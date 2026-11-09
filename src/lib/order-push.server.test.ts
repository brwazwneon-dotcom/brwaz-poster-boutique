import { describe, expect, it, vi } from "vitest";
import { buildOrderPushMessage, sendOrderPush, type PushEnv } from "./order-push.server";

const prod: PushEnv = { NTFY_TOPIC: "brwaz-orders-x7k2p9q4", VERCEL_ENV: "production" };
const order = {
  orderRef: "BRW-1042",
  value: 1245.4,
  city: "الجيزة",
  kind: "frames" as const,
  numItems: 3,
};
const ok = () => vi.fn().mockResolvedValue({ ok: true, status: 200 });

describe("buildOrderPushMessage", () => {
  it("has the order number, the total, what it is and where it goes", () => {
    const m = buildOrderPushMessage(order);
    expect(m.title).toBe("🛍️ طلب جديد BRW-1042");
    expect(m.message).toBe("1245 جنيه • براويز (3) • 📍 الجيزة");
  });
  it("works with only the essentials", () => {
    expect(buildOrderPushMessage({ orderRef: "A1", value: 90 }).message).toBe("90 جنيه");
    expect(buildOrderPushMessage({ orderRef: "A1", value: 90, kind: "photos" }).message).toBe(
      "90 جنيه • طباعة صور",
    );
  });
  it("keeps free text short and on one line", () => {
    const m = buildOrderPushMessage({ ...order, city: `x\ny${"z".repeat(200)}` });
    expect(m.message).not.toMatch(/[\r\n]/);
    expect(m.message.length).toBeLessThan(120);
  });
  it("has no field for a name, a phone number or an address", () => {
    const m = buildOrderPushMessage({
      ...order,
      customer_name: "Ahmed",
      phone: "01012345678",
      address: "12 Street",
    } as never);
    expect(JSON.stringify(m)).not.toMatch(/Ahmed|01012345678|Street/);
  });
});

describe("sendOrderPush", () => {
  it("posts one JSON message to the topic", async () => {
    const f = ok();
    expect(await sendOrderPush(order, { env: prod, fetchImpl: f })).toEqual({ sent: true });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://ntfy.sh");
    const body = JSON.parse(init.body);
    expect(body.topic).toBe("brwaz-orders-x7k2p9q4");
    expect(body.title).toContain("BRW-1042");
  });
  it("does nothing until NTFY_TOPIC is set", async () => {
    const f = ok();
    expect(await sendOrderPush(order, { env: { VERCEL_ENV: "production" }, fetchImpl: f })).toEqual(
      { sent: false, reason: "not_configured" },
    );
    expect(f).not.toHaveBeenCalled();
  });
  it("stays silent outside the production deployment", async () => {
    const f = ok();
    for (const VERCEL_ENV of ["preview", "development", undefined]) {
      expect(await sendOrderPush(order, { env: { ...prod, VERCEL_ENV }, fetchImpl: f })).toEqual({
        sent: false,
        reason: "not_production",
      });
    }
    expect(f).not.toHaveBeenCalled();
  });
  it("refuses a topic that is not a plain safe name", async () => {
    const f = ok();
    for (const NTFY_TOPIC of ["short", "has space here", "a/b/../c-12345", "x".repeat(70)]) {
      expect(await sendOrderPush(order, { env: { ...prod, NTFY_TOPIC }, fetchImpl: f })).toEqual({
        sent: false,
        reason: "bad_topic",
      });
    }
    expect(f).not.toHaveBeenCalled();
  });
  it("only an https server of the owner's choice is used, otherwise ntfy.sh", async () => {
    const f = ok();
    await sendOrderPush(order, {
      env: { ...prod, NTFY_SERVER: "https://push.example.com" },
      fetchImpl: f,
    });
    expect(f.mock.calls[0][0]).toBe("https://push.example.com");
    await sendOrderPush(order, { env: { ...prod, NTFY_SERVER: "http://evil.test" }, fetchImpl: f });
    expect(f.mock.calls[1][0]).toBe("https://ntfy.sh");
  });
  it("never throws, whatever goes wrong, and never prints the topic", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const boom = vi.fn().mockRejectedValue(new Error("network down brwaz-orders-x7k2p9q4"));
    expect(await sendOrderPush(order, { env: prod, fetchImpl: boom })).toEqual({
      sent: false,
      reason: "failed",
    });
    const bad = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    expect(await sendOrderPush(order, { env: prod, fetchImpl: bad })).toEqual({
      sent: false,
      reason: "failed",
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("x7k2p9q4");
    warn.mockRestore();
  });
  it("gives up when the service does not answer", async () => {
    const hang = vi.fn(
      (_u: string, init: { signal: AbortSignal }) =>
        new Promise((_r, reject) =>
          init.signal.addEventListener("abort", () => reject(new Error("aborted"))),
        ),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await sendOrderPush(order, {
      env: prod,
      fetchImpl: hang as never,
      timeoutMs: 20,
    });
    expect(r).toEqual({ sent: false, reason: "failed" });
    warn.mockRestore();
  });
});
