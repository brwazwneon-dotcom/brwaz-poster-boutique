
-- Badge column for social proof
ALTER TABLE public.posters
  ADD COLUMN IF NOT EXISTS badge text;

-- Allow anon/authenticated to atomically bump view counts
CREATE OR REPLACE FUNCTION public.increment_poster_views(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.posters SET views_count = views_count + 1 WHERE id = p_id;
$$;

REVOKE ALL ON FUNCTION public.increment_poster_views(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_poster_views(uuid) TO anon, authenticated, service_role;

-- Bump purchase / sales counts after an order is placed
CREATE OR REPLACE FUNCTION public.increment_poster_sales(p_ids uuid[], p_qty int)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.posters
    SET sales_count = sales_count + COALESCE(p_qty, 1)
    WHERE id = ANY(p_ids);
$$;

REVOKE ALL ON FUNCTION public.increment_poster_sales(uuid[], int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_poster_sales(uuid[], int) TO anon, authenticated, service_role;
