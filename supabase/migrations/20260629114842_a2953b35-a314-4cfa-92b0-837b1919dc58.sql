
-- Allow authenticated users to invoke the admin role check used by RLS policies
GRANT USAGE ON SCHEMA private TO authenticated, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, anon;

-- Public read for category, slider, review images (buckets are private so anon read policy is required)
DROP POLICY IF EXISTS "Public read categories bucket" ON storage.objects;
CREATE POLICY "Public read categories bucket" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'categories');

DROP POLICY IF EXISTS "Public read reviews bucket" ON storage.objects;
CREATE POLICY "Public read reviews bucket" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'reviews');

-- Ensure slider has public read for anon too (existing policy may only target authenticated implicitly)
DROP POLICY IF EXISTS "Public read slider bucket" ON storage.objects;
CREATE POLICY "Public read slider bucket" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'slider');

-- Admin write policies for categories
DROP POLICY IF EXISTS "Admins can upload to categories bucket" ON storage.objects;
CREATE POLICY "Admins can upload to categories bucket" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'categories' AND private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can update categories bucket" ON storage.objects;
CREATE POLICY "Admins can update categories bucket" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'categories' AND private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can delete from categories bucket" ON storage.objects;
CREATE POLICY "Admins can delete from categories bucket" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'categories' AND private.has_role(auth.uid(), 'admin'::public.app_role));

-- Admin write policies for reviews
DROP POLICY IF EXISTS "Admins can upload to reviews bucket" ON storage.objects;
CREATE POLICY "Admins can upload to reviews bucket" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'reviews' AND private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can update reviews bucket" ON storage.objects;
CREATE POLICY "Admins can update reviews bucket" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'reviews' AND private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can delete from reviews bucket" ON storage.objects;
CREATE POLICY "Admins can delete from reviews bucket" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'reviews' AND private.has_role(auth.uid(), 'admin'::public.app_role));

-- Re-target existing posters admin write policies to the authenticated role (they currently target no role)
DROP POLICY IF EXISTS "Admins can upload to posters bucket" ON storage.objects;
CREATE POLICY "Admins can upload to posters bucket" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'posters' AND private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can update posters bucket" ON storage.objects;
CREATE POLICY "Admins can update posters bucket" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'posters' AND private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can delete from posters bucket" ON storage.objects;
CREATE POLICY "Admins can delete from posters bucket" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'posters' AND private.has_role(auth.uid(), 'admin'::public.app_role));
