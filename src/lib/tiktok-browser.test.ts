// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const relay = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("./tiktok-events.functions", () => ({ sendTikTokEventFromBrowser: relay.fn }));
vi.mock("./analytics", () => ({ visitorId: () => "visitor-1" }));

import { _resetTikTokBrowserForTests, trackTikTok } from "./tiktok-browser";

const P1 = "11111111-1111-4111-8111-111111111111";
type W = Window & {
  ttq?: { track: ReturnType<typeof vi.fn> };
  __brwz_tiktok_pixel_loaded?: boolean;
};
const w = window as W;

const bootPixel = () => {
  w.ttq = { track: vi.fn() };
  w.__brwz_tiktok_pixel_loaded = true;
};

beforeEach(() => {
  vi.useFakeTimers();
  relay.fn.mockReset().mockResolvedValue({ ok: true });
  delete w.ttq;
  delete w.__brwz_tiktok_pixel_loaded;
  window.localStorage.clear();
  document.cookie = "_ttp=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  _resetTikTokBrowserForTests();
});
afterEach(() => vi.useRealTimers());

describe("trackTikTok — pixel", () => {
  it("fires the mapped TikTok event with the shared event_id and sanitised properties", () => {
    bootPixel();
    trackTikTok(
      "AddToCart",
      { content_ids: [P1], value: 230, audience_type: "x", utm_campaign: "y" },
      "evt_11111111",
      {},
    );
    expect(w.ttq!.track).toHaveBeenCalledWith(
      "AddToCart",
      {
        content_type: "product",
        contents: [{ content_id: P1, content_type: "product", quantity: 1 }],
        value: 230,
        currency: "EGP",
      },
      { event_id: "evt_11111111" },
    );
  });

  it("Purchase is sent to the pixel as CompletePayment with the deterministic id — and never relayed", () => {
    bootPixel();
    trackTikTok("Purchase", { value: 1000, order_id: "BRW-1" }, "purchase_BRW-1", { relay: true });
    expect(w.ttq!.track).toHaveBeenCalledWith("CompletePayment", expect.any(Object), {
      event_id: "purchase_BRW-1",
    });
    expect(relay.fn).not.toHaveBeenCalled();
  });

  it("events with no TikTok mapping (PageView, custom Meta events) are ignored", () => {
    bootPixel();
    for (const n of ["PageView", "ViewCart", "photo_page_view", "Nope"])
      trackTikTok(n, {}, "evt_11111111", { relay: true });
    expect(w.ttq!.track).not.toHaveBeenCalled();
    expect(relay.fn).not.toHaveBeenCalled();
  });

  it("holds early events until the pixel boots (bounded wait), then sends them once, in order", () => {
    trackTikTok("ViewContent", {}, "evt_00000001", {});
    trackTikTok("AddToCart", {}, "evt_00000002", {});
    vi.advanceTimersByTime(1000);
    bootPixel();
    vi.advanceTimersByTime(1000);
    expect(w.ttq!.track.mock.calls.map((c) => [c[0], c[2].event_id])).toEqual([
      ["ViewContent", "evt_00000001"],
      ["AddToCart", "evt_00000002"],
    ]);
    vi.advanceTimersByTime(20_000);
    expect(w.ttq!.track).toHaveBeenCalledTimes(2); // no duplicates
  });

  it("if the pixel never boots (blocked / offline) the queue is dropped, not leaked", () => {
    trackTikTok("ViewContent", {}, "evt_00000001", {});
    vi.advanceTimersByTime(30_000);
    bootPixel();
    vi.advanceTimersByTime(5_000);
    expect(w.ttq!.track).not.toHaveBeenCalled();
  });

  it("the pending queue is bounded", () => {
    for (let i = 0; i < 80; i++)
      trackTikTok("ViewContent", {}, `evt_${String(i).padStart(8, "0")}`, {});
    bootPixel();
    vi.advanceTimersByTime(1000);
    expect(w.ttq!.track).toHaveBeenCalledTimes(50);
  });

  it("a throwing pixel never breaks the page", () => {
    bootPixel();
    w.ttq!.track.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => trackTikTok("AddToCart", {}, "evt_11111111", {})).not.toThrow();
  });
});

describe("trackTikTok — Events API relay", () => {
  it("does not relay while the Events API is off", () => {
    bootPixel();
    trackTikTok("AddToCart", {}, "evt_11111111", { relay: false });
    trackTikTok("AddToCart", {}, "evt_22222222", {});
    expect(relay.fn).not.toHaveBeenCalled();
  });

  it("relays with the SAME event_id, the click identifiers and a client id", () => {
    bootPixel();
    window.localStorage.setItem(
      "brw-attribution-v1",
      JSON.stringify({ ttclid: { id: "E.C.P.abcdefgh12", ts: Date.now() } }),
    );
    document.cookie = "_ttp=b6uv1xU3p9zAB5lUBiqX";
    trackTikTok("AddToCart", { content_ids: [P1] }, "evt_11111111", { relay: true });
    const arg = relay.fn.mock.calls[0][0].data;
    expect(arg).toMatchObject({
      event_name: "AddToCart",
      event_id: "evt_11111111",
      ttclid: "E.C.P.abcdefgh12",
      ttp: "b6uv1xU3p9zAB5lUBiqX",
      external_id: "visitor-1",
    });
    expect(w.ttq!.track.mock.calls[0][2].event_id).toBe(arg.event_id);
  });

  it("relays even before the pixel is ready (the server does not need the browser pixel)", () => {
    trackTikTok("AddToCart", {}, "evt_11111111", { relay: true });
    expect(relay.fn).toHaveBeenCalledTimes(1);
  });

  it("customer data goes along only when the caller passes it (Advanced Matching)", () => {
    bootPixel();
    trackTikTok("Lead", {}, "evt_11111111", { relay: true });
    expect(relay.fn.mock.calls[0][0].data.user_data).toEqual({});
    trackTikTok("Lead", {}, "evt_22222222", {
      relay: true,
      userData: { email: "a@b.c", phone: "0101" },
    });
    expect(relay.fn.mock.calls[1][0].data.user_data).toEqual({ email: "a@b.c", phone: "0101" });
  });

  it("a failing relay never surfaces", async () => {
    bootPixel();
    relay.fn.mockRejectedValue(new Error("network"));
    expect(() => trackTikTok("AddToCart", {}, "evt_11111111", { relay: true })).not.toThrow();
    await vi.advanceTimersByTimeAsync(10);
  });
});
