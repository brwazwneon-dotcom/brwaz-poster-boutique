
CREATE TABLE public.assistant_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword TEXT NOT NULL,
  category TEXT,
  selected_title TEXT,
  selected_poster_id UUID,
  action TEXT NOT NULL DEFAULT 'search',
  size TEXT,
  session_id TEXT,
  meta JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX assistant_requests_created_at_idx ON public.assistant_requests (created_at DESC);
CREATE INDEX assistant_requests_keyword_idx ON public.assistant_requests (lower(keyword));
CREATE INDEX assistant_requests_action_idx ON public.assistant_requests (action);

GRANT SELECT ON public.assistant_requests TO authenticated;
GRANT INSERT ON public.assistant_requests TO anon, authenticated;
GRANT ALL ON public.assistant_requests TO service_role;

ALTER TABLE public.assistant_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can log assistant activity"
  ON public.assistant_requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can view assistant requests"
  ON public.assistant_requests FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
