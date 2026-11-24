-- Require court and emergency-response details as part of league creation.
alter table public.leagues add column if not exists default_venue_id uuid references public.venues(id) on delete set null;
alter table public.leagues add column if not exists local_responder_name text not null default '';
alter table public.leagues add column if not exists local_responder_phone text not null default '';
alter table public.leagues add column if not exists emergency_access_message text not null default '';

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
    'venues',coalesce((select jsonb_agg(jsonb_build_object('name',v.name,'address',v.address,'latitude',v.latitude,'longitude',v.longitude,'emergency_access_notes',v.emergency_access_notes) order by v.name) from public.venues v where v.organization_id=o.id),'[]'::jsonb),
    'leagues',coalesce((select jsonb_agg(jsonb_build_object(
      'name',l.name,'local_responder_name',l.local_responder_name,'local_responder_phone',l.local_responder_phone,
      'emergency_access_message',l.emergency_access_message,
      'court',jsonb_build_object('name',v.name,'address',v.address,'latitude',v.latitude,'longitude',v.longitude,'emergency_access_notes',v.emergency_access_notes)
    ) order by l.name) from public.leagues l left join public.venues v on v.id=l.default_venue_id where l.organization_id=o.id),'[]'::jsonb)
  ) else null end
  from public.organizations o left join public.medical_response_settings s on s.organization_id=o.id
  where o.id=p_organization_id;
$function$;
revoke all on function public.get_public_medical_info(uuid) from public;
grant execute on function public.get_public_medical_info(uuid) to anon, authenticated;

create or replace function public.create_league_with_medical_setup(
  p_organization_id uuid,
  p_league_name text,
  p_venue_name text,
  p_venue_address text,
  p_latitude double precision,
  p_longitude double precision,
  p_court_access_notes text,
  p_responder_name text,
  p_responder_phone text,
  p_medical_access_message text
) returns jsonb
language plpgsql security definer set search_path=public as $function$
declare
  v_user uuid:=auth.uid();
  v_league_id uuid;
  v_venue_id uuid;
  v_phone text:=regexp_replace(coalesce(p_responder_phone,''),'[^0-9+]','','g');
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.has_user_role(p_organization_id,array['OWNER','ADMIN']) then raise exception 'FORBIDDEN'; end if;
  if nullif(trim(p_league_name),'') is null then raise exception 'LEAGUE_NAME_REQUIRED'; end if;
  if nullif(trim(p_venue_name),'') is null or nullif(trim(p_venue_address),'') is null then raise exception 'COURT_NAME_AND_ADDRESS_REQUIRED'; end if;
  if p_latitude is null or p_latitude < -90 or p_latitude > 90 or p_longitude is null or p_longitude < -180 or p_longitude > 180 then raise exception 'VALID_COURT_COORDINATES_REQUIRED'; end if;
  if nullif(trim(p_court_access_notes),'') is null then raise exception 'COURT_ACCESS_NOTES_REQUIRED'; end if;
  if nullif(trim(p_responder_name),'') is null or length(v_phone)<7 then raise exception 'RESPONDER_NAME_AND_VALID_PHONE_REQUIRED'; end if;
  if nullif(trim(p_medical_access_message),'') is null then raise exception 'MEDICAL_ACCESS_INSTRUCTIONS_REQUIRED'; end if;

  insert into public.venues(organization_id,name,address,latitude,longitude,emergency_access_notes)
  values(p_organization_id,trim(p_venue_name),trim(p_venue_address),p_latitude,p_longitude,trim(p_court_access_notes))
  returning id into v_venue_id;

  insert into public.leagues(organization_id,name,default_venue_id,local_responder_name,local_responder_phone,emergency_access_message)
  values(p_organization_id,trim(p_league_name),v_venue_id,trim(p_responder_name),v_phone,trim(p_medical_access_message))
  returning id into v_league_id;

  insert into public.audit_log(organization_id,actor_id,action,entity_type,entity_id,metadata)
  values(p_organization_id,v_user,'CREATE','LEAGUE',v_league_id::text,
    jsonb_build_object('venue_id',v_venue_id,'court_location_configured',true,'medical_contacts_configured',true));

  return jsonb_build_object('league_id',v_league_id,'venue_id',v_venue_id);
end;
$function$;
revoke all on function public.create_league_with_medical_setup(uuid,text,text,text,double precision,double precision,text,text,text,text) from public;
grant execute on function public.create_league_with_medical_setup(uuid,text,text,text,double precision,double precision,text,text,text,text) to authenticated;
