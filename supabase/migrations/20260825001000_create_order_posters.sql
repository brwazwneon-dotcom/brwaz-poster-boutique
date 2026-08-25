-- ===========================================================
-- create_order_posters - Posters per order (for bundles)
-- References public.orders(id), NOT order_items
-- Idempotent: safe to run multiple times
-- ===========================================================

-- Table: safe create if not exists
CREATE TABLE IF NOT EXISTS public.order_posters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL
    REFERENCES public.orders(id)
    ON DELETE CASCADE,
  poster_id UUID NOT NULL
    REFERENCES public.posters(id)
    ON DELETE RESTRICT,
  poster_title TEXT NOT NULL,
  poster_image TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes: safe create if not exists
CREATE INDEX IF NOT EXISTS order_posters_order_id_idx ON public.order_posters(order_id);
CREATE INDEX IF NOT EXISTS order_posters_poster_id_idx ON public.order_posters(poster_id);
CREATE INDEX IF NOT EXISTS order_posters_order_position_idx ON public.order_posters(order_id, position);

-- RLS Policies: drop if exist then create (idempotent)
-- Insert: allow anon + authenticated (matches orders policy)
DROP POLICY IF EXISTS "Anyone can insert order_posters" ON public.order_posters;
CREATE POLICY "Anyone can insert order_posters" ON public.order_posters FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Select: admin only
DROP POLICY IF EXISTS "Admins view order_posters" ON public.order_posters;
CREATE POLICY "Admins view order_posters" ON public.order_posters FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

-- Update: admin only
DROP POLICY IF EXISTS "Admins update order_posters" ON public.order_posters;
CREATE POLICY "Admins update order_posters" ON public.order_posters FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

-- Delete: admin only
DROP POLICY IF EXISTS "Admins delete order_posters" ON public.order_posters;
CREATE POLICY "Admins delete order_posters" ON public.order_posters FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

COMMENT ON TABLE public.order_posters IS 'Stores individual poster associations for orders (bundles). Each row represents one poster within an order, enabling display of multiple posters per order. Linked to public.orders(id).';