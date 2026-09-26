// Meta Marketing API client (read-only): campaigns, ad sets, ads and daily
// ad-level insights for ONE ad account.
//
// Server-only, and deliberately separate from the Conversions API module
// (meta-capi.server.ts): the Pixel/CAPI token is a dataset credential and is
// never used here. Reading ads needs its own token with the `ads_read`
// permission (a Business Manager system-user token), supplied as
//   META_MARKETING_ACCESS_TOKEN   secret, server only
//   META_AD_ACCOUNT_ID            the account id (with or without "act_")
//   META_MARKETING_API_VERSION    optional, defaults to DEFAULT_VERSION
//
// Nothing here throws a secret: errors are classified and scrubbed, and the
// token only ever travels in the request to graph.facebook.com.

export const DEFAULT_VERSION = "v25.0";
const GRAPH_HOST = "https://graph.facebook.com";
const PAGE_LIMIT = 200;
const INSIGHTS_PAGE_LIMIT = 500;
const MAX_PAGES = 100;

export type MarketingConfig = { token: string; accountId: string; version: string };

export type MarketingConfigStatus =
  | { configured: true; config: MarketingConfig }
  | { configured: false; missing: string[]; invalid: string[] };

/** The account id as digits only ("act_123" -> "123"), or null when it is not one. */
export function normalizeAccountId(raw: string | undefined | null): string | null {
  const id = (raw ?? "").trim().replace(/^act_/i, "");
  return /^\d{5,20}$/.test(id) ? id : null;
}

export function readMarketingConfig(
  env: Record<string, string | undefined> = process.env,
): MarketingConfigStatus {
  const token = env.META_MARKETING_ACCESS_TOKEN?.trim() ?? "";
  const accountRaw = env.META_AD_ACCOUNT_ID?.trim() ?? "";
  const versionRaw = env.META_MARKETING_API_VERSION?.trim() || DEFAULT_VERSION;
  const missing: string[] = [];
  const invalid: string[] = [];
  if (!token) missing.push("META_MARKETING_ACCESS_TOKEN");
  if (!accountRaw) missing.push("META_AD_ACCOUNT_ID");
  const accountId = normalizeAccountId(accountRaw);
  if (accountRaw && !accountId) invalid.push("META_AD_ACCOUNT_ID");
  if (!/^v\d{1,2}\.\d{1,2}$/.test(versionRaw)) invalid.push("META_MARKETING_API_VERSION");
  if (missing.length || invalid.length || !accountId) {
    return { configured: false, missing, invalid };
  }
  return { configured: true, config: { token, accountId, version: versionRaw } };
}

export type MetaErrorKind =
  | "auth" // token invalid / expired (401, OAuth code 190)
  | "permission" // token valid but not allowed (403, code 10 / 200-299)
  | "rate_limit" // 429 or a Meta throttling code
  | "bad_request" // 400: the request itself is wrong
  | "server" // 5xx
  | "network" // no answer / timeout
  | "malformed"; // an answer we cannot read

export class MetaApiError extends Error {
  constructor(
    readonly kind: MetaErrorKind,
    message: string,
    readonly status?: number,
    readonly code?: number,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

const RATE_LIMIT_CODES = new Set([4, 17, 32, 341, 613]);
const isRateLimitCode = (c?: number) =>
  c !== undefined && (RATE_LIMIT_CODES.has(c) || (c >= 80000 && c <= 80014));

/** Removes anything token-shaped or URL-with-query from text bound for a log or a table. */
export function scrub(text: string, token?: string): string {
  let out = text;
  if (token) out = out.split(token).join("[redacted]");
  out = out.replace(/access_token=[^&\s"']+/gi, "access_token=[redacted]");
  out = out.replace(/\bEAA[A-Za-z0-9]{20,}\b/g, "[redacted]");
  out = out.replace(/https?:\/\/\S+/g, "[url]");
  return out.slice(0, 300);
}

export function classifyFailure(
  status: number,
  body: unknown,
): { kind: MetaErrorKind; message: string; code?: number } {
  const err = (body as { error?: { message?: unknown; code?: unknown } } | null)?.error;
  const code = typeof err?.code === "number" ? err.code : undefined;
  const message = typeof err?.message === "string" ? err.message : `HTTP ${status}`;
  if (status === 429 || isRateLimitCode(code)) return { kind: "rate_limit", message, code };
  if (status === 401 || code === 190) return { kind: "auth", message, code };
  if (status === 403 || code === 10 || (code !== undefined && code >= 200 && code <= 299))
    return { kind: "permission", message, code };
  if (status >= 500) return { kind: "server", message, code };
  return { kind: "bad_request", message, code };
}

export type GraphOptions = {
  fetchImpl?: typeof fetch;
  /** Extra attempts after the first for rate limits, 5xx and network errors. */
  retries?: number;
  timeoutMs?: number;
  /** Injected in tests so backoff does not slow them down. */
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const RETRYABLE: ReadonlySet<MetaErrorKind> = new Set(["rate_limit", "server", "network"]);

type Params = Record<string, string | number | undefined>;

/** One authenticated GET. Retries only what can succeed later; never retries 4xx auth/permission/bad requests. */
export async function graphGet(
  cfg: MarketingConfig,
  path: string,
  params: Params,
  opts: GraphOptions = {},
): Promise<Record<string, unknown>> {
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const attempts = 1 + Math.max(0, opts.retries ?? 2);
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
  q.set("access_token", cfg.token);
  const url = `${GRAPH_HOST}/${cfg.version}/${path}?${q.toString()}`;

  let last: MetaApiError = new MetaApiError("network", "no attempt made");
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(Math.min(8000, 1000 * 2 ** (attempt - 1)));
    try {
      const res = await doFetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
      });
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      if (!res.ok) {
        const c = classifyFailure(res.status, body);
        last = new MetaApiError(c.kind, scrub(c.message, cfg.token), res.status, c.code);
      } else if (body === null || typeof body !== "object" || Array.isArray(body)) {
        last = new MetaApiError(
          "malformed",
          "Meta returned a body that is not a JSON object",
          res.status,
        );
      } else {
        // Meta can answer HTTP 200 with an `error` object on some edges.
        if ((body as { error?: unknown }).error) {
          const c = classifyFailure(res.status, body);
          last = new MetaApiError(c.kind, scrub(c.message, cfg.token), res.status, c.code);
        } else {
          return body as Record<string, unknown>;
        }
      }
    } catch (e) {
      last =
        e instanceof MetaApiError
          ? e
          : new MetaApiError(
              "network",
              scrub(e instanceof Error ? e.message : "network error", cfg.token),
            );
    }
    if (!RETRYABLE.has(last.kind)) throw last;
  }
  throw last;
}

/**
 * Walks a Graph edge page by page. The next page is requested by re-building
 * OUR request with the `after` cursor — the `paging.next` URL Meta returns
 * embeds the access token and is never fetched or stored. Pages are capped.
 */
export async function graphPaginate(
  cfg: MarketingConfig,
  path: string,
  params: Params,
  opts: GraphOptions & { maxPages?: number; deadline?: number } = {},
): Promise<{ rows: Record<string, unknown>[]; complete: boolean }> {
  const rows: Record<string, unknown>[] = [];
  let after: string | undefined;
  const maxPages = opts.maxPages ?? MAX_PAGES;
  for (let page = 0; page < maxPages; page++) {
    if (opts.deadline && Date.now() > opts.deadline) return { rows, complete: false };
    const body = await graphGet(cfg, path, { ...params, after }, opts);
    const data = body.data;
    if (!Array.isArray(data)) {
      throw new MetaApiError("malformed", "Meta response has no data array");
    }
    for (const r of data) if (r && typeof r === "object") rows.push(r as Record<string, unknown>);
    const paging = body.paging as { cursors?: { after?: unknown }; next?: unknown } | undefined;
    const next = paging?.next ? paging?.cursors?.after : undefined;
    if (typeof next !== "string" || !next) return { rows, complete: true };
    after = next;
  }
  return { rows, complete: false };
}

/* ------------------------------------------------------------------ */
/* Typed rows                                                          */
/* ------------------------------------------------------------------ */

const str = (v: unknown): string | null =>
  typeof v === "string" && v !== "" ? v : typeof v === "number" ? String(v) : null;

/** Meta sends numbers as strings; null when absent or not a finite number. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Budgets arrive in the currency's minor unit (piasters for EGP). */
const budget = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : n / 100;
};

const time = (v: unknown): string | null => {
  const s = str(v);
  return s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : null;
};

export type CampaignRecord = {
  meta_campaign_id: string;
  name: string | null;
  status: string | null;
  effective_status: string | null;
  objective: string | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
  created_time: string | null;
  updated_time: string | null;
};
export type AdsetRecord = {
  meta_adset_id: string;
  meta_campaign_id: string | null;
  name: string | null;
  status: string | null;
  effective_status: string | null;
  optimization_goal: string | null;
  billing_event: string | null;
  daily_budget: number | null;
  created_time: string | null;
  updated_time: string | null;
};
export type AdRecord = {
  meta_ad_id: string;
  meta_adset_id: string | null;
  meta_campaign_id: string | null;
  name: string | null;
  status: string | null;
  effective_status: string | null;
  creative_id: string | null;
  created_time: string | null;
  updated_time: string | null;
};
export type InsightRecord = {
  date: string;
  meta_ad_id: string;
  meta_adset_id: string | null;
  meta_campaign_id: string | null;
  campaign_name: string | null;
  adset_name: string | null;
  ad_name: string | null;
  spend: number;
  impressions: number;
  reach: number | null;
  clicks: number;
  link_clicks: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  purchases: number | null;
  purchase_value: number | null;
  currency: string | null;
};

export const mapCampaign = (r: Record<string, unknown>): CampaignRecord | null => {
  const id = str(r.id);
  return id
    ? {
        meta_campaign_id: id,
        name: str(r.name),
        status: str(r.status),
        effective_status: str(r.effective_status),
        objective: str(r.objective),
        daily_budget: budget(r.daily_budget),
        lifetime_budget: budget(r.lifetime_budget),
        created_time: time(r.created_time),
        updated_time: time(r.updated_time),
      }
    : null;
};

export const mapAdset = (r: Record<string, unknown>): AdsetRecord | null => {
  const id = str(r.id);
  return id
    ? {
        meta_adset_id: id,
        meta_campaign_id: str(r.campaign_id),
        name: str(r.name),
        status: str(r.status),
        effective_status: str(r.effective_status),
        optimization_goal: str(r.optimization_goal),
        billing_event: str(r.billing_event),
        daily_budget: budget(r.daily_budget),
        created_time: time(r.created_time),
        updated_time: time(r.updated_time),
      }
    : null;
};

export const mapAd = (r: Record<string, unknown>): AdRecord | null => {
  const id = str(r.id);
  const creative = r.creative as { id?: unknown } | undefined;
  return id
    ? {
        meta_ad_id: id,
        meta_adset_id: str(r.adset_id),
        meta_campaign_id: str(r.campaign_id),
        name: str(r.name),
        status: str(r.status),
        effective_status: str(r.effective_status),
        creative_id: str(creative?.id),
        created_time: time(r.created_time),
        updated_time: time(r.updated_time),
      }
    : null;
};

// What Meta calls a purchase, most specific aggregate first.
const PURCHASE_ACTIONS = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];

function actionTotal(list: unknown, wanted = PURCHASE_ACTIONS): number | null {
  if (!Array.isArray(list)) return null;
  for (const type of wanted) {
    const hit = list.find((a) => (a as { action_type?: unknown })?.action_type === type);
    const v = num((hit as { value?: unknown } | undefined)?.value);
    if (v !== null) return v;
  }
  return null;
}

export const mapInsight = (r: Record<string, unknown>): InsightRecord | null => {
  const ad = str(r.ad_id);
  const date = str(r.date_start);
  if (!ad || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return {
    date,
    meta_ad_id: ad,
    meta_adset_id: str(r.adset_id),
    meta_campaign_id: str(r.campaign_id),
    campaign_name: str(r.campaign_name),
    adset_name: str(r.adset_name),
    ad_name: str(r.ad_name),
    spend: num(r.spend) ?? 0,
    impressions: Math.round(num(r.impressions) ?? 0),
    reach: num(r.reach) === null ? null : Math.round(num(r.reach)!),
    clicks: Math.round(num(r.clicks) ?? 0),
    link_clicks: num(r.inline_link_clicks) === null ? null : Math.round(num(r.inline_link_clicks)!),
    ctr: num(r.ctr),
    cpc: num(r.cpc),
    cpm: num(r.cpm),
    purchases: actionTotal(r.actions),
    purchase_value: actionTotal(r.action_values),
    currency: str(r.account_currency),
  };
};

/* ------------------------------------------------------------------ */
/* Edge fetchers                                                       */
/* ------------------------------------------------------------------ */

type Fetched<T> = { rows: T[]; complete: boolean; skipped: number };

async function fetchEdge<T>(
  cfg: MarketingConfig,
  edge: string,
  fields: string,
  map: (r: Record<string, unknown>) => T | null,
  opts: GraphOptions & { deadline?: number },
): Promise<Fetched<T>> {
  const { rows, complete } = await graphPaginate(
    cfg,
    `act_${cfg.accountId}/${edge}`,
    { fields, limit: PAGE_LIMIT },
    opts,
  );
  const out: T[] = [];
  let skipped = 0;
  for (const r of rows) {
    const m = map(r);
    if (m) out.push(m);
    else skipped++;
  }
  return { rows: out, complete, skipped };
}

export const fetchCampaigns = (
  cfg: MarketingConfig,
  opts: GraphOptions & { deadline?: number } = {},
) =>
  fetchEdge(
    cfg,
    "campaigns",
    "id,name,status,effective_status,objective,daily_budget,lifetime_budget,created_time,updated_time",
    mapCampaign,
    opts,
  );

export const fetchAdsets = (
  cfg: MarketingConfig,
  opts: GraphOptions & { deadline?: number } = {},
) =>
  fetchEdge(
    cfg,
    "adsets",
    "id,campaign_id,name,status,effective_status,optimization_goal,billing_event,daily_budget,created_time,updated_time",
    mapAdset,
    opts,
  );

export const fetchAds = (cfg: MarketingConfig, opts: GraphOptions & { deadline?: number } = {}) =>
  fetchEdge(
    cfg,
    "ads",
    "id,adset_id,campaign_id,name,status,effective_status,created_time,updated_time,creative{id}",
    mapAd,
    opts,
  );

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Daily ad-level insights for [since, until] (inclusive, YYYY-MM-DD in the ad account's calendar). */
export async function fetchInsights(
  cfg: MarketingConfig,
  since: string,
  until: string,
  opts: GraphOptions & { deadline?: number } = {},
): Promise<Fetched<InsightRecord>> {
  if (!ISO_DAY.test(since) || !ISO_DAY.test(until) || since > until) {
    throw new MetaApiError("bad_request", "Invalid insights date range");
  }
  const { rows, complete } = await graphPaginate(
    cfg,
    `act_${cfg.accountId}/insights`,
    {
      level: "ad",
      time_increment: 1,
      time_range: JSON.stringify({ since, until }),
      fields:
        "date_start,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,reach,clicks,inline_link_clicks,ctr,cpc,cpm,actions,action_values,account_currency",
      limit: INSIGHTS_PAGE_LIMIT,
    },
    opts,
  );
  const out: InsightRecord[] = [];
  let skipped = 0;
  for (const r of rows) {
    const m = mapInsight(r);
    if (m) out.push(m);
    else skipped++;
  }
  return { rows: out, complete, skipped };
}
