// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const server = vi.hoisted(() => ({ logAnalyticsEventsPublic: vi.fn() }));
const env = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/lib/db-public.functions", () => server);
vi.mock("@/lib/analytics-env", async (orig) => ({
  ...(await orig<typeof import("./analytics-env")>()),
  clientTrackingAllowed: () => env.allowed,
}));
vi.mock("@/lib/preview-mode", () => ({ isPreviewMode: () => false }));
vi.mock("@/lib/analytics", () => ({ visitorId: () => "visitor-1", sessionId: () => "session-1" }));
vi.mock("@/lib/ga4", () => ({ gaEvent: vi.fn() }));

import { dispatchInternalOnly, emitAnalyticsEvent, toInternalEvent } from "./analytics-events";
import {
  MAX_EVENTS_PER_BATCH,
  cleanPath,
  sanitizeAttribution,
  sanitizeEvent,
  sanitizeProps,
} from "./analytics-events-schema";
import { isProductionHostname, parseHostList } from "./analytics-env";

describe("toInternalEvent: only events with no existing internal writer", () => {
  it("ViewCart → view_cart with value and item count", () => {
    expect(
      toInternalEvent("ViewCart", { value: 466, num_items: 2, contents: [{}, {}] }),
    ).toMatchObject({
      event_type: "view_cart",
      value: 466,
      quantity: 2,
      props: { items: 2 },
    });
  });
  it("ViewCategory → view_item_list", () => {
    expect(
      toInternalEvent("ViewCategory", { category_slug: "movies", category_name: "Movies" }),
    ).toMatchObject({
      event_type: "view_item_list",
      props: { list: "category", category: "movies" },
    });
  });
  it("Contact via whatsapp → whatsapp_click; other Contact methods are ignored", () => {
    expect(toInternalEvent("Contact", { method: "whatsapp" })?.event_type).toBe("whatsapp_click");
    expect(toInternalEvent("Contact", { method: "phone" })).toBeNull();
  });
  it("Lead / WhatsAppClick are NOT mapped, so one tap is counted once", () => {
    expect(toInternalEvent("Lead", { method: "whatsapp" })).toBeNull();
    expect(toInternalEvent("WhatsAppClick", {})).toBeNull();
  });
  it("events that already have internal writers are not duplicated", () => {
    for (const n of [
      "PageView",
      "ViewContent",
      "AddToCart",
      "InitiateCheckout",
      "Purchase",
      "Search",
      "AddToWishlist",
    ]) {
      expect(toInternalEvent(n, { value: 1 })).toBeNull();
    }
  });
  it("select_item passes through with the poster id", () => {
    const id = "8cf1b532-e15e-4d3e-82bb-71d53e2de197";
    expect(
      toInternalEvent("select_item", { poster_id: id, category: "movies", list: "category" }),
    ).toMatchObject({
      event_type: "select_item",
      poster_id: id,
      props: { category: "movies", list: "category" },
    });
  });
  it("custom design events carry counts and choices only", () => {
    const e = toInternalEvent("custom_design_add_to_cart", {
      count: 2,
      frame_type: "pvc",
      size: "30x40",
      value: 466,
      file_name: "IMG_0470.jpeg",
      image_url: "https://res.cloudinary.com/x.jpg",
      phone: "01017845551",
    })!;
    expect(e.props).toEqual({ count: 2, frame_type: "pvc", size: "30x40" });
    expect(e.value).toBe(466);
    expect(JSON.stringify(e)).not.toMatch(/IMG_0470|cloudinary|01017845551/);
  });
});

describe("sanitizing what reaches the database", () => {
  it("props keep only allow-listed business keys — PII keys are dropped", () => {
    expect(
      sanitizeProps({
        category: "movies",
        phone: "010",
        name: "Ahmed",
        address: "Cairo",
        email: "a@b.c",
        size: "20x30",
      }),
    ).toEqual({ category: "movies", size: "20x30" });
  });
  it("paths are pathname-only", () => {
    expect(cleanPath("/cart?token=secret&phone=010#x")).toBe("/cart");
  });
  it("unknown event types are rejected", () => {
    expect(sanitizeEvent({ event_type: "drop table" })).toBeNull();
    expect(sanitizeEvent({ event_type: "select_item", value: -5 })?.value).toBeNull();
    expect(
      sanitizeEvent({ event_type: "view_cart", poster_id: "not-a-uuid" })?.poster_id,
    ).toBeNull();
  });
  it("attribution is forced into the taxonomy on the server", () => {
    const a = sanitizeAttribution({
      first_source: "ig",
      last_source: "l.instagram.com",
      last_campaign: "c",
      first_medium: "PAID",
    });
    expect(a.first_source).toBe("instagram");
    expect(a.last_source).toBe("instagram");
    expect(a.first_medium).toBe("paid");
  });
});

describe("dev / production host guard", () => {
  it("only the production hostnames count", () => {
    expect(isProductionHostname("brwazwneon.com")).toBe(true);
    expect(isProductionHostname("www.brwazwneon.com")).toBe(true);
    expect(isProductionHostname("BRWAZWNEON.com:443")).toBe(true);
    expect(isProductionHostname("localhost:8080")).toBe(false);
    expect(isProductionHostname("127.0.0.1")).toBe(false);
    expect(isProductionHostname("brwaz-poster-boutique-abc.vercel.app")).toBe(false);
    expect(isProductionHostname("evil-brwazwneon.com")).toBe(false);
    expect(isProductionHostname("")).toBe(false);
    expect(isProductionHostname(null)).toBe(false);
  });
  it("a real staging domain can be added explicitly", () => {
    expect(
      isProductionHostname(
        "staging.brwazwneon.com",
        parseHostList("staging.brwazwneon.com, other.example"),
      ),
    ).toBe(true);
  });
});

describe("emitAnalyticsEvent: batching, dedupe, failure isolation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    server.logAnalyticsEventsPublic.mockReset();
    server.logAnalyticsEventsPublic.mockResolvedValue({ ok: true, stored: 1 });
    env.allowed = true;
    window.history.pushState({}, "", "/cart");
  });

  it("batches events into ONE request after a short delay", async () => {
    emitAnalyticsEvent("ViewCart", { value: 100 });
    dispatchInternalOnly("select_item", { poster_id: "8cf1b532-e15e-4d3e-82bb-71d53e2de197" });
    expect(server.logAnalyticsEventsPublic).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(server.logAnalyticsEventsPublic).toHaveBeenCalledTimes(1);
    const { data } = server.logAnalyticsEventsPublic.mock.calls[0][0];
    expect(data.visitor_id).toBe("visitor-1");
    expect(data.session_id).toBe("session-1");
    expect(data.events.map((e: { event_type: string }) => e.event_type)).toEqual([
      "view_cart",
      "select_item",
    ]);
    expect(data.events[0].path).toBe("/cart");
  });

  it("the same event fired twice within seconds (MarketingBoot + cart page) is stored once", async () => {
    window.history.pushState({}, "", "/cart");
    emitAnalyticsEvent("ViewCart", { value: 250 });
    emitAnalyticsEvent("ViewCart", { value: 250 });
    await vi.advanceTimersByTimeAsync(2000);
    const events = server.logAnalyticsEventsPublic.mock.calls.flatMap((c) => c[0].data.events);
    expect(
      events.filter(
        (e: { event_type: string; value: number }) =>
          e.event_type === "view_cart" && e.value === 250,
      ),
    ).toHaveLength(1);
  });

  it("nothing is sent from a non-production host", async () => {
    env.allowed = false;
    emitAnalyticsEvent("ViewCart", { value: 999 });
    dispatchInternalOnly("select_banner", { banner_id: "b1" });
    await vi.advanceTimersByTimeAsync(3000);
    expect(server.logAnalyticsEventsPublic).not.toHaveBeenCalled();
  });

  it("a failing analytics request never throws into the page", async () => {
    server.logAnalyticsEventsPublic.mockRejectedValue(new Error("network down"));
    expect(() => emitAnalyticsEvent("ViewCart", { value: 321 })).not.toThrow();
    await expect(vi.advanceTimersByTimeAsync(3000)).resolves.not.toThrow();
  });

  it("a synchronously throwing request never throws into the page", async () => {
    server.logAnalyticsEventsPublic.mockImplementation(() => {
      throw new Error("sync boom");
    });
    emitAnalyticsEvent("ViewCart", { value: 654 });
    await expect(vi.advanceTimersByTimeAsync(3000)).resolves.not.toThrow();
  });

  it("dispatchInternalOnly reports whether the event stays internal (so Meta is skipped)", () => {
    expect(dispatchInternalOnly("select_item", {})).toBe(true);
    expect(dispatchInternalOnly("custom_design_start", { count: 1 })).toBe(true);
    expect(dispatchInternalOnly("ViewCart", {})).toBe(false);
    expect(dispatchInternalOnly("photo_page_view", {})).toBe(false);
  });

  it("caps a batch at the server limit", async () => {
    for (let i = 0; i < MAX_EVENTS_PER_BATCH + 5; i++) {
      window.history.pushState({}, "", `/cart/${i}`);
      emitAnalyticsEvent("ViewCart", { value: 1000 + i });
    }
    await vi.advanceTimersByTimeAsync(4000);
    for (const call of server.logAnalyticsEventsPublic.mock.calls) {
      expect(call[0].data.events.length).toBeLessThanOrEqual(MAX_EVENTS_PER_BATCH);
    }
  });
});
