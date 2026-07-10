
-- Customer notes (admin-only, keyed by phone)
CREATE TABLE public.customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  text text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  author text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_notes_phone_idx ON public.customer_notes(phone, pinned DESC, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_notes TO authenticated;
GRANT ALL ON public.customer_notes TO service_role;
ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage customer_notes" ON public.customer_notes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER customer_notes_set_updated_at
  BEFORE UPDATE ON public.customer_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Customers directory
CREATE OR REPLACE FUNCTION public.admin_customers_list(
  p_search text DEFAULT NULL,
  p_segment text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  total int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH agg AS (
    SELECT
      COALESCE(NULLIF(btrim(phone),''), customer_name) AS key,
      MAX(customer_name) AS name,
      MAX(phone) AS phone,
      MAX(governorate) AS governorate,
      MAX(address) AS last_address,
      COUNT(*)::int AS orders_count,
      COALESCE(SUM(total_price),0)::numeric AS total_spent,
      MIN(created_at) AS first_order,
      MAX(created_at) AS last_order,
      COUNT(*) FILTER (WHERE lower(coalesce(status,'')) IN ('cancelled','canceled'))::int AS cancelled_count
    FROM public.orders
    WHERE COALESCE(NULLIF(btrim(phone),''), customer_name) IS NOT NULL
    GROUP BY 1
  ),
  scored AS (
    SELECT *,
      CASE
        WHEN cancelled_count >= 3 THEN 'problem'
        WHEN orders_count >= 5 OR total_spent >= 3000 THEN 'vip'
        WHEN orders_count > 1 THEN 'returning'
        ELSE 'new'
      END AS segment
    FROM agg
  ),
  filtered AS (
    SELECT * FROM scored
    WHERE (p_search IS NULL OR p_search = '' OR
           lower(coalesce(name,'')) LIKE '%'||lower(p_search)||'%' OR
           coalesce(phone,'') LIKE '%'||p_search||'%')
      AND (p_segment IS NULL OR p_segment = 'all' OR segment = p_segment)
  ),
  page AS (
    SELECT * FROM filtered ORDER BY last_order DESC NULLS LAST
    LIMIT GREATEST(1, LEAST(200, COALESCE(p_limit, 50)))
    OFFSET GREATEST(0, COALESCE(p_offset, 0))
  )
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*) FROM filtered),
    'rows', COALESCE((SELECT jsonb_agg(to_jsonb(page)) FROM page), '[]'::jsonb),
    'segments', jsonb_build_object(
      'new', (SELECT COUNT(*) FROM scored WHERE segment='new'),
      'returning', (SELECT COUNT(*) FROM scored WHERE segment='returning'),
      'vip', (SELECT COUNT(*) FROM scored WHERE segment='vip'),
      'problem', (SELECT COUNT(*) FROM scored WHERE segment='problem')
    )
  ) INTO result;
  RETURN result;
END;
$$;

-- Abandoned carts
CREATE OR REPLACE FUNCTION public.admin_abandoned_orders(p_limit int DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH latest AS (
    SELECT ce.visitor_id,
      MAX(ce.created_at) FILTER (WHERE ce.event='add') AS last_add,
      MAX(ce.created_at) FILTER (WHERE ce.event='checkout_start') AS last_checkout_start,
      MAX(ce.created_at) FILTER (WHERE ce.event IN ('purchase','checkout_complete')) AS last_purchase,
      MAX(ce.created_at) AS last_activity,
      COUNT(*) FILTER (WHERE ce.event='add')::int AS add_count,
      array_agg(DISTINCT ce.poster_id) FILTER (WHERE ce.event='add' AND ce.poster_id IS NOT NULL) AS poster_ids
    FROM public.visitor_cart_events ce
    WHERE ce.created_at > now() - interval '30 days'
    GROUP BY ce.visitor_id
  ),
  abandoned AS (
    SELECT l.*, vp.phone, vp.city, vp.governorate, vp.device, vp.last_seen
    FROM latest l
    LEFT JOIN public.visitor_profiles vp ON vp.visitor_id = l.visitor_id
    WHERE l.last_add IS NOT NULL
      AND (l.last_purchase IS NULL OR l.last_purchase < l.last_add)
  ),
  enriched AS (
    SELECT a.*,
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'image_url', p.image_url))
           FROM public.posters p
          WHERE p.id = ANY(a.poster_ids)),
        '[]'::jsonb
      ) AS items,
      CASE
        WHEN a.last_checkout_start IS NOT NULL AND a.last_checkout_start > a.last_add THEN 'checkout_started'
        WHEN a.add_count > 0 THEN 'cart_added'
        ELSE 'browsing'
      END AS last_step,
      a.phone IS NOT NULL AS has_phone
    FROM abandoned a
  )
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*) FROM enriched),
    'today', (SELECT COUNT(*) FROM enriched WHERE last_activity >= date_trunc('day', now())),
    'with_phone', (SELECT COUNT(*) FROM enriched WHERE has_phone),
    'rows', COALESCE((
      SELECT jsonb_agg(to_jsonb(e) ORDER BY e.last_activity DESC)
      FROM (SELECT * FROM enriched ORDER BY last_activity DESC
            LIMIT GREATEST(1, LEAST(500, COALESCE(p_limit, 100)))) e
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;
