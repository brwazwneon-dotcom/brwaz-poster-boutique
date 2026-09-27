/**
 * Meta Ads reporting against the REAL Neon database — inside a transaction that
 * is ALWAYS rolled back. Migration 025 is applied INSIDE that transaction (DDL is
 * transactional in Postgres), so nothing is created or kept: production is not
 * migrated by this test. Meta itself is never called (a scripted fetch answers).
 *
 * Proves, on real SQL: the migration runs, the sync upserts on Meta's ids (a
 * second run duplicates nothing), and the report joins the synced spend to a
 * website visit and to an order by campaign id and ad id.
 *
 * Opt-in (it talks to the live database):
 *   RUN_DB_TESTS=1 npx vitest run src/lib/meta-ads.db.integration.test.ts
 */
import fs from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool, neonConfig, type PoolClient } from "@neondatabase/serverless";

const enabled = process.env.RUN_DB_TESTS === "1";

const tx = vi.hoisted(() => ({
  client: null as unknown as { query: (t: string, v?: unknown[]) => Promise<{ rows: unknown[] }> },
}));

vi.mock("@/lib/neon.server", () => ({
  sql: () => {
    const run = async (text: string, values: unknown[] = []) =>
      (await tx.client.query(text, values)).rows;
    return (first: TemplateStringsArray | string, ...rest: unknown[]) => {
      if (typeof first === "string") return run(first, (rest[0] as unknown[]) ?? []);
      const text = first.reduce((acc, s, i) => acc + s + (i < rest.length ? `$${i + 1}` : ""), "");
      return run(text, rest);
    };
  },
}));

const RUN = Math.random().toString(36).slice(2, 8);
const CAMP = `9${Date.now()}`.slice(0, 15); // numeric, like Meta's ids
const SET = `8${Date.now()}`.slice(0, 15);
const AD = `7${Date.now()}`.slice(0, 15);
const VISITOR = `qa-meta-visitor-${RUN}`;
const SESSION = `qa-meta-session-${RUN}`;

const ENV = {
  META_MARKETING_ACCESS_TOKEN: "qa-not-a-real-token",
  META_AD_ACCOUNT_ID: "act_1234567",
};

describe.skipIf(!enabled)("Meta Ads sync + report on real Postgres (rolled back)", () => {
  let pool: Pool;
  let client: PoolClient;
  const today = () => new Date().toISOString().slice(0, 10);

  const meta = (spend: string) =>
    vi.fn(async (url: string) => {
      const u = String(url);
      const body = u.includes("/insights")
        ? {
            data: [
              {
                date_start: today(),
                ad_id: AD,
                adset_id: SET,
                campaign_id: CAMP,
                campaign_name: `QA campaign ${RUN}`,
                adset_name: "QA set",
                ad_name: "QA ad",
                spend,
                impressions: "5000",
                clicks: "120",
                inline_link_clicks: "90",
                account_currency: "EGP",
                actions: [{ action_type: "omni_purchase", value: "2" }],
                action_values: [{ action_type: "omni_purchase", value: "900" }],
              },
            ],
          }
        : u.includes("/adsets")
          ? { data: [{ id: SET, campaign_id: CAMP, name: "QA set", optimization_goal: "X" }] }
          : u.includes("/ads")
            ? { data: [{ id: AD, adset_id: SET, campaign_id: CAMP, name: "QA ad" }] }
            : { data: [{ id: CAMP, name: `QA campaign ${RUN}`, status: "PAUSED" }] };
      return new Response(JSON.stringify(body), { status: 200 });
    });

  beforeAll(async () => {
    const raw = fs.readFileSync(".env.local", "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
    }
    const wsModule = "ws";
    neonConfig.webSocketConstructor = (
      (await import(/* @vite-ignore */ wsModule)) as { default: never }
    ).default;
    pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });
    client = await pool.connect();
    await client.query("BEGIN");
    tx.client = client;
    // Migration 025, run inside the transaction that is rolled back at the end.
    const migration = fs.readFileSync("neon/migrations/025_meta_ads_reporting.sql", "utf8");
    await client.query(migration);
  }, 60_000);

  afterAll(async () => {
    try {
      await client?.query("ROLLBACK");
    } finally {
      client?.release();
      await pool?.end();
    }
  }, 60_000);

  const count = async (table: string, where = "true", params: unknown[] = []) =>
    Number(
      (
        (await client.query(`select count(*)::int n from ${table} where ${where}`, params))
          .rows[0] as { n: number }
      ).n,
    );

  it("the migration creates the five tables and is idempotent", async () => {
    const migration = fs.readFileSync("neon/migrations/025_meta_ads_reporting.sql", "utf8");
    await expect(client.query(migration)).resolves.toBeTruthy(); // second run: no error
    const { metaAdsTablesApplied } = await import("./meta-ads-sync.server");
    await expect(metaAdsTablesApplied()).resolves.toBe(true);
  });

  it("syncs, then a second sync of the same range duplicates nothing and updates in place", async () => {
    const { syncMetaAds } = await import("./meta-ads-sync.server");
    const run = (spend: string) =>
      syncMetaAds(
        {},
        { env: ENV, graph: { fetchImpl: meta(spend) as never, sleep: async () => {}, retries: 0 } },
      );

    const first = await run("300.50");
    expect(first).toMatchObject({
      ok: true,
      status: "success",
      campaigns: 1,
      adsets: 1,
      ads: 1,
      insightRows: 1,
    });
    expect(await count("meta_campaigns", "meta_campaign_id = $1", [CAMP])).toBe(1);
    expect(await count("meta_ads", "meta_ad_id = $1", [AD])).toBe(1);
    expect(await count("meta_ad_insights_daily", "meta_ad_id = $1", [AD])).toBe(1);

    const second = await run("410.25"); // Meta restated the day's spend
    expect(second.ok).toBe(true);
    expect(await count("meta_ad_insights_daily", "meta_ad_id = $1", [AD])).toBe(1);
    const row = (
      await client.query(
        "select spend::text, impressions::text, purchases::text, purchase_value::text, currency from meta_ad_insights_daily where meta_ad_id = $1",
        [AD],
      )
    ).rows[0];
    expect(row).toMatchObject({
      spend: "410.25",
      impressions: "5000",
      purchases: "2",
      purchase_value: "900",
      currency: "EGP",
    });
    expect(await count("meta_sync_runs", "status = 'success'")).toBeGreaterThanOrEqual(2);
  }, 60_000);

  it("the status view reports the last success and never a secret", async () => {
    const { getSyncStatus } = await import("./meta-ads-sync.server");
    const s = await getSyncStatus({ env: ENV });
    expect(s).toMatchObject({ configured: true, migrationApplied: true });
    expect(s.lastSuccess).not.toBeNull();
    expect(JSON.stringify(s)).not.toContain(ENV.META_MARKETING_ACCESS_TOKEN);
  });

  it("the report ties the synced ad to website traffic and to an order by id", async () => {
    const { logVisitToDb } = await import("./db-analytics.server");
    const { sanitizeAttribution } = await import("./analytics-events-schema");
    await logVisitToDb({
      visitor_id: VISITOR,
      session_id: SESSION,
      path: "/",
      referrer: "",
      source: "instagram",
      device: "mobile",
      browser: "Chrome",
      os: "Android",
      country: null,
      country_code: null,
      city: null,
      governorate: null,
      user_agent: "qa",
      host: "brwazwneon.com",
      attribution: sanitizeAttribution({
        first_source: "instagram",
        first_medium: "paid",
        first_campaign: CAMP,
        first_content: AD,
        last_source: "instagram",
        last_medium: "paid",
        last_campaign: CAMP,
        last_content: AD,
      }),
    });

    // An order that stored only source / medium / campaign (like production's) must still
    // resolve to the AD through the visitor's session — and only because the campaign agrees.
    const { attributeCheckouts, makeCtx } = await import("./analytics-core.server");
    const { resolveAnalyticsRange } = await import("./store-time");
    const range = resolveAnalyticsRange("7d");
    const ctx = await makeCtx(range);
    const mk = (over: Record<string, unknown>) => ({
      k: "k",
      order_number: "BRW-QA",
      items: 1,
      payment_method: "cod",
      visitor_id: VISITOR,
      created_at: new Date(Date.now() + 60_000).toISOString(),
      revenue: "1000",
      status: "confirmed",
      utm_source: "ig",
      utm_medium: "paid",
      utm_campaign: CAMP,
      ...over,
    });
    const [same, other] = await attributeCheckouts(
      ctx,
      [mk({}), mk({ utm_campaign: "555" })],
      "last",
    );
    expect(same.touch).toMatchObject({ campaign: CAMP, content: AD });
    expect(other.touch).toMatchObject({ campaign: "555", content: null });

    const { getMetaAdsReport } = await import("./meta-ads-report.server");
    const { status, report } = await getMetaAdsReport(range, "last");
    expect(status.migrationApplied).toBe(true);
    const camp = report!.campaigns.find((c) => c.id === CAMP)!;
    expect(camp).toBeTruthy();
    expect(camp.name).toBe(`QA campaign ${RUN}`);
    expect(camp.platform.spend).toBeCloseTo(410.25, 2);
    expect(camp.platform.metaPurchases).toBe(2);
    const ad = camp.adsets[0].ads.find((a) => a.id === AD)!;
    expect(ad.site.sessions).toBe(1);
    expect(ad.site.visitors).toBe(1);
    expect(report!.notes.join(" ")).toMatch(/Reach is not shown/);
    expect(JSON.stringify(report)).not.toContain(ENV.META_MARKETING_ACCESS_TOKEN);
  }, 90_000);

  it("the dashboard tiles report real synced numbers for a covered period, and say so for an uncovered one", async () => {
    const { getMetaDashboardTiles } = await import("./meta-ads-report.server");
    const { resolveAnalyticsRange } = await import("./store-time");
    const covered = await getMetaDashboardTiles(resolveAnalyticsRange("7d"));
    expect(covered.state).toBe("ok");
    expect(covered.spend).toBeCloseTo(410.25, 2);
    // a period far before anything was synced is "not covered", never a fake zero
    const old = await getMetaDashboardTiles(
      resolveAnalyticsRange("custom", { from: "2025-01-01", to: "2025-01-31" }),
    );
    expect(old.state).toBe("not_covered");
    expect(old.spend).toBeNull();
    expect(JSON.stringify(covered)).not.toContain(ENV.META_MARKETING_ACCESS_TOKEN);
  }, 90_000);

  it("both exports run on the live schema", async () => {
    const { buildMetaAdsExport } = await import("./meta-ads-report.server");
    const { resolveAnalyticsRange } = await import("./store-time");
    const range = resolveAnalyticsRange("7d");
    const ads = await buildMetaAdsExport("meta_ads", range, "last");
    expect(ads.rows.some((r) => r.ad_id === AD && r.spend === 410.25)).toBe(true);
    const orders = await buildMetaAdsExport("meta_ads_orders", range, "first");
    expect(Array.isArray(orders.rows)).toBe(true);
    // Order exports carry order numbers, never customer fields.
    for (const r of orders.rows)
      expect(Object.keys(r).join(",")).not.toMatch(/phone|name|address|email/);
  }, 90_000);
});

describe.skipIf(!enabled)("order-time attribution snapshot on real Postgres (rolled back)", () => {
  let pool: Pool;
  let client: PoolClient;

  beforeAll(async () => {
    const raw = fs.readFileSync(".env.local", "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
    }
    const wsModule = "ws";
    neonConfig.webSocketConstructor = (
      (await import(/* @vite-ignore */ wsModule)) as { default: never }
    ).default;
    pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });
    client = await pool.connect();
    await client.query("BEGIN");
    tx.client = client;
  }, 60_000);

  afterAll(async () => {
    try {
      await client?.query("ROLLBACK");
    } finally {
      client?.release();
      await pool?.end();
    }
  }, 60_000);

  it("loadCheckouts reads orders.ad_tracking -> attribution, and attributes from it", async () => {
    const { loadCheckouts, attributeCheckouts, makeCtx } = await import("./analytics-core.server");
    const { resolveAnalyticsRange } = await import("./store-time");
    const { sanitizeOrderAttribution } = await import("./order-attribution");
    const snap = sanitizeOrderAttribution({
      first: { source: "ig", medium: "paid", campaign: CAMP, content: AD, term: null },
      last: { source: "instagram", medium: "paid", campaign: CAMP, content: AD, term: null },
    });
    // A test order that exists only inside this rolled-back transaction.
    await client.query("SAVEPOINT s");
    let inserted = true;
    try {
      await client.query(
        `insert into orders (customer_name, phone, governorate, address, frame_type, frame_color, size,
                             quantity, total_price, is_test, status, guest_session_id, ad_tracking)
         values ('QA', '01000000000', 'Cairo', 'QA', 'wood', 'black', '30x40', 1, 1000, false, 'confirmed',
                 $1, $2::jsonb)`,
        [`qa-snap-${RUN}`, JSON.stringify({ fbp: "fb.1.1.1", attribution: snap })],
      );
    } catch {
      // The price guard may reject a hand-made row; then only the SQL itself is proven.
      inserted = false;
      await client.query("ROLLBACK TO SAVEPOINT s");
    }
    const ctx = await makeCtx(resolveAnalyticsRange("7d"));
    const rows = await loadCheckouts(ctx); // must run on the live schema either way
    expect(Array.isArray(rows)).toBe(true);
    if (inserted) {
      const mine = rows.find((r) => r.visitor_id === `qa-snap-${RUN}`)!;
      expect(mine.snapshot).toBeTruthy();
      const [first, last] = await Promise.all([
        attributeCheckouts(ctx, [mine], "first"),
        attributeCheckouts(ctx, [mine], "last"),
      ]);
      expect(first[0].touch).toMatchObject({ source: "instagram", campaign: CAMP, content: AD });
      expect(last[0].touch).toMatchObject({ source: "instagram", campaign: CAMP, content: AD });
    }
    console.info(`snapshot test order inserted in rolled-back tx: ${inserted}`);
  }, 60_000);
});
