/**
 * Guards the shape of the Meta Ads layer by reading the source: a public endpoint,
 * a secret in client code, or a second write path into Meta is easy to introduce
 * and hard to notice at runtime.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const code = (text: string) =>
  text
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const read = (rel: string) => code(fs.readFileSync(path.join(SRC, rel), "utf8"));

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const all = walk(SRC).map((p) => ({
  rel: path.relative(SRC, p).replace(/\\/g, "/"),
  text: code(fs.readFileSync(p, "utf8")),
}));
const nonTest = all.filter((f) => !/\.test\.tsx?$/.test(f.rel));

describe("Meta Ads endpoints are admin-only", () => {
  const fns = read("lib/meta-ads.functions.ts");

  it("every server function carries the admin middleware", () => {
    const declared = (fns.match(/createServerFn\(/g) ?? []).length;
    const guarded = (fns.match(/\.middleware\(\[\.\.\.admin\(\)\]\)/g) ?? []).length;
    expect(declared).toBeGreaterThanOrEqual(4);
    expect(guarded).toBe(declared);
    expect(fns).toMatch(/requireAdminSessionNeon/);
  });

  it("no public route or API handler reaches the Meta Ads code", () => {
    const offenders = nonTest
      .filter((f) => /^routes\//.test(f.rel) && /meta-ads|meta-marketing/.test(f.text))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("the ad account and the token are never taken from a request", () => {
    expect(fns).not.toMatch(/accountId|account_id|META_AD_ACCOUNT_ID|access_token|token/i);
  });

  it("syncing is a POST; reading is a GET", () => {
    expect(fns).toMatch(/syncMetaAdsNow = createServerFn\(\{ method: "POST" \}\)/);
    expect(fns).toMatch(/getMetaAdsReport = createServerFn\(\{ method: "GET" \}\)/);
  });
});

describe("secrets stay on the server", () => {
  it("the Marketing API token is only referenced in server-only files", () => {
    const files = nonTest
      .filter((f) => f.text.includes("META_MARKETING_ACCESS_TOKEN"))
      .map((f) => f.rel);
    expect(files.length).toBeGreaterThan(0);
    for (const rel of files) expect(rel, rel).toMatch(/\.server\.ts$/);
  });

  it("nothing client-side imports a server module or the Marketing client", () => {
    const client = nonTest.filter((f) => /^(components|routes)\//.test(f.rel));
    for (const f of client) {
      expect(f.text, f.rel).not.toMatch(/from "@\/lib\/meta-marketing\.server"/);
      expect(f.text, f.rel).not.toMatch(/from "@\/lib\/meta-ads-(sync|report)\.server"/);
    }
  });

  it("the token is never logged and never put in a URL we store or return", () => {
    for (const rel of ["lib/meta-marketing.server.ts", "lib/meta-ads-sync.server.ts"]) {
      const text = read(rel);
      expect(text, rel).not.toMatch(/console\.(log|info|debug|warn|error)/);
    }
    // the only place a token is put into a request URL is the single outgoing Graph call
    const client = read("lib/meta-marketing.server.ts");
    expect((client.match(/access_token/g) ?? []).length).toBeLessThanOrEqual(4);
    expect(client).toMatch(/scrub\(/);
  });

  it("the token cannot reach Neon", () => {
    const sync = read("lib/meta-ads-sync.server.ts");
    expect(sync).not.toMatch(/cfg\.token[^,)]*\bparams\b|\[[^\]]*cfg\.token[^\]]*\]/);
    const migration = fs.readFileSync(
      path.join(SRC, "..", "neon/migrations/025_meta_ads_reporting.sql"),
      "utf8",
    );
    // (comments may say "never a secret"; no COLUMN or statement may name one)
    expect(migration.replace(/--.*$/gm, "")).not.toMatch(/token|secret|password/i);
  });
});

describe("the Marketing API client is read-only and isolated from CAPI", () => {
  const client = read("lib/meta-marketing.server.ts");

  it("only reads: GET requests, no create / update / delete", () => {
    expect(client).toMatch(/method: "GET"/);
    expect(client).not.toMatch(/method: "(POST|PUT|PATCH|DELETE)"/);
  });

  it("pages by cursor and never fetches the paging.next URL (which embeds the token)", () => {
    expect(client).toMatch(/cursors/);
    const fetches = client.match(/doFetch\(([^,)]+)/g) ?? [];
    expect(fetches).toEqual(["doFetch(url"]);
  });

  it("does not use, or share code with, the Pixel / Conversions API credential", () => {
    expect(client).not.toMatch(/META_PIXEL_ACCESS_TOKEN|meta-capi/);
    expect(read("lib/meta-capi.server.ts")).not.toMatch(/meta-marketing|META_MARKETING/);
    expect(read("lib/order-tracking.server.ts")).not.toMatch(/meta-marketing|meta-ads/);
  });

  it("the checkout / order path does not depend on the Meta Ads layer", () => {
    for (const rel of [
      "lib/db-orders.functions.ts",
      "lib/order-ops.functions.ts",
      "lib/order-tracking.server.ts",
      "lib/meta-pixel.ts",
      "routes/cart.tsx",
    ]) {
      expect(read(rel), rel).not.toMatch(/meta-ads|meta-marketing/);
    }
  });
});

describe("no second attribution system", () => {
  it("the Meta Ads report reads the existing analytics attribution, not its own store", () => {
    const report = read("lib/meta-ads-report.server.ts");
    expect(report).toMatch(/attributeCheckouts/);
    expect(report).toMatch(/touchOf/);
    expect(report).not.toMatch(/localStorage|document\.cookie|click-ids|brw-attribution/);
    expect(read("lib/meta-ads-report.core.ts")).not.toMatch(/from "@\/lib\/neon\.server"|fetch\(/);
  });
});

describe("order attribution snapshot", () => {
  it("the browser builds it from the ONE attribution store and sends it with the order", () => {
    const cart = read("routes/cart.tsx");
    expect(cart).toMatch(/getOrderAttributionSnapshot\(\)/);
    expect(cart).toMatch(/attribution,\s*\n?\s*\};?/);
    expect(read("lib/attribution.ts")).toMatch(/export function getOrderAttributionSnapshot/);
    expect(read("lib/order-attribution.ts")).not.toMatch(/localStorage|document\.cookie|window\./);
  });

  it("it is stored only from the deferred tracking task — the order response never waits on it", () => {
    const orders = read("lib/db-orders.functions.ts");
    expect(orders).not.toMatch(/buildAdTracking|sanitizeOrderAttribution|ad_tracking/);
    const tracking = read("lib/order-tracking.server.ts");
    expect(tracking.indexOf("afterResponse(")).toBeLessThan(tracking.indexOf("buildAdTracking("));
  });

  it("the server never trusts the browser's clock or unknown keys", () => {
    const shared = read("lib/order-attribution.ts");
    expect(shared).toMatch(/recorded_at: now\.toISOString\(\)/);
    expect(read("lib/meta-capi.server.ts")).toMatch(
      /sanitizeOrderAttribution\(raw\?\.attribution\)/,
    );
  });

  it("the Purchase sent to Meta does not change: it still reads only the identifiers", () => {
    const capi = read("lib/meta-capi.server.ts");
    expect(capi).toMatch(/const t = sanitizeTracking\(args\.tracking\)/);
    expect(capi.slice(capi.indexOf("export async function sendPurchaseToMeta"))).not.toMatch(
      /attribution/,
    );
  });
});

describe("Executive Dashboard marketing tiles", () => {
  const tab = read("components/admin/tabs/DashboardTab.tsx");

  it("no hard-coded 'not connected' placeholder is left; the tiles read the server function", () => {
    expect(tab).not.toMatch(/NotConnectedTile|connect Meta\/TikTok/);
    expect(tab).toMatch(/getMetaDashboardTiles\(/);
  });

  it("the tab imports only the admin server function, never a server module", () => {
    expect(tab).not.toMatch(/from "@\/lib\/[^"]*\.server"/);
  });

  it("the tile state logic is pure (no database, no network)", () => {
    expect(read("lib/meta-ads-dashboard.core.ts")).not.toMatch(/neon\.server|fetch\(|process\.env/);
  });
});
