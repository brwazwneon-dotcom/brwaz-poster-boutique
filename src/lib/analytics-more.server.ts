import {
  N,
  baseCtes,
  cairoDay,
  groupedAttribution,
  makeCtx,
  periodInfo,
  periodMetrics,
  query,
  run,
  trackingStarted,
  type Ctx,
} from "@/lib/analytics-core.server";
import type { AnalyticsRange } from "@/lib/store-time";
import { readMarketingConfig } from "@/lib/meta-marketing.server";
import type {
  AdvertisingData,
  CartData,
  ClickRow,
  ClicksData,
  ConnectionStatus,
  CustomDesignData,
  CustomDesignStep,
  LabelCount,
  ProductRow,
  ProductSortKey,
  ProductsData,
} from "@/lib/analytics-center.types";

const CHECKOUT_KEY = "coalesce(customer_id::text, phone) || '|' || created_at::text";
const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

/** Same parameters as run() ($1 start, $2 end, $3 hosts) plus extras from $4. */
async function runX<T = Record<string, unknown>>(
  ctx: Ctx,
  body: string,
  extra: unknown[],
): Promise<T[]> {
  return query<T>(`with ${baseCtes(ctx.m)} ${body}`, [ctx.start, ctx.end, ctx.hosts, ...extra]);
}

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

const SORT_SQL: Record<ProductSortKey, string> = {
  views: "views",
  unique_views: "unique_views",
  clicks: "clicks",
  cart_adds: "cart_adds",
  wishlists: "wishlists",
  purchases: "purchases",
  revenue: "revenue",
  conversion: "conversion",
  title: "lower(title)",
};

type ProductSqlRow = {
  id: string;
  title: string;
  slug: string | null;
  image_url: string | null;
  category: string | null;
  views: number;
  unique_views: number;
  clicks: number;
  cart_adds: number;
  wishlists: number;
  purchases: number;
  revenue: string;
  conversion: string | null;
  total: number;
};

async function queryProducts(
  ctx: Ctx,
  opts: { sort: ProductSortKey; dir: "asc" | "desc"; page: number; pageSize: number; q: string },
): Promise<{ rows: ProductRow[]; total: number }> {
  const sort = SORT_SQL[opts.sort] ?? SORT_SQL.views;
  const dir = opts.dir === "asc" ? "asc" : "desc";
  const rows = await runX<ProductSqlRow>(
    ctx,
    `, ev as (
        select poster_id,
               count(*) filter (where event_type = 'view')::int views,
               count(*) filter (where event_type = 'unique_view')::int unique_views,
               count(*) filter (where event_type = 'select_item')::int clicks,
               count(*) filter (where event_type = 'cart_add')::int cart_adds,
               count(*) filter (where event_type = 'wishlist_add')::int wishlists
        from e where poster_id is not null group by poster_id),
      ord as (
        select selected_poster poster_id, coalesce(sum(quantity),0)::int purchases,
               coalesce(sum(subtotal),0)::numeric revenue
        from orders
        where is_test = false and status not in ('cancelled','returned') and selected_poster is not null
          and created_at >= $1::timestamptz and created_at < $2::timestamptz
        group by 1),
      r as (
        select p.id, p.title, p.slug, p.image_url, c.name category,
               coalesce(ev.views,0) views, coalesce(ev.unique_views,0) unique_views,
               coalesce(ev.clicks,0) clicks, coalesce(ev.cart_adds,0) cart_adds,
               coalesce(ev.wishlists,0) wishlists,
               coalesce(ord.purchases,0) purchases, coalesce(ord.revenue,0) revenue,
               case when coalesce(ev.views,0) > 0 then coalesce(ord.purchases,0)::numeric / ev.views end conversion
        from posters p
        left join ev on ev.poster_id = p.id
        left join ord on ord.poster_id = p.id
        left join categories c on c.id = p.category_id
        where (ev.poster_id is not null or ord.poster_id is not null)
          and ($4::text = '' or p.title ilike '%' || $4::text || '%'))
     select r.*, count(*) over ()::int total from r
     order by ${sort} ${dir} nulls last, lower(title)
     limit $5::int offset $6::int`,
    [opts.q, opts.pageSize, (opts.page - 1) * opts.pageSize],
  );
  return {
    total: N(rows[0]?.total),
    rows: rows.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      imageUrl: r.image_url,
      category: r.category,
      views: N(r.views),
      uniqueViews: N(r.unique_views),
      clicks: N(r.clicks),
      cartAdds: N(r.cart_adds),
      wishlists: N(r.wishlists),
      purchases: N(r.purchases),
      revenue: N(r.revenue),
      conversionRate: r.conversion === null ? null : N(r.conversion),
    })),
  };
}

export async function getProducts(
  range: AnalyticsRange,
  opts: {
    sort?: ProductSortKey;
    dir?: "asc" | "desc";
    page?: number;
    pageSize?: number;
    q?: string;
  },
): Promise<ProductsData> {
  const ctx = await makeCtx(range);
  const sort = opts.sort && opts.sort in SORT_SQL ? opts.sort : "views";
  const dir = opts.dir === "asc" ? "asc" : "desc";
  const pageSize = Math.min(100, Math.max(5, Math.round(opts.pageSize ?? 25)));
  const page = Math.max(1, Math.round(opts.page ?? 1));
  const q = (opts.q ?? "").trim().slice(0, 80);
  const topOf = (s: ProductSortKey) =>
    queryProducts(ctx, { sort: s, dir: "desc", page: 1, pageSize: 5, q: "" }).then((r) =>
      r.rows.filter(
        (row) =>
          (s === "views"
            ? row.views
            : s === "clicks"
              ? row.clicks
              : s === "cart_adds"
                ? row.cartAdds
                : row.purchases) > 0,
      ),
    );
  const [main, views, clicks, cartAdds, purchases, started] = await Promise.all([
    queryProducts(ctx, { sort, dir, page, pageSize, q }),
    topOf("views"),
    topOf("clicks"),
    topOf("cart_adds"),
    topOf("purchases"),
    trackingStarted(ctx),
  ]);
  return {
    period: periodInfo(range),
    rows: main.rows,
    total: main.total,
    page,
    pageSize,
    sort,
    dir,
    clicksTracked: Boolean(started.select_item),
    top: { views, clicks, cartAdds, purchases },
    limitations: [
      "Clicks are product taps in the category grids (tracked from the day the select_item event shipped).",
      "Checkout is recorded per session, not per product, so a per-product checkout count is not available.",
      "Purchases and revenue come from orders with a single poster (cancelled/returned excluded, revenue = item subtotal). Bundle and set orders are stored as one line, so they are not attributed to individual posters.",
      "Conversion rate = purchases ÷ product views.",
    ],
  };
}

/** Every product with activity in the period (for CSV/XLSX export). */
export async function exportProductRows(range: AnalyticsRange): Promise<ProductRow[]> {
  const ctx = await makeCtx(range);
  return (await queryProducts(ctx, { sort: "views", dir: "desc", page: 1, pageSize: 5000, q: "" }))
    .rows;
}

/* ------------------------------------------------------------------ */
/* Clicks                                                              */
/* ------------------------------------------------------------------ */

const CLICK_LABELS: Array<{ key: string; label: string }> = [
  { key: "select_item", label: "Product clicks" },
  { key: "select_category", label: "Category clicks" },
  { key: "select_subcategory", label: "Subcategory clicks" },
  { key: "select_banner", label: "Banner clicks" },
  { key: "select_offer", label: "Offer clicks" },
  { key: "whatsapp_click", label: "WhatsApp clicks" },
  { key: "cart_add", label: "Add to cart" },
];

export async function getClicks(range: AnalyticsRange): Promise<ClicksData> {
  const ctx = await makeCtx(range);
  const keys = CLICK_LABELS.map((c) => c.key);
  const [counts, first, searchTotals, topSearches, zeroSearches, banners, offers, cats] =
    await Promise.all([
      runX<{ event_type: string; events: number; sessions: number }>(
        ctx,
        `select event_type, count(*)::int events, count(distinct session_id)::int sessions
         from e where event_type = any($4::text[]) group by 1`,
        [keys],
      ),
      trackingStarted(ctx),
      runX<{ total: number; zero: number }>(
        ctx,
        `select count(*)::int total, count(*) filter (where results_count = 0)::int zero
         from search_queries sq
         where sq.created_at >= $1::timestamptz and sq.created_at < $2::timestamptz and $3::text[] is not null
           and (sq.visitor_id is null or not exists (select 1 from dev_visitors d where d.visitor_id = sq.visitor_id))`,
        [],
      ),
      runX<{ label: string; n: number }>(
        ctx,
        `select lower(query) label, count(*)::int n from search_queries sq
         where sq.created_at >= $1::timestamptz and sq.created_at < $2::timestamptz and $3::text[] is not null
           and (sq.visitor_id is null or not exists (select 1 from dev_visitors d where d.visitor_id = sq.visitor_id))
         group by 1 order by 2 desc limit 10`,
        [],
      ),
      runX<{ label: string; n: number }>(
        ctx,
        `select lower(query) label, count(*)::int n from search_queries sq
         where sq.created_at >= $1::timestamptz and sq.created_at < $2::timestamptz and $3::text[] is not null
           and sq.results_count = 0
           and (sq.visitor_id is null or not exists (select 1 from dev_visitors d where d.visitor_id = sq.visitor_id))
         group by 1 order by 2 desc limit 10`,
        [],
      ),
      runX<LabelCount>(
        ctx,
        `select coalesce(props->>'label', props->>'banner_id', '(unlabelled)') label, count(*)::int n
         from e where event_type = 'select_banner' group by 1 order by 2 desc limit 10`,
        [],
      ),
      runX<LabelCount>(
        ctx,
        `select coalesce(props->>'label', props->>'offer_id', '(unlabelled)') label, count(*)::int n
         from e where event_type = 'select_offer' group by 1 order by 2 desc limit 10`,
        [],
      ),
      runX<LabelCount>(
        ctx,
        `select coalesce(props->>'category', props->>'subcategory', '(unknown)') label, count(*)::int n
         from e where event_type in ('select_category','select_subcategory') group by 1 order by 2 desc limit 10`,
        [],
      ),
    ]);
  const cartFirst = (await query(
    `select min(created_at) first from analytics_poster_events where event_type = 'cart_add'`,
    [],
  )) as Array<{ first: Date | string | null }>;
  const firstSeen = (k: string): string | null => {
    if (k === "cart_add")
      return cartFirst[0]?.first ? new Date(cartFirst[0].first).toISOString() : null;
    return first[k] ?? null;
  };
  const rows: ClickRow[] = CLICK_LABELS.map(({ key, label }) => {
    const c = counts.find((r) => r.event_type === key);
    return {
      key,
      label,
      events: N(c?.events),
      sessions: N(c?.sessions),
      firstSeen: firstSeen(key),
    };
  });
  const clickRows = rows.filter((r) => r.key !== "cart_add");
  const totalClicks = clickRows.some((r) => r.firstSeen)
    ? clickRows.reduce((s, r) => s + r.events, 0)
    : null;
  return {
    period: periodInfo(range),
    totalClicks,
    rows,
    searches: { total: N(searchTotals[0]?.total), zeroResult: N(searchTotals[0]?.zero) },
    topSearches: topSearches.map((r) => ({ label: r.label, n: N(r.n) })),
    zeroResultSearches: zeroSearches.map((r) => ({ label: r.label, n: N(r.n) })),
    topBanners: banners.map((r) => ({ label: r.label, n: N(r.n) })),
    topOffers: offers.map((r) => ({ label: r.label, n: N(r.n) })),
    topCategories: cats.map((r) => ({ label: r.label, n: N(r.n) })),
    limitations: [
      "Click events are recorded from the day each was added ('Tracked since' below); earlier periods show no data, not zero clicks.",
      "Click-through rate is not shown: the site does not record impressions per banner/product, so there is no honest denominator.",
      "CTA clicks are not tracked separately — the meaningful call-to-action clicks (WhatsApp, add to cart) are listed individually.",
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Cart                                                                */
/* ------------------------------------------------------------------ */

const ORDER_TYPE_LABEL: Record<string, string> = {
  regular: "Regular posters",
  bundle_or_offer: "Bundles / offers",
  custom_design: "Custom design",
  tape: "Double-face tape (add-on line)",
};

export async function getCart(range: AnalyticsRange): Promise<CartData> {
  const ctx = await makeCtx(range);
  const [m, avg, abandoned, sizes, types] = await Promise.all([
    periodMetrics(ctx),
    runX<{ avg: string | null; n: number }>(
      ctx,
      `select avg(v)::numeric avg, count(*)::int n from (
         select (array_agg(value order by created_at desc))[1] v from e
         where event_type = 'view_cart' and value is not null group by session_id) x
       where v is not null`,
      [],
    ),
    runX<{ id: string; title: string; image_url: string | null; adds: number }>(
      ctx,
      `select p.id, p.title, p.image_url, count(*)::int adds
       from e join posters p on p.id = e.poster_id
       where e.event_type = 'cart_add'
         and not exists (
           select 1 from orders o
           where o.is_test = false and o.guest_session_id = e.visitor_id
             and o.created_at >= e.created_at and o.created_at < e.created_at + interval '7 days')
       group by p.id, p.title, p.image_url order by adds desc limit 10`,
      [],
    ),
    query<{ label: string; checkouts: number }>(
      `select case when qty >= 6 then '6+' else qty::text end label, count(*)::int checkouts
       from (select ${CHECKOUT_KEY} k, sum(quantity)::int qty from orders
             where is_test = false and created_at >= $1::timestamptz and created_at < $2::timestamptz
               and coalesce(poster_title,'') <> 'Double Face Tape' group by 1) x
       group by 1 order by min(qty)`,
      [ctx.start, ctx.end],
    ),
    query<{ t: string; checkouts: number; revenue: string }>(
      `select case when notes like '{"originalFilename"%' then 'custom_design'
                   when poster_title = 'Double Face Tape' then 'tape'
                   when selected_poster is null then 'bundle_or_offer'
                   else 'regular' end t,
              count(distinct ${CHECKOUT_KEY})::int checkouts, coalesce(sum(subtotal),0)::numeric revenue
       from orders where is_test = false and created_at >= $1::timestamptz and created_at < $2::timestamptz
       group by 1 order by 2 desc`,
      [ctx.start, ctx.end],
    ),
  ]);
  return {
    period: periodInfo(range),
    cartSessions: m.addToCartSessions,
    itemsAdded: m.addToCartItems,
    viewCartSessions: m.viewCartSessions,
    checkoutStarts: m.checkoutStarts,
    orders: m.orders,
    cartAbandonment:
      m.addToCartSessions > 0 ? Math.max(0, 1 - m.orders / m.addToCartSessions) : null,
    checkoutAbandonment: m.checkoutStarts > 0 ? Math.max(0, 1 - m.orders / m.checkoutStarts) : null,
    averageCartValue: avg[0]?.avg == null ? null : N(avg[0].avg),
    averageCartValueSamples: N(avg[0]?.n),
    abandonedProducts: abandoned.map((r) => ({
      id: r.id,
      title: r.title,
      imageUrl: r.image_url,
      adds: N(r.adds),
    })),
    cartSizes: sizes.map((r) => ({ label: r.label, checkouts: N(r.checkouts) })),
    orderTypes: types.map((r) => ({
      type: r.t,
      label: ORDER_TYPE_LABEL[r.t] ?? r.t,
      checkouts: N(r.checkouts),
      revenue: N(r.revenue),
    })),
    notes: [
      "Cart abandonment = 1 − checkouts placed ÷ sessions that added to cart. Checkout abandonment = 1 − checkouts placed ÷ checkout starts. Both use the selected period only, so a cart added late in the period can complete after it.",
      "Average cart value needs the cart-view event, which is only recorded from the day it shipped.",
      "Abandoned products = cart adds with no order from the same visitor in the following 7 days.",
      "Photo-printing orders are stored separately and are not part of this cart analysis.",
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Custom design                                                       */
/* ------------------------------------------------------------------ */

const CUSTOM_NOTES = `notes like '{"originalFilename"%'`;

export async function getCustomDesign(range: AnalyticsRange): Promise<CustomDesignData> {
  const ctx = await makeCtx(range);
  const [pageVisits, events, checkoutSessions, purchases, allTime, started] = await Promise.all([
    run<{ n: number }>(
      ctx,
      `select count(distinct session_id)::int n from v where path like '/custom-design%'`,
    ),
    run<{ event_type: string; s: number }>(
      ctx,
      `select event_type, count(distinct session_id)::int s from e
       where event_type in ('custom_design_start','custom_design_upload','custom_design_completed','custom_design_add_to_cart')
       group by 1`,
    ),
    run<{ n: number }>(
      ctx,
      `select count(distinct a.session_id)::int n from e a
       join e c on c.session_id = a.session_id and c.event_type = 'checkout_start'
       where a.event_type = 'custom_design_add_to_cart'`,
    ),
    query<{ checkouts: number; items: number; revenue: string }>(
      `select count(distinct k)::int checkouts, coalesce(sum(quantity),0)::int items, coalesce(sum(subtotal),0)::numeric revenue
       from (select ${CHECKOUT_KEY} k, quantity, subtotal from orders
             where is_test = false and ${CUSTOM_NOTES}
               and created_at >= $1::timestamptz and created_at < $2::timestamptz) x`,
      [ctx.start, ctx.end],
    ),
    query<{ checkouts: number; revenue: string }>(
      `select count(distinct k)::int checkouts, coalesce(sum(subtotal),0)::numeric revenue
       from (select ${CHECKOUT_KEY} k, subtotal from orders where is_test = false and ${CUSTOM_NOTES}) x`,
      [],
    ),
    trackingStarted(ctx),
  ]);
  const step = (key: string, label: string, count: number): CustomDesignStep => {
    const f = started[key] ? new Date(started[key]!) : null;
    if (!f || f.getTime() >= range.end.getTime()) {
      return { key, label, count: null, note: "Not tracked yet for this period." };
    }
    return {
      key,
      label,
      count,
      note:
        f.getTime() > range.start.getTime()
          ? `Tracked from ${f.toISOString().slice(0, 10)}; earlier days are not included.`
          : undefined,
    };
  };
  const s = (k: string) => N(events.find((r) => r.event_type === k)?.s);
  const addTracked = started.custom_design_add_to_cart !== null;
  return {
    period: periodInfo(range),
    steps: [
      { key: "page", label: "Visited Custom Design page", count: N(pageVisits[0]?.n) },
      step("custom_design_start", "Started (chose an image)", s("custom_design_start")),
      // Images are uploaded when the customer confirms, so completion comes first.
      step(
        "custom_design_completed",
        "Customisation completed (confirmed)",
        s("custom_design_completed"),
      ),
      step("custom_design_upload", "Images uploaded", s("custom_design_upload")),
      step("custom_design_add_to_cart", "Added to cart", s("custom_design_add_to_cart")),
      addTracked
        ? {
            key: "checkout",
            label: "Checkout started (same session)",
            count: N(checkoutSessions[0]?.n),
          }
        : {
            key: "checkout",
            label: "Checkout started (same session)",
            count: null,
            note: "Needs the add-to-cart event.",
          },
      {
        key: "purchase",
        label: "Purchased",
        count: N(purchases[0]?.checkouts),
        note: "Counted from orders.",
      },
    ],
    purchases: {
      checkouts: N(purchases[0]?.checkouts),
      items: N(purchases[0]?.items),
      revenue: N(purchases[0]?.revenue),
    },
    allTime: { checkouts: N(allTime[0]?.checkouts), revenue: N(allTime[0]?.revenue) },
    notes: [
      "The uploaded image itself is never stored in analytics — only counts, size/frame choices and timing.",
      "Purchases are checkouts containing a custom-design line (identified by its stored upload metadata).",
      "The page-visit and purchase steps have full history; the interaction steps exist only from the day tracking shipped.",
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Advertising                                                         */
/* ------------------------------------------------------------------ */

const PAID_MEDIUM = /paid|cpc|ppc|cpm|display|ads?$|sponsored/i;
const PLATFORM_OF: Record<string, "meta" | "tiktok" | "google" | undefined> = {
  instagram: "meta",
  facebook: "meta",
  tiktok: "tiktok",
  google: "google",
};

const asBool = (v: unknown) => v === true || v === "true";
const asStr = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Whether Meta Ads spend/insights are being synced (Marketing API), for the Advertising card. */
async function metaAdsConnection(): Promise<{ status: ConnectionStatus; needs: string }> {
  const cfg = readMarketingConfig();
  if (!cfg.configured) {
    const what = [...cfg.missing, ...cfg.invalid.map((n) => `${n} (invalid)`)].join(", ");
    return {
      status: "not_connected",
      needs: `Set ${what} on the server (the token needs the ads_read permission on the ad account), apply migration 025, then use Meta Ads → Sync now.`,
    };
  }
  try {
    const rows = await query<{ f: Date | string | null }>(
      `select max(finished_at) f from meta_sync_runs where status = 'success'`,
      [],
    );
    return rows[0]?.f
      ? {
          status: "connected",
          needs: "Synced from the Meta Marketing API — see the Meta Ads section.",
        }
      : {
          status: "partial",
          needs: "Credentials are set; run Meta Ads → Sync now to load spend and insights.",
        };
  } catch {
    return {
      status: "partial",
      needs:
        "Credentials are set; apply migration 025_meta_ads_reporting.sql, then run Meta Ads → Sync now.",
    };
  }
}

export async function getAdvertising(range: AnalyticsRange): Promise<AdvertisingData> {
  const ctx = await makeCtx(range);
  const startDay = cairoDay(range.start);
  const endDay = cairoDay(new Date(range.end.getTime() - 1));
  const [settings, attribution, expenses, metaConn] = await Promise.all([
    query<{ key: string; value: unknown }>(
      `select key, value from site_settings
       where key in ('meta_pixel_id','meta_pixel_enabled','meta_capi_enabled','ga4_measurement_id','ga4_enabled')`,
      [],
    ),
    groupedAttribution(ctx, "last"),
    query<{ total: string; n: number }>(
      `select coalesce(sum(amount),0)::numeric total, count(*)::int n from expenses
       where category = 'ads' and expense_date >= $1::date and expense_date <= $2::date`,
      [startDay, endDay],
    ),
    metaAdsConnection(),
  ]);
  const setting = (k: string) => settings.find((s) => s.key === k)?.value;
  const pixelId = asStr(setting("meta_pixel_id"));
  const pixelOn = asBool(setting("meta_pixel_enabled")) && /^\d{6,20}$/.test(pixelId);
  const capiOn = asBool(setting("meta_capi_enabled"));
  const capiToken = !!process.env.META_PIXEL_ACCESS_TOKEN;
  const ga4Id = asStr(setting("ga4_measurement_id"));
  const ga4On = asBool(setting("ga4_enabled")) && /^G-[A-Z0-9]{6,}$/.test(ga4Id);

  const paid: Record<
    "meta" | "tiktok" | "google",
    { sessions: number; orders: number; revenue: number }
  > = {
    meta: { sessions: 0, orders: 0, revenue: 0 },
    tiktok: { sessions: 0, orders: 0, revenue: 0 },
    google: { sessions: 0, orders: 0, revenue: 0 },
  };
  for (const g of attribution.groups) {
    const platform = PLATFORM_OF[g.source];
    if (!platform || !g.medium || !PAID_MEDIUM.test(g.medium)) continue;
    paid[platform].sessions += g.sessions;
    paid[platform].orders += g.orders;
    paid[platform].revenue += g.revenue;
  }

  const status = (ok: boolean, partial = false): ConnectionStatus =>
    ok ? "connected" : partial ? "partial" : "not_connected";
  const spend = N(expenses[0]?.total);
  const paidRevenue = paid.meta.revenue + paid.tiktok.revenue + paid.google.revenue;
  return {
    period: periodInfo(range),
    platforms: [
      {
        key: "meta",
        label: "Meta (Facebook / Instagram)",
        apiStatus: metaConn.status,
        apiNeeds: metaConn.needs,
        tracking: [
          {
            label: "Meta Pixel",
            status: status(pixelOn),
            detail: pixelOn ? `Enabled (ID ${pixelId})` : "Not enabled in Settings",
          },
          {
            label: "Conversions API",
            status: status(capiOn && capiToken, capiOn || capiToken),
            detail: !capiOn
              ? "Turned off in Settings"
              : capiToken
                ? "Enabled with an access token"
                : "Enabled in Settings but META_PIXEL_ACCESS_TOKEN is not set on the server — NOT CONNECTED",
          },
        ],
        paidSessions: paid.meta.sessions,
        orders: paid.meta.orders,
        revenue: paid.meta.revenue,
      },
      {
        key: "tiktok",
        label: "TikTok",
        apiStatus: "not_connected",
        apiNeeds:
          "TikTok Marketing API access token and advertiser id — needed for spend, impressions, clicks and conversions.",
        tracking: [
          {
            label: "TikTok Pixel",
            status: "connected",
            detail: "Installed site-wide (pixel ID is set in the site code)",
          },
        ],
        paidSessions: paid.tiktok.sessions,
        orders: paid.tiktok.orders,
        revenue: paid.tiktok.revenue,
      },
      {
        key: "google",
        label: "Google",
        apiStatus: "not_connected",
        apiNeeds:
          "Google Ads API developer token + OAuth (and the GA4 Data API for GA4 reporting).",
        tracking: [
          {
            label: "Google Analytics 4",
            status: status(ga4On),
            detail: ga4On
              ? `Enabled (${ga4Id})`
              : "Not configured — add a GA4 Measurement ID in Settings",
          },
        ],
        paidSessions: paid.google.sessions,
        orders: paid.google.orders,
        revenue: paid.google.revenue,
      },
    ],
    manualExpenses: {
      total: spend,
      entries: N(expenses[0]?.n),
      note: "Manually logged in Finance (category “ads”). This is NOT ad-platform spend and cannot be split by platform or campaign.",
    },
    blended:
      spend > 0
        ? {
            spend,
            revenue: paidRevenue,
            roas: paidRevenue > 0 ? paidRevenue / spend : null,
            note: "Blended: revenue from UTM-tagged paid traffic ÷ manually logged ad expenses (all platforms). Not a platform-reported ROAS.",
          }
        : null,
  };
}
