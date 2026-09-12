-- Customer reviews — admin-entered (this store has no customer account
-- system to collect reviews from directly), shown on the homepage and
-- poster pages. CustomerReviews.tsx already had a real-data path with a
-- sample-review fallback; this table gives the admin somewhere to add
-- real ones instead of always falling back to samples.
CREATE TABLE IF NOT EXISTS reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name  text NOT NULL,
  governorate    text,
  rating         integer NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  review_text    text,
  photo_url      text,
  poster_id      uuid REFERENCES posters(id) ON DELETE SET NULL,
  approved       boolean NOT NULL DEFAULT true,
  featured       boolean NOT NULL DEFAULT false,
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reviews_approved ON reviews(approved, featured, sort_order);
CREATE INDEX IF NOT EXISTS idx_reviews_poster ON reviews(poster_id);
