
-- ============ admin_notifications ============
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  priority text NOT NULL DEFAULT 'medium',
  link text,
  entity_type text,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  resolved_at timestamptz,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_created ON public.admin_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread ON public.admin_notifications(read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_admin_notifications_type ON public.admin_notifications(type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_notifications TO authenticated;
GRANT INSERT ON public.admin_notifications TO anon;
GRANT ALL ON public.admin_notifications TO service_role;

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage notifications" ON public.admin_notifications;
CREATE POLICY "Admins manage notifications" ON public.admin_notifications
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Anyone can insert notifications" ON public.admin_notifications;
CREATE POLICY "Anyone can insert notifications" ON public.admin_notifications
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- ============ system_logs ============
CREATE TABLE IF NOT EXISTS public.system_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  level text NOT NULL DEFAULT 'error',
  source text NOT NULL DEFAULT 'client',
  category text,
  message text NOT NULL,
  stack text,
  url text,
  user_agent text,
  visitor_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_logs_created ON public.system_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON public.system_logs(level);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_logs TO authenticated;
GRANT INSERT ON public.system_logs TO anon;
GRANT ALL ON public.system_logs TO service_role;

ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage system logs" ON public.system_logs;
CREATE POLICY "Admins manage system logs" ON public.system_logs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Anyone can log errors" ON public.system_logs;
CREATE POLICY "Anyone can log errors" ON public.system_logs
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- ============ Auto-notify on new orders ============
CREATE OR REPLACE FUNCTION public.notify_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_title text;
  n_body text;
  n_link text;
  n_type text;
BEGIN
  IF TG_TABLE_NAME = 'orders' THEN
    n_type := 'new_order';
    n_title := '🛒 طلب جديد';
    n_body := COALESCE(NEW.customer_name, 'عميل') || ' — ' || COALESCE(NEW.governorate, '') ||
              ' — ' || COALESCE(NEW.total_price::text, '0') || ' EGP';
    n_link := '/admin?tab=orders&order=' || NEW.id::text;
  ELSIF TG_TABLE_NAME = 'custom_design_orders' THEN
    n_type := 'new_custom_order';
    n_title := '🎨 طلب تصميم مخصص جديد';
    n_body := COALESCE(NEW.customer_name, 'عميل') || ' — ' || COALESCE(NEW.total_price::text, '0') || ' EGP';
    n_link := '/admin?tab=custom&order=' || NEW.id::text;
  ELSIF TG_TABLE_NAME = 'photo_orders' THEN
    n_type := 'new_photo_order';
    n_title := '📸 طلب طباعة صور جديد';
    n_body := COALESCE(NEW.customer_name, 'عميل') || ' — ' || COALESCE(NEW.total_price::text, '0') || ' EGP';
    n_link := '/admin?tab=photo-4x6&order=' || NEW.id::text;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.admin_notifications (type, title, body, priority, link, entity_type, entity_id)
  VALUES (n_type, n_title, n_body, 'high', n_link, TG_TABLE_NAME, NEW.id::text);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_order ON public.orders;
CREATE TRIGGER trg_notify_new_order
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_order();

DROP TRIGGER IF EXISTS trg_notify_new_custom_order ON public.custom_design_orders;
CREATE TRIGGER trg_notify_new_custom_order
  AFTER INSERT ON public.custom_design_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_order();

DROP TRIGGER IF EXISTS trg_notify_new_photo_order ON public.photo_orders;
CREATE TRIGGER trg_notify_new_photo_order
  AFTER INSERT ON public.photo_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_order();

-- ============ Enable realtime ============
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.custom_design_orders;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.photo_orders;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ============ Summary function for dashboard cards ============
CREATE OR REPLACE FUNCTION public.admin_notifications_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
    'upload_failures_24h', (SELECT COUNT(*) FROM public.system_logs WHERE category = 'upload_failed' AND created_at > now() - interval '24 hours')::int
  );
END;
$$;
