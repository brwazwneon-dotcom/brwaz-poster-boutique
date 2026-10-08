import { describe, expect, it, vi } from "vitest";
import type { CartItem } from "./cart";
import {
  buildPlaceOrderPayload,
  isFunctionMissing,
  isPriceChanged,
  placeOrderViaRpc,
  serverTotalFrom,
} from "./place-order-client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asUuid = (v: string | null | undefined) => (v && UUID.test(v) ? v : null);

const item = (o: Partial<CartItem> = {}): CartItem => ({
  id: "l1",
  posterId: "7b0d1d52-3f2b-4a0e-9a7e-2f3f8f3b2a11",
  title: "Poster",
  image: "https://x/p.jpg",
  categoryId: null,
  categoryName: "Movies",
  frameType: "pvc",
  size: "30x40",
  color: "black",
  price: 1, // a tampered browser price must never be sent
  qty: 2,
  ...o,
});

const input = (items: CartItem[]) => ({
  items,
  customer: {
    name: "Ahmed",
    phone: "01012345678",
    governorate: "Cairo",
    address: "1 St",
    guestSessionId: "guest-12345678",
  },
  paymentMethod: "cod" as const,
  screenshotPath: null,
  isTest: false,
  tape: true,
  expectedTotal: 339,
  asUuid,
});

describe("buildPlaceOrderPayload", () => {
  it("sends WHAT was ordered and no prices except the expected total", () => {
    const p = buildPlaceOrderPayload(input([item()]));
    expect(p.p_items[0]).toEqual({
      poster_id: "7b0d1d52-3f2b-4a0e-9a7e-2f3f8f3b2a11",
      title: "Poster",
      image: "https://x/p.jpg",
      frame_type: "pvc",
      color: "black",
      size: "30x40",
      qty: 2,
      custom_image_path: "",
    });
    const json = JSON.stringify(p);
    expect(json).not.toMatch(/"price"|unit_price|total_price|shipping|subtotal/);
    expect(p.p_payment).toEqual({
      method: "cod",
      screenshot_path: "",
      is_test: false,
      tape: true,
      expected_total: 339,
    });
    expect(p.p_customer.guest_session_id).toBe("guest-12345678");
  });

  it("custom designs: storage path + metadata (key omitted when absent, never null)", () => {
    const meta = {
      originalFilename: "a.jpg",
      originalMimeType: "image/jpeg",
      originalWidth: 1,
      originalHeight: 1,
      originalFileSize: 1,
    };
    const withMeta = buildPlaceOrderPayload(
      input([
        item({ posterId: "custom-abc-0", customImagePath: "u/a.jpg", customImageMeta: meta }),
      ]),
    );
    expect(withMeta.p_items[0].poster_id).toBeNull();
    expect(withMeta.p_items[0].custom_image_path).toBe("u/a.jpg");
    expect(withMeta.p_items[0]).toHaveProperty("custom_meta", meta);
    expect(buildPlaceOrderPayload(input([item()])).p_items[0]).not.toHaveProperty("custom_meta");
  });

  it("bundles send their posters (uuid or null), not a price", () => {
    const b = item({
      bundle: {
        key: "b",
        label: "B",
        posters: [
          { posterId: "7b0d1d52-3f2b-4a0e-9a7e-2f3f8f3b2a11", title: "P1", image: "i1" },
          { posterId: "not-a-uuid", title: "P2", image: "i2" },
        ],
      },
    });
    const p = buildPlaceOrderPayload(input([b])).p_items[0] as {
      bundle: { posters: { poster_id: string | null }[] };
    };
    expect(p.bundle.posters.map((x) => x.poster_id)).toEqual([
      "7b0d1d52-3f2b-4a0e-9a7e-2f3f8f3b2a11",
      null,
    ]);
  });
});

describe("error classification", () => {
  it("function missing", () => {
    expect(isFunctionMissing({ code: "PGRST202" })).toBe(true);
    expect(isFunctionMissing({ code: "42883" })).toBe(true);
    expect(
      isFunctionMissing({
        message: "Could not find the function public.place_order(...) in the schema cache",
      }),
    ).toBe(true);
    expect(isFunctionMissing({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isFunctionMissing(null)).toBe(false);
  });
  it("price changed + server total", () => {
    const e = { code: "PC001", message: "price_changed", details: "server_total=339.00" };
    expect(isPriceChanged(e)).toBe(true);
    expect(serverTotalFrom(e)).toBe(339);
    expect(isPriceChanged({ code: "22023", message: "invalid phone" })).toBe(false);
    expect(serverTotalFrom({ message: "x" })).toBeNull();
  });
});

describe("placeOrderViaRpc", () => {
  const payload = buildPlaceOrderPayload(input([item()]));
  const rpc = (r: { data?: unknown; error?: unknown }) => ({
    rpc: vi.fn(async () => ({ data: r.data ?? null, error: (r.error ?? null) as never })),
  });

  it("ok", async () => {
    const c = rpc({ data: { order_group_id: "g1", total: "339.00", row_ids: ["a", "b"] } });
    expect(await placeOrderViaRpc(c, payload)).toEqual({
      status: "ok",
      orderGroupId: "g1",
      total: 339,
      rowIds: ["a", "b"],
    });
    expect(c.rpc).toHaveBeenCalledWith("place_order", payload);
  });
  it("unavailable → caller falls back to the legacy insert", async () => {
    expect(
      (await placeOrderViaRpc(rpc({ error: { code: "PGRST202", message: "not found" } }), payload))
        .status,
    ).toBe("unavailable");
  });
  it("price changed", async () => {
    const r = await placeOrderViaRpc(
      rpc({ error: { code: "PC001", message: "price_changed", details: "server_total=419.50" } }),
      payload,
    );
    expect(r).toEqual({ status: "price_changed", serverTotal: 419.5 });
  });
  it("other errors are surfaced (never silently retried through the legacy path)", async () => {
    const r = await placeOrderViaRpc(
      rpc({ error: { code: "22023", message: "invalid phone" } }),
      payload,
    );
    expect(r.status).toBe("error");
  });
  it("garbage response is an error, not a success", async () => {
    expect((await placeOrderViaRpc(rpc({ data: { total: 5 } }), payload)).status).toBe("error");
  });
});
