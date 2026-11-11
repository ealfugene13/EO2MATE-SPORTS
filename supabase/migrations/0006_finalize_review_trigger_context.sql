-- Permit the authorized Result Review RPC to perform the LIVE -> FINAL update
-- required by guard_game_until_scheduled_date(). The trigger flag is transaction
-- local and is set only after staff authorization and LIVE-state validation.
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

  perform set_config('eo2mate.authorized_game_finalize','on',true);
  update public.games set status='FINAL',finalized_at=now()
   where id=p_game_id returning * into v_game;

  insert into public.audit_log(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(v_game.organization_id,auth.uid(),'FINALIZE','GAME',p_game_id::text,to_jsonb(v_game));
  return v_game;
end;
$function$;

revoke all on function public.finalize_game(uuid) from public;
grant execute on function public.finalize_game(uuid) to authenticated;
