
-- Fast fuzzy search for posters
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Trigram index on description for fuzzy/ILIKE
CREATE INDEX IF NOT EXISTS posters_description_trgm_idx
  ON public.posters USING gin (description extensions.gin_trgm_ops);

-- SEO title trigram (small but useful)
CREATE INDEX IF NOT EXISTS posters_seo_title_trgm_idx
  ON public.posters USING gin (seo_title extensions.gin_trgm_ops);

-- Tag-aware trigram on flattened tags (helps fuzzy on tags)
-- (already have gin(tags) for exact; trigram on array_to_string for fuzzy)
CREATE OR REPLACE FUNCTION public.posters_tags_text(p_tags text[])
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(array_to_string(p_tags, ' '), '');
$$;

CREATE INDEX IF NOT EXISTS posters_tags_text_trgm_idx
  ON public.posters USING gin ((public.posters_tags_text(tags)) extensions.gin_trgm_ops);

-- Main fuzzy search RPC
CREATE OR REPLACE FUNCTION public.search_posters(q text, lim int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  title text,
  image_url text,
  category_id uuid,
  category_slug text,
  category_name text,
  tags text[],
  badge text,
  score real
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH params AS (
    SELECT
      lower(btrim(coalesce(q, ''))) AS qn,
      '%' || lower(btrim(coalesce(q, ''))) || '%' AS qlike
  )
  SELECT
    p.id,
    p.title,
    p.image_url,
    p.category_id,
    c.slug AS category_slug,
    c.name AS category_name,
    p.tags,
    p.badge,
    GREATEST(
      similarity(lower(coalesce(p.title,'')), params.qn),
      similarity(lower(coalesce(p.description,'')), params.qn) * 0.7,
      similarity(lower(coalesce(p.seo_title,'')), params.qn) * 0.8,
      similarity(lower(public.posters_tags_text(p.tags)), params.qn) * 0.9,
      similarity(lower(coalesce(c.name,'')), params.qn) * 0.8,
      CASE WHEN params.qn = ANY(SELECT lower(unnest(coalesce(p.tags, ARRAY[]::text[])))) THEN 1.0 ELSE 0 END
    )::real AS score
  FROM public.posters p
  LEFT JOIN public.categories c ON c.id = p.category_id
  CROSS JOIN params
  WHERE p.hidden = false
    AND params.qn <> ''
    AND (
      lower(p.title) LIKE params.qlike
      OR lower(coalesce(p.description,'')) LIKE params.qlike
      OR lower(coalesce(p.seo_title,'')) LIKE params.qlike
      OR lower(coalesce(p.seo_description,'')) LIKE params.qlike
      OR lower(public.posters_tags_text(p.tags)) LIKE params.qlike
      OR lower(coalesce(c.name,'')) LIKE params.qlike
      OR lower(coalesce(c.slug,'')) LIKE params.qlike
      OR similarity(lower(p.title), params.qn) > 0.25
      OR similarity(lower(public.posters_tags_text(p.tags)), params.qn) > 0.3
    )
  ORDER BY score DESC, p.sales_count DESC NULLS LAST, p.views_count DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(coalesce(lim, 50), 200));
$$;

GRANT EXECUTE ON FUNCTION public.search_posters(text, int) TO anon, authenticated;

-- Trending searches (last 7 days, min length 2)
CREATE OR REPLACE FUNCTION public.trending_searches(lim int DEFAULT 8)
RETURNS TABLE (query text, count bigint)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(btrim(query)) AS query, COUNT(*)::bigint AS count
  FROM public.search_queries
  WHERE created_at > now() - interval '7 days'
    AND length(btrim(query)) >= 2
  GROUP BY lower(btrim(query))
  ORDER BY count DESC, max(created_at) DESC
  LIMIT GREATEST(1, LEAST(coalesce(lim, 8), 25));
$$;

GRANT EXECUTE ON FUNCTION public.trending_searches(int) TO anon, authenticated;
