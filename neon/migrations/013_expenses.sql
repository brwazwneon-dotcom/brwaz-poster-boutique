-- Business OS Phase 5: expense tracking + a simple profit view.
--
-- Deliberately NOT including per-product COGS in this pass: orders store
-- frame_type/size as display labels (e.g. "High Quality PVC", "20x30"),
-- and a robust per-order cost snapshot needs those captured at sale time,
-- not joined against a labels table after the fact. That's a real,
-- separate piece of work gated on the owner actually having real
-- material/print/packaging costs to enter — until then, this ships a
-- correct, honest revenue-minus-logged-expenses profit view instead of a
-- half-right COGS number.
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  amount numeric not null check (amount >= 0),
  category text not null,
  expense_date date not null default current_date,
  description text,
  payment_method text,
  created_at timestamptz not null default now()
);

create index if not exists idx_expenses_date on expenses(expense_date);
