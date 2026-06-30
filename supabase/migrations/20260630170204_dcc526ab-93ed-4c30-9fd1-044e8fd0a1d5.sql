
-- Reviews table
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  governorate text,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text text,
  photo_url text,
  poster_id uuid REFERENCES public.posters(id) ON DELETE SET NULL,
  approved boolean NOT NULL DEFAULT true,
  featured boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.reviews TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view approved reviews" ON public.reviews FOR SELECT USING (approved = true OR private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins insert reviews" ON public.reviews FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update reviews" ON public.reviews FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete reviews" ON public.reviews FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX reviews_poster_idx ON public.reviews(poster_id);
CREATE INDEX reviews_created_idx ON public.reviews(created_at DESC);

CREATE TRIGGER reviews_updated_at BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Poster images (multiple per poster)
CREATE TABLE public.poster_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poster_id uuid NOT NULL REFERENCES public.posters(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  kind text DEFAULT 'gallery',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.poster_images TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.poster_images TO authenticated;
GRANT ALL ON public.poster_images TO service_role;
ALTER TABLE public.poster_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view poster images" ON public.poster_images FOR SELECT USING (true);
CREATE POLICY "Admins insert poster images" ON public.poster_images FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update poster images" ON public.poster_images FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete poster images" ON public.poster_images FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX poster_images_poster_idx ON public.poster_images(poster_id, sort_order);

-- Storage policies for 'reviews' bucket (admins write, anyone read)
CREATE POLICY "Reviews public read" ON storage.objects FOR SELECT USING (bucket_id = 'reviews');
CREATE POLICY "Admins write reviews" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'reviews' AND private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update reviews objects" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'reviews' AND private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete reviews objects" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'reviews' AND private.has_role(auth.uid(), 'admin'::app_role));
