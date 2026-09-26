// Meta Ads → Neon sync. Pulls campaigns, ad sets, ads and daily ad-level
// insights through meta-marketing.server.ts and upserts them, so the Analytics
// Center reads Neon and never waits on (or depends on) Meta.
//
//  - Idempotent: every table upserts on Meta's own id (insights on date + ad),
//    so re-running any range never duplicates a row.
//  - Bounded: a page cap, a per-request timeout and an overall deadline; a run
//    that cannot finish is recorded as "partial", never left half-reported.
//  - Isolated: this module is only reached from admin server functions. A Meta
//    outage cannot touch the storefront, checkout, the Pixel or CAPI.
//  - Quiet: run rows keep a scrubbed, truncated reason — no token, no payload.
import { sql } from "@/lib/neon.server";
import {
  MetaApiError,
  fetchAdsets,
  fetchAds,
  fetchCampaigns,
  fetchInsights,
  readMarketingConfig,
  scrub,
  type AdRecord,
  type AdsetRecord,
  type CampaignRecord,
  type GraphOptions,
  type InsightRecord,
  type MarketingConfig,
} from "@/lib/meta-marketing.server";

export type SyncTrigger = "manual" | "auto" | "cron";
export type SyncStatus = "running" | "success" | "partial" | "failed";

export type SyncResult = {
  ok: boolean;
  status: SyncStatus;
  runId: string | null;
  dateFrom: string;
  dateTo: string;
  campaigns: number;
  adsets: number;
  ads: number;
  insightRows: number;
  /** Reason in plain words; scrubbed of secrets. */
  message: string | null;
  errorKind: string | null;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
export const DEFAULT_SYNC_DAYS = 30;
export const MAX_SYNC_DAYS = 93;
const RUN_LOCK_MINUTES = 10;
const OVERALL_BUDGET_MS = 120_000;
const CHUNK = 400;

type Db = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
const defaultDb: Db = (text, params = []) =>
  sql()(text, params) as Promise<Record<string, unknown>[]>;

const dayString = (d: Date) => d.toISOString().slice(0, 10);

/** Validates and defaults the range. Dates are the ad account's own calendar days. */
export function resolveSyncRange(
  input: { from?: string; to?: string } = {},
  now = new Date(),
): { from: string; to: string } {
  const to = input.to && ISO_DAY.test(input.to) ? input.to : dayString(now);
  const from =
    input.from && ISO_DAY.test(input.from)
      ? input.from
      : dayString(new Date(Date.parse(to) - (DEFAULT_SYNC_DAYS - 1) * DAY_MS));
  if (Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to)) || from > to) {
    throw new Error("Invalid date range");
  }
  if ((Date.parse(to) - Date.parse(from)) / DAY_MS + 1 > MAX_SYNC_DAYS) {
    throw new Error(`Date range is limited to ${MAX_SYNC_DAYS} days per sync`);
  }
  return { from, to };
}

export const REQUIRED_TABLES = [
  "meta_campaigns",
  "meta_adsets",
  "meta_ads",
  "meta_ad_insights_daily",
  "meta_sync_runs",
];

/** True once neon/migrations/025_meta_ads_reporting.sql is applied. */
export async function metaAdsTablesApplied(db: Db = defaultDb): Promise<boolean> {
  const rows = await db(
    `select count(*)::int n from information_schema.tables
     where table_schema = 'public' and table_name = any($1::text[])`,
    [REQUIRED_TABLES],
  );
  return Number(rows[0]?.n) === REQUIRED_TABLES.length;
}

const chunks = <T>(list: T[], size = CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

async function upsertCampaigns(db: Db, account: string, rows: CampaignRecord[]) {
  for (const part of chunks(rows)) {
    await db(
      `insert into meta_campaigns
         (meta_campaign_id, account_id, name, status, effective_status, objective,
          daily_budget, lifetime_budget, created_time, updated_time, synced_at)
       select x.meta_campaign_id, $2, x.name, x.status, x.effective_status, x.objective,
              x.daily_budget, x.lifetime_budget, x.created_time, x.updated_time, now()
       from jsonb_to_recordset($1::jsonb) as x(
         meta_campaign_id text, name text, status text, effective_status text, objective text,
         daily_budget numeric, lifetime_budget numeric, created_time timestamptz, updated_time timestamptz)
       on conflict (meta_campaign_id) do update set
         account_id = excluded.account_id, name = excluded.name, status = excluded.status,
         effective_status = excluded.effective_status, objective = excluded.objective,
         daily_budget = excluded.daily_budget, lifetime_budget = excluded.lifetime_budget,
         created_time = excluded.created_time, updated_time = excluded.updated_time,
         synced_at = now()`,
      [JSON.stringify(part), account],
    );
  }
}

async function upsertAdsets(db: Db, account: string, rows: AdsetRecord[]) {
  for (const part of chunks(rows)) {
    await db(
      `insert into meta_adsets
         (meta_adset_id, meta_campaign_id, account_id, name, status, effective_status,
          optimization_goal, billing_event, daily_budget, created_time, updated_time, synced_at)
       select x.meta_adset_id, x.meta_campaign_id, $2, x.name, x.status, x.effective_status,
              x.optimization_goal, x.billing_event, x.daily_budget, x.created_time, x.updated_time, now()
       from jsonb_to_recordset($1::jsonb) as x(
         meta_adset_id text, meta_campaign_id text, name text, status text, effective_status text,
         optimization_goal text, billing_event text, daily_budget numeric,
         created_time timestamptz, updated_time timestamptz)
       on conflict (meta_adset_id) do update set
         meta_campaign_id = excluded.meta_campaign_id, account_id = excluded.account_id,
         name = excluded.name, status = excluded.status, effective_status = excluded.effective_status,
         optimization_goal = excluded.optimization_goal, billing_event = excluded.billing_event,
         daily_budget = excluded.daily_budget, created_time = excluded.created_time,
         updated_time = excluded.updated_time, synced_at = now()`,
      [JSON.stringify(part), account],
    );
  }
}

async function upsertAds(db: Db, account: string, rows: AdRecord[]) {
  for (const part of chunks(rows)) {
    await db(
      `insert into meta_ads
         (meta_ad_id, meta_adset_id, meta_campaign_id, account_id, name, status, effective_status,
          creative_id, created_time, updated_time, synced_at)
       select x.meta_ad_id, x.meta_adset_id, x.meta_campaign_id, $2, x.name, x.status, x.effective_status,
              x.creative_id, x.created_time, x.updated_time, now()
       from jsonb_to_recordset($1::jsonb) as x(
         meta_ad_id text, meta_adset_id text, meta_campaign_id text, name text, status text,
         effective_status text, creative_id text, created_time timestamptz, updated_time timestamptz)
       on conflict (meta_ad_id) do update set
         meta_adset_id = excluded.meta_adset_id, meta_campaign_id = excluded.meta_campaign_id,
         account_id = excluded.account_id, name = excluded.name, status = excluded.status,
         effective_status = excluded.effective_status, creative_id = excluded.creative_id,
         created_time = excluded.created_time, updated_time = excluded.updated_time, synced_at = now()`,
      [JSON.stringify(part), account],
    );
  }
}

/**
 * Campaign / ad set / ad names that only appear in insights (an archived or
 * deleted ad is not returned by the entity edges but still has spend). Fills
 * a name in when none is known; never overwrites what the entity edges gave.
 */
async function backfillNames(db: Db, account: string, insights: InsightRecord[]) {
  const camp = new Map<string, string | null>();
  const adset = new Map<string, { campaign: string | null; name: string | null }>();
  const ad = new Map<
    string,
    { adset: string | null; campaign: string | null; name: string | null }
  >();
  for (const r of insights) {
    if (r.meta_campaign_id) camp.set(r.meta_campaign_id, r.campaign_name);
    if (r.meta_adset_id)
      adset.set(r.meta_adset_id, { campaign: r.meta_campaign_id, name: r.adset_name });
    ad.set(r.meta_ad_id, { adset: r.meta_adset_id, campaign: r.meta_campaign_id, name: r.ad_name });
  }
  for (const part of chunks([...camp].map(([id, name]) => ({ id, name })))) {
    await db(
      `insert into meta_campaigns (meta_campaign_id, account_id, name)
       select x.id, $2, x.name from jsonb_to_recordset($1::jsonb) as x(id text, name text)
       on conflict (meta_campaign_id) do update
         set name = coalesce(meta_campaigns.name, excluded.name)`,
      [JSON.stringify(part), account],
    );
  }
  for (const part of chunks([...adset].map(([id, v]) => ({ id, ...v })))) {
    await db(
      `insert into meta_adsets (meta_adset_id, meta_campaign_id, account_id, name)
       select x.id, x.campaign, $2, x.name from jsonb_to_recordset($1::jsonb) as x(id text, campaign text, name text)
       on conflict (meta_adset_id) do update
         set name = coalesce(meta_adsets.name, excluded.name),
             meta_campaign_id = coalesce(meta_adsets.meta_campaign_id, excluded.meta_campaign_id)`,
      [JSON.stringify(part), account],
    );
  }
  for (const part of chunks([...ad].map(([id, v]) => ({ id, ...v })))) {
    await db(
      `insert into meta_ads (meta_ad_id, meta_adset_id, meta_campaign_id, account_id, name)
       select x.id, x.adset, x.campaign, $2, x.name
       from jsonb_to_recordset($1::jsonb) as x(id text, adset text, campaign text, name text)
       on conflict (meta_ad_id) do update
         set name = coalesce(meta_ads.name, excluded.name),
             meta_adset_id = coalesce(meta_ads.meta_adset_id, excluded.meta_adset_id),
             meta_campaign_id = coalesce(meta_ads.meta_campaign_id, excluded.meta_campaign_id)`,
      [JSON.stringify(part), account],
    );
  }
}

async function upsertInsights(db: Db, account: string, rows: InsightRecord[]) {
  for (const part of chunks(rows)) {
    await db(
      `insert into meta_ad_insights_daily
         (date, meta_ad_id, meta_adset_id, meta_campaign_id, account_id, spend, impressions, reach,
          clicks, link_clicks, ctr, cpc, cpm, purchases, purchase_value, currency, synced_at)
       select x.date, x.meta_ad_id, x.meta_adset_id, x.meta_campaign_id, $2, x.spend, x.impressions, x.reach,
              x.clicks, x.link_clicks, x.ctr, x.cpc, x.cpm, x.purchases, x.purchase_value, x.currency, now()
       from jsonb_to_recordset($1::jsonb) as x(
         date date, meta_ad_id text, meta_adset_id text, meta_campaign_id text, spend numeric,
         impressions bigint, reach bigint, clicks bigint, link_clicks bigint, ctr numeric, cpc numeric,
         cpm numeric, purchases numeric, purchase_value numeric, currency text)
       on conflict (date, meta_ad_id) do update set
         meta_adset_id = excluded.meta_adset_id, meta_campaign_id = excluded.meta_campaign_id,
         account_id = excluded.account_id, spend = excluded.spend, impressions = excluded.impressions,
         reach = excluded.reach, clicks = excluded.clicks, link_clicks = excluded.link_clicks,
         ctr = excluded.ctr, cpc = excluded.cpc, cpm = excluded.cpm, purchases = excluded.purchases,
         purchase_value = excluded.purchase_value, currency = excluded.currency, synced_at = now()`,
      [JSON.stringify(part), account],
    );
  }
}

export type SyncDeps = {
  db?: Db;
  graph?: GraphOptions;
  env?: Record<string, string | undefined>;
  now?: () => Date;
};

const failure = (
  range: { from: string; to: string },
  message: string,
  errorKind: string,
  runId: string | null = null,
): SyncResult => ({
  ok: false,
  status: "failed",
  runId,
  dateFrom: range.from,
  dateTo: range.to,
  campaigns: 0,
  adsets: 0,
  ads: 0,
  insightRows: 0,
  message,
  errorKind,
});

/**
 * Runs one sync. Never throws: the outcome (including "not configured",
 * "migration missing" and "another sync is running") is the return value.
 */
export async function syncMetaAds(
  input: { from?: string; to?: string; trigger?: SyncTrigger } = {},
  deps: SyncDeps = {},
): Promise<SyncResult> {
  const db = deps.db ?? defaultDb;
  const now = deps.now ?? (() => new Date());
  let range: { from: string; to: string };
  try {
    range = resolveSyncRange(input, now());
  } catch (e) {
    const t = now();
    return failure(
      { from: dayString(t), to: dayString(t) },
      e instanceof Error ? e.message : "Invalid date range",
      "bad_request",
    );
  }

  const cfgStatus = readMarketingConfig(deps.env);
  if (!cfgStatus.configured) {
    const what = [...cfgStatus.missing, ...cfgStatus.invalid.map((n) => `${n} (invalid)`)];
    return failure(range, `Meta Ads is not configured: ${what.join(", ")}`, "not_configured");
  }
  const cfg: MarketingConfig = cfgStatus.config;

  let runId: string | null = null;
  try {
    if (!(await metaAdsTablesApplied(db))) {
      return failure(
        range,
        "Database migration 025_meta_ads_reporting.sql has not been applied",
        "migration_missing",
      );
    }
    const busy = await db(
      `select 1 from meta_sync_runs
       where status = 'running' and started_at > now() - ($1 || ' minutes')::interval limit 1`,
      [String(RUN_LOCK_MINUTES)],
    );
    if (busy.length > 0) {
      return failure(range, "Another sync is already running", "busy");
    }
    const created = await db(
      `insert into meta_sync_runs (trigger, status, date_from, date_to)
       values ($1, 'running', $2::date, $3::date) returning id`,
      [input.trigger ?? "manual", range.from, range.to],
    );
    runId = String(created[0]?.id ?? "");

    // The real clock: `now` only pins the calendar range, and the pager compares to Date.now().
    const deadline = Date.now() + OVERALL_BUDGET_MS;
    const graph = { ...deps.graph, deadline };
    let campaigns = 0;
    let adsets = 0;
    let ads = 0;
    let insightRows = 0;
    let incomplete = false;
    const notes: string[] = [];
    let firstError: MetaApiError | null = null;

    // Entities first: an auth or permission failure here stops the run at once.
    try {
      const c = await fetchCampaigns(cfg, graph);
      await upsertCampaigns(db, cfg.accountId, c.rows);
      campaigns = c.rows.length;
      if (!c.complete) incomplete = true;
      if (c.skipped) notes.push(`${c.skipped} campaign record(s) unreadable`);

      const s = await fetchAdsets(cfg, graph);
      await upsertAdsets(db, cfg.accountId, s.rows);
      adsets = s.rows.length;
      if (!s.complete) incomplete = true;
      if (s.skipped) notes.push(`${s.skipped} ad set record(s) unreadable`);

      const a = await fetchAds(cfg, graph);
      await upsertAds(db, cfg.accountId, a.rows);
      ads = a.rows.length;
      if (!a.complete) incomplete = true;
      if (a.skipped) notes.push(`${a.skipped} ad record(s) unreadable`);
    } catch (e) {
      if (e instanceof MetaApiError) firstError = e;
      else throw e;
    }

    if (!firstError) {
      try {
        const i = await fetchInsights(cfg, range.from, range.to, graph);
        await backfillNames(db, cfg.accountId, i.rows);
        await upsertInsights(db, cfg.accountId, i.rows);
        insightRows = i.rows.length;
        if (!i.complete) incomplete = true;
        if (i.skipped) notes.push(`${i.skipped} insight row(s) unreadable`);
      } catch (e) {
        if (e instanceof MetaApiError) firstError = e;
        else throw e;
      }
    }

    const status: SyncStatus = firstError
      ? campaigns + adsets + ads > 0
        ? "partial"
        : "failed"
      : incomplete || notes.length > 0
        ? "partial"
        : "success";
    const message = firstError
      ? scrub(firstError.message, cfg.token)
      : incomplete
        ? "Stopped early (time or page limit); run the sync again to continue"
        : notes.length
          ? notes.join("; ")
          : null;
    const errorKind = firstError?.kind ?? null;
    await db(
      `update meta_sync_runs set status = $2, finished_at = now(), campaigns_synced = $3,
         adsets_synced = $4, ads_synced = $5, insight_rows = $6, error_kind = $7, error_message = $8
       where id = $1::uuid`,
      [runId, status, campaigns, adsets, ads, insightRows, errorKind, message],
    );
    return {
      ok: status === "success",
      status,
      runId,
      dateFrom: range.from,
      dateTo: range.to,
      campaigns,
      adsets,
      ads,
      insightRows,
      message,
      errorKind,
    };
  } catch (e) {
    const message = scrub(e instanceof Error ? e.message : "sync failed", cfg.token);
    if (runId) {
      try {
        await db(
          `update meta_sync_runs set status = 'failed', finished_at = now(),
             error_kind = 'internal', error_message = $2 where id = $1::uuid`,
          [runId, message],
        );
      } catch {
        /* the run row is bookkeeping; the result below still reports the failure */
      }
    }
    return failure(range, message, "internal", runId);
  }
}

export type SyncStatusView = {
  configured: boolean;
  /** Names of environment variables that are absent — never their values. */
  missing: string[];
  invalid: string[];
  migrationApplied: boolean;
  apiVersion: string | null;
  lastAttempt: {
    status: SyncStatus;
    startedAt: string;
    finishedAt: string | null;
    dateFrom: string | null;
    dateTo: string | null;
    rows: number;
    message: string | null;
    errorKind: string | null;
  } | null;
  lastSuccess: { finishedAt: string; dateFrom: string | null; dateTo: string | null } | null;
};

const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);
const day = (v: unknown): string | null =>
  v ? new Date(v as string).toISOString().slice(0, 10) : null;

export async function getSyncStatus(deps: SyncDeps = {}): Promise<SyncStatusView> {
  const db = deps.db ?? defaultDb;
  const cfg = readMarketingConfig(deps.env);
  const base: SyncStatusView = {
    configured: cfg.configured,
    missing: cfg.configured ? [] : cfg.missing,
    invalid: cfg.configured ? [] : cfg.invalid,
    migrationApplied: false,
    apiVersion: cfg.configured ? cfg.config.version : null,
    lastAttempt: null,
    lastSuccess: null,
  };
  try {
    base.migrationApplied = await metaAdsTablesApplied(db);
    if (!base.migrationApplied) return base;
    const [last, ok] = await Promise.all([
      db(
        `select status, started_at, finished_at, date_from, date_to,
                (campaigns_synced + adsets_synced + ads_synced + insight_rows)::int rows,
                error_message, error_kind
         from meta_sync_runs order by started_at desc limit 1`,
      ),
      db(
        `select finished_at, date_from, date_to from meta_sync_runs
         where status = 'success' order by finished_at desc limit 1`,
      ),
    ]);
    const l = last[0];
    if (l) {
      base.lastAttempt = {
        status: String(l.status) as SyncStatus,
        startedAt: iso(l.started_at)!,
        finishedAt: iso(l.finished_at),
        dateFrom: day(l.date_from),
        dateTo: day(l.date_to),
        rows: Number(l.rows) || 0,
        message: l.error_message ? String(l.error_message) : null,
        errorKind: l.error_kind ? String(l.error_kind) : null,
      };
    }
    const s = ok[0];
    if (s?.finished_at) {
      base.lastSuccess = {
        finishedAt: iso(s.finished_at)!,
        dateFrom: day(s.date_from),
        dateTo: day(s.date_to),
      };
    }
  } catch {
    // Status is informational; a database hiccup must not break the admin page.
  }
  return base;
}
