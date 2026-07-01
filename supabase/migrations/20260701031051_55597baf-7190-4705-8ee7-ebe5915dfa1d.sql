
CREATE TABLE public.hero_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text NOT NULL,
  title text,
  subtitle text,
  button_text text,
  button_link text,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hero_banners TO anon, authenticated;
GRANT ALL ON public.hero_banners TO authenticated;
GRANT ALL ON public.hero_banners TO service_role;
ALTER TABLE public.hero_banners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hero_banners read" ON public.hero_banners FOR SELECT USING (true);
CREATE POLICY "hero_banners admin write" ON public.hero_banners FOR ALL
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX hero_banners_order_idx ON public.hero_banners (sort_order);
