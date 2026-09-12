-- Admin-curated bundle deals shown on /offers alongside the two
-- hardcoded default bundles. Previously always empty — no admin UI
-- existed to manage it, on top of the Supabase breakage.
CREATE TABLE IF NOT EXISTS custom_offers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  subtitle    text,
  size        text NOT NULL,
  count       integer NOT NULL DEFAULT 1 CHECK (count > 0),
  price       numeric(10,2) NOT NULL,
  image_url   text,
  badge       text,
  sort_order  integer NOT NULL DEFAULT 0,
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_custom_offers_enabled ON custom_offers(enabled, sort_order);
