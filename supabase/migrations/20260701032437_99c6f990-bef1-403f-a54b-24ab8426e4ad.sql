
ALTER TABLE public.marketing_secrets ADD COLUMN IF NOT EXISTS firebase_service_account jsonb;

CREATE TABLE IF NOT EXISTS public.admin_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fcm_token text NOT NULL UNIQUE,
  label text,
  user_agent text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_devices TO authenticated;
GRANT ALL ON public.admin_devices TO service_role;
ALTER TABLE public.admin_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_devices admin read" ON public.admin_devices;
CREATE POLICY "admin_devices admin read" ON public.admin_devices FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "admin_devices self write" ON public.admin_devices;
CREATE POLICY "admin_devices self write" ON public.admin_devices FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) AND user_id = auth.uid());
DROP POLICY IF EXISTS "admin_devices self update" ON public.admin_devices;
CREATE POLICY "admin_devices self update" ON public.admin_devices FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role) AND user_id = auth.uid())
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) AND user_id = auth.uid());
DROP POLICY IF EXISTS "admin_devices admin delete" ON public.admin_devices;
CREATE POLICY "admin_devices admin delete" ON public.admin_devices FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  body text,
  payload jsonb,
  sent_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  status text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.notification_logs TO authenticated;
GRANT ALL ON public.notification_logs TO service_role;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notification_logs admin read" ON public.notification_logs;
CREATE POLICY "notification_logs admin read" ON public.notification_logs FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));
