
DROP POLICY IF EXISTS "slider public read" ON storage.objects;
CREATE POLICY "slider public read" ON storage.objects FOR SELECT
  USING (bucket_id = 'slider');
DROP POLICY IF EXISTS "slider admin write" ON storage.objects;
CREATE POLICY "slider admin write" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'slider' AND private.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'slider' AND private.has_role(auth.uid(), 'admin'));
