
CREATE OR REPLACE FUNCTION public.admin_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  today_start timestamptz := date_trunc('day', now());
  week_start timestamptz := date_trunc('day', now()) - interval '6 days';
  month_start timestamptz := date_trunc('day', now()) - interval '29 days';
  chart_start timestamptz := date_trunc('day', now()) - interval '13 days';
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH
    v_today AS (SELECT COUNT(DISTINCT visitor_id) AS c FROM public.analytics_visits WHERE created_at >= today_start),
    v_month AS (SELECT COUNT(DISTINCT visitor_id) AS c FROM public.analytics_visits WHERE created_at >= month_start),
    v_total AS (SELECT COUNT(DISTINCT visitor_id) AS c FROM public.analytics_visits),
    o_today AS (SELECT COUNT(*)::int AS c, COALESCE(SUM(total_price), 0)::numeric AS rev FROM public.orders WHERE created_at >= today_start),
    o_week AS (SELECT COALESCE(SUM(total_price), 0)::numeric AS rev FROM public.orders WHERE created_at >= week_start),
    o_month AS (SELECT COALESCE(SUM(total_price), 0)::numeric AS rev FROM public.orders WHERE created_at >= month_start),
    o_total AS (SELECT COUNT(*)::int AS c, COALESCE(SUM(total_price), 0)::numeric AS rev FROM public.orders),
    o_status AS (
      SELECT
        COUNT(*) FILTER (WHERE status IN ('new','pending','processing'))::int AS pending,
        COUNT(*) FILTER (WHERE status IN ('completed','delivered','shipped'))::int AS completed,
        COUNT(*) FILTER (WHERE status IN ('cancelled','canceled','refunded'))::int AS cancelled
      FROM public.orders
    ),
    chart_days AS (SELECT generate_series(chart_start::date, today_start::date, interval '1 day')::date AS d),
    orders_by_day AS (
      SELECT date_trunc('day', created_at)::date AS d, COUNT(*)::int AS orders, COALESCE(SUM(total_price), 0)::numeric AS revenue
      FROM public.orders WHERE created_at >= chart_start GROUP BY 1
    ),
    visitors_by_day AS (
      SELECT date_trunc('day', created_at)::date AS d, COUNT(DISTINCT visitor_id)::int AS visitors
      FROM public.analytics_visits WHERE created_at >= chart_start GROUP BY 1
    ),
    chart AS (
      SELECT to_char(cd.d, 'YYYY-MM-DD') AS day,
             COALESCE(o.orders, 0) AS orders,
             COALESCE(o.revenue, 0) AS revenue,
             COALESCE(v.visitors, 0) AS visitors
      FROM chart_days cd
      LEFT JOIN orders_by_day o ON o.d = cd.d
      LEFT JOIN visitors_by_day v ON v.d = cd.d
      ORDER BY cd.d
    ),
    top_sales AS (SELECT id, title, image_url, sales_count FROM public.posters WHERE sales_count > 0 ORDER BY sales_count DESC LIMIT 10),
    top_views AS (SELECT id, title, image_url, views_count FROM public.posters WHERE views_count > 0 ORDER BY views_count DESC LIMIT 10),
    top_cart AS (SELECT id, title, image_url, cart_adds_count FROM public.posters WHERE cart_adds_count > 0 ORDER BY cart_adds_count DESC LIMIT 10),
    top_wish AS (
      SELECT p.id, p.title, p.image_url, COUNT(w.*)::int AS wishlist_count
      FROM public.wishlists w JOIN public.posters p ON p.id = w.poster_id
      GROUP BY p.id, p.title, p.image_url ORDER BY COUNT(w.*) DESC LIMIT 10
    ),
    top_cats AS (
      SELECT c.id, c.name, c.slug, COALESCE(SUM(p.sales_count), 0)::int AS sales, COALESCE(SUM(p.views_count), 0)::int AS views
      FROM public.categories c LEFT JOIN public.posters p ON p.category_id = c.id
      GROUP BY c.id, c.name, c.slug ORDER BY sales DESC NULLS LAST, views DESC NULLS LAST LIMIT 10
    ),
    top_searches AS (SELECT lower(query) AS q, COUNT(*)::int AS c FROM public.search_queries GROUP BY lower(query) ORDER BY COUNT(*) DESC LIMIT 20),
    top_govs AS (
      SELECT governorate, COUNT(*)::int AS orders, COALESCE(SUM(total_price), 0)::numeric AS revenue
      FROM public.orders WHERE governorate IS NOT NULL AND governorate <> ''
      GROUP BY governorate ORDER BY COUNT(*) DESC LIMIT 15
    ),
    devices AS (SELECT device, COUNT(DISTINCT visitor_id)::int AS visitors FROM public.analytics_visits WHERE device IS NOT NULL GROUP BY device ORDER BY visitors DESC),
    sources AS (SELECT source, COUNT(DISTINCT visitor_id)::int AS visitors FROM public.analytics_visits WHERE source IS NOT NULL GROUP BY source ORDER BY visitors DESC),
    recent_orders AS (
      SELECT id, order_number, customer_name, governorate, total_price, status, created_at
      FROM public.orders ORDER BY created_at DESC LIMIT 8
    ),
    recent_customers AS (
      SELECT DISTINCT ON (lower(customer_name||'|'||COALESCE(phone,'')))
        customer_name, phone, governorate, created_at
      FROM public.orders WHERE customer_name IS NOT NULL
      ORDER BY lower(customer_name||'|'||COALESCE(phone,'')), created_at DESC LIMIT 8
    ),
    recent_reviews AS (
      SELECT id, customer_name, rating, review_text, governorate, created_at, status
      FROM public.reviews ORDER BY created_at DESC LIMIT 6
    ),
    recent_custom AS (
      SELECT id, customer_name, total_price,
             COALESCE(array_length(image_paths, 1), 0) AS image_count,
             created_at
      FROM public.custom_design_orders ORDER BY created_at DESC LIMIT 6
    ),
    conversions AS (
      SELECT
        (SELECT COUNT(*) FROM public.photo_orders)::int AS photo_printing,
        (SELECT COUNT(*) FROM public.custom_design_orders)::int AS custom_design,
        (SELECT COUNT(*) FROM public.orders WHERE frame_type ILIKE '%wood%')::int AS wooden_portrait,
        (SELECT COUNT(*) FROM public.orders WHERE frame_type ILIKE '%pvc%' OR frame_type ILIKE '%frame%')::int AS frame_orders,
        (SELECT COUNT(*) FROM public.orders WHERE frame_color ILIKE '%black%')::int AS black_frame,
        (SELECT COUNT(*) FROM public.orders WHERE frame_color ILIKE '%white%')::int AS white_frame,
        (SELECT COUNT(*) FROM public.orders WHERE packaging_fee > 0)::int AS offers
    ),
    health AS (
      SELECT
        (SELECT COUNT(*) FROM public.posters WHERE image_url IS NULL OR image_url = '')::int AS posters_missing_image,
        (SELECT COUNT(*) FROM public.posters WHERE hidden = true)::int AS posters_hidden,
        (SELECT COUNT(*) FROM public.reviews WHERE status = 'pending')::int AS reviews_pending
    )
  SELECT jsonb_build_object(
    'visitors_today', (SELECT c FROM v_today),
    'visitors_month', (SELECT c FROM v_month),
    'visitors_total', (SELECT c FROM v_total),
    'orders_today', (SELECT c FROM o_today),
    'revenue_today', (SELECT rev FROM o_today),
    'revenue_week', (SELECT rev FROM o_week),
    'revenue_month', (SELECT rev FROM o_month),
    'orders_total', (SELECT c FROM o_total),
    'revenue_total', (SELECT rev FROM o_total),
    'orders_pending', (SELECT pending FROM o_status),
    'orders_completed', (SELECT completed FROM o_status),
    'orders_cancelled', (SELECT cancelled FROM o_status),
    'chart_14d', COALESCE((SELECT jsonb_agg(to_jsonb(chart)) FROM chart), '[]'::jsonb),
    'top_selling', COALESCE((SELECT jsonb_agg(to_jsonb(top_sales)) FROM top_sales), '[]'::jsonb),
    'top_viewed', COALESCE((SELECT jsonb_agg(to_jsonb(top_views)) FROM top_views), '[]'::jsonb),
    'top_cart', COALESCE((SELECT jsonb_agg(to_jsonb(top_cart)) FROM top_cart), '[]'::jsonb),
    'top_wishlisted', COALESCE((SELECT jsonb_agg(to_jsonb(top_wish)) FROM top_wish), '[]'::jsonb),
    'top_categories', COALESCE((SELECT jsonb_agg(to_jsonb(top_cats)) FROM top_cats), '[]'::jsonb),
    'top_searches', COALESCE((SELECT jsonb_agg(to_jsonb(top_searches)) FROM top_searches), '[]'::jsonb),
    'top_governorates', COALESCE((SELECT jsonb_agg(to_jsonb(top_govs)) FROM top_govs), '[]'::jsonb),
    'devices', COALESCE((SELECT jsonb_agg(to_jsonb(devices)) FROM devices), '[]'::jsonb),
    'sources', COALESCE((SELECT jsonb_agg(to_jsonb(sources)) FROM sources), '[]'::jsonb),
    'recent_orders', COALESCE((SELECT jsonb_agg(to_jsonb(recent_orders)) FROM recent_orders), '[]'::jsonb),
    'recent_customers', COALESCE((SELECT jsonb_agg(to_jsonb(recent_customers)) FROM recent_customers), '[]'::jsonb),
    'recent_reviews', COALESCE((SELECT jsonb_agg(to_jsonb(recent_reviews)) FROM recent_reviews), '[]'::jsonb),
    'recent_custom', COALESCE((SELECT jsonb_agg(to_jsonb(recent_custom)) FROM recent_custom), '[]'::jsonb),
    'conversions', (SELECT to_jsonb(conversions) FROM conversions),
    'health', (SELECT to_jsonb(health) FROM health)
  ) INTO result;
  RETURN result;
END;
$function$;
