-- Create an Auth user in Supabase first, then replace OWNER_USER_UUID below.
-- This seed is intentionally not automatic because auth.users should be created through Supabase Auth.
do $$ begin raise notice 'Create your first Auth user, then insert organization + organization_members using that user UUID.'; end $$;
