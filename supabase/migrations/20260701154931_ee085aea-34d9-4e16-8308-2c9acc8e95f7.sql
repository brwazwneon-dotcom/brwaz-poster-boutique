
ALTER TABLE public.analytics_visits
  ADD COLUMN IF NOT EXISTS browser text,
  ADD COLUMN IF NOT EXISTS os text,
  ADD COLUMN IF NOT EXISTS country_code text;

CREATE INDEX IF NOT EXISTS idx_analytics_visits_country ON public.analytics_visits (country);
CREATE INDEX IF NOT EXISTS idx_analytics_visits_browser ON public.analytics_visits (browser);
CREATE INDEX IF NOT EXISTS idx_analytics_visits_os ON public.analytics_visits (os);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'analytics_visits'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.analytics_visits';
  END IF;
END $$;

ALTER TABLE public.analytics_visits REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION public.admin_realtime_analytics(p_period text DEFAULT 'day')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
  period_start timestamptz;
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  period_start := CASE p_period
    WHEN 'hour' THEN now() - interval '1 hour'
    WHEN 'day' THEN date_trunc('day', now())
    WHEN 'week' THEN date_trunc('day', now()) - interval '6 days'
    WHEN 'month' THEN date_trunc('day', now()) - interval '29 days'
    WHEN 'year' THEN date_trunc('day', now()) - interval '364 days'
    ELSE date_trunc('day', now())
  END;

  WITH
    -- visitor first-seen classification
    first_seen AS (
      SELECT visitor_id, MIN(created_at) AS first_at
      FROM public.analytics_visits
      GROUP BY visitor_id
    ),
    online AS (
      SELECT DISTINCT visitor_id
      FROM public.analytics_visits
      WHERE created_at > now() - interval '5 minutes'
    ),
    period_visits AS (
      SELECT v.visitor_id, v.created_at, fs.first_at
      FROM public.analytics_visits v
      LEFT JOIN first_seen fs ON fs.visitor_id = v.visitor_id
      WHERE v.created_at >= period_start
    ),
    visitor_summary AS (
      SELECT
        COUNT(DISTINCT visitor_id)::int AS total,
        COUNT(DISTINCT visitor_id) FILTER (WHERE first_at >= period_start)::int AS new_v,
        COUNT(DISTINCT visitor_id) FILTER (WHERE first_at < period_start)::int AS returning_v
      FROM period_visits
    ),
    countries AS (
      SELECT COALESCE(country, 'Unknown') AS country, country_code,
             COUNT(DISTINCT visitor_id)::int AS visitors
      FROM public.analytics_visits
      WHERE created_at >= period_start
      GROUP BY country, country_code
      ORDER BY visitors DESC
      LIMIT 20
    ),
    govs AS (
      SELECT COALESCE(governorate, 'Unknown') AS governorate,
             COUNT(DISTINCT visitor_id)::int AS visitors
      FROM public.analytics_visits
      WHERE created_at >= period_start
      GROUP BY governorate
      ORDER BY visitors DESC
      LIMIT 15
    ),
    cities AS (
      SELECT COALESCE(city, 'Unknown') AS city,
             COALESCE(governorate, '') AS governorate,
             COUNT(DISTINCT visitor_id)::int AS visitors
      FROM public.analytics_visits
      WHERE created_at >= period_start AND city IS NOT NULL
      GROUP BY city, governorate
      ORDER BY visitors DESC
      LIMIT 15
    ),
    sources AS (
      SELECT COALESCE(source, 'direct') AS source,
             COUNT(DISTINCT visitor_id)::int AS visitors
      FROM public.analytics_visits
      WHERE created_at >= period_start
      GROUP BY source
      ORDER BY visitors DESC
    ),
    devices AS (
      SELECT COALESCE(device, 'unknown') AS device,
             COUNT(DISTINCT visitor_id)::int AS visitors
      FROM public.analytics_visits
      WHERE created_at >= period_start
      GROUP BY device
    ),
    browsers AS (
      SELECT COALESCE(browser, 'Other') AS browser,
             COUNT(DISTINCT visitor_id)::int AS visitors
      FROM public.analytics_visits
      WHERE created_at >= period_start
      GROUP BY browser
      ORDER BY visitors DESC
      LIMIT 10
    ),
    oses AS (
      SELECT COALESCE(os, 'Other') AS os,
             COUNT(DISTINCT visitor_id)::int AS visitors
      FROM public.analytics_visits
      WHERE created_at >= period_start
      GROUP BY os
      ORDER BY visitors DESC
      LIMIT 10
    ),
    funnel AS (
      SELECT
        (SELECT COUNT(DISTINCT visitor_id) FROM public.analytics_visits WHERE created_at >= period_start)::int AS visits,
        (SELECT COUNT(*) FROM public.analytics_poster_events WHERE created_at >= period_start AND event_type = 'view')::int AS product_views,
        (SELECT COUNT(*) FROM public.analytics_poster_events WHERE created_at >= period_start AND event_type = 'wishlist_add')::int AS wishlist_adds,
        (SELECT COUNT(*) FROM public.analytics_poster_events WHERE created_at >= period_start AND event_type = 'cart_add')::int AS cart_adds,
        (SELECT COUNT(*) FROM public.analytics_poster_events WHERE created_at >= period_start AND event_type = 'checkout_start')::int AS checkout_started,
        (SELECT COUNT(*) FROM public.orders WHERE created_at >= period_start)::int AS orders_completed
    ),
    -- one row per visitor's most recent visit (feed)
    latest_per_visitor AS (
      SELECT DISTINCT ON (visitor_id)
        visitor_id, session_id, path, source, device, browser, os,
        city, governorate, country, country_code, referrer, created_at
      FROM public.analytics_visits
      WHERE created_at > now() - interval '30 minutes'
      ORDER BY visitor_id, created_at DESC
    ),
    live_feed AS (
      SELECT
        left(md5(visitor_id), 6) AS visitor_hash,
        path, source, device, browser, os,
        city, governorate, country, country_code, referrer, created_at
      FROM latest_per_visitor
      ORDER BY created_at DESC
      LIMIT 40
    ),
    -- most recent search per active session (to enrich feed)
    recent_searches AS (
      SELECT lower(query) AS q, visitor_id, MAX(created_at) AS ts
      FROM public.search_queries
      WHERE created_at > now() - interval '30 minutes'
      GROUP BY lower(query), visitor_id
    ),
    feed_searches AS (
      SELECT left(md5(visitor_id), 6) AS visitor_hash, q, ts
      FROM recent_searches
      ORDER BY ts DESC
      LIMIT 30
    ),
    hourly AS (
      SELECT to_char(date_trunc('hour', created_at), 'YYYY-MM-DD"T"HH24:00') AS hour,
             COUNT(DISTINCT visitor_id)::int AS visitors,
             COUNT(*)::int AS pageviews
      FROM public.analytics_visits
      WHERE created_at > now() - interval '24 hours'
      GROUP BY 1
      ORDER BY 1
    )
  SELECT jsonb_build_object(
    'period', p_period,
    'period_start', period_start,
    'online_now', (SELECT COUNT(*) FROM online)::int,
    'visitors_total', (SELECT total FROM visitor_summary),
    'new_visitors', (SELECT new_v FROM visitor_summary),
    'returning_visitors', (SELECT returning_v FROM visitor_summary),
    'countries', COALESCE((SELECT jsonb_agg(to_jsonb(countries)) FROM countries), '[]'::jsonb),
    'governorates', COALESCE((SELECT jsonb_agg(to_jsonb(govs)) FROM govs), '[]'::jsonb),
    'cities', COALESCE((SELECT jsonb_agg(to_jsonb(cities)) FROM cities), '[]'::jsonb),
    'sources', COALESCE((SELECT jsonb_agg(to_jsonb(sources)) FROM sources), '[]'::jsonb),
    'devices', COALESCE((SELECT jsonb_agg(to_jsonb(devices)) FROM devices), '[]'::jsonb),
    'browsers', COALESCE((SELECT jsonb_agg(to_jsonb(browsers)) FROM browsers), '[]'::jsonb),
    'oses', COALESCE((SELECT jsonb_agg(to_jsonb(oses)) FROM oses), '[]'::jsonb),
    'funnel', (SELECT to_jsonb(funnel) FROM funnel),
    'live_feed', COALESCE((SELECT jsonb_agg(to_jsonb(live_feed)) FROM live_feed), '[]'::jsonb),
    'live_searches', COALESCE((SELECT jsonb_agg(to_jsonb(feed_searches)) FROM feed_searches), '[]'::jsonb),
    'hourly', COALESCE((SELECT jsonb_agg(to_jsonb(hourly)) FROM hourly), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_realtime_analytics(text) TO authenticated;
