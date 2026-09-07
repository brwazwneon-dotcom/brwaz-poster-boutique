-- ===========================================================
-- BACKFILL: Fix custom-design orders with broken image refs
--
-- Run this ONCE in Supabase SQL Editor as admin.
--
-- Problem: Old orders stored blob: URLs or bare filenames
-- in orders.poster_image instead of permanent storage paths.
--
-- Solution: For each affected order, search the custom-designs
-- storage bucket for a matching file and update poster_image
-- with the correct permanent storage path.
--
-- What this does:
-- 1. Finds orders with blob: URLs or bare filenames
-- 2. Extracts original filename from notes JSON
-- 3. Searches storage for exact filename match
-- 4. Updates poster_image with correct storage path
-- 5. Reports unresolved records for manual review
-- ===========================================================

-- Create a function to log migration results
CREATE OR REPLACE FUNCTION public.backfill_custom_image_paths()
RETURNS TABLE (
  order_id UUID,
  order_number TEXT,
  old_poster_image TEXT,
  filename TEXT,
  new_storage_path TEXT,
  status TEXT
) LANGUAGE plpgsql AS $$
DECLARE
  rec RECORD;
  meta JSONB;
  fname TEXT;
  storage_folders RECORD;
  folder_rec RECORD;
  file_rec RECORD;
  found_path TEXT;
  match_count INT;
BEGIN
  -- Find all orders with broken image references
  FOR rec IN
    SELECT o.id, o.order_number, o.poster_image, o.notes
    FROM public.orders o
    WHERE o.poster_image IS NOT NULL
      AND (
        o.poster_image LIKE 'blob:%'
        OR o.poster_image LIKE 'data:%'
        OR o.poster_image NOT LIKE 'http%'
      )
  LOOP
    -- Extract filename from notes JSON
    fname := NULL;
    IF rec.notes IS NOT NULL THEN
      BEGIN
        meta := rec.notes::jsonb;
        fname := meta->>'originalFilename';
      EXCEPTION WHEN OTHERS THEN
        fname := NULL;
      END;
    END NULL;

    -- If no filename in notes, try to extract from poster_image
    IF fname IS NULL AND rec.poster_image IS NOT NULL THEN
      -- Bare filename like "photo.webp"
      fname := rec.poster_image;
    END IF;

    IF fname IS NULL OR fname = '' THEN
      order_id := rec.id;
      order_number := rec.order_number;
      old_poster_image := rec.poster_image;
      filename := NULL;
      new_storage_path := NULL;
      status := 'NO_FILENAME';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Search custom-designs bucket for matching files
    found_path := NULL;
    match_count := 0;

    -- List root folders (UUIDs) in custom-designs bucket
    FOR storage_folders IN
      SELECT name FROM storage.objects
      WHERE bucket_id = 'custom-designs'
        AND name LIKE '%/' || fname
    LOOP
      found_path := storage_folders.name;
      match_count := match_count + 1;
    END LOOP;

    IF match_count = 1 THEN
      -- Exact single match found
      order_id := rec.id;
      order_number := rec.order_number;
      old_poster_image := rec.poster_image;
      filename := fname;
      new_storage_path := found_path;
      status := 'MIGRATED';

      -- Update the order with the correct storage path
      UPDATE public.orders
      SET poster_image = found_path
      WHERE id = rec.id;

      RETURN NEXT;
    ELSIF match_count > 1 THEN
      -- Multiple matches — flag for manual review
      order_id := rec.id;
      order_number := rec.order_number;
      old_poster_image := rec.poster_image;
      filename := fname;
      new_storage_path := NULL;
      status := 'DUPLICATE_MATCHES_REVIEW_REQUIRED';
      RETURN NEXT;
    ELSE
      -- No match found
      order_id := rec.id;
      order_number := rec.order_number;
      old_poster_image := rec.poster_image;
      filename := fname;
      new_storage_path := NULL;
      status := 'FILE_NOT_FOUND_REVIEW_REQUIRED';
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

-- Run the backfill and see results
-- SELECT * FROM public.backfill_custom_image_paths();

-- To see summary:
-- SELECT status, COUNT(*) FROM public.backfill_custom_image_paths() GROUP BY status;
