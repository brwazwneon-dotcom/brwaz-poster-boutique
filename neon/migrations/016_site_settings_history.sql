-- Generic version history for site_settings, starting with the website
-- theme engine (Light/Dark/System control from Admin, with real
-- draft/publish/version/rollback instead of the single-previous-value
-- rollback some settings had before).
--
-- Deliberately keyed the same way site_settings itself is (a free-text
-- `key`) rather than one history table per feature, so any future
-- settings key that wants a publish history can reuse this table too.
-- Only "publish" writes should insert a row here — draft autosaves stay
-- cheap and don't pollute the timeline.
create table if not exists site_settings_history (
  id          uuid primary key default gen_random_uuid(),
  key         text not null,
  value       jsonb not null,
  created_at  timestamptz not null default now(),
  created_by  uuid references admin_users(id) on delete set null
);

create index if not exists site_settings_history_key_created_at_idx
  on site_settings_history (key, created_at desc);
