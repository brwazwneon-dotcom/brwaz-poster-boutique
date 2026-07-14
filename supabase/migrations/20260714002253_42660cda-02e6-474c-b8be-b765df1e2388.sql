
ALTER TABLE public.posters ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS sort_mode text NOT NULL DEFAULT 'newest';

CREATE INDEX IF NOT EXISTS posters_category_order_idx
  ON public.posters (category_id, pinned DESC, sort_order ASC, created_at DESC)
  WHERE hidden = false;

CREATE OR REPLACE FUNCTION public.admin_reorder_posters(_category_id uuid, _ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.posters p
     SET sort_order = t.ord,
         updated_at = now()
    FROM (SELECT id, (ord - 1)::int AS ord
            FROM unnest(_ids) WITH ORDINALITY AS x(id, ord)) t
   WHERE p.id = t.id
     AND p.category_id = _category_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_pin_poster(_id uuid, _pinned boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.posters SET pinned = _pinned, updated_at = now() WHERE id = _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_move_poster_to_top(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cat uuid;
  min_ord int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT category_id INTO cat FROM public.posters WHERE id = _id;
  SELECT COALESCE(MIN(sort_order), 0) INTO min_ord FROM public.posters WHERE category_id = cat;
  UPDATE public.posters SET sort_order = min_ord - 1, updated_at = now() WHERE id = _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_move_poster_to_bottom(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cat uuid;
  max_ord int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT category_id INTO cat FROM public.posters WHERE id = _id;
  SELECT COALESCE(MAX(sort_order), 0) INTO max_ord FROM public.posters WHERE category_id = cat;
  UPDATE public.posters SET sort_order = max_ord + 1, updated_at = now() WHERE id = _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reorder_subcategories(_parent_id uuid, _ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.categories c
     SET sort_order = t.ord,
         updated_at = now()
    FROM (SELECT id, (ord - 1)::int AS ord
            FROM unnest(_ids) WITH ORDINALITY AS x(id, ord)) t
   WHERE c.id = t.id
     AND c.parent_id = _parent_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_category_sort_mode(_id uuid, _mode text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _mode NOT IN ('manual','newest','bestselling','trending','popular','random','ai') THEN
    RAISE EXCEPTION 'invalid sort mode';
  END IF;
  UPDATE public.categories SET sort_mode = _mode, updated_at = now() WHERE id = _id;
END;
$$;
