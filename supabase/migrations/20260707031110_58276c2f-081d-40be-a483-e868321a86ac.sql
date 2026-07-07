-- Behavior tracking & personalization: visitor profiles, cart-event log,
-- interest scoring RPCs, admin dashboards, and settings defaults.

-- 1) visitor_profiles: one row per anonymous visitor id (localStorage). Phone
-- is populated on order to merge guest history with the customer.
CREATE TABLE IF NOT EXISTS public.visitor_profiles (
  visitor_id text PRIMARY KEY,
  phone text,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  visits_count integer NOT NULL DEFAULT 1,
  device text,
  city text,
  governorate text,
  country text,
  interests jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.visitor_profiles TO anon, authenticated;
GRANT ALL ON public.visitor_profiles TO service_role;

ALTER TABLE public.visitor_profiles ENABLE ROW LEVEL SECURITY;

-- Anon can insert/update its own profile row (visitor_id is a random uuid
-- generated client-side; no PII beyond coarse city/gov).
CREATE POLICY vp_anon_insert ON public.visitor_profiles
  FOR INSERT TO anon, authenticated
  WITH CHECK (length(visitor_id) BETWEEN 8 AND 128);

CREATE POLICY vp_anon_update ON public.visitor_profiles
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (length(visitor_id) BETWEEN 8 AND 128);

-- Admins can read all profiles; public reads are blocked (privacy).
CREATE POLICY vp_admin_read ON public.visitor_profiles
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY vp_admin_delete ON public.visitor_profiles
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_vp_phone ON public.visitor_profiles(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vp_last_seen ON public.visitor_profiles(last_seen DESC);

-- 2) visitor_cart_events: lightweight append-only log for cart activity so we
-- can compute abandonment and "continue where you left off".
CREATE TABLE IF NOT EXISTS public.visitor_cart_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id text NOT NULL,
  poster_id uuid REFERENCES public.posters(id) ON DELETE CASCADE,
  event text NOT NULL, -- 'add' | 'remove' | 'checkout_start' | 'purchase'
  qty integer,
  size text,
  frame_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.visitor_cart_events TO anon, authenticated;
GRANT ALL ON public.visitor_cart_events TO service_role;

ALTER TABLE public.visitor_cart_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY vce_anon_insert ON public.visitor_cart_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (length(visitor_id) BETWEEN 8 AND 128 AND length(event) <= 32);

CREATE POLICY vce_admin_read ON public.visitor_cart_events
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_vce_visitor ON public.visitor_cart_events(visitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vce_created ON public.visitor_cart_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vce_poster ON public.visitor_cart_events(poster_id);

-- 3) Add optional metadata column to poster events so we can store size/frame/tag
-- info without a new table.
ALTER TABLE public.analytics_poster_events
  ADD COLUMN IF NOT EXISTS metadata jsonb;

-- 4) upsert_visitor_profile: bump visits_count / last_seen and merge signals.
CREATE OR REPLACE FUNCTION public.upsert_visitor_profile(
  _visitor_id text,
  _device text DEFAULT NULL,
  _city text DEFAULT NULL,
  _governorate text DEFAULT NULL,
  _country text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _visitor_id IS NULL OR length(_visitor_id) < 8 THEN RETURN; END IF;
  INSERT INTO public.visitor_profiles(visitor_id, device, city, governorate, country)
  VALUES (_visitor_id, _device, _city, _governorate, _country)
  ON CONFLICT (visitor_id) DO UPDATE
    SET last_seen = now(),
        visits_count = public.visitor_profiles.visits_count + 1,
        device = COALESCE(EXCLUDED.device, public.visitor_profiles.device),
        city = COALESCE(EXCLUDED.city, public.visitor_profiles.city),
        governorate = COALESCE(EXCLUDED.governorate, public.visitor_profiles.governorate),
        country = COALESCE(EXCLUDED.country, public.visitor_profiles.country),
        updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_visitor_profile(text, text, text, text, text) TO anon, authenticated;

-- 5) score_visitor_interest: bump the interest score for a category or tag.
-- interests jsonb has shape:
--   { categories: {id: score}, tags: {tag: score}, sizes: {size: count}, frames: {frame: count} }
CREATE OR REPLACE FUNCTION public.score_visitor_interest(
  _visitor_id text,
  _kind text,   -- 'category' | 'tag' | 'size' | 'frame'
  _key text,
  _delta numeric DEFAULT 1
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bucket text;
  current numeric;
BEGIN
  IF _visitor_id IS NULL OR length(_visitor_id) < 8 OR _key IS NULL OR length(_key) = 0 THEN
    RETURN;
  END IF;
  bucket := CASE _kind
    WHEN 'category' THEN 'categories'
    WHEN 'tag' THEN 'tags'
    WHEN 'size' THEN 'sizes'
    WHEN 'frame' THEN 'frames'
    ELSE NULL
  END;
  IF bucket IS NULL THEN RETURN; END IF;

  -- Ensure the profile row exists.
  INSERT INTO public.visitor_profiles(visitor_id)
  VALUES (_visitor_id)
  ON CONFLICT (visitor_id) DO NOTHING;

  UPDATE public.visitor_profiles vp
     SET interests = jsonb_set(
           jsonb_set(
             COALESCE(vp.interests, '{}'::jsonb),
             ARRAY[bucket],
             COALESCE(vp.interests -> bucket, '{}'::jsonb),
             true
           ),
           ARRAY[bucket, _key],
           to_jsonb(COALESCE((vp.interests -> bucket ->> _key)::numeric, 0) + _delta),
           true
         ),
         last_seen = now(),
         updated_at = now()
   WHERE vp.visitor_id = _visitor_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.score_visitor_interest(text, text, text, numeric) TO anon, authenticated;

-- 6) merge_visitor_to_phone: attach phone to profile (called at checkout).
CREATE OR REPLACE FUNCTION public.merge_visitor_to_phone(
  _visitor_id text,
  _phone text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _visitor_id IS NULL OR _phone IS NULL OR length(_phone) < 6 THEN
    RETURN;
  END IF;
  UPDATE public.visitor_profiles
     SET phone = _phone, updated_at = now()
   WHERE visitor_id = _visitor_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_visitor_to_phone(text, text) TO anon, authenticated;

-- 7) get_recommendations: returns keyed poster lists for the given visitor.
CREATE OR REPLACE FUNCTION public.get_recommendations(_visitor_id text, _limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile jsonb;
  top_cat_ids uuid[];
  top_cat_id uuid;
  top_cat_name text;
  top_tag text;
  viewed_ids uuid[];
  abandoned_ids uuid[];
  result jsonb;
BEGIN
  SELECT interests INTO profile FROM public.visitor_profiles WHERE visitor_id = _visitor_id;
  profile := COALESCE(profile, '{}'::jsonb);

  -- Top interest category ids ordered by score.
  SELECT array_agg(k::uuid ORDER BY (v)::numeric DESC)
    INTO top_cat_ids
    FROM jsonb_each_text(profile -> 'categories') AS t(k, v)
    WHERE k ~ '^[0-9a-f-]{36}$';

  top_cat_id := (top_cat_ids)[1];

  SELECT name INTO top_cat_name FROM public.categories WHERE id = top_cat_id;

  -- Top tag
  SELECT k INTO top_tag
    FROM jsonb_each_text(profile -> 'tags') AS t(k, v)
    ORDER BY (v)::numeric DESC
    LIMIT 1;

  -- Recently viewed poster ids (last 20).
  SELECT array_agg(poster_id ORDER BY created_at DESC)
    INTO viewed_ids
    FROM (
      SELECT poster_id, MAX(created_at) AS created_at
      FROM public.analytics_poster_events
      WHERE visitor_id = _visitor_id AND event_type = 'view' AND poster_id IS NOT NULL
      GROUP BY poster_id
      ORDER BY MAX(created_at) DESC
      LIMIT 20
    ) t;

  -- Abandoned = latest 'add' with no 'checkout_start' or 'purchase' after it (last 7 days).
  SELECT array_agg(DISTINCT ce.poster_id)
    INTO abandoned_ids
    FROM public.visitor_cart_events ce
    WHERE ce.visitor_id = _visitor_id
      AND ce.event = 'add'
      AND ce.created_at > now() - interval '7 days'
      AND ce.poster_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.visitor_cart_events ce2
        WHERE ce2.visitor_id = ce.visitor_id
          AND ce2.event IN ('purchase','checkout_start')
          AND ce2.created_at > ce.created_at
      );

  result := jsonb_build_object(
    'top_category_id', top_cat_id,
    'top_category_name', top_cat_name,
    'top_tag', top_tag,
    'recently_viewed', COALESCE(
      (SELECT jsonb_agg(to_jsonb(p)) FROM (
         SELECT id, title, image_url, category_id
         FROM public.posters
         WHERE hidden = false AND id = ANY(COALESCE(viewed_ids, ARRAY[]::uuid[]))
         ORDER BY array_position(viewed_ids, id)
         LIMIT _limit
      ) p), '[]'::jsonb),
    'because_you_liked', COALESCE(
      (SELECT jsonb_agg(to_jsonb(p)) FROM (
         SELECT id, title, image_url, category_id
         FROM public.posters
         WHERE hidden = false AND category_id = top_cat_id
           AND (viewed_ids IS NULL OR NOT (id = ANY(viewed_ids)))
         ORDER BY sales_count DESC NULLS LAST, views_count DESC NULLS LAST
         LIMIT _limit
      ) p), '[]'::jsonb),
    'popular_in_tag', COALESCE(
      (SELECT jsonb_agg(to_jsonb(p)) FROM (
         SELECT id, title, image_url, category_id
         FROM public.posters
         WHERE hidden = false AND top_tag IS NOT NULL AND top_tag = ANY(tags)
         ORDER BY sales_count DESC NULLS LAST, views_count DESC NULLS LAST
         LIMIT _limit
      ) p), '[]'::jsonb),
    'recommended_for_you', COALESCE(
      (SELECT jsonb_agg(to_jsonb(p)) FROM (
         SELECT id, title, image_url, category_id
         FROM public.posters
         WHERE hidden = false
           AND (top_cat_ids IS NULL OR category_id = ANY(top_cat_ids))
           AND (viewed_ids IS NULL OR NOT (id = ANY(viewed_ids)))
         ORDER BY sales_count DESC NULLS LAST, views_count DESC NULLS LAST
         LIMIT _limit
      ) p), '[]'::jsonb),
    'continue_where_you_left_off', COALESCE(
      (SELECT jsonb_agg(to_jsonb(p)) FROM (
         SELECT id, title, image_url, category_id
         FROM public.posters
         WHERE hidden = false AND id = ANY(COALESCE(abandoned_ids, ARRAY[]::uuid[]))
         LIMIT _limit
      ) p), '[]'::jsonb)
  );

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_recommendations(text, integer) TO anon, authenticated;

-- 8) admin_behavior_dashboard: aggregate view for Admin → Behavior tab.
CREATE OR REPLACE FUNCTION public.admin_behavior_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH
    profile_totals AS (
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE visits_count > 1)::int AS returning,
        COUNT(*) FILTER (WHERE phone IS NOT NULL)::int AS identified
      FROM public.visitor_profiles
    ),
    abandoned AS (
      SELECT COUNT(DISTINCT ce.visitor_id)::int AS c
      FROM public.visitor_cart_events ce
      WHERE ce.event = 'add'
        AND ce.created_at > now() - interval '7 days'
        AND NOT EXISTS (
          SELECT 1 FROM public.visitor_cart_events ce2
          WHERE ce2.visitor_id = ce.visitor_id
            AND ce2.event IN ('purchase','checkout_start')
            AND ce2.created_at > ce.created_at
        )
    ),
    -- Category interest scores summed across profiles.
    interest_categories AS (
      SELECT c.id, c.name, SUM((t.v)::numeric) AS score
      FROM public.visitor_profiles vp,
           LATERAL jsonb_each_text(COALESCE(vp.interests -> 'categories', '{}'::jsonb)) t(k, v)
           JOIN public.categories c ON c.id::text = t.k
      GROUP BY c.id, c.name
      ORDER BY score DESC
      LIMIT 15
    ),
    interest_tags AS (
      SELECT t.k AS tag, SUM((t.v)::numeric) AS score
      FROM public.visitor_profiles vp,
           LATERAL jsonb_each_text(COALESCE(vp.interests -> 'tags', '{}'::jsonb)) t(k, v)
      GROUP BY t.k
      ORDER BY score DESC
      LIMIT 20
    ),
    top_searches AS (
      SELECT lower(query) AS q, COUNT(*)::int AS c
      FROM public.search_queries
      WHERE created_at > now() - interval '30 days' AND length(btrim(query)) >= 2
      GROUP BY lower(query) ORDER BY COUNT(*) DESC LIMIT 20
    ),
    top_viewed AS (
      SELECT id, title, image_url, views_count
      FROM public.posters WHERE hidden = false AND views_count > 0
      ORDER BY views_count DESC LIMIT 10
    ),
    top_wishlisted AS (
      SELECT p.id, p.title, p.image_url, COUNT(w.*)::int AS wishlist_count
      FROM public.wishlists w JOIN public.posters p ON p.id = w.poster_id
      GROUP BY p.id, p.title, p.image_url
      ORDER BY COUNT(w.*) DESC LIMIT 10
    ),
    top_cart AS (
      SELECT id, title, image_url, cart_adds_count
      FROM public.posters WHERE hidden = false AND cart_adds_count > 0
      ORDER BY cart_adds_count DESC LIMIT 10
    )
  SELECT jsonb_build_object(
    'totals', (SELECT to_jsonb(profile_totals) FROM profile_totals),
    'abandoned_7d', (SELECT c FROM abandoned),
    'interest_categories', COALESCE((SELECT jsonb_agg(to_jsonb(interest_categories)) FROM interest_categories), '[]'::jsonb),
    'interest_tags', COALESCE((SELECT jsonb_agg(to_jsonb(interest_tags)) FROM interest_tags), '[]'::jsonb),
    'top_searches', COALESCE((SELECT jsonb_agg(to_jsonb(top_searches)) FROM top_searches), '[]'::jsonb),
    'top_viewed', COALESCE((SELECT jsonb_agg(to_jsonb(top_viewed)) FROM top_viewed), '[]'::jsonb),
    'top_wishlisted', COALESCE((SELECT jsonb_agg(to_jsonb(top_wishlisted)) FROM top_wishlisted), '[]'::jsonb),
    'top_cart', COALESCE((SELECT jsonb_agg(to_jsonb(top_cart)) FROM top_cart), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_behavior_dashboard() TO authenticated;

-- 9) admin_customer_profile: per-customer detail drawer (looked up by phone).
CREATE OR REPLACE FUNCTION public.admin_customer_profile(_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  vp public.visitor_profiles%ROWTYPE;
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO vp FROM public.visitor_profiles
    WHERE phone = _phone
    ORDER BY last_seen DESC
    LIMIT 1;

  WITH
    o AS (
      SELECT id, order_number, customer_name, governorate, total_price, status, created_at, poster_title
      FROM public.orders
      WHERE phone = _phone
      ORDER BY created_at DESC LIMIT 30
    ),
    wl AS (
      SELECT p.id, p.title, p.image_url, w.created_at
      FROM public.wishlists w
      JOIN public.posters p ON p.id = w.poster_id
      WHERE vp.visitor_id IS NOT NULL AND w.user_id::text = vp.visitor_id
      ORDER BY w.created_at DESC LIMIT 20
    ),
    ce AS (
      SELECT poster_id, event, qty, created_at
      FROM public.visitor_cart_events
      WHERE vp.visitor_id IS NOT NULL AND visitor_id = vp.visitor_id
      ORDER BY created_at DESC LIMIT 30
    ),
    viewed AS (
      SELECT p.id, p.title, p.image_url, e.created_at
      FROM public.analytics_poster_events e
      JOIN public.posters p ON p.id = e.poster_id
      WHERE vp.visitor_id IS NOT NULL AND e.visitor_id = vp.visitor_id AND e.event_type = 'view'
      ORDER BY e.created_at DESC LIMIT 20
    ),
    searches AS (
      SELECT lower(query) AS q, MAX(created_at) AS ts, COUNT(*)::int AS c
      FROM public.search_queries
      WHERE vp.visitor_id IS NOT NULL AND visitor_id = vp.visitor_id
      GROUP BY lower(query) ORDER BY MAX(created_at) DESC LIMIT 20
    )
  SELECT jsonb_build_object(
    'profile', to_jsonb(vp),
    'orders', COALESCE((SELECT jsonb_agg(to_jsonb(o)) FROM o), '[]'::jsonb),
    'wishlist', COALESCE((SELECT jsonb_agg(to_jsonb(wl)) FROM wl), '[]'::jsonb),
    'cart_events', COALESCE((SELECT jsonb_agg(to_jsonb(ce)) FROM ce), '[]'::jsonb),
    'viewed', COALESCE((SELECT jsonb_agg(to_jsonb(viewed)) FROM viewed), '[]'::jsonb),
    'searches', COALESCE((SELECT jsonb_agg(to_jsonb(searches)) FROM searches), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_customer_profile(text) TO authenticated;

-- 10) Admin maintenance: clear anonymous data and reset interest scores.
CREATE OR REPLACE FUNCTION public.admin_clear_anonymous_behavior(_older_than_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed int;
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.visitor_profiles
    WHERE phone IS NULL
      AND last_seen < now() - make_interval(days => GREATEST(0, _older_than_days));
  GET DIAGNOSTICS removed = ROW_COUNT;
  DELETE FROM public.visitor_cart_events
    WHERE created_at < now() - make_interval(days => GREATEST(0, _older_than_days));
  RETURN removed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_clear_anonymous_behavior(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reset_recommendation_engine()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.visitor_profiles SET interests = '{}'::jsonb, updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_recommendation_engine() TO authenticated;

-- 11) Default settings for admin controls (idempotent).
INSERT INTO public.site_settings(key, value) VALUES
  ('behavior.tracking_enabled', 'true'::jsonb),
  ('behavior.personalization_enabled', 'true'::jsonb),
  ('behavior.retention_days', '180'::jsonb)
ON CONFLICT (key) DO NOTHING;