// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildGa4Items, gaEvent, setGA4Config, toGa4Params } from "./ga4";
import type { MarketingConfig } from "./use-marketing";

vi.mock("./preview-mode", () => ({ isPreviewMode: () => false }));

// Built with a cast so this compiles whether or not MarketingConfig carries
// extra flags (ga4.ts only reads the GA4 id and the enabled switch).
const marketingConfig = (over: Partial<MarketingConfig>): MarketingConfig =>
  ({
    pixelId: "",
    pixelEnabled: false,
    capiEnabled: false,
    advancedMatchingEnabled: false,
    ga4MeasurementId: "",
    ga4Enabled: false,
    ...over,
  }) as MarketingConfig;

describe("Meta-shaped params → GA4 ecommerce", () => {
  it("add_to_cart: a single poster becomes one item with price and quantity", () => {
    const p = toGa4Params("add_to_cart", {
      content_ids: ["p1"],
      content_name: "Joker",
      content_type: "product",
      content_category: "Movies",
      value: 233,
      currency: "EGP",
    })!;
    expect(p).toMatchObject({ currency: "EGP", value: 233 });
    expect(p.items).toEqual([
      { item_id: "p1", item_name: "Joker", item_category: "Movies", price: 233, quantity: 1 },
    ]);
    expect(p).not.toHaveProperty("content_ids");
    expect(p).not.toHaveProperty("content_type");
  });

  it("add_to_cart: a bundle (several ids, one price) is ONE item so the value is not repeated", () => {
    const p = toGa4Params("add_to_cart", {
      content_ids: ["a", "b", "c", "d"],
      content_name: "4 Frames Bundle",
      value: 1000,
    })!;
    expect(p.items).toHaveLength(1);
    expect((p.items as Array<{ price: number }>)[0].price).toBe(1000);
    expect(p.value).toBe(1000);
  });

  it("view_item carries items and defaults the currency to EGP", () => {
    const p = toGa4Params("view_item", { content_ids: ["p1"], content_name: "Joker" })!;
    expect(p.currency).toBe("EGP");
    expect((p.items as unknown[]).length).toBe(1);
  });

  it("begin_checkout uses contents (id/quantity/price) and the cart value", () => {
    const p = toGa4Params("begin_checkout", {
      content_ids: ["a", "b"],
      contents: [
        { id: "a", quantity: 2, item_price: 233 },
        { id: "b", quantity: 1, item_price: 300 },
      ],
      num_items: 3,
      value: 766,
      currency: "EGP",
    })!;
    expect(p.items).toEqual([
      { item_id: "a", price: 233, quantity: 2 },
      { item_id: "b", price: 300, quantity: 1 },
    ]);
    expect(p.value).toBe(766);
    expect(p).not.toHaveProperty("contents");
    expect(p).not.toHaveProperty("num_items");
  });

  it("purchase maps order_id → transaction_id with value, currency and items[]", () => {
    const p = toGa4Params("purchase", {
      contents: [{ id: "a", quantity: 3, item_price: 233 }],
      value: 1000,
      currency: "EGP",
      order_id: "BRW-1049",
    })!;
    expect(p.transaction_id).toBe("BRW-1049");
    expect(p.value).toBe(1000);
    expect(p.currency).toBe("EGP");
    expect((p.items as Array<{ quantity: number }>)[0].quantity).toBe(3);
    expect(p).not.toHaveProperty("order_id");
  });

  it("purchase without an order id is NOT sent (it could not be deduplicated)", () => {
    expect(
      toGa4Params("purchase", { value: 500, contents: [{ id: "a", quantity: 1 }] }),
    ).toBeNull();
  });

  it("search maps search_string → search_term", () => {
    expect(toGa4Params("search", { search_string: "messi" })).toMatchObject({
      search_term: "messi",
    });
  });

  it("derives value from item prices when the event has none", () => {
    const p = toGa4Params("view_cart", { contents: [{ id: "a", quantity: 2, item_price: 100 }] })!;
    expect(p.value).toBe(200);
  });

  it("buildGa4Items never returns an item without an id source", () => {
    expect(buildGa4Items({})).toEqual([]);
  });
});

describe("gaEvent: one order = one purchase", () => {
  const gtag = vi.fn();
  beforeEach(() => {
    window.localStorage.clear();
    gtag.mockClear();
    window.gtag = gtag;
    window.__brwz_ga4_loaded = true;
    window.__brwz_ga4_id = "G-TEST123456";
    setGA4Config(marketingConfig({ ga4MeasurementId: "G-TEST123456", ga4Enabled: true }));
    gtag.mockClear();
  });

  const purchase = (id: string) =>
    gaEvent("purchase", {
      contents: [{ id: "a", quantity: 1, item_price: 100 }],
      value: 100,
      currency: "EGP",
      order_id: id,
    });

  it("fires once for a transaction id, however many times it is called", () => {
    purchase("BRW-1");
    purchase("BRW-1");
    purchase("BRW-1");
    const purchases = gtag.mock.calls.filter((c) => c[0] === "event" && c[1] === "purchase");
    expect(purchases).toHaveLength(1);
    expect(purchases[0][2]).toMatchObject({ transaction_id: "BRW-1", currency: "EGP", value: 100 });
  });

  it("still fires for a different order", () => {
    purchase("BRW-A");
    purchase("BRW-B");
    expect(gtag.mock.calls.filter((c) => c[1] === "purchase")).toHaveLength(2);
  });

  it("remembers across a page reload (refresh after purchase does not re-send)", () => {
    purchase("BRW-9");
    // Simulates a reload: module memory is gone, localStorage is not. A fresh
    // import gets a fresh in-memory set but the same storage.
    vi.resetModules();
    return import("./ga4").then(({ gaEvent: fresh, setGA4Config: cfg }) => {
      cfg(marketingConfig({ ga4MeasurementId: "G-TEST123456", ga4Enabled: true }));
      gtag.mockClear();
      fresh("purchase", {
        contents: [{ id: "a", quantity: 1, item_price: 100 }],
        value: 100,
        order_id: "BRW-9",
      });
      expect(gtag.mock.calls.filter((c) => c[1] === "purchase")).toHaveLength(0);
    });
  });

  it("sends nothing when GA4 is not enabled", () => {
    setGA4Config(marketingConfig({}));
    gtag.mockClear();
    purchase("BRW-5");
    expect(gtag).not.toHaveBeenCalled();
  });

  it("a throwing gtag never propagates", () => {
    gtag.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    expect(() => purchase("BRW-7")).not.toThrow();
  });
});
