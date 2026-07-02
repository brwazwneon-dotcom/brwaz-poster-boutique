ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';

ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_status_check;
ALTER TABLE public.categories
  ADD CONSTRAINT categories_status_check CHECK (status IN ('published','draft'));

CREATE INDEX IF NOT EXISTS categories_status_idx ON public.categories(status);
CREATE INDEX IF NOT EXISTS categories_featured_idx ON public.categories(featured) WHERE featured = true;