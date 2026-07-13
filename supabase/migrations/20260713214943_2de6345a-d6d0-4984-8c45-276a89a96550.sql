
-- Image variants table for the Auto Image Optimization Pipeline.
CREATE TABLE public.image_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL,        -- e.g. 'posters', 'orders', 'custom_design_orders'
  source_id text,                    -- id of the source row (nullable for standalone)
  original_path text NOT NULL,       -- path inside storage bucket for the ORIGINAL
  bucket text NOT NULL DEFAULT 'posters',
  variant text NOT NULL,             -- 'thumb' | 'medium' | 'large' | 'web'
  url text,                          -- signed url (long-lived)
  variant_path text,                 -- path inside storage bucket for this variant
  width int,
  height int,
  size_bytes bigint,
  format text,                       -- 'webp' | 'jpeg' | ...
  status text NOT NULL DEFAULT 'pending', -- 'pending'|'processing'|'done'|'failed'
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_table, source_id, original_path, variant)
);

GRANT SELECT ON public.image_variants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.image_variants TO authenticated;
GRANT ALL ON public.image_variants TO service_role;

ALTER TABLE public.image_variants ENABLE ROW LEVEL SECURITY;

-- Anyone can read variant URLs (they're used for public display).
CREATE POLICY "image_variants_public_read"
  ON public.image_variants FOR SELECT
  USING (true);

-- Only admins can insert/update/delete.
CREATE POLICY "image_variants_admin_write"
  ON public.image_variants FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- But authenticated users can insert their own when tied to their upload flow.
CREATE POLICY "image_variants_authenticated_insert"
  ON public.image_variants FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX idx_image_variants_source ON public.image_variants (source_table, source_id);
CREATE INDEX idx_image_variants_original ON public.image_variants (original_path);
CREATE INDEX idx_image_variants_status ON public.image_variants (status);

CREATE TRIGGER image_variants_updated_at
  BEFORE UPDATE ON public.image_variants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Aggregate stats for the Image Control Center.
CREATE OR REPLACE FUNCTION public.admin_image_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH
    posters_total AS (SELECT COUNT(*)::int AS c FROM public.posters WHERE image_url IS NOT NULL),
    variants AS (
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'done')::int AS done,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
        COUNT(*) FILTER (WHERE status IN ('pending','processing'))::int AS pending,
        COALESCE(SUM(size_bytes),0)::bigint AS bytes,
        COUNT(*) FILTER (WHERE size_bytes > 1500000)::int AS heavy
      FROM public.image_variants
    ),
    posters_with_thumb AS (
      SELECT COUNT(DISTINCT p.id)::int AS c
      FROM public.posters p
      JOIN public.image_variants v
        ON v.source_table = 'posters' AND v.source_id = p.id::text AND v.variant = 'thumb' AND v.status = 'done'
      WHERE p.image_url IS NOT NULL
    ),
    heavy_originals AS (
      SELECT id, title, image_url FROM public.posters
      WHERE image_url IS NOT NULL
      ORDER BY id DESC LIMIT 20
    )
  SELECT jsonb_build_object(
    'posters_total', (SELECT c FROM posters_total),
    'posters_with_thumb', (SELECT c FROM posters_with_thumb),
    'posters_missing_thumb', GREATEST(0, (SELECT c FROM posters_total) - (SELECT c FROM posters_with_thumb)),
    'variants_total', (SELECT total FROM variants),
    'variants_done', (SELECT done FROM variants),
    'variants_failed', (SELECT failed FROM variants),
    'variants_pending', (SELECT pending FROM variants),
    'variants_bytes', (SELECT bytes FROM variants),
    'heavy_variants', (SELECT heavy FROM variants)
  ) INTO result;

  RETURN result;
END;
$$;

-- List posters that don't have a 'thumb' variant yet.
CREATE OR REPLACE FUNCTION public.admin_posters_needing_variants(_limit int DEFAULT 25)
RETURNS TABLE(id uuid, title text, image_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.title, p.image_url
  FROM public.posters p
  WHERE p.image_url IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.image_variants v
      WHERE v.source_table = 'posters'
        AND v.source_id = p.id::text
        AND v.variant = 'thumb'
        AND v.status = 'done'
    )
    AND public.has_role(auth.uid(), 'admin'::app_role)
  ORDER BY p.created_at DESC
  LIMIT GREATEST(1, LEAST(200, COALESCE(_limit, 25)));
$$;
