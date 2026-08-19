DROP POLICY IF EXISTS "site_settings read" ON public.site_settings;
DROP POLICY IF EXISTS "site_settings public read" ON public.site_settings;
DROP POLICY IF EXISTS "site_settings admin draft read" ON public.site_settings;

CREATE POLICY "site_settings public read"
ON public.site_settings
FOR SELECT
USING (key <> 'homepage_sections_draft_v1');

CREATE POLICY "site_settings admin draft read"
ON public.site_settings
FOR SELECT
TO authenticated
USING (
  key = 'homepage_sections_draft_v1'
  AND private.has_role(auth.uid(), 'admin')
);
