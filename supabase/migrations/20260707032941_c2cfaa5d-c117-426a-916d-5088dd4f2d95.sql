
-- 1. Add is_test flag to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS orders_is_test_idx ON public.orders (is_test) WHERE is_test = true;

-- 2. Add hashtags column to posters
ALTER TABLE public.posters ADD COLUMN IF NOT EXISTS hashtags text[];

-- 3. AI SEO logs table
CREATE TABLE IF NOT EXISTS public.ai_seo_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poster_id uuid REFERENCES public.posters(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  status text NOT NULL,
  fields_updated text[] DEFAULT '{}'::text[],
  provider text,
  error text,
  admin_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ai_seo_logs TO authenticated;
GRANT ALL ON public.ai_seo_logs TO service_role;
ALTER TABLE public.ai_seo_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage seo logs"
  ON public.ai_seo_logs FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX IF NOT EXISTS ai_seo_logs_created_idx ON public.ai_seo_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_seo_logs_cat_idx ON public.ai_seo_logs (category_id);

-- 4. Update analytics functions to exclude test orders.
-- admin_dashboard: replace public.orders reads with a test-filtered view via a CTE prelude.
-- Simpler: create a helper view and switch references. But cheaper: alter each SELECT.
-- We use a lightweight approach: create a view real_orders and update the two RPCs to use it.
CREATE OR REPLACE VIEW public.real_orders
WITH (security_invoker=on) AS
SELECT * FROM public.orders WHERE is_test = false;
GRANT SELECT ON public.real_orders TO authenticated, service_role;

-- Rewrite admin_dashboard to use real_orders instead of orders (only orders references).
CREATE OR REPLACE FUNCTION public.admin_dashboard(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
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
  range_from timestamptz := COALESCE(p_from, date_trunc('day', now()) - interval '13 days');
  range_to timestamptz := COALESCE(p_to, date_trunc('day', now()) + interval '1 day');
  days_count int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  days_count := GREATEST(1, LEAST(180, (EXTRACT(EPOCH FROM (range_to - range_from)) / 86400)::int));

  WITH
    v_today AS (SELECT COUNT(DISTINCT visitor_id) AS c FROM public.analytics_visits WHERE created_at >= today_start),
    v_month AS (SELECT COUNT(DISTINCT visitor_id) AS c FROM public.analytics_visits WHERE created_at >= month_start),
    v_total AS (SELECT COUNT(DISTINCT visitor_id) AS c FROM public.analytics_visits),
    v_range AS (SELECT COUNT(DISTINCT visitor_id) AS c FROM public.analytics_visits WHERE created_at >= range_from AND created_at < range_to),
    o_today AS (SELECT COUNT(*)::int AS c, COALESCE(SUM(total_price), 0)::numeric AS rev FROM public.real_orders WHERE created_at >= today_start),
    o_week AS (SELECT COALESCE(SUM(total_price), 0)::numeric AS rev FROM public.real_orders WHERE created_at >= week_start),
    o_month AS (SELECT COALESCE(SUM(total_price), 0)::numeric AS rev FROM public.real_orders WHERE created_at >= month_start),
    o_total AS (SELECT COUNT(*)::int AS c, COALESCE(SUM(total_price), 0)::numeric AS rev FROM public.real_orders),
    o_range AS (SELECT COUNT(*)::int AS c, COALESCE(SUM(total_price), 0)::numeric AS rev FROM public.real_orders WHERE created_at >= range_from AND created_at < range_to),
    o_status AS (
      SELECT
        COUNT(*) FILTER (WHERE lower(coalesce(status,'')) IN ('new','pending'))::int AS pending,
        COUNT(*) FILTER (WHERE lower(coalesce(status,'')) = 'processing')::int AS processing,
        COUNT(*) FILTER (WHERE lower(coalesce(status,'')) = 'printed')::int AS printed,
        COUNT(*) FILTER (WHERE lower(coalesce(status,'')) = 'shipped')::int AS shipped,
        COUNT(*) FILTER (WHERE lower(coalesce(status,'')) = 'delivered')::int AS delivered,
        COUNT(*) FILTER (WHERE lower(coalesce(status,'')) IN ('completed'))::int AS completed,
        COUNT(*) FILTER (WHERE lower(coalesce(status,'')) IN ('cancelled','canceled','refunded'))::int AS cancelled
      FROM public.real_orders
    ),
    cust_keys AS (
      SELECT
        COALESCE(NULLIF(btrim(phone),''), NULLIF(btrim(lower(customer_name)),'')) AS k,
        MIN(created_at) AS first_order,
        COUNT(*) AS orders_count,
        SUM(total_price) AS total_spent,
        MAX(customer_name) AS name,
        MAX(governorate) AS gov,
        MAX(phone) AS phone
      FROM public.real_orders
      WHERE COALESCE(NULLIF(btrim(phone),''), NULLIF(btrim(lower(customer_name)),'')) IS NOT NULL
      GROUP BY 1
    ),
    cust_summary AS (
      SELECT
        COUNT(*)::int AS total_customers,
        COUNT(*) FILTER (WHERE orders_count > 1)::int AS returning_customers,
        COUNT(*) FILTER (WHERE first_order >= month_start)::int AS new_customers
      FROM cust_keys
    ),
    top_returning AS (
      SELECT name, phone, gov, orders_count::int AS orders, total_spent::numeric AS spent
      FROM cust_keys
      WHERE orders_count > 1
      ORDER BY orders_count DESC, total_spent DESC NULLS LAST
      LIMIT 10
    ),
    chart_days AS (SELECT generate_series(range_from::date, (range_to - interval '1 day')::date, interval '1 day')::date AS d),
    orders_by_day AS (
      SELECT date_trunc('day', created_at)::date AS d, COUNT(*)::int AS orders, COALESCE(SUM(total_price), 0)::numeric AS revenue
      FROM public.real_orders WHERE created_at >= range_from AND created_at < range_to GROUP BY 1
    ),
    visitors_by_day AS (
      SELECT date_trunc('day', created_at)::date AS d, COUNT(DISTINCT visitor_id)::int AS visitors
      FROM public.analytics_visits WHERE created_at >= range_from AND created_at < range_to GROUP BY 1
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
    lowest AS (
      SELECT id, title, image_url, views_count, sales_count
      FROM public.posters
      WHERE hidden = false AND views_count > 25 AND sales_count = 0
      ORDER BY views_count DESC LIMIT 10
    ),
    top_cats AS (
      SELECT c.id, c.name, c.slug, COALESCE(SUM(p.sales_count), 0)::int AS sales, COALESCE(SUM(p.views_count), 0)::int AS views
      FROM public.categories c LEFT JOIN public.posters p ON p.category_id = c.id
      WHERE c.parent_id IS NULL
      GROUP BY c.id, c.name, c.slug ORDER BY sales DESC NULLS LAST, views DESC NULLS LAST LIMIT 10
    ),
    top_subcats AS (
      SELECT c.id, c.name, c.slug, COALESCE(SUM(p.sales_count), 0)::int AS sales, COALESCE(SUM(p.views_count), 0)::int AS views
      FROM public.categories c LEFT JOIN public.posters p ON p.category_id = c.id
      WHERE c.parent_id IS NOT NULL
      GROUP BY c.id, c.name, c.slug ORDER BY sales DESC NULLS LAST, views DESC NULLS LAST LIMIT 10
    ),
    top_sizes AS (
      SELECT size, COUNT(*)::int AS orders, COALESCE(SUM(total_price),0)::numeric AS revenue
      FROM public.real_orders WHERE size IS NOT NULL AND size <> ''
      GROUP BY size ORDER BY COUNT(*) DESC LIMIT 6
    ),
    top_searches AS (SELECT lower(query) AS q, COUNT(*)::int AS c FROM public.search_queries GROUP BY lower(query) ORDER BY COUNT(*) DESC LIMIT 20),
    no_result_searches AS (
      SELECT lower(query) AS q, COUNT(*)::int AS c
      FROM public.search_queries WHERE results_count = 0
      GROUP BY lower(query) ORDER BY COUNT(*) DESC LIMIT 15
    ),
    top_govs AS (
      SELECT governorate, COUNT(*)::int AS orders, COALESCE(SUM(total_price), 0)::numeric AS revenue
      FROM public.real_orders WHERE governorate IS NOT NULL AND governorate <> ''
      GROUP BY governorate ORDER BY COUNT(*) DESC LIMIT 15
    ),
    top_cities AS (
      SELECT
        COALESCE(NULLIF(btrim(split_part(address, ',', 1)), ''), governorate) AS city,
        COUNT(*)::int AS orders,
        COALESCE(SUM(total_price), 0)::numeric AS revenue
      FROM public.real_orders
      WHERE COALESCE(address, governorate) IS NOT NULL
      GROUP BY 1
      ORDER BY COUNT(*) DESC
      LIMIT 12
    ),
    devices AS (SELECT device, COUNT(DISTINCT visitor_id)::int AS visitors FROM public.analytics_visits WHERE device IS NOT NULL GROUP BY device ORDER BY visitors DESC),
    sources AS (SELECT source, COUNT(DISTINCT visitor_id)::int AS visitors FROM public.analytics_visits WHERE source IS NOT NULL GROUP BY source ORDER BY visitors DESC),
    recent_orders AS (
      SELECT id, order_number, customer_name, governorate, total_price, status, created_at
      FROM public.real_orders ORDER BY created_at DESC LIMIT 10
    ),
    recent_customers AS (
      SELECT DISTINCT ON (lower(customer_name||'|'||COALESCE(phone,'')))
        customer_name, phone, governorate, created_at
      FROM public.real_orders WHERE customer_name IS NOT NULL
      ORDER BY lower(customer_name||'|'||COALESCE(phone,'')), created_at DESC LIMIT 8
    ),
    recent_reviews AS (
      SELECT
        id, customer_name, rating, review_text, governorate, created_at,
        CASE WHEN approved THEN 'approved' ELSE 'pending' END AS status
      FROM public.reviews ORDER BY created_at DESC LIMIT 8
    ),
    recent_custom AS (
      SELECT id, customer_name, total_price,
             COALESCE(array_length(image_paths, 1), 0) AS image_count,
             created_at
      FROM public.custom_design_orders ORDER BY created_at DESC LIMIT 8
    ),
    recent_photo AS (
      SELECT id, customer_name, total_price, quantity, created_at
      FROM public.photo_orders ORDER BY created_at DESC LIMIT 6
    ),
    conversions AS (
      SELECT
        (SELECT COUNT(*) FROM public.photo_orders)::int AS photo_printing,
        (SELECT COUNT(*) FROM public.custom_design_orders)::int AS custom_design,
        (SELECT COUNT(*) FROM public.real_orders WHERE frame_type ILIKE '%wood%')::int AS wooden_portrait,
        (SELECT COUNT(*) FROM public.real_orders WHERE frame_type ILIKE '%pvc%' OR frame_type ILIKE '%frame%')::int AS frame_orders,
        (SELECT COUNT(*) FROM public.real_orders WHERE frame_color ILIKE '%black%')::int AS black_frame,
        (SELECT COUNT(*) FROM public.real_orders WHERE frame_color ILIKE '%white%')::int AS white_frame,
        (SELECT COUNT(*) FROM public.real_orders WHERE packaging_fee > 0)::int AS offers
    ),
    health AS (
      SELECT
        (SELECT COUNT(*) FROM public.posters WHERE image_url IS NULL OR image_url = '')::int AS posters_missing_image,
        (SELECT COUNT(*) FROM public.posters WHERE hidden = true)::int AS posters_hidden,
        (SELECT COUNT(*) FROM public.reviews WHERE approved = false)::int AS reviews_pending
    ),
    costs AS (
      SELECT value FROM public.site_settings WHERE key = 'profit_costs'
    )
  SELECT jsonb_build_object(
    'range', jsonb_build_object('from', range_from, 'to', range_to, 'days', days_count),
    'visitors_today', (SELECT c FROM v_today),
    'visitors_month', (SELECT c FROM v_month),
    'visitors_total', (SELECT c FROM v_total),
    'visitors_range', (SELECT c FROM v_range),
    'orders_today', (SELECT c FROM o_today),
    'revenue_today', (SELECT rev FROM o_today),
    'revenue_week', (SELECT rev FROM o_week),
    'revenue_month', (SELECT rev FROM o_month),
    'orders_total', (SELECT c FROM o_total),
    'revenue_total', (SELECT rev FROM o_total),
    'orders_range', (SELECT c FROM o_range),
    'revenue_range', (SELECT rev FROM o_range),
    'orders_pending', (SELECT pending FROM o_status),
    'orders_processing', (SELECT processing FROM o_status),
    'orders_printed', (SELECT printed FROM o_status),
    'orders_shipped', (SELECT shipped FROM o_status),
    'orders_delivered', (SELECT delivered FROM o_status),
    'orders_completed', (SELECT completed FROM o_status),
    'orders_cancelled', (SELECT cancelled FROM o_status),
    'customers', (SELECT to_jsonb(cust_summary) FROM cust_summary),
    'top_returning', COALESCE((SELECT jsonb_agg(to_jsonb(top_returning)) FROM top_returning), '[]'::jsonb),
    'chart_range', COALESCE((SELECT jsonb_agg(to_jsonb(chart)) FROM chart), '[]'::jsonb),
    'chart_14d', COALESCE((SELECT jsonb_agg(to_jsonb(chart)) FROM chart), '[]'::jsonb),
    'top_selling', COALESCE((SELECT jsonb_agg(to_jsonb(top_sales)) FROM top_sales), '[]'::jsonb),
    'top_viewed', COALESCE((SELECT jsonb_agg(to_jsonb(top_views)) FROM top_views), '[]'::jsonb),
    'top_cart', COALESCE((SELECT jsonb_agg(to_jsonb(top_cart)) FROM top_cart), '[]'::jsonb),
    'top_wishlisted', COALESCE((SELECT jsonb_agg(to_jsonb(top_wish)) FROM top_wish), '[]'::jsonb),
    'lowest_performing', COALESCE((SELECT jsonb_agg(to_jsonb(lowest)) FROM lowest), '[]'::jsonb),
    'top_categories', COALESCE((SELECT jsonb_agg(to_jsonb(top_cats)) FROM top_cats), '[]'::jsonb),
    'top_subcategories', COALESCE((SELECT jsonb_agg(to_jsonb(top_subcats)) FROM top_subcats), '[]'::jsonb),
    'top_sizes', COALESCE((SELECT jsonb_agg(to_jsonb(top_sizes)) FROM top_sizes), '[]'::jsonb),
    'top_searches', COALESCE((SELECT jsonb_agg(to_jsonb(top_searches)) FROM top_searches), '[]'::jsonb),
    'no_result_searches', COALESCE((SELECT jsonb_agg(to_jsonb(no_result_searches)) FROM no_result_searches), '[]'::jsonb),
    'top_governorates', COALESCE((SELECT jsonb_agg(to_jsonb(top_govs)) FROM top_govs), '[]'::jsonb),
    'top_cities', COALESCE((SELECT jsonb_agg(to_jsonb(top_cities)) FROM top_cities), '[]'::jsonb),
    'devices', COALESCE((SELECT jsonb_agg(to_jsonb(devices)) FROM devices), '[]'::jsonb),
    'sources', COALESCE((SELECT jsonb_agg(to_jsonb(sources)) FROM sources), '[]'::jsonb),
    'recent_orders', COALESCE((SELECT jsonb_agg(to_jsonb(recent_orders)) FROM recent_orders), '[]'::jsonb),
    'recent_customers', COALESCE((SELECT jsonb_agg(to_jsonb(recent_customers)) FROM recent_customers), '[]'::jsonb),
    'recent_reviews', COALESCE((SELECT jsonb_agg(to_jsonb(recent_reviews)) FROM recent_reviews), '[]'::jsonb),
    'recent_custom', COALESCE((SELECT jsonb_agg(to_jsonb(recent_custom)) FROM recent_custom), '[]'::jsonb),
    'recent_photo', COALESCE((SELECT jsonb_agg(to_jsonb(recent_photo)) FROM recent_photo), '[]'::jsonb),
    'conversions', (SELECT to_jsonb(conversions) FROM conversions),
    'health', (SELECT to_jsonb(health) FROM health),
    'profit_costs', COALESCE((SELECT value FROM costs), '{}'::jsonb)
  ) INTO result;
  RETURN result;
END;
$function$;
