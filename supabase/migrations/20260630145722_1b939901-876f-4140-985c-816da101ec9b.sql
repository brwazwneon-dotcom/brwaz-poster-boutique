CREATE TABLE IF NOT EXISTS public.recently_viewed (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  poster_id uuid NOT NULL REFERENCES public.posters(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, poster_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recently_viewed TO authenticated;
GRANT ALL ON public.recently_viewed TO service_role;

ALTER TABLE public.recently_viewed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own recently viewed"
  ON public.recently_viewed
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS recently_viewed_user_viewed_idx
  ON public.recently_viewed (user_id, viewed_at DESC);