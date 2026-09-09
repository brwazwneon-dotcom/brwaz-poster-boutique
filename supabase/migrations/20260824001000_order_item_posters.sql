-- =========================================================
-- order_item_posters - Posters per order item (for bundles)
-- =========================================================

CREATE TABLE public.order_item_posters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  poster_id UUID NOT NULL REFERENCES public.posters(id) ON DELETE RESTRICT,
  poster_title TEXT NOT NULL,
  poster_image TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX order_item_posters_order_item_idx ON public.order_item_posters(order_item_id);
CREATE INDEX order_item_posters_poster_id_idx ON public.order_item_posters(poster_id, position);

-- RLS Policies
ALTER TABLE public.order_item_posters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view order item posters" ON public.order_item_posters FOR SELECT USING (true);

CREATE POLICY "Admins insert order item posters" ON public.order_item_posters FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update order item posters" ON public.order_item_posters FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete order item posters" ON public.order_item_posters FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

COMMENT ON TABLE public.order_item_posters IS 'Stores individual poster associations for order items (bundles). Each row represents one poster within an order item, enabling display of multiple posters per order item.';