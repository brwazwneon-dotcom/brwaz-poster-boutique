
CREATE TABLE public.sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  image_url text,
  frames_count int NOT NULL DEFAULT 1,
  price numeric NOT NULL DEFAULT 0,
  old_price numeric,
  enabled boolean NOT NULL DEFAULT true,
  featured boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sets TO authenticated;
GRANT ALL ON public.sets TO service_role;
ALTER TABLE public.sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sets public read enabled" ON public.sets FOR SELECT USING (enabled = true OR private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "sets admin write" ON public.sets FOR ALL USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  title text NOT NULL,
  image_url text,
  link text NOT NULL DEFAULT '/',
  sort_order int NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.highlights TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.highlights TO authenticated;
GRANT ALL ON public.highlights TO service_role;
ALTER TABLE public.highlights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "highlights public read enabled" ON public.highlights FOR SELECT USING (enabled = true OR private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "highlights admin write" ON public.highlights FOR ALL USING (private.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER sets_updated_at BEFORE UPDATE ON public.sets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER highlights_updated_at BEFORE UPDATE ON public.highlights FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.highlights (key, title, link, sort_order) VALUES
  ('football', 'Football', '/category/football', 1),
  ('movies', 'Movies', '/category/movies', 2),
  ('tv-series', 'TV Series', '/category/tv-series', 3),
  ('marvel-dc', 'Marvel & DC', '/category/marvel-dc', 4),
  ('anime', 'Anime', '/category/anime', 5),
  ('cars', 'Cars', '/category/cars', 6),
  ('custom-design', 'Custom Design', '/custom-design', 7),
  ('photo-printing', 'Photo Printing', '/photo-printing', 8),
  ('sets', 'Sets', '/sets', 9)
ON CONFLICT (key) DO NOTHING;
