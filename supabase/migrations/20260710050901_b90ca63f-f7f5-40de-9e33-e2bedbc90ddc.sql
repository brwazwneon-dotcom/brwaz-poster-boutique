ALTER TABLE public.posters
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'ready';

CREATE INDEX IF NOT EXISTS posters_review_status_idx ON public.posters (review_status);
CREATE INDEX IF NOT EXISTS posters_category_id_idx ON public.posters (category_id);
