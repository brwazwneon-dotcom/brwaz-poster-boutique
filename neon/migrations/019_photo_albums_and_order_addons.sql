-- Photo albums: admin-manageable add-on products sold alongside a photo
-- printing order (e.g. a physical photo album the prints go into).
create table if not exists photo_albums (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_ar text not null,
  description_en text,
  description_ar text,
  price numeric not null,
  image_url text,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Order-level fields: which albums (if any) were added, their priced
-- snapshot at order time, and how the customer intends to pay.
alter table photo_4x6_orders add column if not exists selected_albums jsonb not null default '[]';
alter table photo_4x6_orders add column if not exists albums_total numeric not null default 0;
alter table photo_4x6_orders add column if not exists payment_method text not null default 'cod';
alter table photo_4x6_orders add constraint photo_4x6_orders_payment_method_check
  check (payment_method in ('cod', 'instapay', 'vodafone_cash'));
