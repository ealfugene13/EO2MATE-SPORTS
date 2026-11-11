-- Remove the organization workflow-status gate from finalization/correction.
-- Active OWNER, ADMIN, or STAFF authorization and game/event validation remain.
create or replace function public.finalize_game(p_game_id uuid)
returns public.games
language plpgsql security definer
set search_path = public
as $function$
declare
  v_game public.games;
begin
  select * into v_game from public.games where id=p_game_id for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  if auth.uid() is null or not public.has_user_role(v_game.organization_id,array['OWNER','ADMIN','STAFF']) then
    raise exception 'FORBIDDEN';
  end if;
  if v_game.status::text<>'LIVE' then raise exception 'GAME_NOT_LIVE'; end if;
  update public.games set status='FINAL',finalized_at=now() where id=p_game_id returning * into v_game;
  insert into public.audit_log(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(v_game.organization_id,auth.uid(),'FINALIZE','GAME',p_game_id::text,to_jsonb(v_game));
  return v_game;
end;
$function$;

create or replace function public.reverse_game_event(p_actor uuid,p_event_id uuid,p_reason text)
returns jsonb
language plpgsql security definer
set search_path = public
as $function$
declare
  v public.game_events;
  r public.game_events;
  g public.games;
begin
  if auth.uid() is null or p_actor is distinct from auth.uid() then raise exception 'ACTOR_MISMATCH'; end if;
  select * into v from public.game_events where id=p_event_id for update;
  if not found or v.event_type='REVERSAL' or v.reversed_event_id is not null
     or exists(select 1 from public.game_events prior where prior.reversed_event_id=v.id) then
    raise exception 'EVENT_NOT_REVERSIBLE';
  end if;
  if not exists(select 1 from public.organization_members m where m.organization_id=v.organization_id
      and m.user_id=auth.uid() and m.active and m.user_role in ('OWNER','ADMIN','STAFF')) then
    raise exception 'FORBIDDEN';
  end if;
  select * into g from public.games where id=v.game_id for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  insert into public.game_events(organization_id,game_id,team_id,player_id,event_type,period,clock_ms,points,actor_id,reversed_event_id,reason)
  values(v.organization_id,v.game_id,v.team_id,v.player_id,'REVERSAL',v.period,v.clock_ms,-v.points,auth.uid(),v.id,coalesce(nullif(trim(p_reason),''),'Operator correction'))
  returning * into r;
  if v.points>0 then
    perform set_config('eo2mate.recording_game_event','on',true);
    if v.team_id=g.home_team_id then update public.games set home_score=greatest(0,home_score-v.points) where id=g.id;
    elsif v.team_id=g.away_team_id then update public.games set away_score=greatest(0,away_score-v.points) where id=g.id;
    end if;
    perform set_config('eo2mate.recording_game_event','off',true);
  end if;
  insert into public.audit_log(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(v.organization_id,auth.uid(),'REVERSE','GAME_EVENT',v.id::text,jsonb_build_object('reason',coalesce(nullif(trim(p_reason),''),'Operator correction'),'reversal_id',r.id));
  return to_jsonb(r);
end;
$function$;

revoke all on function public.finalize_game(uuid) from public;
grant execute on function public.finalize_game(uuid) to authenticated;
revoke all on function public.reverse_game_event(uuid,uuid,text) from public;
grant execute on function public.reverse_game_event(uuid,uuid,text) to authenticated;
