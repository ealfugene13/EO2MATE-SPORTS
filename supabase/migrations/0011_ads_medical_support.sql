-- Sponsor placements, emergency contacts, court access information, and medical incidents.
alter table public.venues add column if not exists latitude double precision;
alter table public.venues add column if not exists longitude double precision;
alter table public.venues add column if not exists emergency_access_notes text not null default '';

alter table public.games add column if not exists clock_running boolean not null default false;
alter table public.games add column if not exists clock_anchor_at timestamptz;
alter table public.games add column if not exists dead_ball_confirmed_at timestamptz;

create table public.sponsor_ads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sponsor_name text not null,
  headline text not null default '',
  image_url text not null,
  alt_text text not null,
  target_url text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint sponsor_ads_url_check check (image_url ~ '^https://'),
  constraint sponsor_ads_target_check check (target_url ~ '^https://'),
  constraint sponsor_ads_date_range_check check (starts_at is null or ends_at is null or ends_at >= starts_at)
);
create index sponsor_ads_public_idx on public.sponsor_ads(organization_id, active, starts_at, ends_at);
alter table public.sponsor_ads enable row level security;
create or replace function public.is_public_sports_portal_enabled(p_organization_id uuid)
returns boolean language sql stable security definer set search_path=public as $function$
  select exists(select 1 from public.organizations o where o.id=p_organization_id
    and coalesce(to_jsonb(o)->>'public_portal_enabled','false')='true');
$function$;
revoke all on function public.is_public_sports_portal_enabled(uuid) from public;
grant execute on function public.is_public_sports_portal_enabled(uuid) to anon, authenticated;
create policy sponsor_ads_public_live_read on public.sponsor_ads for select to anon, authenticated
  using (active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now())
    and public.is_public_sports_portal_enabled(organization_id));
create policy sponsor_ads_member_read on public.sponsor_ads for select to authenticated
  using (public.is_org_member(organization_id));
create policy sponsor_ads_admin_write on public.sponsor_ads for all to authenticated
  using (public.has_user_role(organization_id,array['OWNER','ADMIN']))
  with check (public.has_user_role(organization_id,array['OWNER','ADMIN']));

create table public.medical_response_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  local_responder_name text not null default '',
  local_responder_phone text not null default '',
  emergency_access_message text not null default '',
  first_aid_reviewer text not null default '',
  first_aid_reviewed_on date,
  first_aid_guidance_published boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.medical_response_settings enable row level security;
create policy medical_settings_member_read on public.medical_response_settings for select to authenticated
  using (public.is_org_member(organization_id));
create policy medical_settings_admin_write on public.medical_response_settings for all to authenticated
  using (public.has_user_role(organization_id,array['OWNER','ADMIN']))
  with check (public.has_user_role(organization_id,array['OWNER','ADMIN']));

create table public.medical_incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  venue_id uuid references public.venues(id) on delete set null,
  incident_type text not null check (incident_type in ('PLAYER_INJURY','SPECTATOR_ILLNESS','CARDIAC_OR_BREATHING','SEVERE_BLEEDING','HEAD_OR_SPINE','OTHER')),
  brief_note text not null default '',
  called_number text not null default '',
  responder_status text not null default 'PENDING' check (responder_status in ('PENDING','ACKNOWLEDGED','ON_SCENE','CLOSED')),
  responder_acknowledged_by uuid references auth.users(id),
  responder_acknowledged_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index medical_incidents_org_created_idx on public.medical_incidents(organization_id, created_at desc);
alter table public.medical_incidents enable row level security;
do $block$
begin
  alter publication supabase_realtime add table public.medical_incidents;
exception when duplicate_object then null;
when undefined_object then null;
end;
$block$;
create policy medical_incidents_member_read on public.medical_incidents for select to authenticated
  using (public.is_org_member(organization_id));
create policy medical_incidents_member_update on public.medical_incidents for update to authenticated
  using (public.has_user_role(organization_id,array['OWNER','ADMIN','STAFF']))
  with check (public.has_user_role(organization_id,array['OWNER','ADMIN','STAFF']));

create or replace function public.guard_game_clock_during_medical_incident()
returns trigger language plpgsql set search_path=public as $function$
begin
  if new.clock_running and exists(select 1 from public.medical_incidents i
    where i.game_id=new.id and i.responder_status<>'CLOSED') then
    raise exception 'MEDICAL_INCIDENT_OPEN';
  end if;
  return new;
end;
$function$;
create trigger guard_game_clock_during_medical_incident
before update of clock_running on public.games
for each row execute function public.guard_game_clock_during_medical_incident();

create or replace function public.activate_medical_incident(
  p_game_id uuid, p_incident_type text, p_brief_note text default '', p_called_number text default '911'
) returns public.medical_incidents
language plpgsql security definer set search_path=public as $function$
declare v_game public.games; v_incident public.medical_incidents; v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_incident_type not in ('PLAYER_INJURY','SPECTATOR_ILLNESS','CARDIAC_OR_BREATHING','SEVERE_BLEEDING','HEAD_OR_SPINE','OTHER') then raise exception 'INVALID_INCIDENT_TYPE'; end if;
  select * into v_game from public.games where id=p_game_id for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  if v_game.status::text<>'LIVE' then raise exception 'GAME_NOT_LIVE'; end if;
  if not public.has_user_role(v_game.organization_id,array['OWNER','ADMIN','STAFF']) then raise exception 'FORBIDDEN'; end if;

  update public.games set
    clock_ms=case when coalesce(clock_running,false) and clock_anchor_at is not null
      then greatest(0,clock_ms-floor(extract(epoch from (now()-clock_anchor_at))*1000)::int) else clock_ms end,
    clock_running=false, clock_anchor_at=null, dead_ball_confirmed_at=null
  where id=p_game_id;

  insert into public.medical_incidents(organization_id,game_id,venue_id,incident_type,brief_note,called_number,created_by)
  values(v_game.organization_id,v_game.id,v_game.venue_id,p_incident_type,left(coalesce(p_brief_note,''),500),left(coalesce(p_called_number,'911'),40),v_user)
  returning * into v_incident;
  insert into public.audit_log(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(v_game.organization_id,v_user,'MEDICAL_EMERGENCY_ACTIVATED','MEDICAL_INCIDENT',v_incident.id::text,
    jsonb_build_object('game_id',v_game.id,'incident_type',p_incident_type,'clock_paused',true));
  return v_incident;
end;
$function$;
revoke all on function public.activate_medical_incident(uuid,text,text,text) from public;
grant execute on function public.activate_medical_incident(uuid,text,text,text) to authenticated;

create or replace function public.get_public_medical_info(p_organization_id uuid)
returns jsonb language sql stable security definer set search_path=public as $function$
  select case when coalesce(to_jsonb(o)->>'public_portal_enabled','false')='true'
    and coalesce(s.first_aid_guidance_published,false)
    and nullif(trim(s.first_aid_reviewer),'') is not null
    and s.first_aid_reviewed_on is not null
  then jsonb_build_object(
    'organization_name',o.name,
    'reviewer',s.first_aid_reviewer,
    'reviewed_on',s.first_aid_reviewed_on,
    'local_responder_name',s.local_responder_name,
    'local_responder_phone',s.local_responder_phone,
    'emergency_access_message',s.emergency_access_message,
    'venues',coalesce((select jsonb_agg(jsonb_build_object('name',v.name,'address',v.address,'latitude',v.latitude,'longitude',v.longitude,'emergency_access_notes',v.emergency_access_notes) order by v.name) from public.venues v where v.organization_id=o.id),'[]'::jsonb)
  ) else null end
  from public.organizations o left join public.medical_response_settings s on s.organization_id=o.id
  where o.id=p_organization_id;
$function$;
revoke all on function public.get_public_medical_info(uuid) from public;
grant execute on function public.get_public_medical_info(uuid) to anon, authenticated;
