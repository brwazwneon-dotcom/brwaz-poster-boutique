/**
 * Guards the shape of the Meta integration by reading the source: the kind of
 * mistake (a second ViewCart, a random Purchase id, a token in client code) that
 * is easy to reintroduce and hard to notice at runtime.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CUSTOM_META_EVENTS } from "./meta-events";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** Source without comments, so a comment that mentions a word is not mistaken for code. */
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

describe("ViewCart and InitiateCheckout have exactly one source each", () => {
  const boot = read("components/MarketingBoot.tsx");
  const cart = read("routes/cart.tsx");

  it("MarketingBoot no longer fires cart/checkout events (no route-based duplicates)", () => {
    expect(boot).not.toMatch(/ViewCart|InitiateCheckout|"\/checkout"|startsWith\("\/cart"\)/);
  });

  it("the cart page sends one ViewCart", () => {
    expect(count(cart, /trackCustom\(\s*"ViewCart"/g)).toBe(1);
  });

  it("across the whole app only the cart page sends ViewCart and InitiateCheckout", () => {
    const viewCart = nonTest.filter(
      (f) =>
        f.rel !== "components/admin/MetaPixelDebugCard.tsx" &&
        /trackCustom\(\s*"ViewCart"|enqueueEvent\(\s*"ViewCart"/.test(f.text),
    );
    const initiate = nonTest.filter((f) => /trackEvent\(\s*"InitiateCheckout"/.test(f.text));
    expect(viewCart.map((f) => f.rel)).toEqual(["routes/cart.tsx"]);
    // (the admin Pixel debug card fires test events on purpose)
    expect(
      initiate.map((f) => f.rel).filter((r) => r !== "components/admin/MetaPixelDebugCard.tsx"),
    ).toEqual(["routes/cart.tsx"]);
  });

  it("InitiateCheckout is once-per-visit and skipped for test-mode checkouts", () => {
    expect(cart).toMatch(/!isTestMode\(\) && !initiateCheckoutSentRef\.current/);
  });
});

describe("Purchase: one sender, deterministic id, from stored data", () => {
  const cart = read("routes/cart.tsx");

  it("no file except the shared layer sends a Purchase from the browser", () => {
    const offenders = nonTest
      .filter((f) => /trackEvent\(\s*"Purchase"/.test(f.text))
      .map((f) => f.rel);
    expect(offenders.filter((r) => r !== "lib/meta-pixel.ts")).toEqual([]);
  });

  it("no fake / timestamp order ids anywhere near a Purchase", () => {
    for (const f of nonTest.filter((f) => /Purchase|purchase/.test(f.text))) {
      expect(f.text, f.rel).not.toMatch(/BRW-\$\{Date\.now\(\)\}|order_id:\s*`?BRW-\$\{/);
    }
    expect(cart).not.toMatch(/Date\.now\(\)/);
  });

  it("the cart fires Purchases from the server payload only, after order creation", () => {
    expect(cart).not.toMatch(/"Purchase"/);
    expect(cart).not.toMatch(/OrderCreated/);
    expect(cart).toMatch(/trackPurchase\(p,/);
    const create = cart.indexOf("await createOrderRows(");
    const fire = cart.lastIndexOf("firePurchases();");
    expect(create).toBeGreaterThan(-1);
    expect(fire).toBeGreaterThan(create);
    // a photo order failing after posters were stored must still report them
    expect(count(cart, /firePurchases\(\)/g)).toBeGreaterThanOrEqual(2);
  });

  it("order creation returns the purchase and passes tracking + product ids", () => {
    const orders = read("lib/db-orders.functions.ts");
    expect(orders).toMatch(
      /purchase\b.*\}\s*;|return \{ ok: true as const, orders: created, purchase \}/s,
    );
    expect(orders).toMatch(/buildOrderPurchase\(/);
    expect(orders).toMatch(/buildPhotoPurchase\(/);
    expect(cart).toMatch(/meta_items:/);
  });

  it("the standalone photo checkout also reports through the server payload", () => {
    const photo = read("routes/photo-printing.tsx");
    expect(photo).toMatch(/if \(result\.purchase\)/);
    expect(photo).toMatch(/trackPurchase\(result\.purchase/);
    expect(photo).toMatch(/test_mode:\s*isTestMode\(\)/);
  });
});

describe("customer data and secrets", () => {
  it("customer file names are never sent to Meta", () => {
    const photo = read("routes/photo-printing.tsx");
    expect(photo).not.toMatch(/trackCustom\([^)]*name:\s*f\.name/);
  });

  it("META_PIXEL_ACCESS_TOKEN appears only in server-side code", () => {
    const withToken = all
      .filter((f) => f.text.includes("META_PIXEL_ACCESS_TOKEN"))
      .map((f) => f.rel)
      .filter((r) => !/\.test\.tsx?$/.test(r));
    for (const r of withToken) {
      expect(r, "token referenced outside server code").toMatch(/(\.server\.ts|\.functions\.ts)$/);
    }
    // and never in a component / route / browser-side library
    expect(withToken.filter((r) => /^(components|routes)\//.test(r))).toEqual([]);
  });

  it("the token is never put in a URL or returned to a caller", () => {
    const server = read("lib/meta-capi.server.ts");
    expect(server).not.toMatch(/access_token=/);
    expect(server).not.toMatch(/console\.(log|info|debug)/);
  });

  it("nothing reads the retired Supabase marketing_secrets for Meta any more", () => {
    expect(read("lib/meta-capi.server.ts")).not.toMatch(/supabase|marketing_secrets/i);
    expect(read("lib/meta-capi.functions.ts")).not.toMatch(/supabase|marketing_secrets/i);
  });
});

describe("one Pixel, one attribution store, one event layer", () => {
  it("only the shared layer loads fbevents.js", () => {
    const loaders = nonTest.filter((f) => /createElement\(e\)|fbq\s*=\s*function/.test(f.text));
    expect(loaders.map((f) => f.rel)).toEqual(["lib/meta-pixel.ts"]);
  });

  it("no second UTM / click-id store is used by the Meta path", () => {
    for (const rel of [
      "lib/meta-pixel.ts",
      "routes/cart.tsx",
      "components/MarketingBoot.tsx",
      "routes/photo-printing.tsx",
    ]) {
      expect(read(rel), rel).not.toMatch(/click-ids|getStoredUtm|getMarketingIdentifiers/);
    }
  });

  it("every custom event the site sends to Meta is on the allow-list (none silently dropped)", () => {
    const used = new Set<string>();
    for (const f of nonTest) {
      if (f.rel === "components/admin/MetaPixelDebugCard.tsx") continue;
      for (const m of f.text.matchAll(/(?:trackCustom|enqueueEvent)\(\s*"([A-Za-z_]+)"/g))
        used.add(m[1]);
    }
    const standard = new Set([
      "PageView",
      "ViewContent",
      "Search",
      "AddToWishlist",
      "AddToCart",
      "InitiateCheckout",
      "Purchase",
      "Lead",
      "Contact",
      "CompleteRegistration",
    ]);
    const internalOnly = /^(select_|custom_design_)/;
    const unknown = [...used].filter(
      (n) =>
        !standard.has(n) &&
        !internalOnly.test(n) &&
        !(CUSTOM_META_EVENTS as readonly string[]).includes(n),
    );
    expect(unknown).toEqual([]);
  });
});
