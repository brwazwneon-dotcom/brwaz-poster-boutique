
-- Table for 4x6 photo printing orders
CREATE TABLE public.photo_4x6_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT UNIQUE,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT,
  governorate TEXT,
  package_key TEXT NOT NULL,
  photo_count INTEGER NOT NULL DEFAULT 0,
  total_price NUMERIC NOT NULL DEFAULT 0,
  original_paths TEXT[] NOT NULL DEFAULT '{}',
  enhanced_paths TEXT[] NOT NULL DEFAULT '{}',
  suit_paths TEXT[] NOT NULL DEFAULT '{}',
  selected_versions JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.photo_4x6_orders TO authenticated;
GRANT INSERT ON public.photo_4x6_orders TO anon;
GRANT ALL ON public.photo_4x6_orders TO service_role;

ALTER TABLE public.photo_4x6_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert 4x6 orders" ON public.photo_4x6_orders
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can view 4x6 orders" ON public.photo_4x6_orders
  FOR SELECT USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update 4x6 orders" ON public.photo_4x6_orders
  FOR UPDATE USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete 4x6 orders" ON public.photo_4x6_orders
  FOR DELETE USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_photo_4x6_order_number
  BEFORE INSERT ON public.photo_4x6_orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_order_number();

CREATE TRIGGER trg_photo_4x6_updated_at
  BEFORE UPDATE ON public.photo_4x6_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_photo_4x6_orders_created ON public.photo_4x6_orders (created_at DESC);
CREATE INDEX idx_photo_4x6_orders_status ON public.photo_4x6_orders (status);

-- Storage policies for photo-4x6 bucket
CREATE POLICY "Anyone can upload to photo-4x6 folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'photo-4x6'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND lower(name) ~* '\.(jpe?g|png|webp|heic|heif)$'
  );

CREATE POLICY "Admins can view photo-4x6 uploads"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'photo-4x6'
    AND private.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Admins can delete photo-4x6 uploads"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'photo-4x6'
    AND private.has_role(auth.uid(), 'admin'::app_role)
  );

-- Seed 4x6 configuration
INSERT INTO public.site_settings (key, value)
VALUES (
  'photo_4x6_config',
  jsonb_build_object(
    'enabled', true,
    'packages', jsonb_build_array(
      jsonb_build_object('key','p8','photos',8,'price',80,'label','8 Photos 4×6'),
      jsonb_build_object('key','p12','photos',12,'price',99,'label','12 Photos 4×6')
    ),
    'aiEnhanceEnabled', true,
    'aiSuitEnabled', true,
    'upsellEnabled', true,
    'upsellExampleImage', '',
    'upsellTitle', 'Print Your Personal Photos 4×6',
    'upsellSubtitle', 'Upload your favorite photos and we''ll enhance the quality before printing.'
  )
)
ON CONFLICT (key) DO NOTHING;
