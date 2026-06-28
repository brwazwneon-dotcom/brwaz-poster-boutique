
-- Nested categories
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description text;
CREATE INDEX IF NOT EXISTS categories_parent_id_idx ON public.categories(parent_id);

-- Poster enrichments
ALTER TABLE public.posters
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text,
  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sales_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS views_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price numeric;

-- Search performance
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS posters_title_trgm_idx ON public.posters USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS posters_tags_gin_idx ON public.posters USING gin (tags);
CREATE INDEX IF NOT EXISTS posters_category_id_idx ON public.posters(category_id);
CREATE INDEX IF NOT EXISTS posters_featured_idx ON public.posters(featured) WHERE featured = true;
CREATE INDEX IF NOT EXISTS posters_hidden_idx ON public.posters(hidden);
CREATE INDEX IF NOT EXISTS posters_created_at_idx ON public.posters(created_at DESC);
CREATE INDEX IF NOT EXISTS posters_sales_count_idx ON public.posters(sales_count DESC);
