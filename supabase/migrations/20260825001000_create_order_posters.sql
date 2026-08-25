-- ===========================================================
-- create_order_posters - Posters per order (for bundles)
-- References public.orders(id), NOT order_items
-- ===========================================================

CREATE TABLE public.order_posters (
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

-- Indexes for performance
CREATE INDEX order_posters_order_id_idx ON public.order_posters(order_id);
CREATE INDEX order_posters_poster_id_idx ON public.order_posters(poster_id);
CREATE INDEX order_posters_order_position_idx ON public.order_posters(order_id, position);

-- RLS Policies
ALTER TABLE public.order_posters ENABLE ROW LEVEL SECURITY;

-- Insert: allow anon + authenticated (matches orders policy)
CREATE POLICY "Anyone can insert order_posters" ON public.order_posters FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Select: admin only
CREATE POLICY "Admins view order_posters" ON public.order_posters FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

-- Update: admin only
CREATE POLICY "Admins update order_posters" ON public.order_posters FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

-- Delete: admin only
CREATE POLICY "Admins delete order_posters" ON public.order_posters FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

COMMENT ON TABLE public.order_posters IS 'Stores individual poster associations for orders (bundles). Each row represents one poster within an order, enabling display of multiple posters per order. Linked to public.orders(id).';