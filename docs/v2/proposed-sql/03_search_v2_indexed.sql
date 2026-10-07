-- PROPOSED, NOT APPLIED. Optional speed-up for 01_search_posters_v2.sql (apply 01 first: it defines ar_norm()).
-- Why: 01 normalizes every poster per query (~550-700 ms on 10k rows in a scratch PostgreSQL 16 test vs ~130 ms for v1).
-- This precomputes normalized search text once per poster and uses a trigram GIN index.
-- Schema change (additive): 2 nullable columns + 1 trigger + 1 index on public.posters.
-- Risk: low-medium. The backfill UPDATE writes every poster row once (run off-peak, on a branch first). It does not change any
--   visible column; the trigger only fills search_norm/search_sq. Rollback at the bottom.
-- Category names are matched through a small categories lookup inside the function (categories is tiny), so renaming a
--   category never needs a poster backfill.

ALTER TABLE public.posters ADD COLUMN IF NOT EXISTS search_norm text;
ALTER TABLE public.posters ADD COLUMN IF NOT EXISTS search_sq text;

CREATE OR REPLACE FUNCTION public.posters_set_search_norm() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, extensions AS $$
BEGIN
  NEW.search_norm := public.ar_norm(coalesce(NEW.title,'') || ' ' || coalesce(NEW.seo_title,'') || ' ' || public.posters_tags_text(NEW.tags));
  NEW.search_sq := replace(NEW.search_norm, ' ', '');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS posters_search_norm_trg ON public.posters;
CREATE TRIGGER posters_search_norm_trg BEFORE INSERT OR UPDATE OF title, seo_title, tags ON public.posters
  FOR EACH ROW EXECUTE FUNCTION public.posters_set_search_norm();

-- Backfill (one-off). Touches only the two new columns.
UPDATE public.posters SET title = title WHERE search_norm IS NULL;

CREATE INDEX IF NOT EXISTS posters_search_norm_trgm_idx ON public.posters USING gin (search_norm extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS posters_search_sq_trgm_idx   ON public.posters USING gin (search_sq   extensions.gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.search_posters_v2(q text, lim int DEFAULT 24)
RETURNS TABLE (id uuid, title text, image_url text, category_id uuid, category_slug text,
               category_name text, tags text[], badge text, score real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  WITH params AS (
    SELECT public.ar_norm(q) AS qn,
           replace(public.ar_norm(q), ' ', '') AS qs,
           ARRAY(SELECT t FROM unnest(string_to_array(public.ar_norm(q), ' ')) t WHERE length(t) >= 2) AS toks
  ), cats AS (  -- categories whose name/slug contains the whole query (tiny table)
    SELECT c.id FROM public.categories c, params pr
    WHERE length(pr.qs) >= 2 AND (public.ar_norm(c.name) LIKE '%' || pr.qn || '%' OR lower(c.slug) LIKE '%' || pr.qs || '%')
  ), cand AS (
    SELECT p.* FROM public.posters p, params pr
    WHERE p.hidden = false AND length(pr.qs) >= 2 AND p.search_norm IS NOT NULL
      AND ( (cardinality(pr.toks) > 0 AND NOT EXISTS (SELECT 1 FROM unnest(pr.toks) t WHERE p.search_norm NOT LIKE '%' || t || '%'))
            OR p.search_sq LIKE '%' || pr.qs || '%'
            OR pr.qn <% p.search_norm                                 -- trigram word-similarity typo tolerance (index-assisted)
            OR p.category_id IN (SELECT id FROM cats) )
  )
  SELECT d.id, d.title, d.image_url, d.category_id, c.slug, c.name, d.tags, d.badge,
    ( CASE WHEN public.ar_norm(d.title) = pr.qn THEN 3 ELSE 0 END
    + CASE WHEN d.search_norm LIKE pr.qn || '%' THEN 1.5 ELSE 0 END
    + CASE WHEN d.search_sq LIKE '%' || pr.qs || '%' THEN 1 ELSE 0 END
    + CASE WHEN d.category_id IN (SELECT id FROM cats) THEN 0.3 ELSE 0 END
    + greatest(similarity(d.search_norm, pr.qn), word_similarity(pr.qn, d.search_norm) * 0.8) )::real AS score
  FROM cand d CROSS JOIN params pr LEFT JOIN public.categories c ON c.id = d.category_id
  ORDER BY score DESC, d.sales_count DESC NULLS LAST, d.views_count DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(coalesce(lim, 24), 100));
$$;
GRANT EXECUTE ON FUNCTION public.search_posters_v2(text,int) TO anon, authenticated;

-- ROLLBACK:
--   (re-run 01_search_posters_v2.sql to restore the non-indexed function), then
--   DROP TRIGGER posters_search_norm_trg ON public.posters; DROP FUNCTION public.posters_set_search_norm();
--   DROP INDEX posters_search_norm_trgm_idx, posters_search_sq_trgm_idx;
--   ALTER TABLE public.posters DROP COLUMN search_norm, DROP COLUMN search_sq;
