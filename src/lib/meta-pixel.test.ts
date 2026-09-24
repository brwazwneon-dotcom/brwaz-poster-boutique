// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ allowed: true, preview: false }));
const relay = vi.hoisted(() => ({ sendCapiEvent: vi.fn() }));
const ga = vi.hoisted(() => ({ gaEvent: vi.fn() }));
const internal = vi.hoisted(() => ({ emitAnalyticsEvent: vi.fn() }));

vi.mock("./meta-capi.functions", () => relay);
vi.mock("./ga4", () => ga);
vi.mock("./preview-mode", () => ({ isPreviewMode: () => env.preview }));
vi.mock("./landing-pages", () => ({ getAudienceAttribution: () => null }));
vi.mock("./analytics", () => ({ visitorId: () => "visitor-1", sessionId: () => "session-1" }));
vi.mock("./analytics-env", async (orig) => ({
  ...(await orig<typeof import("./analytics-env")>()),
  clientTrackingAllowed: () => env.allowed,
}));
vi.mock("./analytics-events", () => ({
  emitAnalyticsEvent: internal.emitAnalyticsEvent,
  // The real list lives in analytics-events.ts; these are the custom-design ones.
  dispatchInternalOnly: (name: string) => {
    const isInternal = /^(custom_design_|select_)/.test(name);
    if (isInternal) internal.emitAnalyticsEvent(name, {}, { ga: true });
    return isInternal;
  },
}));

const P1 = "11111111-1111-4111-8111-111111111111";
const cfg = (over: Record<string, unknown> = {}) =>
  ({
    ready: true,
    pixelId: "4466074806960925",
    pixelEnabled: true,
    capiEnabled: true,
    advancedMatchingEnabled: false,
    ga4MeasurementId: "",
    ga4Enabled: false,
    ...over,
  }) as never;

type Fbq = ReturnType<typeof vi.fn>;
let fbq: Fbq;

async function load() {
  vi.resetModules();
  const m = await import("./meta-pixel");
  return m;
}

beforeEach(() => {
  env.allowed = true;
  env.preview = false;
  relay.sendCapiEvent.mockReset();
  relay.sendCapiEvent.mockResolvedValue({ ok: true });
  ga.gaEvent.mockReset();
  internal.emitAnalyticsEvent.mockReset();
  document.head.innerHTML = "<script></script>";
  document.cookie = "_fbp=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  window.localStorage.clear();
  delete (window as unknown as Record<string, unknown>).fbq;
  delete (window as unknown as Record<string, unknown>)._fbq;
  delete (window as unknown as Record<string, unknown>).__brwz_pixel_loaded;
  delete (window as unknown as Record<string, unknown>).__brwz_pixel_id;
  fbq = vi.fn();
});

/** Replace the real fbq queue function with a spy once the pixel snippet has run. */
const armFbq = () => {
  (window as unknown as { fbq: Fbq }).fbq = fbq;
};
const trackCalls = () => fbq.mock.calls.filter((c) => c[0] === "track" || c[0] === "trackCustom");

describe("host protection (localhost / preview / development)", () => {
  it("a non-production host never loads the Pixel, relays, or mirrors anything", async () => {
    env.allowed = false;
    const m = await load();
    m.setMarketingConfig(cfg());
    m.trackEvent("PageView");
    m.trackEvent("ViewContent", { content_ids: [P1] });
    m.trackCustom("ViewCart", { value: 100 });
    m.trackPurchase({
      event_id: "purchase_BRW-1",
      order_id: "BRW-1",
      value: 500,
      currency: "EGP",
      content_type: "product",
      content_ids: [],
      contents: [],
      num_items: 1,
    });
    expect(document.querySelectorAll('script[src*="fbevents"]').length).toBe(0);
    expect(window.fbq).toBeUndefined();
    expect(relay.sendCapiEvent).not.toHaveBeenCalled();
    expect(ga.gaEvent).not.toHaveBeenCalled();
  });

  it("the admin storefront preview never sends events", async () => {
    env.preview = true;
    const m = await load();
    m.setMarketingConfig(cfg());
    armFbq();
    m.trackEvent("ViewContent", { content_ids: [P1] });
    expect(trackCalls()).toHaveLength(0);
    expect(relay.sendCapiEvent).not.toHaveBeenCalled();
  });
});

describe("Pixel loading", () => {
  it("loads fbevents.js exactly once however many times the config is applied", async () => {
    const m = await load();
    for (let i = 0; i < 4; i++) m.setMarketingConfig(cfg());
    expect(document.querySelectorAll('script[src*="fbevents.js"]').length).toBe(1);
  });

  it("does not load the Pixel while disabled, or before the settings arrive", async () => {
    const m = await load();
    m.setMarketingConfig(cfg({ pixelEnabled: false }));
    m.setMarketingConfig(cfg({ ready: false }));
    expect(document.querySelectorAll('script[src*="fbevents.js"]').length).toBe(0);
  });
});

describe("one event_id for Pixel and Conversions API", () => {
  it("the same id goes to fbq (eventID) and to the relay", async () => {
    const m = await load();
    m.setMarketingConfig(cfg());
    armFbq();
    m.trackEvent("ViewContent", {
      content_ids: [P1],
      content_name: "Joker",
      content_type: "product",
    });
    const [, name, params, opts] = trackCalls()[0];
    expect(name).toBe("ViewContent");
    expect(params).toMatchObject({ content_ids: [P1], content_name: "Joker" });
    expect(opts.eventID).toBeTruthy();
    expect(relay.sendCapiEvent).toHaveBeenCalledTimes(1);
    expect(relay.sendCapiEvent.mock.calls[0][0].data.event_id).toBe(opts.eventID);
    expect(relay.sendCapiEvent.mock.calls[0][0].data.event_name).toBe("ViewContent");
  });

  it("no relay when CAPI is off; the Pixel still fires", async () => {
    const m = await load();
    m.setMarketingConfig(cfg({ capiEnabled: false }));
    armFbq();
    m.trackEvent("PageView");
    expect(trackCalls()).toHaveLength(1);
    expect(relay.sendCapiEvent).not.toHaveBeenCalled();
  });

  it("a failing relay never breaks the page (Pixel already fired, no throw)", async () => {
    relay.sendCapiEvent.mockRejectedValue(new Error("network"));
    const m = await load();
    m.setMarketingConfig(cfg());
    armFbq();
    expect(() => m.trackEvent("AddToCart", { value: 250 })).not.toThrow();
    expect(trackCalls()).toHaveLength(1);
    await Promise.resolve();
  });

  it("attaches fbp, fbc (built from a stored fbclid) and the visitor id as external_id", async () => {
    document.cookie = "_fbp=fb.1.1596403881668.1116446470";
    window.localStorage.setItem(
      "brw-attribution-v1",
      JSON.stringify({ clickIds: { fbclid: "AbCdEf123456", ts: Date.now() } }),
    );
    const m = await load();
    m.setMarketingConfig(cfg());
    armFbq();
    m.trackEvent("PageView");
    const d = relay.sendCapiEvent.mock.calls[0][0].data;
    expect(d.fbp).toBe("fb.1.1596403881668.1116446470");
    expect(d.fbc).toMatch(/^fb\.1\.\d+\.AbCdEf123456$/);
    expect(d.external_id).toBe("visitor-1");
  });
});

describe("early events are not lost", () => {
  it("an event fired before the settings arrive is replayed exactly once afterwards", async () => {
    const m = await load();
    m.setMarketingConfig(cfg({ ready: false }));
    m.trackEvent("PageView");
    expect(relay.sendCapiEvent).not.toHaveBeenCalled();
    m.setMarketingConfig(cfg());
    armFbq();
    m.setMarketingConfig(cfg()); // a second apply must not replay again
    // replay happened during the first ready apply (before armFbq); relay proves it ran once
    expect(relay.sendCapiEvent).toHaveBeenCalledTimes(1);
  });
});

describe("payload hygiene", () => {
  it("custom-design ids and customer file names never reach the Pixel or the relay", async () => {
    const m = await load();
    m.setMarketingConfig(cfg());
    armFbq();
    m.trackEvent("AddToCart", {
      content_ids: ["custom-6f1c9a-0", P1],
      contents: [
        { id: "custom-6f1c9a-0", quantity: 1 },
        { id: P1, quantity: 1 },
      ],
      name: "IMG_0470.jpeg",
      value: 249,
      currency: "USD",
    });
    const params = trackCalls()[0][2];
    expect(params.content_ids).toEqual([P1]);
    expect(params.currency).toBe("EGP");
    expect(JSON.stringify(params)).not.toMatch(/custom-6f1c9a|IMG_0470/);
    expect(JSON.stringify(relay.sendCapiEvent.mock.calls[0][0])).not.toMatch(
      /custom-6f1c9a|IMG_0470/,
    );
  });

  it("photo_quality_warning carries no file name", async () => {
    const m = await load();
    m.setMarketingConfig(cfg());
    armFbq();
    m.trackCustom("photo_quality_warning", { name: "IMG_0470.jpeg", count: 1 });
    const call = trackCalls()[0];
    expect(call[1]).toBe("photo_quality_warning");
    expect(call[2]).toEqual({ count: 1 });
  });
});

describe("custom events", () => {
  it("ViewCart is a custom event sent to Pixel and relay once", async () => {
    const m = await load();
    m.setMarketingConfig(cfg());
    armFbq();
    m.trackCustom("ViewCart", { content_ids: [P1], num_items: 1, value: 250, currency: "EGP" });
    expect(trackCalls().filter((c) => c[1] === "ViewCart")).toHaveLength(1);
    expect(relay.sendCapiEvent).toHaveBeenCalledTimes(1);
  });

  it("events that are not on the allow-list are not sent to Meta (OrderCreated is retired)", async () => {
    const m = await load();
    m.setMarketingConfig(cfg());
    armFbq();
    m.trackCustom("OrderCreated", { value: 1000 });
    m.trackCustom("SomethingNew", { value: 1 });
    expect(trackCalls()).toHaveLength(0);
    expect(relay.sendCapiEvent).not.toHaveBeenCalled();
  });

  it("custom-design events stay internal analytics: nothing goes to Meta", async () => {
    const m = await load();
    m.setMarketingConfig(cfg());
    armFbq();
    for (const n of [
      "custom_design_start",
      "custom_design_upload",
      "custom_design_completed",
      "custom_design_add_to_cart",
    ])
      m.trackCustom(n, { count: 1 });
    expect(trackCalls()).toHaveLength(0);
    expect(relay.sendCapiEvent).not.toHaveBeenCalled();
    expect(internal.emitAnalyticsEvent).toHaveBeenCalledTimes(4);
  });
});

describe("Purchase (browser side)", () => {
  const purchase = {
    event_id: "purchase_BRW-1018",
    order_id: "BRW-1018",
    value: 1219,
    currency: "EGP" as const,
    content_type: "product" as const,
    content_ids: [P1],
    contents: [{ id: P1, quantity: 2 }],
    num_items: 2,
  };

  it("cannot be sent without an order-derived event id", async () => {
    const m = await load();
    m.setMarketingConfig(cfg());
    armFbq();
    m.trackEvent("Purchase", { value: 999999, currency: "EGP", order_id: "BRW-1" });
    expect(trackCalls()).toHaveLength(0);
    expect(ga.gaEvent).not.toHaveBeenCalled();
  });

  it("fires the Pixel Purchase with the deterministic id and the server's stored values", async () => {
    const m = await load();
    m.setMarketingConfig(cfg());
    armFbq();
    m.trackPurchase(purchase, { phone: "01012345678", city: "Cairo", country: "EG" });
    const [, name, params, opts] = trackCalls()[0];
    expect(name).toBe("Purchase");
    expect(opts.eventID).toBe("purchase_BRW-1018");
    expect(params).toMatchObject({
      value: 1219,
      currency: "EGP",
      order_id: "BRW-1018",
      content_ids: [P1],
      num_items: 2,
    });
    expect(typeof params.value).toBe("number");
  });

  it("is NOT relayed to the Conversions API from the browser (the server already sent it)", async () => {
    const m = await load();
    m.setMarketingConfig(cfg());
    armFbq();
    m.trackPurchase(purchase);
    expect(relay.sendCapiEvent).not.toHaveBeenCalled();
  });

  it("a repeated call carries the SAME event id, so Meta deduplicates it", async () => {
    const m = await load();
    m.setMarketingConfig(cfg());
    armFbq();
    m.trackPurchase(purchase);
    m.trackPurchase(purchase);
    const ids = trackCalls().map((c) => c[3].eventID);
    expect(ids).toEqual(["purchase_BRW-1018", "purchase_BRW-1018"]);
  });
});
