-- Add per-game summary and box-score data for public game details.
-- Fix viewer aggregation and include each team and player league/competition assignment. PostgreSQL does not
-- allow count()/sum() inside jsonb_agg(); calculate each row first, then
-- aggregate those rows into JSON.
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
      with team_rows as (
        select t.id,t.name,t.code,
          coalesce(string_agg(distinct l.name,', ' order by l.name) filter(where l.id is not null),'') league,
          coalesce(string_agg(distinct c.name,', ' order by c.name) filter(where c.id is not null),'') competition,
          coalesce(jsonb_agg(distinct c.id) filter(where c.id is not null),'[]'::jsonb) competition_ids
        from public.teams t
        left join public.competition_teams ct on ct.team_id=t.id
        left join public.competitions c on c.id=ct.competition_id and c.organization_id=v_org.id
        left join public.leagues l on l.id=c.league_id
        where t.organization_id=v_org.id and coalesce(t.active,true)
        group by t.id,t.name,t.code
      )
      select jsonb_agg(jsonb_build_object(
        'id',id,'name',name,'code',code,'league',league,
        'competition',competition,'competition_ids',competition_ids
      ) order by name)
      from team_rows
    ),'[]'::jsonb),
    'players',coalesce((
      with player_rows as (
        select p.id,p.jersey_name,p.first_name,p.last_name,t.name team,
          r.jersey_number,r.position,
          coalesce(string_agg(distinct l.name,', ' order by l.name) filter(where l.id is not null),'') league,
          coalesce(string_agg(distinct c.name,', ' order by c.name) filter(where c.id is not null),'') competition,
          coalesce(jsonb_agg(distinct c.id) filter(where c.id is not null),'[]'::jsonb) competition_ids
        from public.competition_players cp
        join public.competitions c on c.id=cp.competition_id and c.organization_id=v_org.id
        left join public.leagues l on l.id=c.league_id
        join public.players p on p.id=cp.player_id and p.organization_id=v_org.id and p.active=true
        join public.teams t on t.id=cp.team_id and t.organization_id=v_org.id
        left join public.rosters r on r.organization_id=v_org.id and r.team_id=t.id
          and r.player_id=p.id and r.season_id=c.season_id and coalesce(r.status,'ACTIVE')='ACTIVE'
        group by p.id,p.jersey_name,p.first_name,p.last_name,t.name,r.jersey_number,r.position
      )
      select jsonb_agg(jsonb_build_object(
        'name',coalesce(nullif(jersey_name,''),trim(first_name||' '||last_name)),
        'team',team,'league',league,'competition',competition,
        'competition_ids',competition_ids,'jersey_number',jersey_number,'position',position
      ) order by team,jersey_number,last_name,first_name)
      from player_rows
    ),'[]'::jsonb),
    'games',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',g.id,'competition_id',g.competition_id,'scheduled_at',g.scheduled_at,
        'status',g.status::text,'period',g.current_period,'clock_ms',g.clock_ms,
        'home_score',g.home_score,'away_score',g.away_score,
        'home_team_id',g.home_team_id,'away_team_id',g.away_team_id,
        'home_team',ht.name,'away_team',at.name,'venue',to_jsonb(v)->>'name'
      ) order by g.scheduled_at nulls last)
      from public.games g
      join public.teams ht on ht.id=g.home_team_id
      join public.teams at on at.id=g.away_team_id
      left join public.venues v on v.id=g.venue_id
      where g.organization_id=v_org.id
    ),'[]'::jsonb),
    'game_box_scores',coalesce((
      select jsonb_agg(jsonb_build_object(
        'game_id',g.id,
        'period_scores',coalesce((
          select jsonb_agg(jsonb_build_object('period',q.period,'home',q.home_points,'away',q.away_points) order by q.period)
          from (
            select e.period,
              coalesce(sum(e.points) filter(where e.team_id=g.home_team_id),0) home_points,
              coalesce(sum(e.points) filter(where e.team_id=g.away_team_id),0) away_points
            from public.game_events e
            where e.organization_id=v_org.id and e.game_id=g.id
              and e.event_type not in ('REVERSAL','PASS') and e.reversed_event_id is null
              and not exists(select 1 from public.game_events rev where rev.reversed_event_id=e.id)
            group by e.period
          ) q
        ),'[]'::jsonb),
        'home_stats',(select jsonb_build_object(
          'fgm',count(*) filter(where e.event_type in ('2PT_MADE','3PT_MADE')),
          'fga',count(*) filter(where e.event_type in ('2PT_MADE','2PT_MISSED','3PT_MADE','3PT_MISSED')),
          'tpm',count(*) filter(where e.event_type='3PT_MADE'),
          'tpa',count(*) filter(where e.event_type in ('3PT_MADE','3PT_MISSED')),
          'ftm',count(*) filter(where e.event_type='FT_MADE'),
          'fta',count(*) filter(where e.event_type in ('FT_MADE','FT_MISSED')),
          'reb',count(*) filter(where e.event_type like 'REBOUND_%'),
          'ast',count(*) filter(where e.event_type='ASSIST'),
          'stl',count(*) filter(where e.event_type='STEAL'),
          'blk',count(*) filter(where e.event_type='BLOCK'),
          'tov',count(*) filter(where e.event_type='TURNOVER'),
          'pf',count(*) filter(where e.event_type in ('FOUL','FLAGRANT_FOUL','TECHNICAL_FOUL'))
        ) from public.game_events e where e.organization_id=v_org.id and e.game_id=g.id and e.team_id=g.home_team_id
          and e.event_type not in ('REVERSAL','PASS') and e.reversed_event_id is null
          and not exists(select 1 from public.game_events rev where rev.reversed_event_id=e.id)),
        'away_stats',(select jsonb_build_object(
          'fgm',count(*) filter(where e.event_type in ('2PT_MADE','3PT_MADE')),
          'fga',count(*) filter(where e.event_type in ('2PT_MADE','2PT_MISSED','3PT_MADE','3PT_MISSED')),
          'tpm',count(*) filter(where e.event_type='3PT_MADE'),
          'tpa',count(*) filter(where e.event_type in ('3PT_MADE','3PT_MISSED')),
          'ftm',count(*) filter(where e.event_type='FT_MADE'),
          'fta',count(*) filter(where e.event_type in ('FT_MADE','FT_MISSED')),
          'reb',count(*) filter(where e.event_type like 'REBOUND_%'),
          'ast',count(*) filter(where e.event_type='ASSIST'),
          'stl',count(*) filter(where e.event_type='STEAL'),
          'blk',count(*) filter(where e.event_type='BLOCK'),
          'tov',count(*) filter(where e.event_type='TURNOVER'),
          'pf',count(*) filter(where e.event_type in ('FOUL','FLAGRANT_FOUL','TECHNICAL_FOUL'))
        ) from public.game_events e where e.organization_id=v_org.id and e.game_id=g.id and e.team_id=g.away_team_id
          and e.event_type not in ('REVERSAL','PASS') and e.reversed_event_id is null
          and not exists(select 1 from public.game_events rev where rev.reversed_event_id=e.id)),
        'players',coalesce((
          select jsonb_agg(jsonb_build_object(
            'player_id',cp.player_id,'team_id',cp.team_id,
            'name',coalesce(nullif(p.jersey_name,''),trim(p.first_name||' '||p.last_name)),
            'number',r.jersey_number,'position',r.position,
            'pts',coalesce(sum(e.points),0),
            'fgm',count(e.id) filter(where e.event_type in ('2PT_MADE','3PT_MADE')),
            'fga',count(e.id) filter(where e.event_type in ('2PT_MADE','2PT_MISSED','3PT_MADE','3PT_MISSED')),
            'tpm',count(e.id) filter(where e.event_type='3PT_MADE'),
            'tpa',count(e.id) filter(where e.event_type in ('3PT_MADE','3PT_MISSED')),
            'ftm',count(e.id) filter(where e.event_type='FT_MADE'),
            'fta',count(e.id) filter(where e.event_type in ('FT_MADE','FT_MISSED')),
            'reb',count(e.id) filter(where e.event_type like 'REBOUND_%'),
            'ast',count(e.id) filter(where e.event_type='ASSIST'),
            'stl',count(e.id) filter(where e.event_type='STEAL'),
            'blk',count(e.id) filter(where e.event_type='BLOCK'),
            'tov',count(e.id) filter(where e.event_type='TURNOVER'),
            'pf',count(e.id) filter(where e.event_type in ('FOUL','FLAGRANT_FOUL','TECHNICAL_FOUL'))
          ) order by cp.team_id,r.jersey_number nulls last,p.last_name,p.first_name)
          from public.competition_players cp
          join public.players p on p.id=cp.player_id and p.organization_id=v_org.id
          left join public.rosters r on r.organization_id=v_org.id and r.team_id=cp.team_id
            and r.player_id=cp.player_id and r.season_id=g.season_id and coalesce(r.status,'ACTIVE')='ACTIVE'
          left join public.game_events e on e.organization_id=v_org.id and e.game_id=g.id
            and e.team_id=cp.team_id and e.player_id=cp.player_id
            and e.event_type not in ('REVERSAL','PASS') and e.reversed_event_id is null
            and not exists(select 1 from public.game_events rev where rev.reversed_event_id=e.id)
          where cp.competition_id=g.competition_id and cp.team_id in (g.home_team_id,g.away_team_id)
          group by cp.team_id,cp.player_id,p.jersey_name,p.first_name,p.last_name,r.jersey_number,r.position
        ),'[]'::jsonb)
      ) order by g.scheduled_at nulls last)
      from public.games g
      join public.competitions c on c.id=g.competition_id and c.organization_id=v_org.id
      where g.organization_id=v_org.id
    ),'[]'::jsonb),
    'fixtures',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',cm.id,'competition_id',cm.competition_id,'round_no',cm.round_no,
        'slot_no',cm.slot_no,'home_team_id',cm.home_team_id,'away_team_id',cm.away_team_id,
        'game_id',cm.game_id,'status',cm.status,
        'home_team',ht.name,'away_team',at.name,
        'game_status',g.status::text,'home_score',g.home_score,'away_score',g.away_score,
        'scheduled_at',g.scheduled_at
      ) order by cm.round_no,cm.slot_no)
      from public.competition_matches cm
      left join public.teams ht on ht.id=cm.home_team_id
      left join public.teams at on at.id=cm.away_team_id
      left join public.games g on g.id=cm.game_id
      join public.competitions c on c.id=cm.competition_id and c.organization_id=v_org.id
    ),'[]'::jsonb),
    'team_stats',coalesce((
      with finished as (
        select g.* from public.games g where g.organization_id=v_org.id
          and g.status::text in ('FINAL','COMPLETED')
      ), sides as (
        select home_team_id team_id,home_score points_for,away_score points_against from finished
        union all
        select away_team_id,away_score,home_score from finished
      ), team_totals as (
        select t.id,t.name,count(s.team_id) played,
          count(s.team_id) filter(where s.points_for>s.points_against) wins,
          count(s.team_id) filter(where s.points_for<s.points_against) losses,
          coalesce(sum(s.points_for),0) points_for,
          coalesce(sum(s.points_against),0) points_against
        from public.teams t left join sides s on s.team_id=t.id
        where t.organization_id=v_org.id and coalesce(t.active,true)
        group by t.id,t.name
      )
      select jsonb_agg(jsonb_build_object(
        'team',name,'played',played,'wins',wins,'losses',losses,
        'points_for',points_for,'points_against',points_against
      ) order by wins desc,name)
      from team_totals
    ),'[]'::jsonb),
    'player_stats',coalesce((
      with player_totals as (
        select p.id,
          coalesce(nullif(p.jersey_name,''),trim(p.first_name||' '||p.last_name)) name,
          t.name team,coalesce(sum(e.points),0) points,
          count(e.id) filter(where e.event_type in ('REBOUND_OFF','REBOUND_DEF','OFFENSIVE_REBOUND','DEFENSIVE_REBOUND')) rebounds,
          count(e.id) filter(where e.event_type='ASSIST') assists,
          count(e.id) filter(where e.event_type='STEAL') steals,
          count(e.id) filter(where e.event_type='BLOCK') blocks,
          p.last_name,p.first_name
        from public.competition_players cp
        join public.competitions c on c.id=cp.competition_id and c.organization_id=v_org.id
        join public.players p on p.id=cp.player_id and p.organization_id=v_org.id
        join public.teams t on t.id=cp.team_id and t.organization_id=v_org.id
        left join public.game_events e on e.player_id=p.id and e.team_id=t.id and e.organization_id=v_org.id
          and e.event_type not in ('REVERSAL','PASS') and e.reversed_event_id is null
          and not exists(select 1 from public.game_events rev where rev.reversed_event_id=e.id)
        group by p.id,p.jersey_name,p.first_name,p.last_name,t.name
      )
      select jsonb_agg(jsonb_build_object(
        'name',name,'team',team,'points',points,'rebounds',rebounds,
        'assists',assists,'steals',steals,'blocks',blocks
      ) order by points desc,last_name,first_name)
      from player_totals
    ),'[]'::jsonb),
    'events',coalesce((
      select jsonb_agg(jsonb_build_object(
        'game_id',e.game_id,'game',ht.name||' vs '||at.name,'at',e.created_at,'period',e.period,
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
