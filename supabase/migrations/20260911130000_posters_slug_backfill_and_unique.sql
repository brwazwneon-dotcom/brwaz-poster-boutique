-- =========================================================
-- Backfill + enforce unique slugs on public.posters
-- =========================================================
-- Context: `posters.slug` (added 2026-07-01) is populated by the AI
-- poster-upload flow (src/components/admin/AiPosterUpload.tsx) but was
-- never backfilled for posters created before that flow existed, and has
-- no uniqueness guarantee — two posters can already share a slug today.
-- This is a blocker for giving every poster a real, permanent URL
-- (the planned /poster/$slug page): a NULL or duplicate slug means no
-- reliable canonical address for that product.
--
-- This migration is purely additive/corrective — it does not touch any
-- existing pricing, order, or auth logic, and it does not remove data.
-- Safe to run any number of times (idempotent).
-- =========================================================

-- 1) Slugify any poster missing a slug, from its title.
UPDATE public.posters
SET slug = lower(
  regexp_replace(
    regexp_replace(trim(title), '[^a-zA-Z0-9]+', '-', 'g'),
    '(^-+)|(-+$)', '', 'g'
  )
)
WHERE slug IS NULL OR btrim(slug) = '';

-- Guard against a title that slugifies to an empty string (e.g. title was
-- all punctuation/non-latin with no ascii letters/digits) — fall back to
-- a short id-based slug so every row still gets a usable, unique value.
UPDATE public.posters
SET slug = 'poster-' || substr(id::text, 1, 8)
WHERE slug IS NULL OR btrim(slug) = '';

-- 2) Resolve collisions (two+ posters that ended up with the same slug,
--    whether from the AI flow or the backfill above) by suffixing every
--    row after the first with a short, stable piece of its own id.
--    Ordering by created_at keeps the earliest poster's URL unchanged,
--    which matters if that URL is already indexed or shared anywhere.
WITH ranked AS (
  SELECT
    id,
    slug,
    row_number() OVER (PARTITION BY slug ORDER BY created_at, id) AS rn
  FROM public.posters
)
UPDATE public.posters p
SET slug = p.slug || '-' || substr(p.id::text, 1, 6)
FROM ranked r
WHERE p.id = r.id AND r.rn > 1;

-- 3) Enforce uniqueness going forward. Safe now that step 2 removed all
--    existing duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS posters_slug_unique_idx ON public.posters (slug);

-- 4) Keep new posters honest: NOT NULL once every row has a value.
ALTER TABLE public.posters ALTER COLUMN slug SET NOT NULL;
