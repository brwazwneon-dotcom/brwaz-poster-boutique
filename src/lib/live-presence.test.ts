// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ ping: vi.fn(), allowed: vi.fn(), preview: vi.fn() }));
vi.mock("@/lib/live-visitors.functions", () => ({ livePingPublic: m.ping }));
vi.mock("./analytics-env", () => ({ clientTrackingAllowed: m.allowed }));
vi.mock("./preview-mode", () => ({ isPreviewMode: m.preview }));
vi.mock("./analytics", () => ({
  visitorId: () => "0a1b2c3d-1111-2222-3333-444455556666",
  detectDevice: () => "mobile",
}));
vi.mock("./attribution", () => ({
  getAttribution: () => ({ first: null, last: { source: "instagram" } }),
}));

import { notifyLivePresence, stopLivePresenceForTests } from "./live-presence";

function setVisibility(v: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
}

beforeEach(() => {
  vi.useFakeTimers();
  m.ping.mockReset().mockResolvedValue({ ok: true });
  m.allowed.mockReset().mockReturnValue(true);
  m.preview.mockReset().mockReturnValue(false);
  setVisibility("visible");
  // no requestIdleCallback in jsdom -> the module falls back to a short timeout
  stopLivePresenceForTests();
});
afterEach(() => {
  stopLivePresenceForTests();
  vi.useRealTimers();
});

describe("live presence heartbeat (browser)", () => {
  it("sends nothing on non-production hosts or in admin preview mode", async () => {
    m.allowed.mockReturnValue(false);
    notifyLivePresence("/");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(m.ping).not.toHaveBeenCalled();
    m.allowed.mockReturnValue(true);
    m.preview.mockReturnValue(true);
    notifyLivePresence("/");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(m.ping).not.toHaveBeenCalled();
  });

  it("is deferred (not sent synchronously) and then sends only a tiny, query-free payload", async () => {
    notifyLivePresence("/category/movies");
    expect(m.ping).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(m.ping).toHaveBeenCalledTimes(1);
    const body = m.ping.mock.calls[0][0].data;
    expect(Object.keys(body).sort()).toEqual([
      "device",
      "path",
      "screen",
      "source",
      "title",
      "visitorId",
    ]);
    expect(body.path).toBe("/category/movies");
    expect(body.source).toBe("instagram");
  });

  it("beats about every 40 seconds while visible, never every second", async () => {
    notifyLivePresence("/");
    await vi.advanceTimersByTimeAsync(2000);
    m.ping.mockClear();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(m.ping.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(m.ping.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("a hidden tab sends nothing, and resumes when it becomes visible", async () => {
    notifyLivePresence("/");
    await vi.advanceTimersByTimeAsync(2000);
    m.ping.mockClear();
    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(130_000);
    expect(m.ping).not.toHaveBeenCalled();
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(m.ping).toHaveBeenCalledTimes(1);
  });

  it("a route change pings right away, but the same path is throttled to once per 5s", async () => {
    notifyLivePresence("/");
    await vi.advanceTimersByTimeAsync(2000);
    m.ping.mockClear();
    notifyLivePresence("/cart");
    notifyLivePresence("/cart");
    notifyLivePresence("/cart");
    expect(m.ping).toHaveBeenCalledTimes(1);
    expect(m.ping.mock.calls[0][0].data.path).toBe("/cart");
  });

  it("a failing endpoint never throws into the page", async () => {
    m.ping.mockRejectedValue(new Error("network"));
    expect(() => notifyLivePresence("/")).not.toThrow();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(m.ping).toHaveBeenCalled();
  });
});
