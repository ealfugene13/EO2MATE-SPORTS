-- Public read-only organization directory. Publication does not depend on a
-- portal toggle, organization approval, or public-name approval. The player
-- directory exposes names and sports roster fields only; private PII is omitted.
create or replace function public.get_sports_viewer_portal(
  p_slug text default null,
  p_organization_id uuid default null
) returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $function$
declare
  v_org public.organizations%rowtype;
  v_org_json jsonb;
  v_payload jsonb;
begin
  if p_slug is null and p_organization_id is null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', to_jsonb(o)->>'id', 'name', to_jsonb(o)->>'name',
      'slug', to_jsonb(o)->>'slug', 'sport', coalesce(to_jsonb(o)->>'sport','SPORTS'),
      'timezone', coalesce(to_jsonb(o)->>'timezone','Asia/Manila')
    ) order by to_jsonb(o)->>'name'), '[]'::jsonb)
    into v_payload from public.organizations o;
    return jsonb_build_object('organizations',v_payload);
  end if;

  if p_organization_id is not null then
    if auth.uid() is null or not exists (
      select 1 from public.organization_members m
      where m.organization_id=p_organization_id and m.user_id=auth.uid() and m.active=true
    ) then raise exception 'You do not have access to this organization.' using errcode='42501'; end if;
    select * into v_org from public.organizations o where o.id=p_organization_id;
  else
    select * into v_org from public.organizations o where to_jsonb(o)->>'slug'=p_slug;
  end if;
  if not found then raise exception 'Organization not found.' using errcode='P0002'; end if;
  v_org_json:=to_jsonb(v_org);

  select jsonb_build_object(
    'organization',jsonb_build_object(
      'id',v_org_json->>'id','name',v_org_json->>'name','slug',v_org_json->>'slug',
      'sport',coalesce(v_org_json->>'sport','SPORTS'),
      'timezone',coalesce(v_org_json->>'timezone','Asia/Manila')
    ),
    'leagues',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',to_jsonb(l)->>'id','name',to_jsonb(l)->>'name',
        'status',coalesce(to_jsonb(l)->>'status',''),
        'season',coalesce(to_jsonb(l)->>'season_name',to_jsonb(l)->>'season','')
      ) order by to_jsonb(l)->>'name')
      from public.leagues l where (to_jsonb(l)->>'organization_id')::uuid=v_org.id
    ),'[]'::jsonb),
    'competitions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'league_id',c.league_id,'name',c.name,'format',c.format,'status',c.status::text
      ) order by c.name)
      from public.competitions c where c.organization_id=v_org.id
    ),'[]'::jsonb),
    'teams',coalesce((
      select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'code',t.code) order by t.name)
      from public.teams t where t.organization_id=v_org.id and coalesce(t.active,true)
    ),'[]'::jsonb),
    'players',coalesce((
      select jsonb_agg(jsonb_build_object(
        'name',coalesce(nullif(p.jersey_name,''),trim(p.first_name||' '||p.last_name)),
        'team',t.name,'jersey_number',r.jersey_number,'position',r.position
      ) order by t.name,r.jersey_number,p.last_name,p.first_name)
      from public.rosters r
      join public.players p on p.id=r.player_id and p.organization_id=v_org.id
        and p.active=true
      join public.teams t on t.id=r.team_id and t.organization_id=v_org.id
      where r.organization_id=v_org.id and coalesce(r.status,'ACTIVE')='ACTIVE'
    ),'[]'::jsonb),
    'games',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',g.id,'competition_id',g.competition_id,'scheduled_at',g.scheduled_at,
        'status',g.status::text,'period',g.current_period,'clock_ms',g.clock_ms,
        'home_score',g.home_score,'away_score',g.away_score,
        'home_team',ht.name,'away_team',at.name,'venue',to_jsonb(v)->>'name'
      ) order by g.scheduled_at nulls last)
      from public.games g
      join public.teams ht on ht.id=g.home_team_id
      join public.teams at on at.id=g.away_team_id
      left join public.venues v on v.id=g.venue_id
      where g.organization_id=v_org.id
    ),'[]'::jsonb),
    'team_stats',coalesce((
      with finished as (
        select g.* from public.games g where g.organization_id=v_org.id
          and g.status::text in ('FINAL','COMPLETED')
      ), sides as (
        select home_team_id team_id,home_score points_for,away_score points_against from finished
        union all
        select away_team_id,away_score,home_score from finished
      )
      select jsonb_agg(jsonb_build_object(
        'team',t.name,'played',count(s.team_id),
        'wins',count(s.team_id) filter(where s.points_for>s.points_against),
        'losses',count(s.team_id) filter(where s.points_for<s.points_against),
        'points_for',coalesce(sum(s.points_for),0),'points_against',coalesce(sum(s.points_against),0)
      ) order by count(s.team_id) filter(where s.points_for>s.points_against) desc,t.name)
      from public.teams t left join sides s on s.team_id=t.id
      where t.organization_id=v_org.id and coalesce(t.active,true)
      group by t.id,t.name
    ),'[]'::jsonb),
    'player_stats',coalesce((
      select jsonb_agg(jsonb_build_object(
        'name',coalesce(nullif(p.jersey_name,''),trim(p.first_name||' '||p.last_name)),
        'team',t.name,'points',coalesce(sum(e.points),0),
        'rebounds',count(e.id) filter(where e.event_type in ('REBOUND_OFF','REBOUND_DEF','OFFENSIVE_REBOUND','DEFENSIVE_REBOUND')),
        'assists',count(e.id) filter(where e.event_type='ASSIST'),
        'steals',count(e.id) filter(where e.event_type='STEAL'),
        'blocks',count(e.id) filter(where e.event_type='BLOCK')
      ) order by coalesce(sum(e.points),0) desc,p.last_name,p.first_name)
      from public.competition_players cp
      join public.competitions c on c.id=cp.competition_id and c.organization_id=v_org.id
      join public.players p on p.id=cp.player_id and p.organization_id=v_org.id
      join public.teams t on t.id=cp.team_id and t.organization_id=v_org.id
      left join public.game_events e on e.player_id=p.id and e.team_id=t.id and e.organization_id=v_org.id
        and e.event_type not in ('REVERSAL','PASS') and e.reversed_event_id is null
        and not exists(select 1 from public.game_events rev where rev.reversed_event_id=e.id)
      group by p.id,p.jersey_name,p.first_name,p.last_name,t.name
    ),'[]'::jsonb),
    'events',coalesce((
      select jsonb_agg(jsonb_build_object(
        'game',ht.name||' vs '||at.name,'at',e.created_at,'period',e.period,
        'clock_ms',e.clock_ms,'team',t.name,
        'player',coalesce(nullif(p.jersey_name,''),trim(p.first_name||' '||p.last_name)),
        'event',e.event_type,'points',e.points
      ) order by e.created_at desc)
      from (select e0.* from public.game_events e0 where e0.organization_id=v_org.id
        and e0.event_type not in ('REVERSAL','PASS') and e0.reversed_event_id is null
        and not exists(select 1 from public.game_events rev where rev.reversed_event_id=e0.id)
        order by e0.created_at desc limit 100) e
      join public.games g on g.id=e.game_id
      join public.teams ht on ht.id=g.home_team_id
      join public.teams at on at.id=g.away_team_id
      left join public.teams t on t.id=e.team_id
      left join public.players p on p.id=e.player_id and p.organization_id=v_org.id
    ),'[]'::jsonb)
  ) into v_payload;
  return v_payload;
end;
$function$;

revoke all on function public.get_sports_viewer_portal(text,uuid) from public;
grant execute on function public.get_sports_viewer_portal(text,uuid) to anon, authenticated;
