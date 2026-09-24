import { describe, expect, it } from "vitest";
import {
  RelayInputSchema,
  buildPurchasePayload,
  cleanFbc,
  cleanFbp,
  cleanMoney,
  cleanSourceUrl,
  isAllowedCustomEvent,
  isCatalogId,
  isRelayedEvent,
  metaContentsFromCart,
  purchaseCustomData,
  purchaseEventId,
  sanitizeMetaParams,
} from "./meta-events";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const P3 = "33333333-3333-4333-8333-333333333333";

describe("event allow-list", () => {
  it("relays the events the site really sends", () => {
    for (const n of [
      "PageView",
      "ViewContent",
      "Search",
      "AddToCart",
      "InitiateCheckout",
      "Lead",
      "Contact",
      "ViewCategory",
      "ViewCart",
    ])
      expect(isRelayedEvent(n)).toBe(true);
  });

  it("never lets the browser relay Purchase, OrderConfirmed or anything unknown", () => {
    for (const n of [
      "Purchase",
      "OrderConfirmed",
      "purchase",
      "Refund",
      "FakeEvent",
      "",
      "OrderCreated",
    ])
      expect(isRelayedEvent(n)).toBe(false);
  });

  it("custom-design events are not Meta events (internal analytics only)", () => {
    for (const n of [
      "custom_design_start",
      "custom_design_upload",
      "custom_design_completed",
      "custom_design_add_to_cart",
      "select_item",
    ]) {
      expect(isRelayedEvent(n)).toBe(false);
      expect(isAllowedCustomEvent(n)).toBe(false);
    }
  });
});

describe("relay input schema (the public endpoint)", () => {
  const ok = { event_name: "AddToCart", event_id: "11111111-2222-3333-4444-555555555555" };

  it("accepts a normal event", () => {
    expect(RelayInputSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects arbitrary event names, including a forged Purchase", () => {
    for (const event_name of ["Purchase", "Whatever", "OrderConfirmed", "A".repeat(65)])
      expect(RelayInputSchema.safeParse({ ...ok, event_name }).success).toBe(false);
  });

  it("rejects server-issued or malformed event ids", () => {
    for (const event_id of ["purchase_BRW-1018", "confirmed_BRW-1", "short", "has space here!"])
      expect(RelayInputSchema.safeParse({ ...ok, event_id }).success).toBe(false);
  });

  it("rejects oversized custom_data", () => {
    const big = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`k${i}`, "x"]));
    expect(RelayInputSchema.safeParse({ ...ok, custom_data: big }).success).toBe(false);
    expect(
      RelayInputSchema.safeParse({ ...ok, custom_data: { note: "x".repeat(7000) } }).success,
    ).toBe(false);
  });
});

describe("sanitizeMetaParams", () => {
  it("keeps well-formed commerce fields and forces EGP", () => {
    const out = sanitizeMetaParams({
      content_ids: [P1, P2],
      contents: [{ id: P1, quantity: 2, item_price: 250 }],
      content_type: "product",
      content_name: "Joker",
      value: "890",
      currency: "USD",
      num_items: 3,
    });
    expect(out).toEqual({
      content_ids: [P1, P2],
      contents: [{ id: P1, quantity: 2, item_price: 250 }],
      content_type: "product",
      content_name: "Joker",
      value: 890,
      currency: "EGP",
      num_items: 3,
    });
  });

  it("drops customer file names and any unlisted key", () => {
    const out = sanitizeMetaParams({
      name: "IMG_0470.jpeg",
      filename: "IMG_0470.jpeg",
      title: "secret",
      phone: "01012345678",
      count: 1,
    });
    expect(out).toEqual({ count: 1 });
    expect(JSON.stringify(out)).not.toMatch(/IMG_0470|01012345678/);
  });

  it("never emits a custom-design or service line id as a content id", () => {
    const out = sanitizeMetaParams({
      content_ids: ["custom-6f1c9a-0", "photo-print-4x6", P1],
      contents: [
        { id: "custom-6f1c9a-0", quantity: 1 },
        { id: P1, quantity: 1 },
      ],
    });
    expect(out.content_ids).toEqual([P1]);
    expect(out.contents).toEqual([{ id: P1, quantity: 1 }]);
  });

  it("money must be a real bounded number, never text like '890 جنيه'", () => {
    expect(sanitizeMetaParams({ value: "890 جنيه" })).toEqual({});
    expect(sanitizeMetaParams({ value: -5 })).toEqual({});
    expect(sanitizeMetaParams({ value: 1e12 })).toEqual({});
    expect(sanitizeMetaParams({ value: Number.NaN })).toEqual({});
    expect(cleanMoney("1200.456")).toBe(1200.46);
  });
});

describe("metaContentsFromCart — content ids and contents", () => {
  const poster = (id: string, qty = 1, price = 250) => ({ posterId: id, qty, price });

  it("normal products: stable id, quantity and unit price; num_items counts units", () => {
    const c = metaContentsFromCart([poster(P1, 2, 250), poster(P2, 1, 300)]);
    expect(c.content_ids).toEqual([P1, P2]);
    expect(c.contents).toEqual([
      { id: P1, quantity: 2, item_price: 250 },
      { id: P2, quantity: 1, item_price: 300 },
    ]);
    expect(c.num_items).toBe(3);
  });

  it("quantity > 1 of the same poster on two lines merges into one content", () => {
    const c = metaContentsFromCart([poster(P1, 2), poster(P1, 3)]);
    expect(c.contents).toEqual([{ id: P1, quantity: 5, item_price: 250 }]);
    expect(c.num_items).toBe(5);
  });

  it("a bundle lists EVERY poster (× line quantity) and uses no bundle key as an id", () => {
    const c = metaContentsFromCart([
      {
        posterId: "bundle-4-frames",
        qty: 2,
        price: 890,
        bundle: { posters: [{ posterId: P1 }, { posterId: P2 }, { posterId: P3 }] },
      },
    ]);
    expect(c.content_ids).toEqual([P1, P2, P3]);
    expect(c.contents).toEqual([
      { id: P1, quantity: 2 },
      { id: P2, quantity: 2 },
      { id: P3, quantity: 2 },
    ]);
    expect(c.num_items).toBe(6);
    expect(JSON.stringify(c)).not.toContain("bundle-4-frames");
  });

  it("a custom design has NO catalog id, but still counts as an item", () => {
    const c = metaContentsFromCart([
      {
        posterId: "custom-abc-0",
        qty: 1,
        price: 249,
        customImageMeta: { originalFilename: "IMG_1.jpg" },
      },
      poster(P1, 1),
    ]);
    expect(c.content_ids).toEqual([P1]);
    expect(c.num_items).toBe(2);
    expect(JSON.stringify(c)).not.toMatch(/custom-abc|IMG_1/);
  });

  it("a cart of only custom designs sends no content ids at all", () => {
    const c = metaContentsFromCart([
      { posterId: "custom-x-0", qty: 2, price: 249, customImagePath: "p" },
    ]);
    expect(c.content_ids).toEqual([]);
    expect(c.contents).toEqual([]);
    expect(c.num_items).toBe(2);
  });
});

describe("Purchase payload (from stored order data)", () => {
  it("event id is deterministic and tied to the order number", () => {
    expect(purchaseEventId("BRW-1018")).toBe("purchase_BRW-1018");
    expect(purchaseEventId("BRW-1018")).toBe(purchaseEventId("BRW-1018"));
    expect(purchaseEventId("bad id!")).toBeNull();
    expect(purchaseEventId(undefined)).toBeNull();
  });

  it("value is the sum of the STORED row totals, in EGP, as a number", () => {
    const p = buildPurchasePayload({
      orderRef: "BRW-1018",
      storedTotals: [1130.5, 250, "89" as unknown as number],
      items: [{ id: P1, quantity: 2 }],
      fallbackNumItems: 3,
    })!;
    expect(p.event_id).toBe("purchase_BRW-1018");
    expect(p.value).toBe(1469.5);
    expect(p.currency).toBe("EGP");
    expect(typeof p.value).toBe("number");
    expect(p.order_id).toBe("BRW-1018");
    expect(p.content_ids).toEqual([P1]);
    expect(p.num_items).toBe(2);
  });

  it("no valid content ids → falls back to the stored quantities; no fake ids", () => {
    const p = buildPurchasePayload({
      orderRef: "BRW-7",
      storedTotals: [500],
      items: [{ id: "custom-x-0", quantity: 1 }],
      fallbackNumItems: 4,
    })!;
    expect(p.content_ids).toEqual([]);
    expect(p.num_items).toBe(4);
    expect(purchaseCustomData(p)).not.toHaveProperty("content_ids");
  });

  it("nothing to report → no Purchase", () => {
    expect(
      buildPurchasePayload({ orderRef: "BRW-1", storedTotals: [0], fallbackNumItems: 1 }),
    ).toBeNull();
    expect(
      buildPurchasePayload({ orderRef: "bad id", storedTotals: [10], fallbackNumItems: 1 }),
    ).toBeNull();
  });

  it("browser and server derive the same custom_data from the same payload", () => {
    const p = buildPurchasePayload({
      orderRef: "BRW-9",
      storedTotals: [890],
      items: [{ id: P1, quantity: 1 }],
      fallbackNumItems: 1,
    })!;
    expect(sanitizeMetaParams(purchaseCustomData(p))).toEqual(purchaseCustomData(p));
  });
});

describe("browser identifiers and source url", () => {
  it("accepts real _fbp/_fbc shapes, rejects junk", () => {
    expect(cleanFbp("fb.1.1596403881668.1116446470")).toBeDefined();
    expect(cleanFbp("<script>")).toBeUndefined();
    expect(cleanFbc("fb.1.1554763741205.AbCdEfGhIjKlMnOp")).toBeDefined();
    expect(cleanFbc("fb.1.1554763741205.")).toBeUndefined();
  });

  it("event_source_url must be https on a production host", () => {
    expect(cleanSourceUrl("https://brwazwneon.com/cart?x=1#frag")).toBe(
      "https://brwazwneon.com/cart?x=1",
    );
    expect(cleanSourceUrl("https://www.brwazwneon.com/")).toBeDefined();
    expect(cleanSourceUrl("http://localhost:8080/cart")).toBeUndefined();
    expect(cleanSourceUrl("https://evil.example/brwazwneon.com")).toBeUndefined();
    expect(cleanSourceUrl("http://brwazwneon.com/")).toBeUndefined();
  });

  it("catalog ids are stable ids only", () => {
    expect(isCatalogId(P1)).toBe(true);
    expect(isCatalogId("custom-1")).toBe(false);
    expect(isCatalogId("A poster title")).toBe(false);
    expect(isCatalogId(42)).toBe(false);
  });
});
