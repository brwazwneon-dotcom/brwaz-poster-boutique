
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.admin_storage_manifest()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(jsonb_object_agg(bucket_id, stats), '{}'::jsonb) INTO result
  FROM (
    SELECT bucket_id, jsonb_build_object(
      'file_count', COUNT(*),
      'total_bytes', COALESCE(SUM((metadata->>'size')::bigint), 0)
    ) AS stats
    FROM storage.objects
    WHERE bucket_id IN ('posters','posters-originals','customer-photos','custom-designs','payment-screenshots','slider','categories','reviews','backups')
    GROUP BY bucket_id
  ) t;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_storage_manifest() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_storage_manifest() TO authenticated, service_role;
