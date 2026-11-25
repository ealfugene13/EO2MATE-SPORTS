-- Sponsor ad creation and management are restricted to active platform support admins.
-- All writes run through the MFA-protected support-admin Edge Function using service role.
drop policy if exists sponsor_ads_admin_write on public.sponsor_ads;
