import { sql } from "@/lib/neon.server";
import { productionHostList } from "@/lib/analytics-host.server";
import { hostOf, normalizeSource } from "@/lib/attribution";
import { readStoredAttribution } from "@/lib/order-attribution";
import { storeOffsetMs, type AnalyticsRange } from "@/lib/store-time";
import type {
  CampaignRow,
  CampaignsData,
  CountRow,
  DataNotes,
  FunnelData,
  FunnelStep,
  Metrics,
  OverviewData,
  PeriodInfo,
  SeriesPoint,
  TouchModel,
  TrafficData,
  TrafficRow,
} from "@/lib/analytics-center.types";

/* ------------------------------------------------------------------ */
/* Shared query infrastructure                                         */
/* ------------------------------------------------------------------ */

const TZ = "Africa/Cairo";
const DAY_MS = 86_400_000;
// Referrers that only exist on developer machines / private networks.
const DEV_REFERRER =
  "^https?://(localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0|\\[::1\\]|192\\.168\\.|10\\.)";
const SESSION_ROW_LIMIT = 100_000;

export type Ctx = { start: string; end: string; hosts: string[]; m: boolean };

const VISIT_CORE = [
  "visitor_id",
  "session_id",
  "path",
  "referrer",
  "source",
  "device",
  "browser",
  "os",
  "created_at",
];
const VISIT_ATTR = [
  "host",
  "first_source",
  "first_medium",
  "first_campaign",
  "first_content",
  "first_term",
  "last_source",
  "last_medium",
  "last_campaign",
  "last_content",
  "last_term",
];
const EVENT_CORE = ["poster_id", "visitor_id", "session_id", "event_type", "created_at"];
const EVENT_EXTRA: Array<[string, string]> = [
  ["host", "text"],
  ["path", "text"],
  ["value", "numeric"],
  ["quantity", "integer"],
  ["props", "jsonb"],
];

let migrationCache: { at: number; applied: boolean } | null = null;

/**
 * True once neon/migrations/024_analytics_attribution.sql is applied. The
 * reports still work without it (attribution columns read as NULL and the
 * legacy per-visit source is used), they just have less to show.
 */
export async function attributionMigrationApplied(): Promise<boolean> {
  if (migrationCache && Date.now() - migrationCache.at < 60_000) return migrationCache.applied;
  const rows = await query<{ table_name: string; n: number }>(
    `select table_name, count(*)::int n from information_schema.columns
     where table_schema='public'
       and ((table_name='analytics_visits' and column_name in ('host','first_source','last_source'))
         or (table_name='analytics_poster_events' and column_name in ('host','props','value','quantity','path')))
     group by table_name`,
    [],
  );
  const get = (t: string) => rows.find((r) => r.table_name === t)?.n ?? 0;
  const applied = get("analytics_visits") === 3 && get("analytics_poster_events") === 5;
  migrationCache = { at: Date.now(), applied };
  return applied;
}

export async function makeCtx(range: AnalyticsRange | { start: Date; end: Date }): Promise<Ctx> {
  return {
    start: range.start.toISOString(),
    end: range.end.toISOString(),
    hosts: productionHostList(),
    m: await attributionMigrationApplied(),
  };
}

/**
 * Common table expressions shared by every report. Parameters:
 *   $1 range start, $2 range end, $3 production hostnames.
 *
 * Development/QA traffic is excluded in two ways: rows recorded with a
 * non-production `host`, and — for the history recorded before `host`
 * existed — whole sessions that contain a localhost/private-network referrer.
 * Nothing is deleted; the rows stay in the table and can be counted (see
 * getDataNotes).
 */
export function baseCtes(m: boolean): string {
  const hostCond = m ? "(host is not null and not (host = any($3::text[]))) or" : "";
  const vHost = m ? "and (av.host is null or av.host = any($3::text[]))" : "";
  const eHost = m ? "and (ae.host is null or ae.host = any($3::text[]))" : "";
  const vCols = [
    ...VISIT_CORE.map((c) => `av.${c}`),
    ...VISIT_ATTR.map((c) => (m ? `av.${c}` : `null::text as ${c}`)),
  ].join(", ");
  const eCols = [
    ...EVENT_CORE.map((c) => `ae.${c}`),
    ...EVENT_EXTRA.map(([c, t]) => (m ? `ae.${c}` : `null::${t} as ${c}`)),
  ].join(", ");
  return `
    dev_sessions as (
      select distinct session_id from analytics_visits
      where session_id is not null and (${hostCond} referrer ~* '${DEV_REFERRER}')
    ),
    dev_visitors as (
      select distinct visitor_id from analytics_visits
      where visitor_id is not null and (${hostCond} referrer ~* '${DEV_REFERRER}')
    ),
    v as (
      select ${vCols} from analytics_visits av
      where av.created_at >= $1::timestamptz and av.created_at < $2::timestamptz
        and av.session_id is not null and $3::text[] is not null ${vHost}
        and not exists (select 1 from dev_sessions d where d.session_id = av.session_id)
    ),
    e as (
      select ${eCols} from analytics_poster_events ae
      where ae.created_at >= $1::timestamptz and ae.created_at < $2::timestamptz ${eHost}
        and (ae.session_id is null or not exists (select 1 from dev_sessions d where d.session_id = ae.session_id))
    )`;
}

const TRANSIENT = /fetch failed|Connect Timeout|ECONNRESET|other side closed|socket hang up/i;

/**
 * Typed parameterised query against Neon. These are read-only reports, so a
 * dropped connection is retried (bounded) instead of failing the whole page.
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return (await sql()(text, params)) as T[];
    } catch (e) {
      lastError = e;
      if (
        !TRANSIENT.test(
          e instanceof Error
            ? `${e.message} ${String((e as { cause?: unknown }).cause ?? "")}`
            : "",
        )
      )
        throw e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function run<T = Record<string, unknown>>(ctx: Ctx, body: string): Promise<T[]> {
  return query<T>(`with ${baseCtes(ctx.m)} ${body}`, [ctx.start, ctx.end, ctx.hosts]);
}

export const N = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export function periodInfo(r: AnalyticsRange): PeriodInfo {
  return {
    key: r.key,
    start: r.start.toISOString(),
    end: r.end.toISOString(),
    prevStart: r.prevStart.toISOString(),
    prevEnd: r.prevEnd.toISOString(),
    days: r.days,
  };
}

/** Cairo calendar day (YYYY-MM-DD) of an instant. */
export function cairoDay(d: Date): string {
  return new Date(d.getTime() + storeOffsetMs(d)).toISOString().slice(0, 10);
}

/** Each Cairo day in [start, end). Sampling at noon keeps DST days from repeating/skipping. */
export function daysBetween(start: Date, end: Date): string[] {
  const out: string[] = [];
  for (let t = start.getTime() + DAY_MS / 2; t < end.getTime(); t += DAY_MS) {
    const label = cairoDay(new Date(t));
    if (out[out.length - 1] !== label) out.push(label);
  }
  return out;
}

const CHECKOUT_KEY = "coalesce(customer_id::text, phone) || '|' || created_at::text";

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

const CLICK_EVENTS = [
  "select_item",
  "select_category",
  "select_subcategory",
  "select_banner",
  "select_offer",
  "whatsapp_click",
];

export async function periodMetrics(ctx: Ctx): Promise<Metrics> {
  const [visit, events, newRet, orders] = await Promise.all([
    run<{ page_views: number; visitors: number; sessions: number }>(
      ctx,
      `select count(*)::int page_views, count(distinct visitor_id)::int visitors,
              count(distinct session_id)::int sessions from v`,
    ),
    run<{ event_type: string; n: number; s: number }>(
      ctx,
      `select event_type, count(*)::int n, count(distinct session_id)::int s from e group by 1`,
    ),
    run<{ new_v: number; ret_v: number }>(
      ctx,
      `select count(*) filter (where fs >= $1::timestamptz)::int new_v,
              count(*) filter (where fs < $1::timestamptz)::int ret_v
       from (select (select min(a.created_at) from analytics_visits a where a.visitor_id = vv.visitor_id) fs
             from (select distinct visitor_id from v where visitor_id is not null) vv) x`,
    ),
    query<{ checkouts: number; cancelled: number; revenue: string; revenue_net: string }>(
      `select count(distinct k)::int checkouts,
              count(distinct k) filter (where status in ('cancelled','returned'))::int cancelled,
              coalesce(sum(total_price),0)::numeric revenue,
              coalesce(sum(total_price) filter (where status not in ('cancelled','returned')),0)::numeric revenue_net
       from (select ${CHECKOUT_KEY} k, status, total_price from orders
             where is_test = false and created_at >= $1::timestamptz and created_at < $2::timestamptz) o`,
      [ctx.start, ctx.end],
    ),
  ]);
  const ev = (t: string) => events.find((r) => r.event_type === t);
  const visitors = N(visit[0]?.visitors);
  const orderCount = N(orders[0]?.checkouts);
  const revenue = N(orders[0]?.revenue);
  return {
    visitors,
    sessions: N(visit[0]?.sessions),
    pageViews: N(visit[0]?.page_views),
    productViews: N(ev("view")?.n),
    clicks: CLICK_EVENTS.some((t) => ev(t))
      ? CLICK_EVENTS.reduce((s, t) => s + N(ev(t)?.n), 0)
      : null,
    addToCartSessions: N(ev("cart_add")?.s),
    addToCartItems: N(ev("cart_add")?.n),
    viewCartSessions: N(ev("view_cart")?.s),
    checkoutStarts: N(ev("checkout_start")?.n),
    orders: orderCount,
    revenue,
    revenueNet: N(orders[0]?.revenue_net),
    cancelledOrders: N(orders[0]?.cancelled),
    newVisitors: N(newRet[0]?.new_v),
    returningVisitors: N(newRet[0]?.ret_v),
    conversionRate: ratio(orderCount, visitors),
    aov: ratio(revenue, orderCount),
  };
}

async function overviewSeries(ctx: Ctx, range: AnalyticsRange): Promise<SeriesPoint[]> {
  const day = `to_char(created_at at time zone '${TZ}', 'YYYY-MM-DD')`;
  const [vis, ev, ord] = await Promise.all([
    run<{ d: string; visitors: number; sessions: number; page_views: number }>(
      ctx,
      `select ${day} d, count(distinct visitor_id)::int visitors, count(distinct session_id)::int sessions,
              count(*)::int page_views from v group by 1`,
    ),
    run<{ d: string; atc: number }>(
      ctx,
      `select ${day} d, count(distinct session_id) filter (where event_type='cart_add')::int atc from e group by 1`,
    ),
    query<{ d: string; orders: number; revenue: string }>(
      `select ${day} d, count(distinct ${CHECKOUT_KEY})::int orders, coalesce(sum(total_price),0)::numeric revenue
       from orders where is_test = false and created_at >= $1::timestamptz and created_at < $2::timestamptz group by 1`,
      [ctx.start, ctx.end],
    ),
  ]);
  return daysBetween(range.start, range.end).map((d) => ({
    day: d,
    visitors: N(vis.find((r) => r.d === d)?.visitors),
    sessions: N(vis.find((r) => r.d === d)?.sessions),
    pageViews: N(vis.find((r) => r.d === d)?.page_views),
    addToCartSessions: N(ev.find((r) => r.d === d)?.atc),
    orders: N(ord.find((r) => r.d === d)?.orders),
    revenue: N(ord.find((r) => r.d === d)?.revenue),
  }));
}

const TRACKED_LATER = [
  "view_cart",
  "view_item_list",
  "select_item",
  "select_category",
  "select_subcategory",
  "select_banner",
  "select_offer",
  "whatsapp_click",
  "custom_design_start",
  "custom_design_upload",
  "custom_design_completed",
  "custom_design_add_to_cart",
];

/** First time each newer event type was recorded (production traffic only). */
export async function trackingStarted(ctx: Ctx): Promise<Record<string, string | null>> {
  const rows = (await query(
    `select ae.event_type, min(ae.created_at) first
     from analytics_poster_events ae
     where ae.event_type = any($1::text[])
       ${ctx.m ? "and (ae.host is null or ae.host = any($2::text[]))" : "and $2::text[] is not null"}
     group by 1`,
    [TRACKED_LATER, ctx.hosts],
  )) as Array<{ event_type: string; first: Date | string }>;
  const out: Record<string, string | null> = {};
  for (const t of TRACKED_LATER) {
    const f = rows.find((r) => r.event_type === t)?.first;
    out[t] = f ? new Date(f).toISOString() : null;
  }
  return out;
}

export async function getDataNotes(ctx: Ctx): Promise<DataNotes> {
  const [counts, started] = await Promise.all([
    run<{ tv: number; kv: number; ts: number; ks: number }>(
      ctx,
      `select (select count(*) from analytics_visits where created_at >= $1::timestamptz and created_at < $2::timestamptz)::int tv,
              (select count(*) from v)::int kv,
              (select count(distinct session_id) from analytics_visits where created_at >= $1::timestamptz and created_at < $2::timestamptz)::int ts,
              (select count(distinct session_id) from v)::int ks`,
    ),
    trackingStarted(ctx),
  ]);
  const c = counts[0] ?? { tv: 0, kv: 0, ts: 0, ks: 0 };
  return {
    devExcludedVisits: Math.max(0, N(c.tv) - N(c.kv)),
    devExcludedSessions: Math.max(0, N(c.ts) - N(c.ks)),
    trackingStarted: started,
    attributionMigrationApplied: ctx.m,
  };
}

export async function getOverview(range: AnalyticsRange): Promise<OverviewData> {
  const cur = await makeCtx(range);
  const prev = await makeCtx({ start: range.prevStart, end: range.prevEnd });
  const [current, previous, series, notes] = await Promise.all([
    periodMetrics(cur),
    periodMetrics(prev),
    overviewSeries(cur, range),
    getDataNotes(cur),
  ]);
  return { period: periodInfo(range), current, previous, series, notes };
}

/* ------------------------------------------------------------------ */
/* Sessions (traffic, funnel, campaigns all derive from these)         */
/* ------------------------------------------------------------------ */

export type SessRow = {
  session_id: string;
  visitor_id: string | null;
  started_at: Date | string;
  device: string | null;
  browser: string | null;
  os: string | null;
  landing_path: string | null;
  exit_path: string | null;
  pages: number;
  legacy_source: string | null;
  legacy_referrer: string | null;
  first_source: string | null;
  first_medium: string | null;
  first_campaign: string | null;
  first_content: string | null;
  first_term: string | null;
  last_source: string | null;
  last_medium: string | null;
  last_campaign: string | null;
  last_content: string | null;
  last_term: string | null;
  viewed?: boolean;
  carted?: boolean;
  viewed_cart?: boolean;
  checkout?: boolean;
  views?: number;
  cart_adds?: number;
};

const first = (col: string, cond = `${col} is not null`) =>
  `(array_agg(${col} order by created_at) filter (where ${cond}))[1]`;
const lastNonNull = (col: string, cond: string) =>
  `(array_agg(${col} order by created_at desc) filter (where ${cond}))[1]`;

/** Aggregates page-view rows of CTE `src` into one row per session. */
export const SESSION_AGG = `
  session_id,
  (array_agg(visitor_id order by created_at))[1] as visitor_id,
  min(created_at) as started_at,
  (array_agg(device order by created_at))[1] as device,
  (array_agg(browser order by created_at))[1] as browser,
  (array_agg(os order by created_at))[1] as os,
  (array_agg(path order by created_at))[1] as landing_path,
  (array_agg(path order by created_at desc))[1] as exit_path,
  count(*)::int as pages,
  (array_agg(source order by created_at))[1] as legacy_source,
  (array_agg(referrer order by created_at))[1] as legacy_referrer,
  ${first("first_source")} as first_source,
  ${first("first_medium", "first_source is not null")} as first_medium,
  ${first("first_campaign", "first_source is not null")} as first_campaign,
  ${first("first_content", "first_source is not null")} as first_content,
  ${first("first_term", "first_source is not null")} as first_term,
  ${lastNonNull("last_source", "last_source is not null")} as last_source,
  ${lastNonNull("last_medium", "last_source is not null")} as last_medium,
  ${lastNonNull("last_campaign", "last_source is not null")} as last_campaign,
  ${lastNonNull("last_content", "last_source is not null")} as last_content,
  ${lastNonNull("last_term", "last_source is not null")} as last_term`;

export async function loadSessions(ctx: Ctx): Promise<SessRow[]> {
  return run<SessRow>(
    ctx,
    `, sess as (select ${SESSION_AGG} from v group by session_id),
     ev as (
       select session_id,
              bool_or(event_type = 'view') viewed,
              bool_or(event_type = 'cart_add') carted,
              bool_or(event_type = 'view_cart') viewed_cart,
              bool_or(event_type = 'checkout_start') checkout,
              count(*) filter (where event_type = 'view')::int views,
              count(*) filter (where event_type = 'cart_add')::int cart_adds
       from e where session_id is not null group by session_id)
     select s.*, coalesce(ev.viewed,false) viewed, coalesce(ev.carted,false) carted,
            coalesce(ev.viewed_cart,false) viewed_cart, coalesce(ev.checkout,false) checkout,
            coalesce(ev.views,0) views, coalesce(ev.cart_adds,0) cart_adds
     from sess s left join ev on ev.session_id = s.session_id
     limit ${SESSION_ROW_LIMIT}`,
  );
}

export type TouchView = {
  source: string;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  /** true = stamped by the browser's first/last-touch capture; false = legacy per-visit guess. */
  stamped: boolean;
};

/**
 * A session's touch under the chosen model. Sessions recorded before the
 * attribution capture shipped only have the legacy `source` of their entry
 * page view (normalized into the same taxonomy) — flagged `stamped: false`.
 */
export function touchOf(r: SessRow, model: TouchModel): TouchView {
  const src = model === "first" ? r.first_source : r.last_source;
  if (src) {
    const p = model === "first" ? "first" : "last";
    const rec = r as unknown as Record<string, string | null>;
    return {
      source: normalizeSource(src) ?? "other",
      medium: rec[`${p}_medium`] ?? null,
      campaign: rec[`${p}_campaign`] ?? null,
      content: rec[`${p}_content`] ?? null,
      term: rec[`${p}_term`] ?? null,
      stamped: true,
    };
  }
  return {
    source: normalizeSource(r.legacy_source) ?? "direct",
    medium: null,
    campaign: null,
    content: null,
    term: null,
    stamped: false,
  };
}

export type CheckoutRow = {
  k: string;
  order_number: string | null;
  items: number;
  payment_method: string | null;
  visitor_id: string | null;
  created_at: Date | string;
  revenue: string;
  status: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  /**
   * orders.ad_tracking -> "attribution": the visitor's first/last touch frozen at
   * the moment the order was placed (see order-attribution.ts). Null for orders
   * placed before the snapshot existed — those fall back to the session join.
   */
  snapshot?: unknown;
};

export async function loadCheckouts(ctx: Ctx): Promise<CheckoutRow[]> {
  const select = (snapshot: string) => `
    select ${CHECKOUT_KEY} k, min(order_number) order_number, sum(quantity)::int items,
            min(payment_method) payment_method, min(guest_session_id) visitor_id, min(created_at) created_at,
            sum(total_price)::numeric revenue, min(status) status,
            min(utm_source) utm_source, min(utm_medium) utm_medium, min(utm_campaign) utm_campaign${snapshot}
     from orders where is_test = false and created_at >= $1::timestamptz and created_at < $2::timestamptz
     group by 1`;
  try {
    return (await query(
      select(
        `, (array_agg(ad_tracking -> 'attribution') filter (where ad_tracking ? 'attribution'))[1] snapshot`,
      ),
      [ctx.start, ctx.end],
    )) as CheckoutRow[];
  } catch (e) {
    // Migration 023 (orders.ad_tracking) not applied: the reports keep working without snapshots.
    if ((e as { code?: string }).code !== "42703") throw e;
    return (await query(select(""), [ctx.start, ctx.end])) as CheckoutRow[];
  }
}

export type AttributedCheckout = CheckoutRow & {
  touch: TouchView | null;
  via: "order_utm" | "session" | "none";
};

/**
 * Attributes checkouts. Order of preference, never guessing:
 *   1. the UTM the checkout itself recorded (orders.utm_*, last paid touch),
 *      normalized to the same taxonomy — last-touch model only;
 *   2. the touch of the visitor's most recent session that started at or
 *      before the order (orders.guest_session_id = analytics visitor id);
 *   3. otherwise "unattributed".
 */
export async function attributeCheckouts(
  ctx: Ctx,
  checkouts: CheckoutRow[],
  model: TouchModel,
): Promise<AttributedCheckout[]> {
  const visitorIds = Array.from(
    new Set(checkouts.map((c) => c.visitor_id).filter(Boolean)),
  ) as string[];
  const byVisitor = new Map<string, SessRow[]>();
  if (visitorIds.length > 0) {
    const vHost = ctx.m
      ? "and (host is null or host = any($2::text[]))"
      : "and $2::text[] is not null";
    const attrCols = VISIT_ATTR.filter((c) => c !== "host")
      .map((c) => (ctx.m ? c : `null::text as ${c}`))
      .join(", ");
    const rows = (await query(
      `with dev_s as (
         select distinct session_id from analytics_visits
         where session_id is not null and (${ctx.m ? "(host is not null and not (host = any($2::text[]))) or" : ""} referrer ~* '${DEV_REFERRER}')
       ),
       va as (
         select visitor_id, session_id, path, source, referrer, device, browser, os, created_at, ${attrCols}
         from analytics_visits
         where visitor_id = any($1::text[]) and session_id is not null ${vHost}
           and not exists (select 1 from dev_s d where d.session_id = analytics_visits.session_id)
       )
       select ${SESSION_AGG} from va group by session_id`,
      [visitorIds, ctx.hosts],
    )) as SessRow[];
    for (const r of rows) {
      if (!r.visitor_id) continue;
      const list = byVisitor.get(r.visitor_id) ?? [];
      list.push(r);
      byVisitor.set(r.visitor_id, list);
    }
  }
  return checkouts.map((c) => {
    const at = new Date(c.created_at).getTime();
    const sessions = (c.visitor_id ? byVisitor.get(c.visitor_id) : undefined) ?? [];
    const candidates = sessions
      .filter((s) => new Date(s.started_at).getTime() <= at)
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
    const s = candidates[0];
    // 1. The snapshot frozen at order time (either touch model). Nothing is re-derived.
    const snap = readStoredAttribution(c.snapshot);
    const snapTouch = snap ? (model === "first" ? snap.first : snap.last) : null;
    if (snapTouch) {
      const touch: TouchView = {
        source: normalizeSource(snapTouch.source) ?? "other",
        medium: snapTouch.medium,
        campaign: snapTouch.campaign,
        content: snapTouch.content,
        term: snapTouch.term,
        stamped: true,
      };
      return { ...c, touch, via: "order_utm" as const };
    }
    if (model === "last" && c.utm_source) {
      // The order stores only source / medium / campaign. The ad id (utm_content)
      // comes from the visitor's own session touch, and only when that touch
      // carries the SAME campaign, so an unrelated ad is never attached.
      const sessionTouch = s ? touchOf(s, model) : null;
      const sameCampaign =
        !!sessionTouch && !!c.utm_campaign && sessionTouch.campaign === c.utm_campaign;
      const touch: TouchView = {
        source: normalizeSource(c.utm_source) ?? "other",
        medium: c.utm_medium?.toLowerCase() ?? null,
        campaign: c.utm_campaign,
        content: sameCampaign ? sessionTouch.content : null,
        term: sameCampaign ? sessionTouch.term : null,
        stamped: true,
      };
      return { ...c, touch, via: "order_utm" as const };
    }
    if (!s) return { ...c, touch: null, via: "none" as const };
    return { ...c, touch: touchOf(s, model), via: "session" as const };
  });
}

/* ------------------------------------------------------------------ */
/* Traffic                                                             */
/* ------------------------------------------------------------------ */

function topCounts(values: Array<string | null | undefined>, limit = 15): CountRow[] {
  const m = new Map<string, number>();
  for (const v of values) {
    const k = (v ?? "").trim();
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m, ([key, sessions]) => ({ key, sessions }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, limit);
}

type Acc = {
  source: string;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  visitors: Set<string>;
  sessions: number;
  pageViews: number;
  productViews: number;
  addToCart: number;
  viewCart: number;
  checkout: number;
  orders: number;
  revenue: number;
};

const newAcc = (t: TouchView): Acc => ({
  source: t.source,
  medium: t.medium,
  campaign: t.campaign,
  content: t.content,
  visitors: new Set(),
  sessions: 0,
  pageViews: 0,
  productViews: 0,
  addToCart: 0,
  viewCart: 0,
  checkout: 0,
  orders: 0,
  revenue: 0,
});

/** Sessions + attributed checkouts, grouped by (source, medium, campaign). */
export async function groupedAttribution(ctx: Ctx, model: TouchModel) {
  const [sessions, checkouts] = await Promise.all([loadSessions(ctx), loadCheckouts(ctx)]);
  const attributed = await attributeCheckouts(ctx, checkouts, model);
  const groups = new Map<string, Acc>();
  const keyOf = (t: TouchView) => `${t.source}|${t.medium ?? ""}|${t.campaign ?? ""}`;
  for (const s of sessions) {
    const t = touchOf(s, model);
    const g = groups.get(keyOf(t)) ?? newAcc(t);
    groups.set(keyOf(t), g);
    if (s.visitor_id) g.visitors.add(s.visitor_id);
    g.sessions += 1;
    g.pageViews += N(s.pages);
    g.productViews += N(s.views);
    if (s.carted) g.addToCart += 1;
    if (s.viewed_cart) g.viewCart += 1;
    if (s.checkout) g.checkout += 1;
    if (!g.content && t.content) g.content = t.content;
  }
  for (const c of attributed) {
    const t: TouchView = c.touch ?? {
      source: "unattributed",
      medium: null,
      campaign: null,
      content: null,
      term: null,
      stamped: false,
    };
    const g = groups.get(keyOf(t)) ?? newAcc(t);
    groups.set(keyOf(t), g);
    g.orders += 1;
    g.revenue += N(c.revenue);
  }
  return { sessions, attributed, groups: Array.from(groups.values()) };
}

export async function getTraffic(range: AnalyticsRange, model: TouchModel): Promise<TrafficData> {
  const ctx = await makeCtx(range);
  const [{ sessions, attributed, groups }, metrics] = await Promise.all([
    groupedAttribution(ctx, model),
    periodMetrics(ctx),
  ]);
  const rows: TrafficRow[] = groups
    .map((g) => ({
      source: g.source,
      medium: g.medium,
      campaign: g.campaign,
      visitors: g.visitors.size,
      sessions: g.sessions,
      pageViews: g.pageViews,
      productViews: g.productViews,
      addToCart: g.addToCart,
      viewCart: g.viewCart,
      checkout: g.checkout,
      orders: g.orders,
      revenue: g.revenue,
      conversionRate: ratio(g.orders, g.sessions),
    }))
    .sort((a, b) => b.sessions - a.sessions || b.orders - a.orders);
  const stamped = sessions.filter((s) => touchOf(s, model).stamped).length;
  return {
    period: periodInfo(range),
    model,
    rows,
    newVisitors: metrics.newVisitors,
    returningVisitors: metrics.returningVisitors,
    devices: topCounts(sessions.map((s) => s.device)),
    browsers: topCounts(sessions.map((s) => s.browser)),
    operatingSystems: topCounts(sessions.map((s) => s.os)),
    landingPages: topCounts(sessions.map((s) => s.landing_path)),
    exitPages: topCounts(sessions.map((s) => s.exit_path)),
    attributionQuality: {
      sessions: sessions.length,
      stamped,
      legacy: sessions.length - stamped,
      ordersFromOrderUtm: attributed.filter((c) => c.via === "order_utm").length,
      ordersFromSession: attributed.filter((c) => c.via === "session").length,
      ordersUnattributed: attributed.filter((c) => c.via === "none").length,
      // Older sessions whose first page view came from our own site (a reload or a
      // new tab): their real origin was never recorded, so they show up as "other".
      legacyInternalReferrer: sessions.filter((s) => {
        if (touchOf(s, model).stamped) return false;
        const h = hostOf(s.legacy_referrer);
        return !!h && (h === "brwazwneon.com" || h.endsWith(".brwazwneon.com"));
      }).length,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Funnel                                                              */
/* ------------------------------------------------------------------ */

const PAID_MEDIUM = /paid|cpc|ppc|cpm|display|ads?$|sponsored/i;

export async function getFunnel(range: AnalyticsRange, model: TouchModel): Promise<FunnelData> {
  const ctx = await makeCtx(range);
  const [sessions, notes, checkouts] = await Promise.all([
    loadSessions(ctx),
    trackingStarted(ctx),
    loadCheckouts(ctx),
  ]);
  const sessionCount = sessions.length;
  const viewed = sessions.filter((s) => s.viewed).length;
  const carted = sessions.filter((s) => s.carted).length;
  const viewedCart = sessions.filter((s) => s.viewed_cart).length;
  const checkedOut = sessions.filter((s) => s.checkout).length;
  const purchased = checkouts.length;
  const paidSessions = sessions.filter((s) => {
    const t = touchOf(s, model);
    return t.stamped && !!t.medium && PAID_MEDIUM.test(t.medium);
  }).length;

  // Cart views only exist from the day this tracking shipped; before that the
  // step is unmeasurable (null), and inside the first tracked range it is partial.
  const viewCartFirst = notes.view_cart ? new Date(notes.view_cart) : null;
  const viewCartTracked = !!viewCartFirst && viewCartFirst.getTime() < range.end.getTime();
  const viewCartPartial = viewCartTracked && viewCartFirst!.getTime() > range.start.getTime();
  const raw: Array<{ key: string; label: string; count: number | null; note?: string }> = [
    { key: "sessions", label: "Sessions", count: sessionCount },
    { key: "product_views", label: "Product views", count: viewed },
    { key: "add_to_cart", label: "Add to cart", count: carted },
    {
      key: "view_cart",
      label: "View cart",
      count: viewCartTracked ? viewedCart : null,
      note: !viewCartTracked
        ? "Cart views have not been tracked yet for this period."
        : viewCartPartial
          ? `Tracked from ${viewCartFirst!.toISOString().slice(0, 10)}; earlier days in this range are not included.`
          : undefined,
    },
    { key: "checkout", label: "Checkout started", count: checkedOut },
    {
      key: "purchase",
      label: "Purchase",
      count: purchased,
      note: "Counted from orders (source of truth).",
    },
  ];
  const base = raw[0].count ?? 0;
  let prev: number | null = null;
  const steps: FunnelStep[] = raw.map((s) => {
    const step: FunnelStep = {
      key: s.key,
      label: s.label,
      count: s.count,
      pctOfFirst: s.count !== null ? ratio(s.count, base) : null,
      dropFromPrevious:
        s.count !== null && prev !== null && prev > 0 ? Math.max(0, 1 - s.count / prev) : null,
      note: s.note,
    };
    if (s.count !== null) prev = s.count;
    return step;
  });
  return {
    period: periodInfo(range),
    steps,
    paidSessions,
    limitations: [
      "Ad clicks are not connected: the ad platforms' click counts need their Marketing APIs. Paid sessions above are sessions whose UTM medium marks them as paid.",
      "Steps count sessions, except Purchase which counts checkouts from orders; a purchase can complete in a later session than the cart add.",
      "add_shipping_info / add_payment_info are not shown: checkout is a single form, so there is no separate step to measure.",
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Campaigns                                                           */
/* ------------------------------------------------------------------ */

export async function getCampaigns(
  range: AnalyticsRange,
  model: TouchModel,
): Promise<CampaignsData> {
  const ctx = await makeCtx(range);
  const { groups } = await groupedAttribution(ctx, model);
  // Roll the (source, medium, campaign) groups up to campaign + source + medium.
  const rows: CampaignRow[] = groups
    .filter((g) => g.campaign || g.medium)
    .map((g) => ({
      campaign: g.campaign ?? "(no campaign)",
      source: g.source,
      medium: g.medium,
      content: g.content,
      sessions: g.sessions,
      visitors: g.visitors.size,
      productViews: g.productViews,
      addToCart: g.addToCart,
      checkout: g.checkout,
      orders: g.orders,
      revenue: g.revenue,
    }))
    .sort((a, b) => b.sessions - a.sessions);
  return {
    period: periodInfo(range),
    model,
    rows,
    limitations: [
      "Only campaigns carried in UTM parameters are attributed. Ad set and ad level are not captured, so they cannot be shown; utm_content is listed when the ad links include it.",
      "Impressions, spend and platform-reported clicks need the Meta/TikTok/Google Ads APIs (see Advertising).",
      "Visits recorded before attribution capture shipped have no campaign — they appear under Traffic with their legacy source only.",
    ],
  };
}
