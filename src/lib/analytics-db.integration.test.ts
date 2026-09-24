/**
 * Integration test for the analytics writers and reports against the REAL
 * Neon database — inside a transaction that is ALWAYS rolled back, so nothing
 * is ever persisted (there is no staging database, and analytics rows for QA
 * must not pollute production).
 *
 * The production SQL runs unmodified: `@/lib/neon.server` is mocked with a
 * tag/function that executes on one pooled connection that is inside BEGIN.
 *
 * Opt-in (it talks to the live database):
 *   RUN_DB_TESTS=1 npx vitest run src/lib/analytics-db.integration.test.ts
 */
import fs from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NeonDbError, Pool, neonConfig, type PoolClient } from "@neondatabase/serverless";

const enabled = process.env.RUN_DB_TESTS === "1";

const tx = vi.hoisted(() => ({
  client: null as unknown as { query: (t: string, v?: unknown[]) => Promise<{ rows: unknown[] }> },
}));
const failOn = vi.hoisted(() => ({ substring: "" as string }));

vi.mock("@/lib/neon.server", () => ({
  sql: () => {
    const run = async (text: string, values: unknown[] = []) => {
      if (failOn.substring && text.includes(failOn.substring)) {
        // Simulates a database where migration 024 is not applied.
        throw Object.assign(new NeonDbError("column does not exist"), { code: "42703" });
      }
      return (await tx.client.query(text, values)).rows;
    };
    return (first: TemplateStringsArray | string, ...rest: unknown[]) => {
      if (typeof first === "string") return run(first, (rest[0] as unknown[]) ?? []);
      const text = first.reduce((acc, s, i) => acc + s + (i < rest.length ? `$${i + 1}` : ""), "");
      return run(text, rest);
    };
  },
}));

describe.skipIf(!enabled)("analytics pipeline against real Postgres (rolled back)", () => {
  let pool: Pool;
  let client: PoolClient;
  let posterId: string;

  beforeAll(async () => {
    const raw = fs.readFileSync(".env.local", "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
    }
    // `ws` ships without type declarations; it is only needed by this opt-in test.
    const wsModule = "ws";
    neonConfig.webSocketConstructor = (
      (await import(/* @vite-ignore */ wsModule)) as {
        default: never;
      }
    ).default;
    pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL });
    client = await pool.connect();
    await client.query("BEGIN");
    tx.client = client;
    posterId = ((await client.query("select id from posters limit 1")).rows[0] as { id: string })
      .id;
  }, 60_000);

  afterAll(async () => {
    try {
      await client?.query("ROLLBACK");
    } finally {
      client?.release();
      await pool?.end();
    }
  }, 60_000);

  const RUN = Math.random().toString(36).slice(2, 8);
  const CAMPAIGN_A = `qa_first_${RUN}`;
  const CAMPAIGN_B = `qa_last_${RUN}`;
  const V1 = `qa-visitor-1-${RUN}`;
  const V2 = `qa-visitor-2-${RUN}`;
  const S1 = `qa-session-1-${RUN}`;
  const S2 = `qa-session-2-${RUN}`;

  const attr = (over: Record<string, string> = {}) => ({
    first_source: "instagram",
    first_medium: "paid_social",
    first_campaign: CAMPAIGN_A,
    last_source: "instagram",
    last_medium: "paid_social",
    last_campaign: CAMPAIGN_A,
    ...over,
  });

  const visit = (session: string, visitor: string, extra: Record<string, unknown> = {}) => ({
    visitor_id: visitor,
    session_id: session,
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
    ...extra,
  });

  it("writes visits with first/last touch and counts them in Traffic + Campaigns", async () => {
    const { logVisitToDb, logEventsToDb } = await import("./db-analytics.server");
    const { sanitizeAttribution } = await import("./analytics-events-schema");
    const { getTraffic, getCampaigns } = await import("./analytics-core.server");
    const { resolveAnalyticsRange } = await import("./store-time");
    const range = resolveAnalyticsRange("7d");

    // S1: one campaign for the whole journey.
    await logVisitToDb({
      ...visit(S1, V1),
      host: "brwazwneon.com",
      attribution: sanitizeAttribution(attr()),
    });
    // S2: first touch = campaign A (instagram), but a later touch = campaign B (tiktok).
    await logVisitToDb({
      ...visit(S2, V2, { source: "tiktok" }),
      host: "www.brwazwneon.com",
      attribution: sanitizeAttribution(
        attr({ last_source: "tiktok", last_medium: "paid", last_campaign: CAMPAIGN_B }),
      ),
    });
    // The full funnel for S1.
    const ev = (event_type: string, extra: Record<string, unknown> = {}) => ({
      event_type,
      poster_id: null,
      value: null,
      quantity: null,
      props: null,
      path: "/",
      ...extra,
    });
    await logEventsToDb({
      visitor_id: V1,
      session_id: S1,
      host: "brwazwneon.com",
      attribution: sanitizeAttribution(attr()),
      events: [
        ev("view", { poster_id: posterId }),
        ev("cart_add", { poster_id: posterId }),
        ev("view_cart", { value: 466, quantity: 2 }),
        ev("checkout_start"),
        ev("select_item", { poster_id: posterId, props: { category: "movies", list: "category" } }),
        // A poster id that does not exist must be stored as NULL, not fail the batch (FK).
        ev("select_item", { poster_id: "00000000-0000-4000-8000-000000000000" }),
      ],
    });

    const last = await getTraffic(range, "last");
    const rowB = last.rows.find((r) => r.campaign === CAMPAIGN_B);
    expect(rowB).toMatchObject({ source: "tiktok", medium: "paid", sessions: 1, visitors: 1 });
    const rowA = last.rows.find((r) => r.campaign === CAMPAIGN_A);
    expect(rowA).toMatchObject({ source: "instagram", medium: "paid_social", sessions: 1 });
    // Funnel behaviour attributed to the campaign of the session.
    expect(rowA).toMatchObject({ productViews: 1, addToCart: 1, viewCart: 1, checkout: 1 });

    const first = await getTraffic(range, "first");
    // First-touch: BOTH sessions belong to campaign A; campaign B has no first-touch sessions.
    expect(first.rows.find((r) => r.campaign === CAMPAIGN_A)).toMatchObject({
      sessions: 2,
      visitors: 2,
    });
    expect(first.rows.find((r) => r.campaign === CAMPAIGN_B)).toBeUndefined();

    const camps = await getCampaigns(range, "last");
    expect(camps.rows.find((r) => r.campaign === CAMPAIGN_B)).toMatchObject({
      source: "tiktok",
      sessions: 1,
    });
    expect(last.attributionQuality.stamped).toBeGreaterThanOrEqual(2);
  }, 90_000);

  it("stores only the source taxonomy and pathname-only paths", async () => {
    const rows = (
      await client.query(
        "select distinct first_source, last_source, host from analytics_visits where visitor_id = any($1)",
        [[V1, V2]],
      )
    ).rows as Array<{ first_source: string; last_source: string; host: string }>;
    for (const r of rows) {
      expect([
        "instagram",
        "facebook",
        "tiktok",
        "google",
        "organic",
        "direct",
        "referral",
        "other",
      ]).toContain(r.first_source);
      expect([
        "instagram",
        "facebook",
        "tiktok",
        "google",
        "organic",
        "direct",
        "referral",
        "other",
      ]).toContain(r.last_source);
    }
    const stored = (
      await client.query(
        "select poster_id, props, host from analytics_poster_events where session_id = $1 order by created_at",
        [S1],
      )
    ).rows as Array<{ poster_id: string | null; props: unknown; host: string }>;
    expect(stored).toHaveLength(6);
    expect(stored.filter((e) => e.poster_id === null)).toHaveLength(3); // view_cart, checkout_start, unknown-poster select_item
    expect(stored.every((e) => e.host === "brwazwneon.com")).toBe(true);
  });

  it("development traffic is excluded from every report, but kept in the table", async () => {
    const { logVisitToDb } = await import("./db-analytics.server");
    const { getOverview, getTraffic } = await import("./analytics-core.server");
    const { resolveAnalyticsRange } = await import("./store-time");
    const range = resolveAnalyticsRange("7d");
    const before = await getOverview(range);

    const DEV1 = `qa-dev-session-1-${RUN}`;
    const DEV2 = `qa-dev-session-2-${RUN}`;
    // (a) recorded with a non-production host (new behaviour)
    await logVisitToDb({
      ...visit(DEV1, `qa-dev-visitor-1-${RUN}`),
      host: "localhost:8080",
      attribution: undefined,
    });
    // (b) legacy row from before `host` existed: only its localhost referrer gives it away
    await logVisitToDb({
      ...visit(DEV2, `qa-dev-visitor-2-${RUN}`, { referrer: "http://localhost:8083/cart" }),
    });

    const after = await getOverview(range);
    expect(after.current.sessions).toBe(before.current.sessions);
    expect(after.current.pageViews).toBe(before.current.pageViews);
    expect(after.notes.devExcludedSessions).toBe(before.notes.devExcludedSessions + 2);
    // Preserved, not deleted:
    const kept = (
      await client.query(
        "select count(*)::int n from analytics_visits where session_id = any($1)",
        [[DEV1, DEV2]],
      )
    ).rows[0] as { n: number };
    expect(kept.n).toBe(2);
    const traffic = await getTraffic(range, "last");
    expect(traffic.attributionQuality.sessions).toBe(after.current.sessions);
  }, 90_000);

  it("falls back to the legacy column list when migration 024 is not applied", async () => {
    const { logVisitToDb, logEventsToDb } = await import("./db-analytics.server");
    const S = `qa-legacy-${RUN}`;
    failOn.substring = "first_source"; // any statement naming the new columns "fails"
    try {
      await logVisitToDb({ ...visit(S, `qa-legacy-visitor-${RUN}`), host: "brwazwneon.com" });
      await logEventsToDb({
        visitor_id: `qa-legacy-visitor-${RUN}`,
        session_id: S,
        host: "brwazwneon.com",
        attribution: {
          first_source: null,
          first_medium: null,
          first_campaign: null,
          first_content: null,
          first_term: null,
          last_source: null,
          last_medium: null,
          last_campaign: null,
          last_content: null,
          last_term: null,
        },
        events: [
          {
            event_type: "view",
            poster_id: posterId,
            value: null,
            quantity: null,
            props: null,
            path: "/",
          },
        ],
      });
    } finally {
      failOn.substring = "";
    }
    const v = (
      await client.query(
        "select count(*)::int n, min(host) h from analytics_visits where session_id = $1",
        [S],
      )
    ).rows[0] as { n: number; h: string | null };
    const e = (
      await client.query(
        "select count(*)::int n from analytics_poster_events where session_id = $1",
        [S],
      )
    ).rows[0] as { n: number };
    expect(v.n).toBe(1);
    expect(v.h).toBeNull(); // legacy insert: no host column written
    expect(e.n).toBe(1);
  }, 60_000);

  it("orders are attributed with the same taxonomy (ig → instagram) and never guessed", async () => {
    const { attributeCheckouts, makeCtx } = await import("./analytics-core.server");
    const { resolveAnalyticsRange } = await import("./store-time");
    const ctx = await makeCtx(resolveAnalyticsRange("30d"));
    const mk = (over: Record<string, unknown>) => ({
      k: "k",
      order_number: "BRW-QA",
      items: 1,
      payment_method: "cod",
      visitor_id: null,
      created_at: new Date().toISOString(),
      revenue: "100",
      status: "new",
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      ...over,
    });
    const out = await attributeCheckouts(
      ctx,
      [
        mk({ k: "a", utm_source: "ig", utm_medium: "paid", utm_campaign: "123" }),
        mk({ k: "b", visitor_id: V1, created_at: new Date(Date.now() + 60_000).toISOString() }),
        mk({ k: "c", visitor_id: "visitor-with-no-history" }),
      ],
      "last",
    );
    expect(out[0]).toMatchObject({
      via: "order_utm",
      touch: { source: "instagram", medium: "paid", campaign: "123" },
    });
    expect(out[1]).toMatchObject({
      via: "session",
      touch: { source: "instagram", campaign: CAMPAIGN_A, stamped: true },
    });
    expect(out[2]).toMatchObject({ via: "none", touch: null });
  }, 60_000);

  it("every report runs against the live schema without error", async () => {
    const core = await import("./analytics-core.server");
    const more = await import("./analytics-more.server");
    const { resolveAnalyticsRange } = await import("./store-time");
    const range = resolveAnalyticsRange("30d");
    await expect(core.getOverview(range)).resolves.toBeTruthy();
    await expect(core.getFunnel(range, "last")).resolves.toBeTruthy();
    await expect(
      more.getProducts(range, { sort: "revenue", dir: "desc", pageSize: 5, q: "a" }),
    ).resolves.toBeTruthy();
    await expect(more.getClicks(range)).resolves.toBeTruthy();
    await expect(more.getCart(range)).resolves.toBeTruthy();
    await expect(more.getCustomDesign(range)).resolves.toBeTruthy();
    await expect(more.getAdvertising(range)).resolves.toBeTruthy();
  }, 120_000);
});
