
-- Order timeline events
CREATE TABLE public.order_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  stage text NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  actor text,
  note text,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_timeline_order_id_idx ON public.order_timeline(order_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_timeline TO authenticated;
GRANT ALL ON public.order_timeline TO service_role;
ALTER TABLE public.order_timeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage order_timeline" ON public.order_timeline
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "insert order_timeline anon system" ON public.order_timeline
  FOR INSERT TO anon WITH CHECK (true);
GRANT INSERT ON public.order_timeline TO anon;

-- Internal notes
CREATE TABLE public.order_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  text text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  author text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_notes_order_id_idx ON public.order_notes(order_id, pinned DESC, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_notes TO authenticated;
GRANT ALL ON public.order_notes TO service_role;
ALTER TABLE public.order_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage order_notes" ON public.order_notes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER order_notes_set_updated_at
  BEFORE UPDATE ON public.order_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto log status changes to timeline
CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_timeline(order_id, stage, status, actor, note)
    VALUES (NEW.id, 'order_created', 'completed', 'system', 'Order created');
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_timeline(order_id, stage, status, actor, note, meta)
    VALUES (NEW.id, 'status_changed', 'completed', 'admin',
            'Status: ' || COALESCE(OLD.status,'?') || ' → ' || COALESCE(NEW.status,'?'),
            jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_log_status_change
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_order_status_change();
