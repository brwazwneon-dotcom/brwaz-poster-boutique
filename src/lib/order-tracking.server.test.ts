import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  posters: [] as string[],
  throws: false,
  queries: 0,
  updates: [] as unknown[][],
}));
const capi = vi.hoisted(() => ({
  sendPurchaseToMeta: vi.fn(),
  captureRequestFacts: vi.fn(),
  buildAdTracking: vi.fn(),
}));

vi.mock("@/lib/neon.server", () => ({
  sql:
    () =>
    (strings: TemplateStringsArray, ...vals: unknown[]) => {
      if (/update orders/.test(strings.join("?"))) {
        db.updates.push(vals);
        return Promise.resolve([]);
      }
      db.queries++;
      if (db.throws) return Promise.reject(new Error("db down"));
      const ids = vals[0] as string[];
      return Promise.resolve(ids.filter((id) => db.posters.includes(id)).map((id) => ({ id })));
    },
}));
vi.mock("@/lib/meta-capi.server", () => capi);
const tt = vi.hoisted(() => ({ sendTikTokPurchase: vi.fn() }));
vi.mock("@/lib/tiktok-events.server", () => tt);

import {
  buildOrderPurchase,
  buildPhotoPurchase,
  sendPurchaseSafely,
  trackNewOrders,
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

const CTX = Symbol.for("@vercel/request-context");
const g = globalThis as Record<symbol, unknown>;
const FACTS = { ctx: { ip: "41.65.10.20", ua: "TestBrowser/1.0" }, production: true };

beforeEach(() => {
  db.posters = [P1, P2, P3];
  db.throws = false;
  db.queries = 0;
  db.updates = [];
  capi.sendPurchaseToMeta.mockReset();
  tt.sendTikTokPurchase.mockReset();
  tt.sendTikTokPurchase.mockResolvedValue({ ok: true });
  capi.captureRequestFacts.mockReset();
  capi.captureRequestFacts.mockResolvedValue(FACTS);
  capi.buildAdTracking.mockReset();
  capi.buildAdTracking.mockResolvedValue({ purchase_ref: "BRW-1018" });
  delete g[CTX];
  delete process.env.VERCEL;
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete g[CTX];
  delete process.env.VERCEL;
});

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

describe("trackNewOrders — Meta never holds up the order response", () => {
  const purchase = {
    event_id: "purchase_BRW-1018",
    order_id: "BRW-1018",
    value: 1219,
    currency: "EGP" as const,
    content_type: "product" as const,
    content_ids: [],
    contents: [],
    num_items: 2,
  };
  const args = {
    orderIds: ["order-1", "order-2"],
    orderRef: "BRW-1018",
    purchase,
    tracking: { fbp: "x" },
    guestSessionId: "visitor-1",
    phone: "01012345678",
    city: "Cairo",
  };
  const onVercel = () => {
    const registered: Promise<unknown>[] = [];
    g[CTX] = { get: () => ({ waitUntil: (p: Promise<unknown>) => registered.push(p) }) };
    process.env.VERCEL = "1";
    return registered;
  };
  const meta = () => {
    let release!: () => void;
    capi.sendPurchaseToMeta.mockImplementation(
      () => new Promise((r) => (release = () => r({ ok: true }))),
    );
    return { release: () => release() };
  };

  it("the order is released while Meta is still pending; Meta then completes under waitUntil", async () => {
    const registered = onVercel();
    const slowMeta = meta();
    const done = vi.fn();

    const mode = await trackNewOrders(args); // <- what createOrderRows awaits before responding
    done();

    expect(mode).toBe("deferred");
    expect(done).toHaveBeenCalled();
    // Meta has been asked but has NOT answered yet — and the response did not wait for it.
    await new Promise((r) => setTimeout(r, 0));
    expect(capi.sendPurchaseToMeta).toHaveBeenCalledTimes(1);
    slowMeta.release();
    await registered[0];
    expect(capi.sendPurchaseToMeta.mock.calls[0][0].purchase.event_id).toBe("purchase_BRW-1018");
  });

  it("a Meta call that hangs forever cannot delay the response", async () => {
    onVercel();
    capi.sendPurchaseToMeta.mockImplementation(() => new Promise(() => {}));
    const t0 = Date.now();
    await expect(trackNewOrders(args)).resolves.toBe("deferred");
    expect(Date.now() - t0).toBeLessThan(200);
  });

  it("request facts are captured BEFORE the work is deferred and passed along unchanged", async () => {
    const registered = onVercel();
    const order: string[] = [];
    capi.captureRequestFacts.mockImplementation(async () => {
      order.push("capture");
      return FACTS;
    });
    capi.sendPurchaseToMeta.mockImplementation(async () => {
      order.push("send");
      return { ok: true };
    });
    await trackNewOrders(args);
    await registered[0];
    expect(order).toEqual(["capture", "send"]);
    // The send uses the captured facts (the request is gone by then)...
    expect(capi.sendPurchaseToMeta.mock.calls[0][0].facts).toBe(FACTS);
    // ...and the ad context is stored with the same captured IP / user agent.
    expect(capi.buildAdTracking).toHaveBeenCalledWith({ fbp: "x" }, "BRW-1018", FACTS.ctx);
    expect(db.updates).toHaveLength(1);
  });

  it("deferred → one retry with the same payload is allowed; inside the request → none", async () => {
    const registered = onVercel();
    capi.sendPurchaseToMeta.mockResolvedValue({ ok: true });
    await trackNewOrders(args);
    await registered[0];
    expect(capi.sendPurchaseToMeta.mock.calls[0][1]).toEqual({ retries: 1, timeoutMs: 3000 });

    delete g[CTX]; // Vercel but no waitUntil: bounded, in-request
    capi.sendPurchaseToMeta.mockClear();
    await trackNewOrders(args);
    expect(capi.sendPurchaseToMeta.mock.calls[0][1]).toEqual({ retries: 0, timeoutMs: 2500 });
  });

  it("without waitUntil on Vercel the response waits at most the bound for a hanging Meta", async () => {
    process.env.VERCEL = "1";
    vi.useFakeTimers();
    capi.sendPurchaseToMeta.mockImplementation(() => new Promise(() => {}));
    let released = false;
    const p = trackNewOrders(args).then((m) => {
      released = true;
      return m;
    });
    await vi.advanceTimersByTimeAsync(3_400);
    expect(released).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    expect(released).toBe(true);
    await expect(p).resolves.toBe("bounded");
  });

  it("Meta failing (rejecting or returning an error) never fails the order", async () => {
    onVercel();
    capi.sendPurchaseToMeta.mockRejectedValue(new Error("meta down"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(trackNewOrders(args)).resolves.toBe("deferred");
    capi.sendPurchaseToMeta.mockResolvedValue({ ok: false, status: 503 });
    await expect(trackNewOrders(args)).resolves.toBe("deferred");
  });

  it("if even scheduling breaks the order still succeeds", async () => {
    capi.captureRequestFacts.mockRejectedValue(new Error("no request"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(trackNewOrders(args)).resolves.toBe("skipped");
  });

  it("a test order (no purchase) still stores its ad context but sends nothing to Meta", async () => {
    const registered = onVercel();
    await trackNewOrders({ ...args, purchase: null });
    await registered[0];
    expect(capi.sendPurchaseToMeta).not.toHaveBeenCalled();
    expect(db.updates).toHaveLength(1);
  });

  it("a photo order (no order rows) sends its Purchase and touches no orders row", async () => {
    const registered = onVercel();
    capi.sendPurchaseToMeta.mockResolvedValue({ ok: true });
    await trackNewOrders({ ...args, orderIds: [] });
    await registered[0];
    expect(capi.sendPurchaseToMeta).toHaveBeenCalledTimes(1);
    expect(db.updates).toHaveLength(0);
    expect(capi.buildAdTracking).not.toHaveBeenCalled();
  });

  it("nothing to track → nothing is scheduled", async () => {
    await expect(trackNewOrders({ ...args, orderIds: [], purchase: null })).resolves.toBe(
      "skipped",
    );
    expect(capi.captureRequestFacts).not.toHaveBeenCalled();
  });
});

describe("trackNewOrders — the TikTok CompletePayment travels beside the Meta Purchase", () => {
  const purchase = {
    event_id: "purchase_BRW-1018",
    order_id: "BRW-1018",
    value: 1219,
    currency: "EGP" as const,
    content_type: "product" as const,
    content_ids: [],
    contents: [],
    num_items: 2,
  };
  const args = {
    orderIds: ["order-1"],
    orderRef: "BRW-1018",
    purchase,
    tracking: { fbp: "x", ttclid: "E.C.P.abcdefgh12" },
    guestSessionId: "visitor-1",
    phone: "01012345678",
    city: "Cairo",
  };
  const onVercel = () => {
    const registered: Promise<unknown>[] = [];
    g[CTX] = { get: () => ({ waitUntil: (p: Promise<unknown>) => registered.push(p) }) };
    process.env.VERCEL = "1";
    return registered;
  };

  it("sends both, with the SAME purchase (same deterministic event id) and the captured request facts", async () => {
    const registered = onVercel();
    capi.sendPurchaseToMeta.mockResolvedValue({ ok: true });
    await trackNewOrders(args);
    await registered[0];
    expect(capi.sendPurchaseToMeta).toHaveBeenCalledTimes(1);
    expect(tt.sendTikTokPurchase).toHaveBeenCalledTimes(1);
    const a = tt.sendTikTokPurchase.mock.calls[0][0];
    expect(a.purchase.event_id).toBe("purchase_BRW-1018");
    expect(a.purchase).toBe(capi.sendPurchaseToMeta.mock.calls[0][0].purchase);
    expect(a.tracking).toEqual({ fbp: "x", ttclid: "E.C.P.abcdefgh12" });
    expect(a.facts).toBe(FACTS);
    expect(tt.sendTikTokPurchase.mock.calls[0][1]).toEqual({ retries: 1, timeoutMs: 3000 });
  });

  it("inside the request (no waitUntil) it is bounded and not retried", async () => {
    process.env.VERCEL = "1";
    capi.sendPurchaseToMeta.mockResolvedValue({ ok: true });
    await trackNewOrders(args);
    expect(tt.sendTikTokPurchase.mock.calls[0][1]).toEqual({ retries: 0, timeoutMs: 2500 });
  });

  it("a TikTok failure (reject or error result) never affects the Meta Purchase or the order", async () => {
    const registered = onVercel();
    capi.sendPurchaseToMeta.mockResolvedValue({ ok: true });
    tt.sendTikTokPurchase.mockRejectedValue(new Error("tiktok down"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(trackNewOrders(args)).resolves.toBe("deferred");
    await registered[0];
    expect(capi.sendPurchaseToMeta).toHaveBeenCalledTimes(1);
    tt.sendTikTokPurchase.mockResolvedValue({ ok: false, status: 200, body: '{"code":40001}' });
    await expect(trackNewOrders(args)).resolves.toBe("deferred");
  });

  it("a Meta failure never affects TikTok either", async () => {
    const registered = onVercel();
    capi.sendPurchaseToMeta.mockRejectedValue(new Error("meta down"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await trackNewOrders(args);
    await registered[0];
    expect(tt.sendTikTokPurchase).toHaveBeenCalledTimes(1);
  });

  it("a TikTok call that hangs forever cannot delay the response", async () => {
    onVercel();
    capi.sendPurchaseToMeta.mockResolvedValue({ ok: true });
    tt.sendTikTokPurchase.mockImplementation(() => new Promise(() => {}));
    const t0 = Date.now();
    await expect(trackNewOrders(args)).resolves.toBe("deferred");
    expect(Date.now() - t0).toBeLessThan(200);
  });

  it("a test order (no purchase) sends nothing to TikTok", async () => {
    const registered = onVercel();
    await trackNewOrders({ ...args, purchase: null });
    await registered[0];
    expect(tt.sendTikTokPurchase).not.toHaveBeenCalled();
  });

  it("a photo order (no order rows) still sends its CompletePayment", async () => {
    const registered = onVercel();
    capi.sendPurchaseToMeta.mockResolvedValue({ ok: true });
    await trackNewOrders({ ...args, orderIds: [] });
    await registered[0];
    expect(tt.sendTikTokPurchase).toHaveBeenCalledTimes(1);
  });
});
