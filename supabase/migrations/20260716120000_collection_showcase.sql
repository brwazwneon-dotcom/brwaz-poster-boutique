CREATE TABLE IF NOT EXISTS public.collection_showcase_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL UNIQUE REFERENCES public.categories(id) ON DELETE CASCADE,
  rotation_enabled boolean NOT NULL DEFAULT true,
  display_mode text NOT NULL DEFAULT 'sequential' CHECK (display_mode IN ('sequential', 'random', 'shuffle_refresh')),
  rotation_speed_ms integer NOT NULL DEFAULT 5000 CHECK (rotation_speed_ms >= 1000),
  transition_type text NOT NULL DEFAULT 'fade' CHECK (transition_type IN ('fade', 'cross_fade', 'zoom', 'slide_left', 'slide_right', 'scale_fade')),
  pause_on_hover boolean NOT NULL DEFAULT true,
  loop_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.collection_showcase_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('upload', 'product')),
  poster_id uuid NULL REFERENCES public.posters(id) ON DELETE SET NULL,
  image_url text NOT NULL,
  alt_text text NULL,
  width integer NULL,
  height integer NULL,
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collection_showcase_images_category
  ON public.collection_showcase_images(category_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_collection_showcase_images_poster
  ON public.collection_showcase_images(poster_id);

ALTER TABLE public.collection_showcase_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_showcase_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read collection showcase settings" ON public.collection_showcase_settings;
CREATE POLICY "Public can read collection showcase settings"
ON public.collection_showcase_settings FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Admins can manage collection showcase settings" ON public.collection_showcase_settings;
CREATE POLICY "Admins can manage collection showcase settings"
ON public.collection_showcase_settings FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Public can read collection showcase images" ON public.collection_showcase_images;
CREATE POLICY "Public can read collection showcase images"
ON public.collection_showcase_images FOR SELECT
USING (enabled = true);

DROP POLICY IF EXISTS "Admins can manage collection showcase images" ON public.collection_showcase_images;
CREATE POLICY "Admins can manage collection showcase images"
ON public.collection_showcase_images FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.touch_collection_showcase_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_collection_showcase_settings_updated_at ON public.collection_showcase_settings;
CREATE TRIGGER trg_collection_showcase_settings_updated_at
BEFORE UPDATE ON public.collection_showcase_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_collection_showcase_updated_at();

DROP TRIGGER IF EXISTS trg_collection_showcase_images_updated_at ON public.collection_showcase_images;
CREATE TRIGGER trg_collection_showcase_images_updated_at
BEFORE UPDATE ON public.collection_showcase_images
FOR EACH ROW EXECUTE FUNCTION public.touch_collection_showcase_updated_at();

CREATE OR REPLACE FUNCTION public.ensure_collection_showcase_settings()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.collection_showcase_settings(category_id)
  VALUES (NEW.id)
  ON CONFLICT (category_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_categories_collection_showcase_defaults ON public.categories;
CREATE TRIGGER trg_categories_collection_showcase_defaults
AFTER INSERT ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.ensure_collection_showcase_settings();

INSERT INTO public.collection_showcase_settings(category_id)
SELECT id FROM public.categories
ON CONFLICT (category_id) DO NOTHING;
