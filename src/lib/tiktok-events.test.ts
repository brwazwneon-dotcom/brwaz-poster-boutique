import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIKTOK_PIXEL_CODE,
  TIKTOK_EVENT_MAP,
  TIKTOK_PURCHASE_EVENT,
  TIKTOK_RELAYED_EVENTS,
  TikTokRelayInputSchema,
  cleanTtclid,
  cleanTtp,
  isTikTokRelayedEvent,
  sanitizeTikTokTracking,
  tiktokEventName,
  tiktokPurchaseProperties,
  toTikTokProperties,
} from "./tiktok-events";
import { RELAYED_STANDARD_EVENTS, buildPurchasePayload } from "./meta-events";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";

describe("event vocabulary", () => {
  it("maps the storefront's events onto TikTok's standard events; Purchase is CompletePayment", () => {
    expect(tiktokEventName("ViewContent")).toBe("ViewContent");
    expect(tiktokEventName("AddToCart")).toBe("AddToCart");
    expect(tiktokEventName("InitiateCheckout")).toBe("InitiateCheckout");
    expect(tiktokEventName("Purchase")).toBe("CompletePayment");
    expect(TIKTOK_PURCHASE_EVENT).toBe("CompletePayment");
    expect(tiktokEventName("Lead")).toBe("SubmitForm");
  });

  it("does not map custom Meta-only events or PageView (the base pixel owns page views)", () => {
    for (const n of [
      "PageView",
      "ViewCart",
      "ViewCategory",
      "photo_page_view",
      "OrderConfirmed",
      "x",
    ])
      expect(tiktokEventName(n)).toBeUndefined();
  });

  it("the relay list is exactly the mapped events minus Purchase", () => {
    expect([...TIKTOK_RELAYED_EVENTS].sort()).toEqual(
      Object.keys(TIKTOK_EVENT_MAP)
        .filter((n) => n !== "Purchase")
        .sort(),
    );
    expect(isTikTokRelayedEvent("Purchase")).toBe(false);
    expect(isTikTokRelayedEvent("AddToCart")).toBe(true);
  });

  it("every relayed TikTok event is also a Meta standard event (one vocabulary)", () => {
    for (const n of TIKTOK_RELAYED_EVENTS) expect(RELAYED_STANDARD_EVENTS).toContain(n);
  });

  it("the default pixel is the site's own (public) code", () => {
    expect(DEFAULT_TIKTOK_PIXEL_CODE).toMatch(/^[A-Z0-9]{20}$/);
  });
});

describe("toTikTokProperties — an allow-list, never the raw params", () => {
  it("maps contents, value, currency, name and search text", () => {
    expect(
      toTikTokProperties({
        content_ids: [P1],
        contents: [{ id: P1, quantity: 2, item_price: 230 }],
        content_name: "Messi",
        value: 460,
        search_string: "messi",
      }),
    ).toEqual({
      content_type: "product",
      contents: [{ content_id: P1, content_type: "product", quantity: 2, price: 230 }],
      content_name: "Messi",
      value: 460,
      currency: "EGP",
      query: "messi",
    });
  });

  it("falls back to content_ids with quantity 1", () => {
    expect(toTikTokProperties({ content_ids: [P1, P2] }).contents).toEqual([
      { content_id: P1, content_type: "product", quantity: 1 },
      { content_id: P2, content_type: "product", quantity: 1 },
    ]);
  });

  it("drops audience/UTM enrichment, order refs, file names and anything unknown", () => {
    const out = toTikTokProperties({
      utm_campaign: "x",
      audience_type: "y",
      landing_page: "z",
      order_id: "BRW-1",
      name: "IMG_0470.jpeg",
      email: "a@b.c",
      phone: "0101",
      value: 10,
    });
    expect(Object.keys(out).sort()).toEqual(["content_type", "currency", "value"]);
  });

  it("drops invalid ids and bad money instead of repairing them", () => {
    const out = toTikTokProperties({
      content_ids: ["custom-design-abc", "photo-print-1", "has space", "<x>"],
      value: -5,
    });
    expect(out).toEqual({ content_type: "product" });
  });

  it("copes with junk input", () => {
    expect(toTikTokProperties(undefined)).toEqual({ content_type: "product" });
    expect(toTikTokProperties({ value: "NaN", contents: "no" } as never)).toEqual({
      content_type: "product",
    });
  });
});

describe("tiktokPurchaseProperties — from the stored order only", () => {
  it("carries the value, currency, order id and contents", () => {
    const p = buildPurchasePayload({
      orderRef: "BRW-1049",
      storedTotals: [4550],
      items: [{ id: P1, quantity: 20 }],
      fallbackNumItems: 20,
    })!;
    expect(tiktokPurchaseProperties(p)).toEqual({
      value: 4550,
      currency: "EGP",
      content_type: "product",
      order_id: "BRW-1049",
      contents: [{ content_id: P1, content_type: "product", quantity: 20 }],
    });
    expect(p.event_id).toBe("purchase_BRW-1049"); // the same id the Meta Purchase uses
  });

  it("an order with no known product ids still reports its value without contents", () => {
    const p = buildPurchasePayload({
      orderRef: "BRW-1050",
      storedTotals: [900],
      fallbackNumItems: 3,
    })!;
    const props = tiktokPurchaseProperties(p);
    expect(props).toMatchObject({ value: 900, order_id: "BRW-1050" });
    expect(props).not.toHaveProperty("contents");
  });
});

describe("click identifiers", () => {
  it("accepts TikTok's ttclid / _ttp shapes and rejects junk", () => {
    expect(cleanTtclid("E.C.P.CjwKCAiAabc-123_xyz")).toBe("E.C.P.CjwKCAiAabc-123_xyz");
    expect(cleanTtclid("short")).toBeUndefined();
    expect(cleanTtclid("has space in it")).toBeUndefined();
    expect(cleanTtclid("<script>alert(1)</script>")).toBeUndefined();
    expect(cleanTtclid(123)).toBeUndefined();
    expect(cleanTtp("b6uv1xU3p9zAB5lUBiqXabcDEF")).toBe("b6uv1xU3p9zAB5lUBiqXabcDEF");
    expect(cleanTtp("no")).toBeUndefined();
  });

  it("sanitizeTikTokTracking keeps only well-formed ids and nothing else", () => {
    expect(
      sanitizeTikTokTracking({
        ttclid: "E.C.P.abcdefgh12",
        ttp: "b6uv1xU3p9zAB5lUBiqX",
        fbp: "x",
        phone: "010",
      }),
    ).toEqual({ ttclid: "E.C.P.abcdefgh12", ttp: "b6uv1xU3p9zAB5lUBiqX" });
    expect(sanitizeTikTokTracking({ ttclid: "bad id", ttp: "x" })).toEqual({});
    expect(sanitizeTikTokTracking(undefined)).toEqual({});
  });
});

describe("the public relay's input schema", () => {
  const ok = { event_name: "AddToCart", event_id: "11111111-2222-3333-4444-555555555555" };

  it("accepts an allow-listed event with a client-issued id", () => {
    expect(TikTokRelayInputSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects Purchase, unknown names and server-reserved ids", () => {
    for (const event_name of [
      "Purchase",
      "CompletePayment",
      "OrderConfirmed",
      "Fabricated",
      "PageView",
    ])
      expect(TikTokRelayInputSchema.safeParse({ ...ok, event_name }).success, event_name).toBe(
        false,
      );
    for (const event_id of [
      "purchase_BRW-1018",
      "confirmed_BRW-1018",
      "PURCHASE_x1234567",
      "short",
    ])
      expect(TikTokRelayInputSchema.safeParse({ ...ok, event_id }).success, event_id).toBe(false);
  });

  it("bounds payload size and free-text fields", () => {
    expect(
      TikTokRelayInputSchema.safeParse({ ...ok, custom_data: { a: "x".repeat(7000) } }).success,
    ).toBe(false);
    expect(
      TikTokRelayInputSchema.safeParse({ ...ok, client_user_agent: "x".repeat(2000) }).success,
    ).toBe(false);
    expect(TikTokRelayInputSchema.safeParse({ ...ok, ttclid: "x".repeat(400) }).success).toBe(
      false,
    );
  });
});
