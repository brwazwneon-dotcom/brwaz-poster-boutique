-- Originals bucket: admin-only
CREATE POLICY "posters_originals admin read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'posters-originals' AND private.has_role(auth.uid(), 'admin'));
CREATE POLICY "posters_originals admin insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'posters-originals' AND private.has_role(auth.uid(), 'admin'));
CREATE POLICY "posters_originals admin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'posters-originals' AND private.has_role(auth.uid(), 'admin'));
CREATE POLICY "posters_originals admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'posters-originals' AND private.has_role(auth.uid(), 'admin'));

-- Track originals on posters
ALTER TABLE public.posters ADD COLUMN IF NOT EXISTS original_url text;