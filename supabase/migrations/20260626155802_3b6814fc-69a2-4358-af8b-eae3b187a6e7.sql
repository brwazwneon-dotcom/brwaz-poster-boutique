DROP TRIGGER IF EXISTS on_auth_user_created_grant_brand_admin ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_updated_grant_brand_admin ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_signed_in_grant_brand_admin ON auth.users;
DROP FUNCTION IF EXISTS public.grant_admin_for_brand_email();