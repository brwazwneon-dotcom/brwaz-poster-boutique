import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ posters: [] as string[], throws: false, queries: 0 }));
const capi = vi.hoisted(() => ({ sendPurchaseToMeta: vi.fn() }));

vi.mock("@/lib/neon.server", () => ({
  sql: () => (_s: TemplateStringsArray, ids: string[]) => {
    db.queries++;
    if (db.throws) return Promise.reject(new Error("db down"));
    return Promise.resolve(ids.filter((id) => db.posters.includes(id)).map((id) => ({ id })));
  },
}));
vi.mock("@/lib/meta-capi.server", () => ({ sendPurchaseToMeta: capi.sendPurchaseToMeta }));

import {
  buildOrderPurchase,
  buildPhotoPurchase,
  sendPurchaseSafely,
  validatedPurchaseItems,
} from "./order-tracking.server";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const P3 = "33333333-3333-4333-8333-333333333333";
const GHOST = "99999999-9999-4999-8999-999999999999";

const row = (over: Record<string, unknown> = {}) => ({
  order_number: "BRW-1018",
  total_price: "500.00",
  quantity: 1,
  is_test: false,
  ...over,
});

beforeEach(() => {
  db.posters = [P1, P2, P3];
  db.throws = false;
  db.queries = 0;
  capi.sendPurchaseToMeta.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("real order → Purchase", () => {
  it("is built from the STORED totals with the deterministic event id", async () => {
    const p = await buildOrderPurchase({
      stored: [
        row({ total_price: "1130.00" }),
        row({ order_number: "BRW-1019", total_price: "89" }),
      ],
      metaItems: [{ id: P1, quantity: 2 }],
    });
    expect(p).toMatchObject({
      event_id: "purchase_BRW-1018", // first row of the checkout
      order_id: "BRW-1018",
      value: 1219,
      currency: "EGP",
      content_ids: [P1],
      num_items: 2,
    });
  });

  it("the browser cannot change the revenue (extra price/value fields are ignored)", async () => {
    const p = await buildOrderPurchase({
      stored: [row({ total_price: "250" })],
      metaItems: [{ id: P1, quantity: 1, value: 999999, price: 1, total: 5 }] as never,
    });
    expect(p!.value).toBe(250);
    expect(JSON.stringify(p)).not.toMatch(/999999/);
  });

  it("bundle: several posters are represented, each with its quantity", async () => {
    const p = await buildOrderPurchase({
      stored: [row({ total_price: "890", quantity: 2 })],
      metaItems: [
        { id: P1, quantity: 2 },
        { id: P2, quantity: 2 },
        { id: P3, quantity: 2 },
      ],
    });
    expect(p!.content_ids).toEqual([P1, P2, P3]);
    expect(p!.contents).toEqual([
      { id: P1, quantity: 2 },
      { id: P2, quantity: 2 },
      { id: P3, quantity: 2 },
    ]);
    expect(p!.num_items).toBe(6);
  });

  it("quantity > 1: the same poster on two lines merges; ids that are not real posters are dropped", async () => {
    const p = await buildOrderPurchase({
      stored: [row({ total_price: "700", quantity: 5 })],
      metaItems: [
        { id: P1, quantity: 2 },
        { id: P1, quantity: 3 },
        { id: GHOST, quantity: 1 },
      ],
    });
    expect(p!.contents).toEqual([{ id: P1, quantity: 5 }]);
    expect(p!.num_items).toBe(5);
  });

  it("custom design: no invented id — falls back to the stored quantity, keeps the stored value", async () => {
    const p = await buildOrderPurchase({
      stored: [row({ total_price: "249", quantity: 1 })],
      metaItems: [{ id: "custom-6f1c9a-0", quantity: 1 }],
    });
    expect(p!.content_ids).toEqual([]);
    expect(p!.num_items).toBe(1);
    expect(p!.value).toBe(249);
    expect(db.queries).toBe(0); // nothing valid to look up
  });

  it("if the poster lookup fails the Purchase is still built (just without content ids)", async () => {
    db.throws = true;
    const p = await buildOrderPurchase({
      stored: [row({ total_price: "300", quantity: 2 })],
      metaItems: [{ id: P1, quantity: 2 }],
    });
    expect(p).toMatchObject({ value: 300, content_ids: [], num_items: 2 });
  });
});

describe("test order → no Purchase", () => {
  it("any row flagged is_test suppresses the whole checkout's Purchase", async () => {
    expect(await buildOrderPurchase({ stored: [row({ is_test: true })] })).toBeNull();
    expect(
      await buildOrderPurchase({ stored: [row(), row({ order_number: "BRW-2", is_test: true })] }),
    ).toBeNull();
  });

  it("nothing stored → nothing to report", async () => {
    expect(await buildOrderPurchase({ stored: [] })).toBeNull();
  });

  it("a zero-value order is not a Purchase", async () => {
    expect(await buildOrderPurchase({ stored: [row({ total_price: "0" })] })).toBeNull();
  });
});

describe("photo-printing order", () => {
  it("real order → Purchase from the server-computed total", () => {
    const p = buildPhotoPurchase({ orderNumber: "PH-204", totalPrice: 480, photoCount: 25 });
    expect(p).toMatchObject({
      event_id: "purchase_PH-204",
      value: 480,
      currency: "EGP",
      num_items: 25,
      content_category: "Photo Printing",
      content_ids: [],
    });
  });

  it("test mode → no Purchase", () => {
    expect(
      buildPhotoPurchase({
        testMode: true,
        orderNumber: "PH-204",
        totalPrice: 480,
        photoCount: 25,
      }),
    ).toBeNull();
  });

  it("a photo order and a poster order of one checkout get different ids that add up", async () => {
    const posters = await buildOrderPurchase({ stored: [row({ total_price: "1000" })] });
    const photos = buildPhotoPurchase({ orderNumber: "PH-9", totalPrice: 200, photoCount: 8 });
    expect(posters!.event_id).not.toBe(photos!.event_id);
    expect(posters!.value + photos!.value).toBe(1200);
  });
});

describe("validatedPurchaseItems", () => {
  it("rejects malformed input without throwing", async () => {
    expect(await validatedPurchaseItems(undefined)).toEqual([]);
    expect(await validatedPurchaseItems("nope")).toEqual([]);
    expect(await validatedPurchaseItems([{ id: 5, quantity: "x" }, null])).toEqual([]);
    expect(
      await validatedPurchaseItems([
        { id: P1, quantity: 0 },
        { id: P1, quantity: 1000 },
      ]),
    ).toEqual([]);
  });
});

describe("sendPurchaseSafely — Meta can never fail an order", () => {
  const purchase = {
    event_id: "purchase_BRW-1",
    order_id: "BRW-1",
    value: 100,
    currency: "EGP" as const,
    content_type: "product" as const,
    content_ids: [],
    contents: [],
    num_items: 1,
  };

  it("swallows a thrown error", async () => {
    capi.sendPurchaseToMeta.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(sendPurchaseSafely({ purchase })).resolves.toBeUndefined();
  });

  it("logs only a reason, never the payload or customer data", async () => {
    capi.sendPurchaseToMeta.mockResolvedValue({
      ok: false,
      skipped: true,
      reason: "no_access_token",
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await sendPurchaseSafely({ purchase, phone: "01012345678" });
    const out = warn.mock.calls.flat().map(String).join(" ");
    expect(out).toContain("no_access_token");
    expect(out).not.toMatch(/01012345678|purchase_BRW-1|value/);
  });

  it("stays quiet for the expected 'disabled' and 'non-production' cases", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    capi.sendPurchaseToMeta.mockResolvedValue({ ok: true, skipped: true, reason: "capi_disabled" });
    await sendPurchaseSafely({ purchase });
    capi.sendPurchaseToMeta.mockResolvedValue({
      ok: true,
      skipped: true,
      reason: "non_production_host",
    });
    await sendPurchaseSafely({ purchase });
    expect(warn).not.toHaveBeenCalled();
  });
});
