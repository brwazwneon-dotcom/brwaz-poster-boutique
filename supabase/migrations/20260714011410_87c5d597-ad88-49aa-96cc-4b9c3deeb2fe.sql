
CREATE TABLE IF NOT EXISTS public.landing_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience_key text NOT NULL UNIQUE,
  visible boolean NOT NULL DEFAULT true,
  title_ar text,
  title_en text,
  subtitle_ar text,
  subtitle_en text,
  hero_image text,
  whatsapp_message text,
  cta_text text,
  source_category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  display_mode text NOT NULL DEFAULT 'manual',
  poster_limit int NOT NULL DEFAULT 24,
  seo_title text,
  meta_description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.landing_pages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_pages TO authenticated;
GRANT ALL ON public.landing_pages TO service_role;
ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "landing_pages_public_read" ON public.landing_pages FOR SELECT TO anon, authenticated USING (visible = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "landing_pages_admin_write" ON public.landing_pages FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER landing_pages_updated_at BEFORE UPDATE ON public.landing_pages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.landing_page_posters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_page_id uuid NOT NULL REFERENCES public.landing_pages(id) ON DELETE CASCADE,
  poster_id uuid NOT NULL REFERENCES public.posters(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (landing_page_id, poster_id)
);
GRANT SELECT ON public.landing_page_posters TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_page_posters TO authenticated;
GRANT ALL ON public.landing_page_posters TO service_role;
ALTER TABLE public.landing_page_posters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "landing_page_posters_public_read" ON public.landing_page_posters FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "landing_page_posters_admin_write" ON public.landing_page_posters FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_landing_page_posters_page ON public.landing_page_posters(landing_page_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_landing_page_posters_poster ON public.landing_page_posters(poster_id);

-- Seed 5 default landing pages
INSERT INTO public.landing_pages (audience_key, title_ar, title_en, subtitle_ar, subtitle_en, whatsapp_message, cta_text, display_mode) VALUES
  ('movies', 'بوسترات الأفلام والمسلسلات', 'Movies & TV Series Posters', 'أفضل تصميمات الأفلام بجودة طباعة عالية', 'Best movie designs in premium print quality', 'أهلًا، أنا مهتم ببوسترات الأفلام والمسلسلات وعايز أعرف المقاسات والعروض.', 'اطلب الآن', 'smart_mix'),
  ('anime',  'بوسترات الأنمي', 'Anime Posters', 'مجموعة مميزة من بوسترات الأنمي', 'A curated collection of anime posters', 'أهلًا، أنا مهتم ببوسترات الأنمي وعايز أشوف أفضل التصميمات.', 'اطلب الآن', 'smart_mix'),
  ('music',  'بوسترات الميوزك', 'Music Posters', 'ألبومات وفنانين بتصميمات حصرية', 'Albums and artists with exclusive designs', 'أهلًا، أنا مهتم ببوسترات الميوزك وعايز أعرف المتاح.', 'اطلب الآن', 'smart_mix'),
  ('cars',   'بوسترات العربيات', 'Cars Posters', 'أفخم سيارات العالم على حائطك', 'The world''s finest cars on your wall', 'أهلًا، أنا مهتم ببوسترات العربيات وعايز أشوف تصميمات أكتر.', 'اطلب الآن', 'smart_mix'),
  ('decor',  'ديكور وبراويز مميزة', 'Home Decor', 'براويز ودكور يليق بمساحتك', 'Frames and decor that fit your space', 'أهلًا، محتاج أختار برواز مناسب لديكور الأوضة.', 'اطلب الآن', 'smart_mix')
ON CONFLICT (audience_key) DO NOTHING;

-- RPC to fetch a landing page + posters (public)
CREATE OR REPLACE FUNCTION public.landing_page_bundle(_audience text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lp public.landing_pages%ROWTYPE;
  posters_json jsonb;
BEGIN
  SELECT * INTO lp FROM public.landing_pages WHERE audience_key = _audience AND visible = true LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF lp.display_mode = 'category' AND lp.source_category_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.sales_count DESC NULLS LAST, p.views_count DESC NULLS LAST), '[]'::jsonb)
      INTO posters_json
    FROM (
      SELECT id, title, image_url, category_id, sales_count, views_count
      FROM public.posters
      WHERE hidden = false AND category_id = lp.source_category_id
      ORDER BY sales_count DESC NULLS LAST, views_count DESC NULLS LAST
      LIMIT GREATEST(1, LEAST(60, lp.poster_limit))
    ) p;
  ELSE
    -- manual + smart_mix: use landing_page_posters, then optionally top-up from category
    SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.pinned DESC, p.sort_order ASC), '[]'::jsonb)
      INTO posters_json
    FROM (
      SELECT po.id, po.title, po.image_url, po.category_id, po.sales_count, po.views_count,
             lpp.sort_order, lpp.pinned
      FROM public.landing_page_posters lpp
      JOIN public.posters po ON po.id = lpp.poster_id
      WHERE lpp.landing_page_id = lp.id AND po.hidden = false
      ORDER BY lpp.pinned DESC, lpp.sort_order ASC
      LIMIT GREATEST(1, LEAST(60, lp.poster_limit))
    ) p;

    IF lp.display_mode = 'smart_mix' AND jsonb_array_length(posters_json) < lp.poster_limit AND lp.source_category_id IS NOT NULL THEN
      posters_json := posters_json || (
        SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
        FROM (
          SELECT id, title, image_url, category_id, sales_count, views_count
          FROM public.posters
          WHERE hidden = false AND category_id = lp.source_category_id
            AND id NOT IN (SELECT poster_id FROM public.landing_page_posters WHERE landing_page_id = lp.id)
          ORDER BY sales_count DESC NULLS LAST, views_count DESC NULLS LAST
          LIMIT GREATEST(0, lp.poster_limit - jsonb_array_length(posters_json))
        ) p
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('page', to_jsonb(lp), 'posters', posters_json);
END;
$$;

-- RPC for admin campaign analytics per audience
CREATE OR REPLACE FUNCTION public.admin_campaign_report()
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

  WITH visits AS (
    SELECT
      NULLIF(regexp_replace(path, '^/landing/([a-z]+).*$', '\1'), path) AS audience,
      visitor_id, created_at
    FROM public.analytics_visits
    WHERE path LIKE '/landing/%' AND created_at > now() - interval '90 days'
  ),
  agg AS (
    SELECT audience,
      COUNT(*)::int AS visits,
      COUNT(DISTINCT visitor_id)::int AS unique_visitors
    FROM visits WHERE audience IS NOT NULL GROUP BY audience
  )
  SELECT jsonb_object_agg(audience, jsonb_build_object('visits', visits, 'unique_visitors', unique_visitors))
    INTO result FROM agg;

  RETURN COALESCE(result, '{}'::jsonb);
END;
$$;
