-- Business OS Phase 1b: a real customer entity + order attribution.
--
-- Today "customers" are just `orders` grouped by phone — there's no
-- persistent identity to attach tags/notes/segments to. And while
-- analytics_visits already captures a visit's source, nothing links that
-- visit to the order it produced, so per-campaign attribution isn't
-- possible yet even though the raw signal exists.
--
-- orders.guest_session_id already equals analytics_visits.visitor_id
-- (both come from the same visitorId() in src/lib/analytics.ts) — that
-- join already works today, no new column needed for visit-level
-- attribution. What's missing is the *campaign* UTM data, which is
-- captured today only for the landing-page -> Meta Pixel path
-- (persistAudienceAttribution in src/lib/landing-pages.ts) and never
-- reaches the order itself.

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  name text,
  email text,
  address text,
  governorate text,
  tags text[] not null default '{}',
  notes text,
  source text, -- first-touch channel, from analytics_visits.source at signup time
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text, -- facebook | instagram | tiktok | google | ...
  utm_campaign text unique, -- resolves a raw utm_campaign string to this row
  budget numeric,
  starts_at date,
  ends_at date,
  created_at timestamptz not null default now()
);

alter table orders
  add column if not exists customer_id uuid references customers(id) on delete set null,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text;

create index if not exists idx_orders_customer_id on orders(customer_id);
