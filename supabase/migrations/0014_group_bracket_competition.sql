-- Group stage + knockout format. Group assignments are edited before start;
-- qualifier seeds are advanced automatically when every group game is final.
alter table public.competition_matches
  add column if not exists stage_code text not null default 'MAIN',
  add column if not exists group_no integer;

create table if not exists public.competition_group_settings (
  competition_id uuid primary key references public.competitions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_count integer not null check (group_count between 2 and 16),
  qualifiers_per_group integer not null check (qualifiers_per_group between 1 and 2),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create table if not exists public.competition_group_assignments (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  group_no integer not null check (group_no between 1 and 16),
  primary key (competition_id, team_id)
);
alter table public.competition_group_settings enable row level security;
alter table public.competition_group_assignments enable row level security;
create policy competition_group_settings_member_read on public.competition_group_settings for select to authenticated using (public.is_org_member(organization_id));
create policy competition_group_assignments_member_read on public.competition_group_assignments for select to authenticated using (public.is_org_member(organization_id));
grant select on public.competition_group_settings, public.competition_group_assignments to authenticated;
revoke insert, update, delete on public.competition_group_settings from authenticated;
revoke insert, update, delete on public.competition_group_assignments from authenticated;

drop function if exists public.save_competition_group_plan(uuid, integer, integer, jsonb);
create function public.save_competition_group_plan(
  p_competition_id uuid,
  p_group_count integer,
  p_qualifiers_per_group integer,
  p_assignments jsonb
) returns integer
language plpgsql security definer set search_path=public as $function$
declare
  v_comp public.competitions;
  v_team_count integer;
  v_assignment_count integer;
  v_group_count integer;
  v_power integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_comp from public.competitions where id=p_competition_id for update;
  if not found then raise exception 'COMPETITION_NOT_FOUND'; end if;
  if v_comp.status not in ('DRAFT','APPROVED') then raise exception 'GROUPS_LOCKED_AFTER_START'; end if;
  if v_comp.format <> 'GROUP_BRACKET' then raise exception 'GROUP_BRACKET_FORMAT_REQUIRED'; end if;
  if not public.has_org_role(v_comp.organization_id,array['OWNER','ADMIN']::public.org_role[]) then raise exception 'FORBIDDEN'; end if;
  if p_group_count not between 2 and 16 then raise exception 'GROUP_COUNT_OUT_OF_RANGE'; end if;
  if p_qualifiers_per_group not between 1 and 2 then raise exception 'QUALIFIERS_OUT_OF_RANGE'; end if;
  v_power := p_group_count*p_qualifiers_per_group;
  if (v_power & (v_power-1)) <> 0 then raise exception 'QUALIFIER_TOTAL_MUST_BE_POWER_OF_TWO'; end if;
  if jsonb_typeof(p_assignments) <> 'array' then raise exception 'GROUP_ASSIGNMENTS_REQUIRED'; end if;

  select count(*) into v_team_count from public.competition_teams where competition_id=p_competition_id;
  select count(*),count(distinct group_no) into v_assignment_count,v_group_count
    from jsonb_to_recordset(p_assignments) as x(team_id uuid,group_no integer);
  if v_team_count=0 or v_assignment_count<>v_team_count then raise exception 'ASSIGN_EVERY_REGISTERED_TEAM_ONCE'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_assignments) as x(team_id uuid,group_no integer)
    where x.group_no<1 or x.group_no>p_group_count
  ) then raise exception 'INVALID_GROUP_NUMBER'; end if;
  if exists (
    select x.team_id from jsonb_to_recordset(p_assignments) as x(team_id uuid,group_no integer)
    group by x.team_id having count(*)<>1
  ) then raise exception 'DUPLICATE_TEAM_ASSIGNMENT'; end if;
  if exists (
    select 1 from public.competition_teams ct
    where ct.competition_id=p_competition_id
      and not exists(select 1 from jsonb_to_recordset(p_assignments) as x(team_id uuid,group_no integer) where x.team_id=ct.team_id)
  ) then raise exception 'ASSIGN_EVERY_REGISTERED_TEAM_ONCE'; end if;
  if v_group_count<>p_group_count or exists (
    select g from generate_series(1,p_group_count) as gs(group_no)
    where not exists(select 1 from jsonb_to_recordset(p_assignments) as x(team_id uuid,group_no integer) where x.group_no=gs.group_no)
  ) then raise exception 'EACH_GROUP_NEEDS_TEAMS'; end if;
  if exists (
    select 1 from generate_series(1,p_group_count) as gs(group_no)
    where (select count(*) from jsonb_to_recordset(p_assignments) as x(team_id uuid,group_no integer) where x.group_no=gs.group_no)<greatest(2,p_qualifiers_per_group)
  ) then raise exception 'EACH_GROUP_NEEDS_TWO_TEAMS_AND_AT_LEAST_AS_MANY_TEAMS_AS_QUALIFIERS'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_assignments) as x(team_id uuid,group_no integer)
    where not exists(select 1 from public.competition_teams ct where ct.competition_id=p_competition_id and ct.team_id=x.team_id)
  ) then raise exception 'TEAM_NOT_REGISTERED_TO_COMPETITION'; end if;
  if exists(select 1 from public.competition_matches where competition_id=p_competition_id)
     or exists(select 1 from public.games where competition_id=p_competition_id) then raise exception 'FIXTURES_ALREADY_GENERATED'; end if;

  insert into public.competition_group_settings(competition_id,organization_id,group_count,qualifiers_per_group,updated_by,updated_at)
  values(p_competition_id,v_comp.organization_id,p_group_count,p_qualifiers_per_group,auth.uid(),now())
  on conflict(competition_id) do update set group_count=excluded.group_count,qualifiers_per_group=excluded.qualifiers_per_group,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  delete from public.competition_group_assignments where competition_id=p_competition_id;
  insert into public.competition_group_assignments(competition_id,organization_id,team_id,group_no)
  select p_competition_id,v_comp.organization_id,x.team_id,x.group_no
  from jsonb_to_recordset(p_assignments) as x(team_id uuid,group_no integer);
  return v_assignment_count;
end;
$function$;
revoke all on function public.save_competition_group_plan(uuid,integer,integer,jsonb) from public;
grant execute on function public.save_competition_group_plan(uuid,integer,integer,jsonb) to authenticated;

create or replace function public.start_sports_competition(p_competition_id uuid)
returns integer language plpgsql security definer set search_path=public as $function$
declare
  c public.competitions%rowtype;
  ids uuid[];
  group_ids uuid[];
  n integer;
  i integer;
  j integer;
  r integer;
  slots integer;
  g uuid;
  fmt text;
  v_group_count integer;
  v_qualifiers integer;
  v_group_no integer;
  v_group_size integer;
  v_round integer;
  v_slot integer:=0;
  v_group_rounds integer:=0;
  v_teams uuid[];
  v_team uuid;
  v_temp uuid;
  v_playoff_teams integer;
begin
  select * into c from public.competitions where id=p_competition_id for update;
  if not found then raise exception 'Competition not found'; end if;
  if not public.has_org_role(c.organization_id,array['OWNER']::public.org_role[]) then raise exception 'Only owner can start competition'; end if;
  if c.status<>'APPROVED' then raise exception 'Competition must be approved'; end if;
  select array_agg(team_id order by registered_at,team_id) into ids from public.competition_teams where competition_id=c.id;
  n:=coalesce(array_length(ids,1),0); fmt:=c.format;
  if n<c.min_teams or n>c.max_teams then raise exception 'Team count % must be between % and %',n,c.min_teams,c.max_teams; end if;
  if exists(select 1 from public.competition_teams t where t.competition_id=c.id and not exists(select 1 from public.competition_players p where p.competition_id=c.id and p.team_id=t.team_id)) then raise exception 'Every registered team needs at least one player'; end if;
  if exists(select 1 from public.competition_matches where competition_id=c.id) or exists(select 1 from public.games where competition_id=c.id) then raise exception 'Schedule already exists'; end if;

  if fmt='GROUP_BRACKET' then
    select group_count,qualifiers_per_group into v_group_count,v_qualifiers from public.competition_group_settings where competition_id=c.id;
    if not found then raise exception 'SAVE_GROUP_SETTINGS_FIRST'; end if;
    v_playoff_teams:=v_group_count*v_qualifiers;
    if (v_playoff_teams & (v_playoff_teams-1))<>0 then raise exception 'QUALIFIER_TOTAL_MUST_BE_POWER_OF_TWO'; end if;
    if (select count(*) from public.competition_group_assignments where competition_id=c.id)<>n then raise exception 'ASSIGN_EVERY_REGISTERED_TEAM_ONCE'; end if;
    if exists(select 1 from public.competition_teams ct where ct.competition_id=c.id and not exists(select 1 from public.competition_group_assignments a where a.competition_id=c.id and a.team_id=ct.team_id)) then raise exception 'ASSIGN_EVERY_REGISTERED_TEAM_ONCE'; end if;
    if exists(select 1 from generate_series(1,v_group_count) as gs(group_no) where (select count(*) from public.competition_group_assignments a where a.competition_id=c.id and a.group_no=gs.group_no)<greatest(2,v_qualifiers)) then raise exception 'EACH_GROUP_NEEDS_TWO_TEAMS_AND_AS_MANY_TEAMS_AS_QUALIFIERS'; end if;

    for v_group_no in 1..v_group_count loop
      select array_agg(a.team_id order by a.team_id) into v_teams from public.competition_group_assignments a where a.competition_id=c.id and a.group_no=v_group_no;
      v_group_size:=coalesce(array_length(v_teams,1),0);
      if v_group_size%2=1 then v_teams:=array_append(v_teams,null::uuid); v_group_size:=v_group_size+1; end if;
      v_group_rounds:=greatest(v_group_rounds,v_group_size-1);
      for v_round in 1..v_group_size-1 loop
        for j in 1..v_group_size/2 loop
          if j=1 then v_team:=v_teams[1];v_temp:=v_teams[v_group_size];
          else v_team:=v_teams[j];v_temp:=v_teams[v_group_size-j+1]; end if;
          if v_team is not null and v_temp is not null then
            v_slot:=v_slot+1;
            insert into public.games(organization_id,competition_id,season_id,home_team_id,away_team_id,status)
            values(c.organization_id,c.id,c.season_id,v_team,v_temp,'SCHEDULED') returning id into g;
            insert into public.competition_matches(competition_id,organization_id,round_no,slot_no,home_team_id,away_team_id,game_id,status,stage_code,group_no)
            values(c.id,c.organization_id,v_round,v_slot,v_team,v_temp,g,'READY','GROUP',v_group_no);
          end if;
        end loop;
        v_teams:=array[v_teams[1]]||array[v_teams[v_group_size]]||v_teams[2:v_group_size-1];
      end loop;
    end loop;
    slots:=v_playoff_teams/2;r:=1;
    while slots>=1 loop
      for i in 1..slots loop
        insert into public.competition_matches(competition_id,organization_id,round_no,slot_no,status,stage_code)
        values(c.id,c.organization_id,v_group_rounds+r,i,'PENDING','KNOCKOUT');
      end loop;
      slots:=slots/2;r:=r+1;
    end loop;
  elsif fmt='SINGLE_ELIMINATION' then
    if n<>2^ceil(log(2,n))::integer then raise exception 'Single elimination currently requires a power-of-two team count (2,4,8,16,32,64...)'; end if;
    slots:=n/2;r:=1;
    while slots>=1 loop
      for i in 1..slots loop
        if r=1 then
          insert into public.games(organization_id,competition_id,season_id,home_team_id,away_team_id,status) values(c.organization_id,c.id,c.season_id,ids[i],ids[n-i+1],'SCHEDULED') returning id into g;
          insert into public.competition_matches(competition_id,organization_id,round_no,slot_no,home_team_id,away_team_id,game_id,status) values(c.id,c.organization_id,r,i,ids[i],ids[n-i+1],g,'READY');
        else insert into public.competition_matches(competition_id,organization_id,round_no,slot_no) values(c.id,c.organization_id,r,i); end if;
      end loop;
      slots:=slots/2;r:=r+1;
    end loop;
  elsif fmt in ('ROUND_ROBIN','ROUND_ROBIN_SINGLE','ROUND_ROBIN_DOUBLE') then
    j:=0;
    for i in 1..n-1 loop
      for r in i+1..n loop
        j:=j+1;
        insert into public.games(organization_id,competition_id,season_id,home_team_id,away_team_id,status) values(c.organization_id,c.id,c.season_id,ids[i],ids[r],'SCHEDULED') returning id into g;
        insert into public.competition_matches(competition_id,organization_id,round_no,slot_no,home_team_id,away_team_id,game_id,status) values(c.id,c.organization_id,1,j,ids[i],ids[r],g,'READY');
        if fmt='ROUND_ROBIN_DOUBLE' then
          j:=j+1;
          insert into public.games(organization_id,competition_id,season_id,home_team_id,away_team_id,status) values(c.organization_id,c.id,c.season_id,ids[r],ids[i],'SCHEDULED') returning id into g;
          insert into public.competition_matches(competition_id,organization_id,round_no,slot_no,home_team_id,away_team_id,game_id,status) values(c.id,c.organization_id,1,j,ids[r],ids[i],g,'READY');
        end if;
      end loop;
    end loop;
  else raise exception 'Competition format % is not yet supported for automatic scheduling',fmt;
  end if;
  perform set_config('sports.competition_transition','authorized',true);
  update public.competitions set status='ACTIVE' where id=c.id;
  perform set_config('sports.competition_transition','',true);
  return (select count(*) from public.games where competition_id=c.id);
end;
$function$;
revoke all on function public.start_sports_competition(uuid) from public;
grant execute on function public.start_sports_competition(uuid) to authenticated;

create or replace function public.randomize_competition_fixtures(p_competition_id uuid)
returns integer language plpgsql security definer set search_path=public as $function$
declare
  v_organization_id uuid;v_status text;v_format text;v_original uuid[];v_randomized uuid[];v_match_count integer;v_updated integer;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select c.organization_id,c.status::text,c.format into v_organization_id,v_status,v_format from public.competitions c where c.id=p_competition_id for update;
  if not found then raise exception 'Competition not found.'; end if;
  if v_format='GROUP_BRACKET' then raise exception 'Group bracket assignments are manual; fixtures cannot be randomized across groups.'; end if;
  if v_status<>'ACTIVE' then raise exception 'Start the competition before randomizing its fixtures.'; end if;
  if not exists(select 1 from public.organization_members m where m.organization_id=v_organization_id and m.user_id=auth.uid() and m.active=true and m.user_role='OWNER') then raise exception 'Only the organization owner can randomize competition fixtures.'; end if;
  if exists(select 1 from public.competition_fixture_randomizations r where r.competition_id=p_competition_id) then return 0; end if;
  select array_agg(ct.team_id order by ct.team_id) into v_original from public.competition_teams ct where ct.competition_id=p_competition_id;
  if coalesce(array_length(v_original,1),0)<2 then raise exception 'At least two registered teams are required to randomize fixtures.'; end if;
  select array_agg(team_id order by gen_random_uuid()) into v_randomized from unnest(v_original) as teams(team_id);
  if v_randomized=v_original then v_randomized:=v_original[2:array_length(v_original,1)]||v_original[1:1]; end if;
  select count(*) into v_match_count from public.competition_matches cm where cm.competition_id=p_competition_id;
  if v_match_count=0 then raise exception 'No generated competition fixtures were found.'; end if;
  if exists(select 1 from public.competition_matches cm join public.games g on g.id=cm.game_id where cm.competition_id=p_competition_id and (g.status in ('LIVE','FINAL') or g.home_score<>0 or g.away_score<>0 or exists(select 1 from public.game_events e where e.game_id=g.id))) then raise exception 'Fixtures cannot be randomized after game activity has started.'; end if;
  update public.competition_matches cm set home_team_id=case when cm.home_team_id is null then null else v_randomized[array_position(v_original,cm.home_team_id)] end,away_team_id=case when cm.away_team_id is null then null else v_randomized[array_position(v_original,cm.away_team_id)] end where cm.competition_id=p_competition_id;
  get diagnostics v_updated=row_count;
  update public.games g set home_team_id=cm.home_team_id,away_team_id=cm.away_team_id from public.competition_matches cm where cm.competition_id=p_competition_id and cm.game_id=g.id;
  insert into public.competition_fixture_randomizations(competition_id,organization_id,randomized_by) values(p_competition_id,v_organization_id,auth.uid());
  return v_updated;
end;
$function$;
revoke all on function public.randomize_competition_fixtures(uuid) from public;
grant execute on function public.randomize_competition_fixtures(uuid) to authenticated;

create or replace function public.advance_group_bracket(p_competition_id uuid)
returns void language plpgsql security definer set search_path=public as $function$
declare
  v_org uuid;v_group_count integer;v_qualifiers integer;v_first_round integer;v_group_no integer;v_rank integer;v_team uuid;v_slot integer;v_side text;v_pair integer;v_match public.competition_matches%rowtype;v_game uuid;v_rounds integer;
begin
  select c.organization_id,s.group_count,s.qualifiers_per_group into v_org,v_group_count,v_qualifiers
  from public.competitions c join public.competition_group_settings s on s.competition_id=c.id
  where c.id=p_competition_id and c.format='GROUP_BRACKET' for update of c;
  if not found then return; end if;
  if exists(select 1 from public.competition_matches cm join public.games g on g.id=cm.game_id where cm.competition_id=p_competition_id and cm.stage_code='GROUP' and g.status<>'FINAL') then return; end if;
  select min(round_no) into v_first_round from public.competition_matches where competition_id=p_competition_id and stage_code='KNOCKOUT';
  if v_first_round is null then return; end if;

  for v_group_no,v_rank,v_team in
    with sides as (
      select g.home_team_id team_id,g.home_score points_for,g.away_score points_against,case when g.home_score>g.away_score then 1 else 0 end win
      from public.games g join public.competition_matches cm on cm.game_id=g.id and cm.stage_code='GROUP'
      where cm.competition_id=p_competition_id and g.status='FINAL'
      union all
      select g.away_team_id,g.away_score,g.home_score,case when g.away_score>g.home_score then 1 else 0 end
      from public.games g join public.competition_matches cm on cm.game_id=g.id and cm.stage_code='GROUP'
      where cm.competition_id=p_competition_id and g.status='FINAL'
    ), totals as (
      select a.group_no,t.id team_id,coalesce(sum(s.win),0) wins,coalesce(sum(s.points_for-s.points_against),0) point_diff,coalesce(sum(s.points_for),0) points_for,t.name
      from public.competition_group_assignments a join public.teams t on t.id=a.team_id
      left join sides s on s.team_id=a.team_id
      where a.competition_id=p_competition_id group by a.group_no,t.id,t.name
    ), ranked as (
      select *,row_number() over(partition by group_no order by wins desc,point_diff desc,points_for desc,name,team_id) rank_no from totals
    ) select group_no,rank_no,team_id from ranked where rank_no<=v_qualifiers order by group_no,rank_no
  loop
    if v_qualifiers=1 then
      v_slot:=(v_group_no+1)/2;v_side:=case when v_group_no%2=1 then 'home' else 'away' end;
    else
      v_pair:=(v_group_no-1)/2;
      if v_group_no%2=1 and v_rank=1 then v_slot:=v_pair*2+1;v_side:='home';
      elsif v_group_no%2=0 and v_rank=2 then v_slot:=v_pair*2+1;v_side:='away';
      elsif v_group_no%2=0 and v_rank=1 then v_slot:=v_pair*2+2;v_side:='home';
      else v_slot:=v_pair*2+2;v_side:='away';end if;
    end if;
    if v_side='home' then update public.competition_matches set home_team_id=v_team,status='READY' where competition_id=p_competition_id and stage_code='KNOCKOUT' and round_no=v_first_round and slot_no=v_slot and home_team_id is null;
    else update public.competition_matches set away_team_id=v_team,status='READY' where competition_id=p_competition_id and stage_code='KNOCKOUT' and round_no=v_first_round and slot_no=v_slot and away_team_id is null;end if;
  end loop;
  for v_match in select * from public.competition_matches where competition_id=p_competition_id and stage_code='KNOCKOUT' and round_no=v_first_round and home_team_id is not null and away_team_id is not null and game_id is null for update loop
    insert into public.games(organization_id,competition_id,season_id,home_team_id,away_team_id,status)
    select c.organization_id,c.id,c.season_id,v_match.home_team_id,v_match.away_team_id,'SCHEDULED' from public.competitions c where c.id=p_competition_id returning id into v_game;
    update public.competition_matches set game_id=v_game,status='READY' where id=v_match.id;
  end loop;
end;
$function$;
revoke all on function public.advance_group_bracket(uuid) from public;
grant execute on function public.advance_group_bracket(uuid) to authenticated;

create or replace function public.advance_group_bracket_on_final()
returns trigger language plpgsql security definer set search_path=public as $function$
declare v_match public.competition_matches%rowtype;v_next public.competition_matches%rowtype;v_winner uuid;v_game uuid;
begin
  if new.status<>'FINAL' or old.status='FINAL' then return new; end if;
  select cm.* into v_match from public.competition_matches cm where cm.game_id=new.id and cm.stage_code in ('GROUP','KNOCKOUT') for update;
  if not found then return new; end if;
  if new.home_score=new.away_score then return new; end if;
  v_winner:=case when new.home_score>new.away_score then new.home_team_id else new.away_team_id end;
  update public.competition_matches set winner_team_id=v_winner where id=v_match.id;
  if v_match.stage_code='GROUP' then
    perform public.advance_group_bracket(v_match.competition_id);
    return new;
  end if;
  select cm.* into v_next from public.competition_matches cm
  where cm.competition_id=v_match.competition_id and cm.stage_code='KNOCKOUT'
    and cm.round_no=v_match.round_no+1 and cm.slot_no=(v_match.slot_no+1)/2 for update;
  if found then
    if v_match.slot_no%2=1 then update public.competition_matches set home_team_id=v_winner,status='READY' where id=v_next.id and home_team_id is null;
    else update public.competition_matches set away_team_id=v_winner,status='READY' where id=v_next.id and away_team_id is null;end if;
    select * into v_next from public.competition_matches where id=v_next.id;
    if v_next.home_team_id is not null and v_next.away_team_id is not null and v_next.game_id is null then
      insert into public.games(organization_id,competition_id,season_id,home_team_id,away_team_id,status)
      select c.organization_id,c.id,c.season_id,v_next.home_team_id,v_next.away_team_id,'SCHEDULED' from public.competitions c where c.id=v_next.competition_id returning id into v_game;
      update public.competition_matches set game_id=v_game,status='READY' where id=v_next.id;
    end if;
  else
    perform set_config('sports.competition_transition','authorized',true);
    update public.competitions set status='COMPLETED' where id=v_match.competition_id and status='ACTIVE';
    perform set_config('sports.competition_transition','',true);
  end if;
  return new;
end;
$function$;
drop trigger if exists advance_group_bracket_on_final on public.games;
create trigger advance_group_bracket_on_final after update of status on public.games
for each row execute function public.advance_group_bracket_on_final();

create or replace function public.get_public_group_bracket(p_competition_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $function$
declare v_comp public.competitions%rowtype;v_settings public.competition_group_settings%rowtype;v_payload jsonb;
begin
  select * into v_comp from public.competitions where id=p_competition_id;
  if not found or v_comp.format<>'GROUP_BRACKET' or v_comp.status not in ('APPROVED','ACTIVE','COMPLETED') then return null; end if;
  if not public.is_public_sports_portal_enabled(v_comp.organization_id) then return null; end if;
  select * into v_settings from public.competition_group_settings where competition_id=p_competition_id;
  if not found then return null; end if;
  with sides as (
    select cm.group_no,g.home_team_id team_id,g.home_score points_for,g.away_score points_against,case when g.home_score>g.away_score then 1 else 0 end win
    from public.competition_matches cm join public.games g on g.id=cm.game_id
    where cm.competition_id=p_competition_id and cm.stage_code='GROUP' and g.status='FINAL'
    union all
    select cm.group_no,g.away_team_id,g.away_score,g.home_score,case when g.away_score>g.home_score then 1 else 0 end
    from public.competition_matches cm join public.games g on g.id=cm.game_id
    where cm.competition_id=p_competition_id and cm.stage_code='GROUP' and g.status='FINAL'
  ), standings as (
    select a.group_no,t.id team_id,t.name,coalesce(count(s.team_id),0) played,
      coalesce(sum(s.win),0) wins,
      coalesce(count(s.team_id) filter(where s.points_for<s.points_against),0) losses,
      coalesce(sum(s.points_for),0) points_for,coalesce(sum(s.points_against),0) points_against,
      coalesce(sum(s.points_for-s.points_against),0) point_diff
    from public.competition_group_assignments a join public.teams t on t.id=a.team_id
    left join sides s on s.team_id=t.id and s.group_no=a.group_no
    where a.competition_id=p_competition_id
    group by a.group_no,t.id,t.name
  )
  select jsonb_build_object(
    'competition_id',p_competition_id,
    'qualifiers_per_group',v_settings.qualifiers_per_group,
    'groups',coalesce((select jsonb_agg(jsonb_build_object(
      'group_no',gs.group_no,'group_name','Group '||chr(64+gs.group_no),
      'standings',coalesce((select jsonb_agg(jsonb_build_object(
        'team_id',st.team_id,'name',st.name,'played',st.played,'wins',st.wins,'losses',st.losses,
        'points_for',st.points_for,'points_against',st.points_against,'point_diff',st.point_diff,
        'qualifies',st.rank_no<=v_settings.qualifiers_per_group
      ) order by st.rank_no) from (
        select standings.*,row_number() over(partition by group_no order by wins desc,point_diff desc,points_for desc,name,team_id) rank_no
        from standings where group_no=gs.group_no
      ) st),'[]'::jsonb)
    ) order by gs.group_no) from generate_series(1,v_settings.group_count) as gs(group_no)),'[]'::jsonb),
    'group_fixtures',coalesce((select jsonb_agg(jsonb_build_object(
      'id',cm.id,'competition_id',cm.competition_id,'stage_code',cm.stage_code,'group_no',cm.group_no,
      'round_no',cm.round_no,'slot_no',cm.slot_no,'home_team_id',cm.home_team_id,'away_team_id',cm.away_team_id,
      'game_id',cm.game_id,'status',cm.status,'home_team',ht.name,'away_team',at.name,
      'game_status',g.status::text,'home_score',g.home_score,'away_score',g.away_score,'scheduled_at',g.scheduled_at
    ) order by cm.group_no,cm.round_no,cm.slot_no) from public.competition_matches cm
      left join public.games g on g.id=cm.game_id
      left join public.teams ht on ht.id=cm.home_team_id
      left join public.teams at on at.id=cm.away_team_id
      where cm.competition_id=p_competition_id and cm.stage_code='GROUP'),'[]'::jsonb),
    'knockout_fixtures',coalesce((select jsonb_agg(jsonb_build_object(
      'id',cm.id,'competition_id',cm.competition_id,'stage_code',cm.stage_code,'round_no',cm.round_no,'slot_no',cm.slot_no,
      'home_team_id',cm.home_team_id,'away_team_id',cm.away_team_id,'game_id',cm.game_id,'status',cm.status,
      'home_team',ht.name,'away_team',at.name,'game_status',g.status::text,
      'home_score',g.home_score,'away_score',g.away_score,'scheduled_at',g.scheduled_at
    ) order by cm.round_no,cm.slot_no) from public.competition_matches cm
      left join public.games g on g.id=cm.game_id
      left join public.teams ht on ht.id=cm.home_team_id
      left join public.teams at on at.id=cm.away_team_id
      where cm.competition_id=p_competition_id and cm.stage_code='KNOCKOUT'),'[]'::jsonb)
  ) into v_payload;
  return v_payload;
end;
$function$;
revoke all on function public.get_public_group_bracket(uuid) from public;
grant execute on function public.get_public_group_bracket(uuid) to anon,authenticated;
