-- WhatsApp confirmation tracking + a shared per-order event timeline and
-- internal notes table. Replaces the previously Supabase-only, never-wired
-- order_timeline/order_notes design in the old src/lib/order-management.ts /
-- OrderDetailsExtras.tsx (their types/templates/validation logic are pure
-- and reused as-is; only the Supabase reads/writes are replaced by the
-- Neon-backed functions in src/lib/order-ops.functions.ts). Additive only,
-- no existing data touched. confirmation_status values are validated in
-- the app layer (see VALID_CONFIRMATION_STATUSES), matching orders.status
-- which also has no CHECK constraint.

alter table orders add column if not exists confirmation_status text not null default 'not_sent';
alter table orders add column if not exists confirmed_at timestamptz;
alter table orders add column if not exists confirmed_by text;
alter table orders add column if not exists whatsapp_message text;

create table if not exists order_timeline (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  stage text not null,
  status text not null default 'completed',
  actor text,
  note text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists idx_order_timeline_order_id on order_timeline(order_id, created_at);

create table if not exists order_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  text text not null,
  pinned boolean not null default false,
  author text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_order_notes_order_id on order_notes(order_id, pinned desc, created_at desc);
