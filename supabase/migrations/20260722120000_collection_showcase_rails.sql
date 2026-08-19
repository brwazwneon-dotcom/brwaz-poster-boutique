ALTER TABLE public.collection_showcase_settings
ADD COLUMN IF NOT EXISTS section_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.collection_showcase_settings
ADD COLUMN IF NOT EXISTS view_all_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.enforce_collection_showcase_image_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  image_count integer;
BEGIN
  IF NEW.enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT count(*)
  INTO image_count
  FROM public.collection_showcase_images
  WHERE category_id = NEW.category_id
    AND enabled = true
    AND id <> NEW.id;

  IF image_count >= 10 THEN
    RAISE EXCEPTION 'A collection can have a maximum of 10 enabled showcase images';
  END IF;

  RETURN NEW;
END;
$$;
