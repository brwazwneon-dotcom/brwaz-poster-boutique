
-- 1. Add manual override flag
ALTER TABLE public.posters ADD COLUMN IF NOT EXISTS is_best_seller boolean NOT NULL DEFAULT false;

-- 2. Auto-refresh best sellers ranking (admin only)
CREATE OR REPLACE FUNCTION public.refresh_auto_best_sellers(_top_n integer DEFAULT 12)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  keep_ids uuid[];
  added int := 0;
  removed int := 0;
  base_pos int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  _top_n := GREATEST(1, LEAST(60, COALESCE(_top_n, 12)));

  -- Compute top-N poster ids by score
  WITH scored AS (
    SELECT p.id,
      (COALESCE(p.sales_count,0)*5
       + COALESCE(p.cart_adds_count,0)*2
       + COALESCE(p.views_count,0)*0.1
       + (SELECT COUNT(*) FROM public.wishlists w WHERE w.poster_id = p.id)*2
       + CASE WHEN p.last_viewed_at > now() - interval '30 days' THEN 5 ELSE 0 END
      )::numeric AS score
    FROM public.posters p
    WHERE p.hidden = false
  )
  SELECT array_agg(id ORDER BY score DESC NULLS LAST) INTO keep_ids
  FROM (SELECT id FROM scored ORDER BY score DESC NULLS LAST LIMIT _top_n) t;

  keep_ids := COALESCE(keep_ids, ARRAY[]::uuid[]);

  -- Remove auto rows no longer qualifying (skip pinned and manual overrides)
  WITH del AS (
    DELETE FROM public.best_sellers bs
    WHERE bs.pinned = false
      AND NOT (bs.poster_id = ANY(keep_ids))
      AND NOT EXISTS (SELECT 1 FROM public.posters p WHERE p.id = bs.poster_id AND p.is_best_seller = true)
    RETURNING 1
  ) SELECT COUNT(*) INTO removed FROM del;

  -- Base position after all existing rows
  SELECT COALESCE(MAX(position),0) INTO base_pos FROM public.best_sellers;

  -- Insert missing top-N (skip already present)
  WITH ins AS (
    INSERT INTO public.best_sellers (poster_id, position)
    SELECT k.id, base_pos + row_number() OVER ()
    FROM unnest(keep_ids) WITH ORDINALITY AS k(id, ord)
    WHERE NOT EXISTS (SELECT 1 FROM public.best_sellers bs WHERE bs.poster_id = k.id)
    RETURNING 1
  ) SELECT COUNT(*) INTO added FROM ins;

  RETURN jsonb_build_object('added', added, 'removed', removed, 'kept', array_length(keep_ids,1));
END;
$$;

-- 3. Analytics for admin best sellers view
CREATE OR REPLACE FUNCTION public.best_sellers_analytics()
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

  WITH
    tv AS (SELECT id,title,image_url,views_count FROM public.posters WHERE hidden=false AND views_count>0 ORDER BY views_count DESC LIMIT 10),
    tp AS (SELECT id,title,image_url,sales_count FROM public.posters WHERE hidden=false AND sales_count>0 ORDER BY sales_count DESC LIMIT 10),
    tw AS (
      SELECT p.id,p.title,p.image_url,COUNT(w.*)::int AS wishlist_count
      FROM public.wishlists w JOIN public.posters p ON p.id=w.poster_id
      WHERE p.hidden=false GROUP BY p.id,p.title,p.image_url ORDER BY COUNT(w.*) DESC LIMIT 10
    ),
    -- Trending by cart_adds within window (proxy for recent momentum)
    td AS (
      SELECT p.id,p.title,p.image_url,COUNT(ce.*)::int AS score
      FROM public.visitor_cart_events ce JOIN public.posters p ON p.id=ce.poster_id
      WHERE ce.event='add' AND ce.created_at > now() - interval '1 day' AND p.hidden=false
      GROUP BY p.id,p.title,p.image_url ORDER BY COUNT(ce.*) DESC LIMIT 10
    ),
    twk AS (
      SELECT p.id,p.title,p.image_url,COUNT(ce.*)::int AS score
      FROM public.visitor_cart_events ce JOIN public.posters p ON p.id=ce.poster_id
      WHERE ce.event='add' AND ce.created_at > now() - interval '7 days' AND p.hidden=false
      GROUP BY p.id,p.title,p.image_url ORDER BY COUNT(ce.*) DESC LIMIT 10
    ),
    tmo AS (
      SELECT p.id,p.title,p.image_url,COUNT(ce.*)::int AS score
      FROM public.visitor_cart_events ce JOIN public.posters p ON p.id=ce.poster_id
      WHERE ce.event='add' AND ce.created_at > now() - interval '30 days' AND p.hidden=false
      GROUP BY p.id,p.title,p.image_url ORDER BY COUNT(ce.*) DESC LIMIT 10
    )
  SELECT jsonb_build_object(
    'top_viewed',      COALESCE((SELECT jsonb_agg(to_jsonb(tv))  FROM tv),  '[]'::jsonb),
    'top_purchased',   COALESCE((SELECT jsonb_agg(to_jsonb(tp))  FROM tp),  '[]'::jsonb),
    'top_wishlisted',  COALESCE((SELECT jsonb_agg(to_jsonb(tw))  FROM tw),  '[]'::jsonb),
    'trending_today',  COALESCE((SELECT jsonb_agg(to_jsonb(td))  FROM td),  '[]'::jsonb),
    'trending_week',   COALESCE((SELECT jsonb_agg(to_jsonb(twk)) FROM twk), '[]'::jsonb),
    'trending_month',  COALESCE((SELECT jsonb_agg(to_jsonb(tmo)) FROM tmo), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;
