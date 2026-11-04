// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketingConfig } from "./use-marketing";

vi.mock("./preview-mode", () => ({ isPreviewMode: () => false }));

const cfg = {
  pixelId: "",
  pixelEnabled: false,
  capiEnabled: false,
  advancedMatchingEnabled: false,
  ga4MeasurementId: "G-TEST123456",
  ga4Enabled: true,
} as MarketingConfig;

const realLocation = window.location;
function visit(hostname: string) {
  Object.defineProperty(window, "location", {
    value: {
      hostname,
      href: `https://${hostname}/`,
      pathname: "/",
      search: "",
      origin: `https://${hostname}`,
    },
    configurable: true,
  });
}

async function boot() {
  vi.resetModules();
  return import("./ga4");
}

const gaScripts = () => document.querySelectorAll('script[src*="googletagmanager.com"]').length;

function fireEverything(ga: Awaited<ReturnType<typeof boot>>) {
  ga.setGA4Config(cfg);
  ga.gaPageView("/");
  ga.gaEvent("view_item", { content_ids: ["p1"], content_name: "Joker", value: 100 });
  ga.gaEvent("purchase", {
    contents: [{ id: "a", quantity: 1, item_price: 100 }],
    value: 100,
    order_id: "BRW-HOST-1",
  });
}

beforeEach(() => {
  window.localStorage.clear();
  document.head.innerHTML = "";
  delete window.gtag;
  delete window.dataLayer;
  delete window.__brwz_ga4_loaded;
  delete window.__brwz_ga4_id;
});

afterEach(() => {
  Object.defineProperty(window, "location", { value: realLocation, configurable: true });
});

describe("GA4 only runs on production hosts", () => {
  it.each(["brwazwneon.com", "www.brwazwneon.com"])(
    "%s: loads gtag.js and sends page_view and events",
    async (host) => {
      visit(host);
      const ga = await boot();
      ga.setGA4Config(cfg);
      expect(gaScripts()).toBe(1);
      const gtag = vi.fn();
      window.gtag = gtag;
      ga.gaPageView("/");
      ga.gaEvent("view_item", { content_ids: ["p1"], content_name: "Joker", value: 100 });
      ga.gaEvent("purchase", {
        contents: [{ id: "a", quantity: 1, item_price: 100 }],
        value: 100,
        order_id: "BRW-HOST-1",
      });
      const names = gtag.mock.calls.filter((c) => c[0] === "event").map((c) => c[1]);
      expect(names).toEqual(["page_view", "view_item", "purchase"]);
    },
  );

  it.each([
    "brwaz-poster-boutique-abc123-team.vercel.app",
    "brwaz-poster-boutique.vercel.app",
    "localhost",
    "evil.brwazwneon.com.example",
  ])("%s: no script, no dataLayer, no events", async (host) => {
    visit(host);
    const ga = await boot();
    const gtag = vi.fn();
    window.gtag = gtag;
    fireEverything(ga);
    expect(gaScripts()).toBe(0);
    expect(window.dataLayer).toBeUndefined();
    expect(window.__brwz_ga4_loaded).toBeUndefined();
    expect(gtag).not.toHaveBeenCalled();
  });

  it("a Preview never loads GA4 even if gtag was injected by something else", async () => {
    visit("x-y.vercel.app");
    const ga = await boot();
    ga.setGA4Config(cfg);
    const gtag = vi.fn();
    window.gtag = gtag;
    ga.gaPageView("/cart");
    ga.gaEvent("view_cart", { value: 1, contents: [{ id: "a", quantity: 1, item_price: 1 }] });
    expect(gtag).not.toHaveBeenCalled();
    expect(gaScripts()).toBe(0);
  });
});
