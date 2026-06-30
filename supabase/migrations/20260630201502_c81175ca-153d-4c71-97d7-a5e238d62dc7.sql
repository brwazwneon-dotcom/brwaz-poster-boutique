
ALTER TABLE public.posters
  ADD COLUMN IF NOT EXISTS unique_views_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cart_adds_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_view_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.analytics_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id text NOT NULL,
  session_id text NOT NULL,
  path text,
  referrer text,
  source text,
  device text,
  user_agent text,
  governorate text,
  city text,
  country text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_visits_created ON public.analytics_visits (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_visits_visitor ON public.analytics_visits (visitor_id);
CREATE INDEX IF NOT EXISTS idx_analytics_visits_source ON public.analytics_visits (source);
CREATE INDEX IF NOT EXISTS idx_analytics_visits_device ON public.analytics_visits (device);

GRANT INSERT ON public.analytics_visits TO anon, authenticated;
GRANT SELECT, DELETE ON public.analytics_visits TO authenticated;
GRANT ALL ON public.analytics_visits TO service_role;
ALTER TABLE public.analytics_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_insert_visits" ON public.analytics_visits FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admin_read_visits" ON public.analytics_visits FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admin_delete_visits" ON public.analytics_visits FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.analytics_poster_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poster_id uuid REFERENCES public.posters(id) ON DELETE CASCADE,
  visitor_id text,
  session_id text,
  event_type text NOT NULL,
  duration_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_pe_created ON public.analytics_poster_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_pe_poster ON public.analytics_poster_events (poster_id);
CREATE INDEX IF NOT EXISTS idx_analytics_pe_type ON public.analytics_poster_events (event_type);

GRANT INSERT ON public.analytics_poster_events TO anon, authenticated;
GRANT SELECT, DELETE ON public.analytics_poster_events TO authenticated;
GRANT ALL ON public.analytics_poster_events TO service_role;
ALTER TABLE public.analytics_poster_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_insert_pe" ON public.analytics_poster_events FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admin_read_pe" ON public.analytics_poster_events FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admin_delete_pe" ON public.analytics_poster_events FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.search_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  results_count integer NOT NULL DEFAULT 0,
  visitor_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_search_queries_created ON public.search_queries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_queries_query ON public.search_queries (lower(query));

GRANT INSERT ON public.search_queries TO anon, authenticated;
GRANT SELECT, DELETE ON public.search_queries TO authenticated;
GRANT ALL ON public.search_queries TO service_role;
ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_insert_sq" ON public.search_queries FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admin_read_sq" ON public.search_queries FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admin_delete_sq" ON public.search_queries FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.increment_poster_views(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.posters SET views_count = views_count + 1, last_viewed_at = now() WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION public.increment_poster_unique_views(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.posters SET unique_views_count = unique_views_count + 1 WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION public.increment_poster_cart_adds(p_ids uuid[], p_qty integer)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.posters SET cart_adds_count = cart_adds_count + COALESCE(p_qty, 1) WHERE id = ANY(p_ids);
$$;

CREATE OR REPLACE FUNCTION public.add_poster_view_seconds(p_id uuid, p_seconds integer)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.posters SET total_view_seconds = total_view_seconds + GREATEST(0, COALESCE(p_seconds, 0)) WHERE id = p_id;
$$;
