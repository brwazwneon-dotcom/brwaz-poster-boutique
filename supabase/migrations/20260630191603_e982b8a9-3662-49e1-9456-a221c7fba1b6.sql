
ALTER TABLE public.poster_images
  ADD COLUMN IF NOT EXISTS label TEXT,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS poster_images_poster_id_sort_idx ON public.poster_images(poster_id, sort_order);

CREATE TABLE IF NOT EXISTS public.before_after (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  description TEXT,
  before_url TEXT NOT NULL,
  after_url TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT 'homepage',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.before_after TO anon, authenticated;
GRANT ALL ON public.before_after TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.before_after TO authenticated;

ALTER TABLE public.before_after ENABLE ROW LEVEL SECURITY;

CREATE POLICY "before_after public read"
  ON public.before_after FOR SELECT
  USING (active = true OR private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "before_after admin write"
  ON public.before_after FOR ALL
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER before_after_updated_at
  BEFORE UPDATE ON public.before_after
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
