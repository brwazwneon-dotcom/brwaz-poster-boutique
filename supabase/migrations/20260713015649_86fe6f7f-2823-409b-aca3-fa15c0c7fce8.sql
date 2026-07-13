
-- Fix: admin_notifications_open_insert
-- Trigger notify_new_order (SECURITY DEFINER) and admin service-role code still populate this table.
DROP POLICY IF EXISTS "Anyone can insert notifications" ON public.admin_notifications;

-- Fix: order_timeline_open_insert
-- Trigger log_order_status_change (SECURITY DEFINER) writes timeline entries.
-- Authenticated admins retain access via existing "admin manage order_timeline" ALL policy.
DROP POLICY IF EXISTS "insert order_timeline anon system" ON public.order_timeline;

-- Fix: visitor_profiles_anon_update_using_true
-- All visitor writes go through SECURITY DEFINER RPCs (upsert_visitor_profile,
-- score_visitor_interest, merge_visitor_to_phone), which bypass RLS. Drop the
-- open USING(true) UPDATE policy so anon requests can no longer overwrite
-- other visitors' rows directly through the Data API.
DROP POLICY IF EXISTS "vp_anon_update" ON public.visitor_profiles;

-- Fix: SUPA_rls_policy_always_true — remove remaining WITH CHECK (true) INSERT
-- policies on anon telemetry tables by adding minimal shape validation while
-- keeping the same functional behavior (anon clients can still send events).
DROP POLICY IF EXISTS "Anyone can log assistant activity" ON public.assistant_requests;
CREATE POLICY "Anyone can log assistant activity"
  ON public.assistant_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    length(keyword) BETWEEN 1 AND 500
    AND length(action) BETWEEN 1 AND 100
  );

DROP POLICY IF EXISTS "Anyone can record perf metrics" ON public.perf_metrics;
CREATE POLICY "Anyone can record perf metrics"
  ON public.perf_metrics
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    length(page_path) BETWEEN 1 AND 500
    AND length(metric) BETWEEN 1 AND 100
    AND value_ms >= 0
    AND value_ms <= 600000
  );

DROP POLICY IF EXISTS "Anyone can log errors" ON public.system_logs;
CREATE POLICY "Anyone can log errors"
  ON public.system_logs
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    level IN ('debug','info','warn','error','critical')
    AND length(source) BETWEEN 1 AND 100
    AND length(message) BETWEEN 1 AND 10000
  );
