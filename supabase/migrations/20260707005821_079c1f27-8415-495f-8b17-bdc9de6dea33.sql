
-- Restrict admin-only SECURITY DEFINER functions to authenticated (revoke from anonymous & PUBLIC).
REVOKE EXECUTE ON FUNCTION public.admin_dashboard(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_realtime_analytics(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_storage_manifest() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_live_visitors() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_realtime_analytics(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_storage_manifest() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_live_visitors() TO authenticated;

-- Tighten "always true" INSERT policies with basic column validation while keeping anonymous inserts working.
DROP POLICY IF EXISTS "anyone_insert_pe" ON public.analytics_poster_events;
CREATE POLICY "anyone_insert_pe" ON public.analytics_poster_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    event_type IS NOT NULL
    AND length(event_type) <= 64
    AND (visitor_id IS NULL OR length(visitor_id) <= 128)
    AND (session_id IS NULL OR length(session_id) <= 128)
  );

DROP POLICY IF EXISTS "anyone_insert_visits" ON public.analytics_visits;
CREATE POLICY "anyone_insert_visits" ON public.analytics_visits
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    visitor_id IS NOT NULL
    AND length(visitor_id) BETWEEN 1 AND 128
    AND length(session_id) BETWEEN 1 AND 128
    AND (path IS NULL OR length(path) <= 1024)
    AND (referrer IS NULL OR length(referrer) <= 1024)
    AND (user_agent IS NULL OR length(user_agent) <= 512)
  );

DROP POLICY IF EXISTS "anyone_insert_sq" ON public.search_queries;
CREATE POLICY "anyone_insert_sq" ON public.search_queries
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    query IS NOT NULL
    AND length(btrim(query)) BETWEEN 1 AND 200
    AND (visitor_id IS NULL OR length(visitor_id) <= 128)
  );

DROP POLICY IF EXISTS "Anyone can insert 4x6 orders" ON public.photo_4x6_orders;
CREATE POLICY "Anyone can insert 4x6 orders" ON public.photo_4x6_orders
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(btrim(customer_name)) BETWEEN 1 AND 200
    AND length(btrim(phone)) BETWEEN 5 AND 32
    AND length(package_key) BETWEEN 1 AND 64
    AND photo_count > 0 AND photo_count <= 500
    AND total_price >= 0
  );
