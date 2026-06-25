
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO postgres, service_role;

-- Recreate policies to use private.has_role
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can insert posters" ON public.posters;
DROP POLICY IF EXISTS "Admins can update posters" ON public.posters;
DROP POLICY IF EXISTS "Admins can delete posters" ON public.posters;
CREATE POLICY "Admins can insert posters" ON public.posters FOR INSERT WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can update posters" ON public.posters FOR UPDATE USING (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can delete posters" ON public.posters FOR DELETE USING (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can insert categories" ON public.categories;
DROP POLICY IF EXISTS "Admins can update categories" ON public.categories;
DROP POLICY IF EXISTS "Admins can delete categories" ON public.categories;
CREATE POLICY "Admins can insert categories" ON public.categories FOR INSERT WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can update categories" ON public.categories FOR UPDATE USING (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can delete categories" ON public.categories FOR DELETE USING (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can view orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can delete orders" ON public.orders;
CREATE POLICY "Admins can view orders" ON public.orders FOR SELECT USING (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can update orders" ON public.orders FOR UPDATE USING (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can delete orders" ON public.orders FOR DELETE USING (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can upload to posters bucket" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update posters bucket" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete from posters bucket" ON storage.objects;
CREATE POLICY "Admins can upload to posters bucket" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'posters' AND private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can update posters bucket" ON storage.objects FOR UPDATE USING (bucket_id = 'posters' AND private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can delete from posters bucket" ON storage.objects FOR DELETE USING (bucket_id = 'posters' AND private.has_role(auth.uid(), 'admin'::public.app_role));

-- Drop the public version now that policies use private
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
