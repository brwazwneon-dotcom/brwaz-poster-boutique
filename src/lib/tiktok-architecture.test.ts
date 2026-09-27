/**
 * Guards the shape of the TikTok integration by reading the source: a second
 * sender, a token in client code, or a relayed Purchase is easy to introduce and
 * hard to notice at runtime.
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
const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

describe("secrets stay on the server", () => {
  it("the Events API token is referenced only in server-only files", () => {
    const files = nonTest
      .filter((f) => f.text.includes("TIKTOK_EVENTS_ACCESS_TOKEN"))
      .map((f) => f.rel);
    expect(files.length).toBeGreaterThan(0);
    for (const rel of files) expect(rel, rel).toMatch(/\.server\.ts$/);
  });

  it("nothing client-side imports the server sender", () => {
    for (const f of nonTest.filter(
      (f) => /^(components|routes)\//.test(f.rel) || /^lib\/tiktok-browser/.test(f.rel),
    ))
      expect(f.text, f.rel).not.toMatch(/tiktok-events\.server/);
  });

  it("the token goes in a header, is never put in a URL, and is never logged", () => {
    const server = read("lib/tiktok-events.server.ts");
    expect(server).toMatch(/"Access-Token": cfg\.token/);
    expect(server).not.toMatch(/access_token=|\?token=/i);
    expect(server).not.toMatch(/console\.(log|info|debug|warn|error)/);
  });

  it("the endpoint host is fixed in code, never taken from a request or a setting", () => {
    const server = read("lib/tiktok-events.server.ts");
    expect(server).toMatch(/const ENDPOINT = "https:\/\/business-api\.tiktok\.com\//);
    expect(count(server, /fetch\(/g)).toBe(1);
    expect(server).toMatch(/fetch\(ENDPOINT,/);
  });
});

describe("one source per event, one id across channels", () => {
  it("the browser sender is called from ONE place: trackEvent in meta-pixel.ts", () => {
    const callers = nonTest
      .filter((f) => /\btrackTikTok\(/.test(f.text) && f.rel !== "lib/tiktok-browser.ts")
      .map((f) => f.rel);
    expect(callers).toEqual(["lib/meta-pixel.ts"]);
    expect(count(read("lib/meta-pixel.ts"), /\btrackTikTok\(/g)).toBe(1);
  });

  it("the TikTok pixel event and the relay share the event_id the Meta pixel uses", () => {
    const pixel = read("lib/meta-pixel.ts");
    expect(pixel).toMatch(/trackTikTok\(name, params, event_id,/);
    const browser = read("lib/tiktok-browser.ts");
    expect(browser).toMatch(/\{ event_id: eventId \}/);
    expect(browser).toMatch(/event_id: eventId,/);
  });

  it("only order-tracking sends a server CompletePayment, with the purchase built from stored data", () => {
    const callers = nonTest
      .filter((f) => /sendTikTokPurchase\(/.test(f.text) && f.rel !== "lib/tiktok-events.server.ts")
      .map((f) => f.rel);
    expect(callers).toEqual(["lib/order-tracking.server.ts"]);
    const tracking = read("lib/order-tracking.server.ts");
    // the CALL (last occurrence; the first is the definition) sits inside the deferred task
    expect(tracking.indexOf("afterResponse(")).toBeLessThan(
      tracking.lastIndexOf("sendTikTokPurchaseSafely("),
    );
  });

  it("the order response never awaits TikTok: db-orders hands everything to trackNewOrders", () => {
    expect(read("lib/db-orders.functions.ts")).not.toMatch(/tiktok/i);
    expect(read("lib/order-ops.functions.ts")).not.toMatch(/tiktok/i);
  });

  it("the server Purchase is CompletePayment, the same event name the browser pixel maps Purchase to", () => {
    expect(read("lib/tiktok-events.ts")).toMatch(/Purchase: "CompletePayment"/);
    expect(read("lib/tiktok-events.server.ts")).toMatch(/event: TIKTOK_PURCHASE_EVENT/);
    expect(read("lib/tiktok-events.server.ts")).toMatch(/event_id: args\.purchase\.event_id/);
    expect(read("lib/tiktok-events.server.ts")).not.toMatch(/randomUUID|Math\.random/);
  });
});

describe("the public relay is narrow", () => {
  it("is a validated POST that only calls the relay function", () => {
    const fns = read("lib/tiktok-events.functions.ts");
    expect(count(fns, /createServerFn\(/g)).toBe(1);
    expect(fns).toMatch(/createServerFn\(\{ method: "POST" \}\)/);
    expect(fns).toMatch(/TikTokRelayInputSchema\.parse/);
    expect(fns).not.toMatch(/accountId|token|process\.env|pixel/i);
  });

  it("Purchase is not on the relay's allow-list", () => {
    const events = read("lib/tiktok-events.ts");
    expect(
      events.slice(events.indexOf("TIKTOK_RELAYED_EVENTS"), events.indexOf("] as const")),
    ).not.toMatch(/Purchase|CompletePayment/);
  });

  it("the relay answers with the outcome only", () => {
    expect(read("lib/tiktok-events.server.ts")).toMatch(
      /return r\.skipped \? \{ ok: r\.ok, skipped: true \} : \{ ok: r\.ok \}/,
    );
  });
});

describe("customer data", () => {
  it("the browser layer forwards customer data only when the caller passes it", () => {
    const pixel = read("lib/meta-pixel.ts");
    expect(pixel).toMatch(/tiktokAdvancedMatchingEnabled/);
    expect(read("lib/tiktok-browser.ts")).not.toMatch(/localStorage|document\.cookie\b.*email/);
  });

  it("the server hashes customer fields and only when Advanced Matching is on", () => {
    const server = read("lib/tiktok-events.server.ts");
    expect(server).toMatch(/if \(cfg\.advancedMatching\) \{/);
    expect(server).toMatch(/sha256Hex\(normEmail\(u\.email\)\)/);
    expect(server).toMatch(/sha256Hex\(u\.external_id\.trim\(\)\)/);
  });
});

describe("no second attribution system", () => {
  it("the ttclid is stored by attribution.ts, the only attribution implementation", () => {
    expect(read("lib/attribution.ts")).toMatch(/ttclid/);
    for (const rel of ["lib/tiktok-browser.ts", "lib/tiktok-events.ts", "routes/cart.tsx"])
      expect(read(rel), rel).not.toMatch(
        /click-ids|getStoredUtm|getMarketingIdentifiers|brw-click-ids/,
      );
  });

  it("checkout sends the TikTok identifiers through the same tracking object as the Meta ones", () => {
    expect(read("routes/cart.tsx")).toMatch(/\.\.\.getTikTokIdentifiers\(\)/);
    expect(read("routes/photo-printing.tsx")).toMatch(/\.\.\.getTikTokIdentifiers\(\)/);
  });
});
