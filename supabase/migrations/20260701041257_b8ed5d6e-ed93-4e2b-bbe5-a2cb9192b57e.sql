
ALTER TABLE public.posters
  ADD COLUMN IF NOT EXISTS colors text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS orientation text,
  ADD COLUMN IF NOT EXISTS ai_confidence numeric,
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS alt_text text;

CREATE INDEX IF NOT EXISTS posters_colors_idx ON public.posters USING gin (colors);
CREATE INDEX IF NOT EXISTS posters_orientation_idx ON public.posters (orientation);
