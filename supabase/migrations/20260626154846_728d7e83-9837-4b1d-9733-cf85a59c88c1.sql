-- Auto-grant admin role to brwazwneon@gmail.com on signup or email verification
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
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_grant_brand_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_brand_admin
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_admin_for_brand_email();

-- Backfill: if that user already exists, grant the role now
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role
FROM auth.users
WHERE lower(email) = 'brwazwneon@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;