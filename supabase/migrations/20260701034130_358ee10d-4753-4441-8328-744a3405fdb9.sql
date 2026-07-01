
-- Backup registry
CREATE TABLE IF NOT EXISTS public.backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_type text NOT NULL CHECK (backup_type IN ('daily','weekly','monthly','manual','safety','emergency')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
  storage_path text,
  size_bytes bigint DEFAULT 0,
  table_counts jsonb DEFAULT '{}'::jsonb,
  storage_manifest jsonb DEFAULT '{}'::jsonb,
  checksum text,
  encryption text DEFAULT 'aes-256-gcm',
  error_message text,
  created_by uuid,
  created_by_email text,
  triggered_by text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.backups TO authenticated;
GRANT ALL ON public.backups TO service_role;

CREATE INDEX IF NOT EXISTS backups_type_created_idx ON public.backups (backup_type, created_at DESC);
CREATE INDEX IF NOT EXISTS backups_status_idx ON public.backups (status);

ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view backups"
  ON public.backups FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert backups"
  ON public.backups FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update backups"
  ON public.backups FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete backups"
  ON public.backups FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

-- Storage policies for private `backups` bucket (admin-only)
CREATE POLICY "Admins can read backup files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'backups' AND private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can upload backup files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'backups' AND private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete backup files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'backups' AND private.has_role(auth.uid(), 'admin'::app_role));
