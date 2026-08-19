ALTER TABLE public.collection_showcase_settings
ADD COLUMN IF NOT EXISTS selection_mode text NOT NULL DEFAULT 'auto'
CHECK (selection_mode IN ('auto', 'manual'));

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

  IF image_count >= 5 THEN
    RAISE EXCEPTION 'A collection can have a maximum of 5 enabled showcase images';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_collection_showcase_image_limit ON public.collection_showcase_images;
CREATE TRIGGER trg_collection_showcase_image_limit
BEFORE INSERT OR UPDATE OF category_id, enabled ON public.collection_showcase_images
FOR EACH ROW EXECUTE FUNCTION public.enforce_collection_showcase_image_limit();
