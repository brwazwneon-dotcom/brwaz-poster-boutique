
CREATE OR REPLACE FUNCTION public.admin_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  today_start timestamptz := date_trunc('day', now());
  week_start timestamptz := date_trunc('day', now()) - interval '6 days';
  month_start timestamptz := date_trunc('day', now()) - interval '29 days';
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH
    v_today AS (
      SELECT COUNT(DISTINCT visitor_id) AS c FROM public.analytics_visits WHERE created_at >= today_start
    ),
    v_total AS (
      SELECT COUNT(DISTINCT visitor_id) AS c FROM public.analytics_visits
    ),
    o_today AS (
      SELECT COUNT(*)::int AS c, COALESCE(SUM(total_price), 0)::numeric AS rev
      FROM public.orders WHERE created_at >= today_start
    ),
    o_week AS (
      SELECT COALESCE(SUM(total_price), 0)::numeric AS rev FROM public.orders WHERE created_at >= week_start
    ),
    o_month AS (
      SELECT COALESCE(SUM(total_price), 0)::numeric AS rev FROM public.orders WHERE created_at >= month_start
    ),
    o_total AS (
      SELECT COUNT(*)::int AS c, COALESCE(SUM(total_price), 0)::numeric AS rev FROM public.orders
    ),
    top_sales AS (
      SELECT id, title, image_url, sales_count
      FROM public.posters WHERE sales_count > 0
      ORDER BY sales_count DESC LIMIT 10
    ),
    top_views AS (
      SELECT id, title, image_url, views_count
      FROM public.posters WHERE views_count > 0
      ORDER BY views_count DESC LIMIT 10
    ),
    top_cart AS (
      SELECT id, title, image_url, cart_adds_count
      FROM public.posters WHERE cart_adds_count > 0
      ORDER BY cart_adds_count DESC LIMIT 10
    ),
    top_wish AS (
      SELECT p.id, p.title, p.image_url, COUNT(w.*)::int AS wishlist_count
      FROM public.wishlists w JOIN public.posters p ON p.id = w.poster_id
      GROUP BY p.id, p.title, p.image_url
      ORDER BY COUNT(w.*) DESC LIMIT 10
    ),
    top_cats AS (
      SELECT c.id, c.name, c.slug, COALESCE(SUM(p.sales_count), 0)::int AS sales,
             COALESCE(SUM(p.views_count), 0)::int AS views
      FROM public.categories c LEFT JOIN public.posters p ON p.category_id = c.id
      GROUP BY c.id, c.name, c.slug
      ORDER BY sales DESC NULLS LAST, views DESC NULLS LAST LIMIT 10
    ),
    top_searches AS (
      SELECT lower(query) AS q, COUNT(*)::int AS c
      FROM public.search_queries
      GROUP BY lower(query) ORDER BY COUNT(*) DESC LIMIT 20
    ),
    top_govs AS (
      SELECT governorate, COUNT(*)::int AS orders, COALESCE(SUM(total_price), 0)::numeric AS revenue
      FROM public.orders WHERE governorate IS NOT NULL AND governorate <> ''
      GROUP BY governorate ORDER BY COUNT(*) DESC LIMIT 15
    ),
    devices AS (
      SELECT device, COUNT(DISTINCT visitor_id)::int AS visitors
      FROM public.analytics_visits WHERE device IS NOT NULL
      GROUP BY device ORDER BY visitors DESC
    ),
    sources AS (
      SELECT source, COUNT(DISTINCT visitor_id)::int AS visitors
      FROM public.analytics_visits WHERE source IS NOT NULL
      GROUP BY source ORDER BY visitors DESC
    ),
    conversions AS (
      SELECT
        (SELECT COUNT(*) FROM public.photo_orders)::int AS photo_printing,
        (SELECT COUNT(*) FROM public.custom_design_orders)::int AS custom_design,
        (SELECT COUNT(*) FROM public.orders WHERE frame_type ILIKE '%wood%')::int AS wooden_portrait,
        (SELECT COUNT(*) FROM public.orders WHERE frame_color ILIKE '%black%')::int AS black_frame,
        (SELECT COUNT(*) FROM public.orders WHERE frame_color ILIKE '%white%')::int AS white_frame,
        (SELECT COUNT(*) FROM public.orders WHERE packaging_fee > 0)::int AS offers
    )
  SELECT jsonb_build_object(
    'visitors_today', (SELECT c FROM v_today),
    'visitors_total', (SELECT c FROM v_total),
    'orders_today', (SELECT c FROM o_today),
    'revenue_today', (SELECT rev FROM o_today),
    'revenue_week', (SELECT rev FROM o_week),
    'revenue_month', (SELECT rev FROM o_month),
    'orders_total', (SELECT c FROM o_total),
    'revenue_total', (SELECT rev FROM o_total),
    'top_selling', COALESCE((SELECT jsonb_agg(to_jsonb(top_sales)) FROM top_sales), '[]'::jsonb),
    'top_viewed', COALESCE((SELECT jsonb_agg(to_jsonb(top_views)) FROM top_views), '[]'::jsonb),
    'top_cart', COALESCE((SELECT jsonb_agg(to_jsonb(top_cart)) FROM top_cart), '[]'::jsonb),
    'top_wishlisted', COALESCE((SELECT jsonb_agg(to_jsonb(top_wish)) FROM top_wish), '[]'::jsonb),
    'top_categories', COALESCE((SELECT jsonb_agg(to_jsonb(top_cats)) FROM top_cats), '[]'::jsonb),
    'top_searches', COALESCE((SELECT jsonb_agg(to_jsonb(top_searches)) FROM top_searches), '[]'::jsonb),
    'top_governorates', COALESCE((SELECT jsonb_agg(to_jsonb(top_govs)) FROM top_govs), '[]'::jsonb),
    'devices', COALESCE((SELECT jsonb_agg(to_jsonb(devices)) FROM devices), '[]'::jsonb),
    'sources', COALESCE((SELECT jsonb_agg(to_jsonb(sources)) FROM sources), '[]'::jsonb),
    'conversions', (SELECT to_jsonb(conversions) FROM conversions)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dashboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard() TO authenticated;
