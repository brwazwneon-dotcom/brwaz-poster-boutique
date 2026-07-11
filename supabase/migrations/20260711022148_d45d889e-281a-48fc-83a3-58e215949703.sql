-- Add trending fields for the "Trending Now" homepage section
ALTER TABLE public.posters
  ADD COLUMN IF NOT EXISTS trending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trending_order integer;

CREATE INDEX IF NOT EXISTS posters_trending_idx
  ON public.posters (trending, trending_order)
  WHERE trending = true;