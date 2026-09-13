-- Business OS Phase 6a: coupon codes (admin management only in this pass).
--
-- Checkout redemption is deliberately NOT wired in yet: cart.tsx's pricing
-- (auto bundle discounts, tiered free-shipping threshold, tape upsell) is
-- intricate, interdependent, and the single most revenue-sensitive code
-- path on the site. Adding a coupon discount there needs its own careful
-- pass integrated with that existing engine, not a rushed addition here.
-- The existing orders_price_guard trigger already tolerates up to a 55%
-- per-line discount, so a reasonable coupon discount is compatible with
-- it once redemption is wired in.
create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null, -- 'percent' | 'fixed'
  discount_value numeric not null check (discount_value > 0),
  usage_limit integer, -- null = unlimited
  used_count integer not null default 0,
  per_customer_limit integer, -- null = unlimited
  min_order_amount numeric,
  starts_at timestamptz,
  ends_at timestamptz,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
