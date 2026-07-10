
-- 1. perf_metrics table
CREATE TABLE public.perf_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_path text NOT NULL,
  metric text NOT NULL,
  value_ms integer NOT NULL,
  session_id text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.perf_metrics TO authenticated;
GRANT INSERT ON public.perf_metrics TO anon, authenticated;
GRANT ALL ON public.perf_metrics TO service_role;

ALTER TABLE public.perf_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can record perf metrics" ON public.perf_metrics
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Admins can read perf metrics" ON public.perf_metrics
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage perf metrics" ON public.perf_metrics
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_perf_metrics_created ON public.perf_metrics (created_at DESC);
CREATE INDEX idx_perf_metrics_page ON public.perf_metrics (page_path);
CREATE INDEX idx_perf_metrics_metric ON public.perf_metrics (metric);

-- 2. Expand summary RPC
CREATE OR REPLACE FUNCTION public.admin_notifications_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN jsonb_build_object(
    'unread_total', (SELECT COUNT(*) FROM public.admin_notifications WHERE read_at IS NULL)::int,
    'critical_open', (SELECT COUNT(*) FROM public.admin_notifications WHERE priority = 'critical' AND status = 'open')::int,
    'high_open', (SELECT COUNT(*) FROM public.admin_notifications WHERE priority = 'high' AND status = 'open')::int,
    'new_orders_today', (SELECT COUNT(*) FROM public.orders WHERE created_at >= date_trunc('day', now()))::int,
    'errors_24h', (SELECT COUNT(*) FROM public.system_logs WHERE level IN ('error','critical') AND created_at > now() - interval '24 hours')::int,
    'low_quality_24h', (SELECT COUNT(*) FROM public.system_logs WHERE category = 'low_quality_image' AND created_at > now() - interval '24 hours')::int,
    'upload_failures_24h', (SELECT COUNT(*) FROM public.system_logs WHERE category = 'upload_failed' AND created_at > now() - interval '24 hours')::int,
    'critical_errors_24h', (SELECT COUNT(*) FROM public.system_logs WHERE level = 'critical' AND status <> 'resolved' AND created_at > now() - interval '24 hours')::int,
    'open_bugs', (SELECT COUNT(*) FROM public.admin_notifications WHERE type LIKE 'bug_%' AND status = 'open')::int,
    'slow_pages_24h', (SELECT COUNT(*) FROM public.perf_metrics WHERE value_ms > 3000 AND created_at > now() - interval '24 hours')::int,
    'orders_need_attention', (
      SELECT COUNT(*) FROM public.orders
      WHERE (status IN ('new','pending') AND created_at < now() - interval '30 minutes')
         OR (lower(status) = 'printing' AND created_at < now() - interval '24 hours')
    )::int,
    'unresolved_alerts', (SELECT COUNT(*) FROM public.admin_notifications WHERE status = 'open')::int
  );
END;
$function$;

-- 3. Auto Bug Detector
CREATE OR REPLACE FUNCTION public.detect_bugs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  created_count int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- 1) Orders stuck new/pending > 30 min
  WITH ins AS (
    INSERT INTO public.admin_notifications (type, title, body, priority, link, entity_type, entity_id)
    SELECT
      'bug_order_unconfirmed',
      '⏰ طلب لم يتم تأكيده',
      'الطلب ' || COALESCE(o.order_number, o.id::text) || ' لـ ' || COALESCE(o.customer_name,'عميل') || ' لم يتم تأكيده منذ أكثر من 30 دقيقة.',
      'high',
      '/admin?tab=orders&order=' || o.id::text,
      'orders',
      o.id::text
    FROM public.orders o
    WHERE o.status IN ('new','pending')
      AND o.created_at < now() - interval '30 minutes'
      AND o.created_at > now() - interval '7 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.admin_notifications n
        WHERE n.type = 'bug_order_unconfirmed' AND n.entity_id = o.id::text AND n.status = 'open'
      )
    RETURNING 1
  ) SELECT created_count + COUNT(*) INTO created_count FROM ins;

  -- 2) Orders in printing > 24h
  WITH ins AS (
    INSERT INTO public.admin_notifications (type, title, body, priority, link, entity_type, entity_id)
    SELECT
      'bug_order_printing_stuck',
      '🖨️ أوردر في الطباعة أكثر من 24 ساعة',
      'الطلب ' || COALESCE(o.order_number, o.id::text) || ' لـ ' || COALESCE(o.customer_name,'عميل') || ' لم يخرج من مرحلة الطباعة منذ أكثر من 24 ساعة.',
      'high',
      '/admin?tab=orders&order=' || o.id::text,
      'orders',
      o.id::text
    FROM public.orders o
    WHERE lower(o.status) = 'printing'
      AND o.created_at < now() - interval '24 hours'
      AND NOT EXISTS (
        SELECT 1 FROM public.admin_notifications n
        WHERE n.type = 'bug_order_printing_stuck' AND n.entity_id = o.id::text AND n.status = 'open'
      )
    RETURNING 1
  ) SELECT created_count + COUNT(*) INTO created_count FROM ins;

  -- 3) Invalid WhatsApp phone
  WITH ins AS (
    INSERT INTO public.admin_notifications (type, title, body, priority, link, entity_type, entity_id)
    SELECT
      'bug_order_bad_phone',
      '📵 رقم واتساب غير صحيح',
      'الطلب ' || COALESCE(o.order_number, o.id::text) || ' فيه رقم واتساب غير صحيح: ' || COALESCE(o.phone, '(فارغ)'),
      'critical',
      '/admin?tab=orders&order=' || o.id::text,
      'orders',
      o.id::text
    FROM public.orders o
    WHERE (o.phone IS NULL OR length(regexp_replace(o.phone, '\D', '', 'g')) < 10)
      AND o.created_at > now() - interval '30 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.admin_notifications n
        WHERE n.type = 'bug_order_bad_phone' AND n.entity_id = o.id::text AND n.status = 'open'
      )
    RETURNING 1
  ) SELECT created_count + COUNT(*) INTO created_count FROM ins;

  -- 4) Zero / negative price
  WITH ins AS (
    INSERT INTO public.admin_notifications (type, title, body, priority, link, entity_type, entity_id)
    SELECT
      'bug_order_bad_price',
      '💰 سعر أوردر غير منطقي',
      'الطلب ' || COALESCE(o.order_number, o.id::text) || ' سعره ' || o.total_price::text || ' EGP. راجعه.',
      'critical',
      '/admin?tab=orders&order=' || o.id::text,
      'orders',
      o.id::text
    FROM public.orders o
    WHERE o.total_price <= 0
      AND o.created_at > now() - interval '30 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.admin_notifications n
        WHERE n.type = 'bug_order_bad_price' AND n.entity_id = o.id::text AND n.status = 'open'
      )
    RETURNING 1
  ) SELECT created_count + COUNT(*) INTO created_count FROM ins;

  -- 5) Photo orders without images
  WITH ins AS (
    INSERT INTO public.admin_notifications (type, title, body, priority, link, entity_type, entity_id)
    SELECT
      'bug_photo_order_no_images',
      '🖼️ طلب طباعة بدون صور',
      'طلب طباعة ' || COALESCE(p.order_number, p.id::text) || ' لـ ' || COALESCE(p.customer_name,'عميل') || ' اتعمل بدون صور.',
      'high',
      '/admin?tab=photo-4x6&order=' || p.id::text,
      'photo_orders',
      p.id::text
    FROM public.photo_orders p
    WHERE (p.photo_urls IS NULL OR jsonb_array_length(p.photo_urls) = 0)
      AND p.created_at > now() - interval '30 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.admin_notifications n
        WHERE n.type = 'bug_photo_order_no_images' AND n.entity_id = p.id::text AND n.status = 'open'
      )
    RETURNING 1
  ) SELECT created_count + COUNT(*) INTO created_count FROM ins;

  -- 6) Custom design orders without images
  WITH ins AS (
    INSERT INTO public.admin_notifications (type, title, body, priority, link, entity_type, entity_id)
    SELECT
      'bug_custom_order_no_images',
      '🎨 طلب تصميم بدون صور',
      'طلب تصميم ' || COALESCE(c.order_number, c.id::text) || ' لـ ' || COALESCE(c.customer_name,'عميل') || ' اتعمل بدون صور.',
      'critical',
      '/admin?tab=custom&order=' || c.id::text,
      'custom_design_orders',
      c.id::text
    FROM public.custom_design_orders c
    WHERE (c.image_urls IS NULL OR array_length(c.image_urls, 1) IS NULL)
      AND c.created_at > now() - interval '30 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.admin_notifications n
        WHERE n.type = 'bug_custom_order_no_images' AND n.entity_id = c.id::text AND n.status = 'open'
      )
    RETURNING 1
  ) SELECT created_count + COUNT(*) INTO created_count FROM ins;

  RETURN jsonb_build_object('created', created_count, 'ran_at', now());
END;
$function$;

-- 4. Error log status helper
CREATE OR REPLACE FUNCTION public.set_error_log_status(_id uuid, _status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _status NOT IN ('open','in_progress','resolved') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  UPDATE public.system_logs SET status = _status WHERE id = _id;
END;
$function$;
