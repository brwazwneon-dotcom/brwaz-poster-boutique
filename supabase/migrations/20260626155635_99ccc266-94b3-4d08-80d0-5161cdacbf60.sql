DO $$
DECLARE
  brand_admin_id uuid;
BEGIN
  SELECT id INTO brand_admin_id
  FROM auth.users
  WHERE lower(email) = 'brwazwneon@gmail.com'
  LIMIT 1;

  IF brand_admin_id IS NULL THEN
    RAISE EXCEPTION 'BRWAZWNEON admin user was not found';
  END IF;

  IF NOT private.has_role(brand_admin_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'private.has_role() did not return true for the BRWAZWNEON admin user';
  END IF;
END $$;