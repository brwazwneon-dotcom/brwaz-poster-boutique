CREATE OR REPLACE FUNCTION public.grant_admin_for_brand_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NOT NULL
     AND lower(NEW.email) = 'brwazwneon@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_admin_for_brand_email() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_admin_for_brand_email() TO postgres, service_role;

DROP TRIGGER IF EXISTS on_auth_user_created_grant_brand_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_brand_admin
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.grant_admin_for_brand_email();

DROP TRIGGER IF EXISTS on_auth_user_updated_grant_brand_admin ON auth.users;
CREATE TRIGGER on_auth_user_updated_grant_brand_admin
AFTER UPDATE OF email ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.grant_admin_for_brand_email();