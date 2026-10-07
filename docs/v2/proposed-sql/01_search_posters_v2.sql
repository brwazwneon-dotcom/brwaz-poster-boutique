-- PROPOSED, NOT APPLIED. Additive: creates a NEW function; search_posters (v1) is untouched.
-- Reason: Arabic normalization, token-AND matching ("spider man"), prefix boost ("spider"), exact-title boost.
-- Risk: low (read-only function). Rollback: DROP FUNCTION public.search_posters_v2(text,int); DROP FUNCTION public.ar_norm(text);
-- Apply order: run on a Supabase BRANCH/dev project first, compare results against v1, then production by the owner.
-- The client (SearchBox) calls v2 and silently falls back to v1 if v2 does not exist.

CREATE OR REPLACE FUNCTION public.ar_norm(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT lower(btrim(regexp_replace(
    regexp_replace(
      translate(
        regexp_replace(coalesce(t,''), '[\u064B-\u065F\u0670\u0640]', '', 'g'),   -- diacritics, tatweel
        'أإآٱىةؤئ', 'اااايهوي'),                                                       -- alef/ya/ta-marbuta/hamza folding
      '[-_:.,!?()\[\]/\\&''"+*]', ' ', 'g'),                                         -- punctuation -> space
    '\s+', ' ', 'g')))
$$;

CREATE OR REPLACE FUNCTION public.search_posters_v2(q text, lim int DEFAULT 24)
RETURNS TABLE (id uuid, title text, image_url text, category_id uuid, category_slug text,
               category_name text, tags text[], badge text, score real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  WITH params AS (
    SELECT public.ar_norm(q) AS qn,
           replace(public.ar_norm(q), ' ', '') AS qs,
           ARRAY(SELECT t FROM unnest(string_to_array(public.ar_norm(q), ' ')) t WHERE length(t) >= 2) AS toks
  ), docs AS (
    SELECT p.*, c.slug AS cslug, c.name AS cname,
           public.ar_norm(coalesce(p.title,'') || ' ' || coalesce(p.seo_title,'') || ' ' ||
                          public.posters_tags_text(p.tags) || ' ' || coalesce(c.name,'') || ' ' || coalesce(c.slug,'')) AS hay,
           public.ar_norm(coalesce(p.title,'')) AS ntitle,
           public.ar_norm(public.posters_tags_text(p.tags)) AS ntags
    FROM public.posters p LEFT JOIN public.categories c ON c.id = p.category_id
    WHERE p.hidden = false
  )
  SELECT d.id, d.title, d.image_url, d.category_id, d.cslug, d.cname, d.tags, d.badge,
    ( CASE WHEN d.ntitle = pr.qn THEN 3 ELSE 0 END
    + CASE WHEN d.ntitle LIKE pr.qn || '%' THEN 1.5 ELSE 0 END
    + CASE WHEN replace(d.ntitle, ' ', '') LIKE '%' || pr.qs || '%' THEN 1 ELSE 0 END   -- "spiderman" ~ "Spider-Man"
    + CASE WHEN d.hay LIKE '%' || pr.qn || '%' THEN 0.5 ELSE 0 END
    + greatest(similarity(d.ntitle, pr.qn), word_similarity(pr.qn, d.ntitle) * 0.8, word_similarity(pr.qn, d.ntags) * 0.6) )::real AS score
  FROM docs d CROSS JOIN params pr
  WHERE length(pr.qs) >= 2
    AND ( (cardinality(pr.toks) > 0 AND NOT EXISTS (SELECT 1 FROM unnest(pr.toks) t WHERE d.hay NOT LIKE '%' || t || '%'))  -- all tokens present
          OR replace(d.hay, ' ', '') LIKE '%' || pr.qs || '%'                                                                 -- spacing-insensitive
          OR similarity(d.ntitle, pr.qn) > 0.25                                                                               -- typo tolerance
          OR word_similarity(pr.qn, d.ntitle) > 0.5
          OR word_similarity(pr.qn, d.ntags) > 0.5 )
  ORDER BY score DESC, d.sales_count DESC NULLS LAST, d.views_count DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(coalesce(lim, 24), 100));
$$;
GRANT EXECUTE ON FUNCTION public.search_posters_v2(text,int) TO anon, authenticated;
-- Tested on a scratch PostgreSQL 16 (see docs/v2/proposed-sql/search_v2_test_results.md).
-- Perf note: scans visible posters per query (fine for ~10k rows; verify with EXPLAIN ANALYZE on a branch).
-- If slow, add a generated normalized column + gin_trgm index instead of computing `hay` inline.
