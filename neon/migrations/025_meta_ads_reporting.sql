-- Meta Ads reporting cache: campaigns, ad sets, ads and daily ad-level insights
-- pulled from the Meta Marketing API by the admin "Sync now" action, so the
-- Analytics Center reads Neon and never calls Meta on a page load.
--
-- Strictly additive and idempotent: CREATE TABLE / INDEX IF NOT EXISTS only.
-- No existing table is altered, no row is rewritten, nothing is dropped.
--
-- The application does not depend on this migration for the storefront or
-- checkout: only the admin Meta Ads reports read these tables, and they say
-- "migration not applied" instead of failing when they are missing.
--
-- IDs are Meta's own numeric ids stored as text (they exceed safe JS integers
-- in some accounts). The site's UTM parameters carry them too:
--   utm_campaign = campaign id, utm_content = ad id  (verified against Ads Manager)
-- so website traffic and orders join to these rows by id, not by name.

create table if not exists meta_campaigns (
  meta_campaign_id text primary key,
  account_id       text not null,
  name             text,
  status           text,
  effective_status text,
  objective        text,
  daily_budget     numeric,
  lifetime_budget  numeric,
  created_time     timestamptz,
  updated_time     timestamptz,
  synced_at        timestamptz not null default now()
);

create table if not exists meta_adsets (
  meta_adset_id     text primary key,
  meta_campaign_id  text,
  account_id        text not null,
  name              text,
  status            text,
  effective_status  text,
  optimization_goal text,
  billing_event     text,
  daily_budget      numeric,
  created_time      timestamptz,
  updated_time      timestamptz,
  synced_at         timestamptz not null default now()
);
create index if not exists idx_meta_adsets_campaign on meta_adsets (meta_campaign_id);

create table if not exists meta_ads (
  meta_ad_id       text primary key,
  meta_adset_id    text,
  meta_campaign_id text,
  account_id       text not null,
  name             text,
  status           text,
  effective_status text,
  creative_id      text,
  created_time     timestamptz,
  updated_time     timestamptz,
  synced_at        timestamptz not null default now()
);
create index if not exists idx_meta_ads_adset on meta_ads (meta_adset_id);
create index if not exists idx_meta_ads_campaign on meta_ads (meta_campaign_id);

-- One row per ad per day (the ad account's own calendar day). Re-syncing a day
-- replaces that day's row, so the sync is safe to repeat.
--   spend / cpc / cpm are in `currency`; ctr is a percentage as Meta reports it.
--   reach is per day and NOT additive across days: reports never sum it.
--   purchases / purchase_value are what Meta itself attributes (pixel + CAPI);
--   they are shown next to, never mixed with, the orders counted on the website.
create table if not exists meta_ad_insights_daily (
  date             date not null,
  meta_ad_id       text not null,
  meta_adset_id    text,
  meta_campaign_id text,
  account_id       text not null,
  spend            numeric not null default 0,
  impressions      bigint not null default 0,
  reach            bigint,
  clicks           bigint not null default 0,
  link_clicks      bigint,
  ctr              numeric,
  cpc              numeric,
  cpm              numeric,
  purchases        numeric,
  purchase_value   numeric,
  currency         text,
  synced_at        timestamptz not null default now(),
  primary key (date, meta_ad_id)
);
create index if not exists idx_meta_insights_campaign_date
  on meta_ad_insights_daily (meta_campaign_id, date);
create index if not exists idx_meta_insights_adset_date
  on meta_ad_insights_daily (meta_adset_id, date);

-- One row per sync attempt: what was asked for, what happened, never a secret.
create table if not exists meta_sync_runs (
  id                uuid primary key default gen_random_uuid(),
  trigger           text not null default 'manual',
  status            text not null default 'running', -- running | success | partial | failed
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  date_from         date,
  date_to           date,
  campaigns_synced  integer not null default 0,
  adsets_synced     integer not null default 0,
  ads_synced        integer not null default 0,
  insight_rows      integer not null default 0,
  error_kind        text,
  error_message     text
);
create index if not exists idx_meta_sync_runs_started on meta_sync_runs (started_at desc);
