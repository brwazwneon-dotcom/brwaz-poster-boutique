import { generateTextPriority } from "@/lib/gemini.server";
import { resolveAnalyticsRange, storeOffsetMs, type AnalyticsRange } from "@/lib/store-time";
import {
  N,
  attributeCheckouts,
  cairoDay,
  getCampaigns,
  getFunnel,
  getOverview,
  getTraffic,
  loadCheckouts,
  makeCtx,
} from "@/lib/analytics-core.server";
import {
  getAdvertising,
  getCart,
  getProducts,
  exportProductRows,
} from "@/lib/analytics-more.server";
import type {
  ExportDataset,
  ExportResult,
  Metrics,
  ReportData,
  ReportNarrative,
  ReportPeriodKind,
  TouchModel,
} from "@/lib/analytics-center.types";

/* ------------------------------------------------------------------ */
/* Report period                                                       */
/* ------------------------------------------------------------------ */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * daily   = the chosen day; weekly = the 7 days ending on it; monthly = the
 * calendar month containing it. The chosen day defaults to yesterday (the last
 * complete Cairo day), so a scheduled/default report never contains a
 * half-finished day.
 */
export function resolveReportRange(
  kind: ReportPeriodKind,
  date?: string,
  now = new Date(),
): AnalyticsRange {
  const local = new Date(now.getTime() + storeOffsetMs(now));
  const yesterday = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - 1),
  );
  const anchor = date && ISO_DAY.test(date) ? new Date(`${date}T00:00:00Z`) : yesterday;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth();
  if (kind === "daily")
    return resolveAnalyticsRange("custom", { from: iso(anchor), to: iso(anchor) }, now);
  if (kind === "weekly") {
    const from = new Date(anchor.getTime() - 6 * 86_400_000);
    return resolveAnalyticsRange("custom", { from: iso(from), to: iso(anchor) }, now);
  }
  return resolveAnalyticsRange(
    "custom",
    { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0))) },
    now,
  );
}

/* ------------------------------------------------------------------ */
/* Deterministic report                                                */
/* ------------------------------------------------------------------ */

const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtEgp = (n: number) => `${fmtInt(n)} EGP`;
const fmtPct = (r: number | null) => (r === null ? "n/a" : `${(r * 100).toFixed(1)}%`);
const change = (cur: number, prev: number): string => {
  if (prev === 0) return cur === 0 ? "no change (both 0)" : "new (previous period: 0)";
  const p = ((cur - prev) / prev) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}% vs previous (${fmtInt(prev)})`;
};
const daySpan = (r: AnalyticsRange) => {
  const a = cairoDay(r.start);
  const b = cairoDay(new Date(r.end.getTime() - 1));
  return a === b ? a : `${a} → ${b}`;
};

function observations(
  o: { current: Metrics; previous: Metrics },
  funnelSteps: Array<{ label: string; count: number | null }>,
  topSource: { source: string; sessions: number } | null,
  topProduct: { title: string; views: number } | null,
  quality: { sessions: number; stamped: number },
): string[] {
  const out: string[] = [];
  const c = o.current;
  out.push(
    c.orders === 0
      ? "No orders were placed in this period."
      : `${fmtInt(c.orders)} order(s) totalling ${fmtEgp(c.revenue)} (average order value ${c.aov === null ? "n/a" : fmtEgp(c.aov)}).`,
  );
  const measured = funnelSteps.filter(
    (s): s is { label: string; count: number } => s.count !== null,
  );
  let worst: { from: string; to: string; drop: number } | null = null;
  for (let i = 1; i < measured.length; i++) {
    const prev = measured[i - 1];
    if (prev.count <= 0) continue;
    const drop = 1 - measured[i].count / prev.count;
    if (!worst || drop > worst.drop) worst = { from: prev.label, to: measured[i].label, drop };
  }
  if (worst) {
    out.push(
      `Largest funnel drop-off: ${worst.from} → ${worst.to} (${(Math.max(0, worst.drop) * 100).toFixed(1)}% of sessions did not continue).`,
    );
  }
  if (topSource)
    out.push(
      `Most sessions came from ${topSource.source} (${fmtInt(topSource.sessions)} sessions).`,
    );
  if (topProduct && topProduct.views > 0) {
    out.push(`Most viewed product: ${topProduct.title} (${fmtInt(topProduct.views)} views).`);
  }
  if (quality.sessions > 0) {
    const pct = (quality.stamped / quality.sessions) * 100;
    out.push(
      pct >= 99.5
        ? "All sessions carry first-party attribution."
        : `${pct.toFixed(0)}% of sessions carry first-party attribution; the rest use the older per-visit source guess.`,
    );
  }
  return out;
}

function hypotheses(o: { current: Metrics; previous: Metrics }): string[] {
  const out: string[] = [];
  const { current: c, previous: p } = o;
  if (p.visitors > 0 && c.visitors < p.visitors * 0.8) {
    out.push(
      "Visitors fell by more than 20%. Possible factors to investigate: changes in ad spend or schedule, posting frequency, or tracking coverage. This is a hypothesis, not a measured cause.",
    );
  }
  if (
    p.conversionRate !== null &&
    c.conversionRate !== null &&
    c.conversionRate < p.conversionRate * 0.8
  ) {
    out.push(
      "Conversion rate fell by more than 20%. Possible factors to investigate: product mix, pricing/offers, shipping cost visibility, checkout friction or payment flow. This is a hypothesis, not a measured cause.",
    );
  }
  return out;
}

function renderText(r: Omit<ReportData, "text">): string {
  const o = r.overview;
  const c = o.current;
  const p = o.previous;
  const lines: string[] = [];
  const kind = r.kind.toUpperCase();
  lines.push("BRWAZWNEON MARKETING REPORT");
  lines.push(
    `${kind} — Period: ${daySpan({ start: new Date(r.period.start), end: new Date(r.period.end) } as AnalyticsRange)} (Cairo time)`,
  );
  lines.push(
    `Compared with: ${daySpan({ start: new Date(r.period.prevStart), end: new Date(r.period.prevEnd) } as AnalyticsRange)}`,
  );
  lines.push("");
  lines.push("TRAFFIC");
  lines.push(`- Visitors: ${fmtInt(c.visitors)} — ${change(c.visitors, p.visitors)}`);
  lines.push(`- Sessions: ${fmtInt(c.sessions)} — ${change(c.sessions, p.sessions)}`);
  lines.push(`- Page views: ${fmtInt(c.pageViews)} — ${change(c.pageViews, p.pageViews)}`);
  lines.push(
    `- New / returning visitors: ${fmtInt(c.newVisitors)} / ${fmtInt(c.returningVisitors)}`,
  );
  const srcRows = r.traffic.rows.reduce<Record<string, number>>(
    (m, row) => ({ ...m, [row.source]: (m[row.source] ?? 0) + row.sessions }),
    {},
  );
  const srcList = Object.entries(srcRows).sort((a, b) => b[1] - a[1]);
  lines.push(
    `- Sessions by source (${r.traffic.model} touch): ${srcList.length ? srcList.map(([s, n]) => `${s} ${fmtInt(n)}`).join(", ") : "no data"}`,
  );
  lines.push("");
  lines.push("ENGAGEMENT");
  lines.push(
    `- Product views: ${fmtInt(c.productViews)} — ${change(c.productViews, p.productViews)}`,
  );
  lines.push(
    c.clicks === null
      ? "- Clicks (product/category/banner/offer/WhatsApp): not recorded in this period"
      : `- Clicks (product/category/banner/offer/WhatsApp): ${fmtInt(c.clicks)} — ${change(c.clicks, p.clicks ?? 0)}`,
  );
  lines.push(
    `- Sessions with add to cart: ${fmtInt(c.addToCartSessions)} — ${change(c.addToCartSessions, p.addToCartSessions)}`,
  );
  lines.push("");
  lines.push("COMMERCE");
  lines.push(`- Orders: ${fmtInt(c.orders)} — ${change(c.orders, p.orders)}`);
  lines.push(`- Revenue: ${fmtEgp(c.revenue)} — ${change(c.revenue, p.revenue)}`);
  lines.push(`- Revenue excluding cancelled/returned: ${fmtEgp(c.revenueNet)}`);
  lines.push(
    `- Conversion rate (orders ÷ visitors): ${fmtPct(c.conversionRate)} (previous ${fmtPct(p.conversionRate)})`,
  );
  lines.push(
    `- Average order value: ${c.aov === null ? "n/a" : fmtEgp(c.aov)} (previous ${p.aov === null ? "n/a" : fmtEgp(p.aov)})`,
  );
  lines.push("");
  lines.push("FUNNEL (sessions)");
  for (const s of r.funnel.steps) {
    lines.push(
      `- ${s.label}: ${s.count === null ? "not measurable" : fmtInt(s.count)}${
        s.dropFromPrevious !== null ? ` (drop-off ${(s.dropFromPrevious * 100).toFixed(1)}%)` : ""
      }`,
    );
  }
  lines.push("");
  lines.push("PRODUCTS (by views)");
  if (r.products.rows.length === 0) lines.push("- No product activity recorded.");
  for (const row of r.products.rows.slice(0, 5)) {
    lines.push(
      `- ${row.title}: ${fmtInt(row.views)} views, ${fmtInt(row.cartAdds)} add to cart, ${fmtInt(row.purchases)} purchased`,
    );
  }
  lines.push("");
  lines.push("CAMPAIGNS (UTM)");
  if (r.campaigns.rows.length === 0) lines.push("- No UTM-tagged campaign traffic in this period.");
  for (const row of r.campaigns.rows.slice(0, 5)) {
    lines.push(
      `- ${row.campaign} (${row.source}${row.medium ? ` / ${row.medium}` : ""}): ${fmtInt(row.sessions)} sessions, ${fmtInt(row.orders)} orders, ${fmtEgp(row.revenue)}`,
    );
  }
  lines.push("");
  lines.push("ADVERTISING");
  const ad = r.advertising;
  lines.push(
    "- Platform spend, impressions, reach, CPC, CPM: NOT CONNECTED (needs ad-platform APIs).",
  );
  lines.push(
    `- Manually logged ad expenses: ${fmtEgp(ad.manualExpenses.total)} (${ad.manualExpenses.entries} entr${ad.manualExpenses.entries === 1 ? "y" : "ies"})`,
  );
  for (const pl of ad.platforms) {
    if (pl.paidSessions > 0 || pl.orders > 0) {
      lines.push(
        `- ${pl.label} UTM-tagged paid traffic: ${fmtInt(pl.paidSessions)} sessions, ${fmtInt(pl.orders)} orders, ${fmtEgp(pl.revenue)}`,
      );
    }
  }
  if (ad.blended?.roas)
    lines.push(`- Blended ROAS (manual expenses): ${ad.blended.roas.toFixed(2)}`);
  lines.push("");
  lines.push("KEY OBSERVATIONS (measured facts)");
  for (const s of r.observations) lines.push(`- ${s}`);
  if (r.hypotheses.length > 0) {
    lines.push("");
    lines.push("POSSIBLE FACTORS TO INVESTIGATE (hypotheses — not measured causes)");
    for (const s of r.hypotheses) lines.push(`- ${s}`);
  }
  return lines.join("\n");
}

export async function buildReport(
  kind: ReportPeriodKind,
  date?: string,
  now = new Date(),
): Promise<ReportData> {
  const range = resolveReportRange(kind, date, now);
  const model: TouchModel = "last";
  const [overview, traffic, funnel, products, campaigns, advertising] = await Promise.all([
    getOverview(range),
    getTraffic(range, model),
    getFunnel(range, model),
    getProducts(range, { sort: "views", dir: "desc", page: 1, pageSize: 10 }),
    getCampaigns(range, model),
    getAdvertising(range),
  ]);
  const bySource = new Map<string, number>();
  for (const row of traffic.rows)
    bySource.set(row.source, (bySource.get(row.source) ?? 0) + row.sessions);
  const topSourceEntry = Array.from(bySource).sort((a, b) => b[1] - a[1])[0];
  const partial: Omit<ReportData, "text"> = {
    kind,
    period: overview.period,
    overview,
    traffic,
    funnel,
    products,
    campaigns,
    advertising,
    observations: observations(
      overview,
      funnel.steps,
      topSourceEntry ? { source: topSourceEntry[0], sessions: topSourceEntry[1] } : null,
      products.rows[0] ? { title: products.rows[0].title, views: products.rows[0].views } : null,
      {
        sessions: traffic.attributionQuality.sessions,
        stamped: traffic.attributionQuality.stamped,
      },
    ),
    hypotheses: hypotheses(overview),
  };
  return { ...partial, text: renderText(partial) };
}

/* ------------------------------------------------------------------ */
/* AI narrative — interpretation only, checked against the numbers     */
/* ------------------------------------------------------------------ */

const NARRATIVE_SYSTEM = `You write a short business summary of a marketing report for the owner of a small e-commerce store (framed posters, Egypt).
Rules you must follow exactly:
- Use ONLY numbers that appear in the report below. Never calculate new figures, never estimate, never round differently.
- Describe what the numbers show. Do not state a cause as fact. If you suggest a reason, start it with "One possibility to check:".
- If a metric says "not measurable", "n/a" or "NOT CONNECTED", say the data is not available — do not fill it in.
- 120-180 words, plain sentences, no headings, no markdown, no emojis.`;

function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ""));
}

/** Numbers in the narrative that the measured report does not contain. */
export function findUnverifiedNumbers(narrative: string, reportText: string): string[] {
  const allowed = new Set<string>();
  for (const n of numbersIn(reportText)) {
    allowed.add(n);
    const v = Number(n);
    if (Number.isFinite(v)) {
      allowed.add(String(Math.round(v)));
      allowed.add(v.toFixed(1));
      allowed.add(v.toFixed(2));
    }
  }
  return Array.from(new Set(numbersIn(narrative).filter((n) => !allowed.has(n))));
}

export async function buildNarrative(report: ReportData): Promise<ReportNarrative> {
  const res = await generateTextPriority({
    system: NARRATIVE_SYSTEM,
    user: `REPORT (measured data):\n${report.text}`,
    temperature: 0.2,
  });
  const text = res.content.trim();
  return {
    text,
    provider: `${res.provider}:${res.key}`,
    unverifiedNumbers: findUnverifiedNumbers(text, report.text),
  };
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

const EXPORT_ROW_LIMIT = 10_000;
type Row = Record<string, string | number | null>;

export async function buildExport(
  dataset: ExportDataset,
  range: AnalyticsRange,
  model: TouchModel,
): Promise<ExportResult> {
  const stamp = `${cairoDay(range.start)}_${cairoDay(new Date(range.end.getTime() - 1))}`;
  const finish = (name: string, rows: Row[]): ExportResult => ({
    filename: `brwazwneon-${name}-${stamp}`,
    rows: rows.slice(0, EXPORT_ROW_LIMIT),
    truncated: rows.length > EXPORT_ROW_LIMIT,
  });
  switch (dataset) {
    case "traffic": {
      const t = await getTraffic(range, model);
      return finish(
        "traffic",
        t.rows.map((r) => ({
          source: r.source,
          medium: r.medium,
          campaign: r.campaign,
          visitors: r.visitors,
          sessions: r.sessions,
          page_views: r.pageViews,
          product_views: r.productViews,
          add_to_cart_sessions: r.addToCart,
          view_cart_sessions: r.viewCart,
          checkout_sessions: r.checkout,
          orders: r.orders,
          revenue_egp: r.revenue,
          conversion_rate:
            r.conversionRate === null ? null : Number((r.conversionRate * 100).toFixed(2)),
        })),
      );
    }
    case "campaigns": {
      const c = await getCampaigns(range, model);
      return finish(
        "campaigns",
        c.rows.map((r) => ({
          campaign: r.campaign,
          source: r.source,
          medium: r.medium,
          content: r.content,
          sessions: r.sessions,
          visitors: r.visitors,
          product_views: r.productViews,
          add_to_cart_sessions: r.addToCart,
          checkout_sessions: r.checkout,
          orders: r.orders,
          revenue_egp: r.revenue,
        })),
      );
    }
    case "products": {
      const rows = await exportProductRows(range);
      return finish(
        "products",
        rows.map((r) => ({
          product: r.title,
          category: r.category,
          views: r.views,
          unique_views: r.uniqueViews,
          clicks: r.clicks,
          add_to_cart: r.cartAdds,
          wishlists: r.wishlists,
          purchases: r.purchases,
          revenue_egp: r.revenue,
          conversion_rate:
            r.conversionRate === null ? null : Number((r.conversionRate * 100).toFixed(2)),
        })),
      );
    }
    case "cart": {
      const c = await getCart(range);
      const rows: Row[] = [
        { section: "summary", label: "Sessions with add to cart", value: c.cartSessions },
        { section: "summary", label: "Items added", value: c.itemsAdded },
        { section: "summary", label: "Cart view sessions", value: c.viewCartSessions },
        { section: "summary", label: "Checkout starts", value: c.checkoutStarts },
        { section: "summary", label: "Orders", value: c.orders },
        {
          section: "summary",
          label: "Cart abandonment %",
          value: c.cartAbandonment === null ? null : Number((c.cartAbandonment * 100).toFixed(1)),
        },
        {
          section: "summary",
          label: "Checkout abandonment %",
          value:
            c.checkoutAbandonment === null
              ? null
              : Number((c.checkoutAbandonment * 100).toFixed(1)),
        },
        ...c.abandonedProducts.map((p) => ({
          section: "abandoned_product",
          label: p.title,
          value: p.adds,
        })),
        ...c.cartSizes.map((s) => ({
          section: "cart_size_frames",
          label: s.label,
          value: s.checkouts,
        })),
        ...c.orderTypes.map((t) => ({
          section: "order_type_checkouts",
          label: t.label,
          value: t.checkouts,
        })),
      ];
      return finish("cart", rows);
    }
    case "revenue": {
      const o = await getOverview(range);
      return finish(
        "revenue",
        o.series.map((s) => ({
          day: s.day,
          visitors: s.visitors,
          sessions: s.sessions,
          page_views: s.pageViews,
          add_to_cart_sessions: s.addToCartSessions,
          orders: s.orders,
          revenue_egp: s.revenue,
        })),
      );
    }
    case "orders": {
      // Checkout-level and anonymised: no names, phones or addresses.
      const ctx = await makeCtx(range);
      const attributed = await attributeCheckouts(ctx, await loadCheckouts(ctx), model);
      return finish(
        "orders",
        attributed.map((c) => ({
          order_number: c.order_number,
          date: cairoDay(new Date(c.created_at)),
          status: c.status,
          payment_method: c.payment_method,
          items: N(c.items),
          revenue_egp: N(c.revenue),
          source: c.touch?.source ?? "unattributed",
          medium: c.touch?.medium ?? null,
          campaign: c.touch?.campaign ?? null,
          attribution_basis: c.via,
        })),
      );
    }
  }
}
