DROP TRIGGER IF EXISTS on_auth_user_signed_in_grant_brand_admin ON auth.users;
CREATE TRIGGER on_auth_user_signed_in_grant_brand_admin
AFTER UPDATE OF last_sign_in_at ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.grant_admin_for_brand_email();