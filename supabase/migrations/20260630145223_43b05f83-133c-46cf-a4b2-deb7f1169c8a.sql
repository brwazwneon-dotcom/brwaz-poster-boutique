CREATE TABLE IF NOT EXISTS public.wishlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  poster_id uuid NOT NULL REFERENCES public.posters(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, poster_id)
);

CREATE INDEX IF NOT EXISTS wishlists_user_idx ON public.wishlists(user_id);
CREATE INDEX IF NOT EXISTS wishlists_poster_idx ON public.wishlists(poster_id);

GRANT SELECT, INSERT, DELETE ON public.wishlists TO authenticated;
GRANT ALL ON public.wishlists TO service_role;

ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own wishlist"
ON public.wishlists
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all wishlists"
ON public.wishlists
FOR SELECT
TO authenticated
USING (private.has_role(auth.uid(), 'admin'::app_role));