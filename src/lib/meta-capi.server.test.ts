import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  prod: true,
  settings: [] as Array<{ key: string; value: unknown }>,
  settingsThrows: false,
  settingsQueries: 0,
  headers: {
    "x-forwarded-for": "41.65.10.20, 10.0.0.1",
    "user-agent": "TestBrowser/1.0",
  } as Record<string, string>,
}));

vi.mock("@/lib/neon.server", () => ({
  sql: () => () => {
    state.settingsQueries++;
    if (state.settingsThrows) return Promise.reject(new Error("db down"));
    return Promise.resolve(state.settings);
  },
}));
vi.mock("@/lib/analytics-host.server", () => ({ isProductionRequest: () => state.prod }));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({ headers: new Headers(state.headers) }),
}));

import {
  _resetMetaCapiCacheForTests,
  _resetRelayLimiterForTests,
  buildAdTracking,
  normPhone,
  relayBrowserEvent,
  sendMetaEvent,
  sendPurchaseToMeta,
} from "./meta-capi.server";
import { buildPurchasePayload } from "./meta-events";

const TOKEN = "EAAB-super-secret-token-value-123456";
const P1 = "11111111-1111-4111-8111-111111111111";
const sha = (v: string) => createHash("sha256").update(v).digest("hex");

const fetchMock = vi.fn();
const ok = () => new Response(JSON.stringify({ events_received: 1 }), { status: 200 });

const enable = (over: Record<string, unknown> = {}) => {
  state.settings = Object.entries({
    meta_pixel_id: "4466074806960925",
    meta_capi_enabled: true,
    meta_advanced_matching_enabled: true,
    ...over,
  }).map(([key, value]) => ({ key, value }));
};

const sent = (i = -1) => {
  const call = fetchMock.mock.calls.at(i)!;
  return { url: String(call[0]), init: call[1], body: JSON.parse(String(call[1].body)) };
};

const baseEvent = {
  event_name: "AddToCart",
  event_id: "evt_11111111-2222",
  user: {} as Record<string, string>,
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  state.prod = true;
  state.settingsThrows = false;
  state.settingsQueries = 0;
  enable();
  process.env.META_PIXEL_ACCESS_TOKEN = TOKEN;
  delete process.env.META_CAPI_TEST_EVENT_CODE;
  _resetMetaCapiCacheForTests();
  _resetRelayLimiterForTests();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => ok());
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendMetaEvent — configuration gates", () => {
  it("does nothing on a non-production host (localhost / preview never reach Meta)", async () => {
    state.prod = false;
    const r = await sendMetaEvent(baseEvent);
    expect(r).toMatchObject({ ok: true, skipped: true, reason: "non_production_host" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("CAPI disabled (no meta_capi_enabled row) → skipped", async () => {
    enable({ meta_capi_enabled: undefined });
    state.settings = state.settings.filter((s) => s.key !== "meta_capi_enabled");
    const r = await sendMetaEvent(baseEvent);
    expect(r).toMatchObject({ skipped: true, reason: "capi_disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("missing META_PIXEL_ACCESS_TOKEN → skipped, honestly not ok, nothing sent", async () => {
    delete process.env.META_PIXEL_ACCESS_TOKEN;
    const r = await sendMetaEvent(baseEvent);
    expect(r).toMatchObject({ ok: false, skipped: true, reason: "no_access_token" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("unreadable settings keep CAPI off (never guesses)", async () => {
    state.settingsThrows = true;
    const r = await sendMetaEvent(baseEvent);
    expect(r).toMatchObject({ skipped: true, reason: "capi_disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("invalid pixel id → skipped", async () => {
    enable({ meta_pixel_id: "not-a-number" });
    const r = await sendMetaEvent(baseEvent);
    expect(r).toMatchObject({ skipped: true, reason: "invalid_pixel_id" });
  });

  it("settings are cached briefly (a burst of events is one query)", async () => {
    await sendMetaEvent(baseEvent);
    await sendMetaEvent(baseEvent);
    await sendMetaEvent(baseEvent);
    expect(state.settingsQueries).toBe(1);
  });
});

describe("sendMetaEvent — payload", () => {
  it("token is in the request body, never in the URL; pixel id comes from settings", async () => {
    await sendMetaEvent(baseEvent);
    const { url, body } = sent();
    expect(url).toBe("https://graph.facebook.com/v23.0/4466074806960925/events");
    expect(url).not.toContain(TOKEN);
    expect(body.access_token).toBe(TOKEN);
  });

  it("carries the event id, name, custom data and website action source", async () => {
    await sendMetaEvent({
      ...baseEvent,
      custom_data: { value: 890, currency: "EGP" },
      event_source_url: "https://brwazwneon.com/cart#x",
    });
    const e = sent().body.data[0];
    expect(e).toMatchObject({
      event_name: "AddToCart",
      event_id: "evt_11111111-2222",
      action_source: "website",
      event_source_url: "https://brwazwneon.com/cart",
      custom_data: { value: 890, currency: "EGP" },
    });
    expect(typeof e.event_time).toBe("number");
  });

  it("hashes PII server-side with Meta normalisation (Egyptian 01… → 201…)", async () => {
    expect(normPhone("01012345678")).toBe("201012345678");
    expect(normPhone("+20 101 234 5678")).toBe("201012345678");
    await sendMetaEvent({
      ...baseEvent,
      user: { phone: "01012345678", city: " Cairo ", country: "EG", email: " A@B.com " },
    });
    const u = sent().body.data[0].user_data;
    expect(u.ph).toEqual([sha("201012345678")]);
    expect(u.ct).toEqual([sha("cairo")]);
    expect(u.country).toEqual([sha("eg")]);
    expect(u.em).toEqual([sha("a@b.com")]);
    expect(JSON.stringify(sent().body)).not.toMatch(/01012345678|A@B\.com|Cairo/);
  });

  it("Advanced Matching off → no personal identifiers are sent at all", async () => {
    enable({ meta_advanced_matching_enabled: false });
    await sendMetaEvent({
      ...baseEvent,
      user: { phone: "01012345678", email: "a@b.com", city: "Cairo" },
    });
    const u = sent().body.data[0].user_data;
    expect(u).not.toHaveProperty("ph");
    expect(u).not.toHaveProperty("em");
    expect(u).not.toHaveProperty("ct");
  });

  it("sends fbp/fbc only when well-formed, external_id hashed, IP and user agent as given", async () => {
    await sendMetaEvent({
      ...baseEvent,
      user: {
        fbp: "fb.1.1596403881668.1116446470",
        fbc: "fb.1.1554763741205.AbCdEfGhIjKlMn",
        external_id: "visitor-123",
        client_ip_address: "41.65.10.20",
        client_user_agent: "TestBrowser/1.0",
      },
    });
    const u = sent().body.data[0].user_data;
    expect(u.fbp).toBe("fb.1.1596403881668.1116446470");
    expect(u.fbc).toBe("fb.1.1554763741205.AbCdEfGhIjKlMn");
    expect(u.external_id).toEqual([sha("visitor-123")]);
    expect(u.client_ip_address).toBe("41.65.10.20");
    expect(u.client_user_agent).toBe("TestBrowser/1.0");

    await sendMetaEvent({ ...baseEvent, user: { fbp: "garbage", fbc: "<x>" } });
    const bad = sent().body.data[0].user_data;
    expect(bad).not.toHaveProperty("fbp");
    expect(bad).not.toHaveProperty("fbc");
  });

  it("uses META_CAPI_TEST_EVENT_CODE only when set (Test Events)", async () => {
    await sendMetaEvent(baseEvent);
    expect(sent().body).not.toHaveProperty("test_event_code");
    process.env.META_CAPI_TEST_EVENT_CODE = "TEST12345";
    await sendMetaEvent(baseEvent);
    expect(sent().body.test_event_code).toBe("TEST12345");
  });
});

describe("sendMetaEvent — failures never escape and retries keep the event id", () => {
  it("a Meta 4xx is returned (not thrown) and not retried", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 190 } }), { status: 400 }),
    );
    const r = await sendMetaEvent(baseEvent);
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a Meta 5xx is retried once with the IDENTICAL payload (same event_id)", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(ok());
    const r = await sendMetaEvent(baseEvent, { retries: 1 });
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    const second = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    expect(second).toEqual(first);
    expect(second.data[0].event_id).toBe("evt_11111111-2222");
  });

  it("a network failure / timeout returns an error result instead of throwing", async () => {
    fetchMock.mockRejectedValue(new Error("fetch failed"));
    const r = await sendMetaEvent(baseEvent, { retries: 0 });
    expect(r).toMatchObject({ ok: false, error: "fetch failed" });
  });

  it("every attempt is time-boxed", async () => {
    await sendMetaEvent(baseEvent);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe("relayBrowserEvent — the public relay", () => {
  const relayed = (over: Record<string, unknown> = {}) => ({
    event_name: "ViewContent",
    event_id: "11111111-2222-3333-4444-555555555555",
    custom_data: {},
    user_data: {},
    ...over,
  });

  it("forwards an allowed event with server-observed IP and user agent", async () => {
    await relayBrowserEvent(relayed() as never);
    const u = sent().body.data[0].user_data;
    expect(u.client_ip_address).toBe("41.65.10.20");
    expect(u.client_user_agent).toBe("TestBrowser/1.0");
  });

  it("refuses Purchase (and any non-allow-listed name) even if the schema were bypassed", async () => {
    for (const event_name of ["Purchase", "OrderConfirmed", "Fabricated"]) {
      const r = await relayBrowserEvent(relayed({ event_name }) as never);
      expect(r).toMatchObject({ ok: false, skipped: true, reason: "event_not_allowed" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-sanitises the payload: file names and unknown keys never reach Meta", async () => {
    await relayBrowserEvent(
      relayed({
        event_name: "photo_quality_warning",
        custom_data: { name: "IMG_0470.jpeg", count: 1, value: "999 EGP" },
      }) as never,
    );
    const cd = sent().body.data[0].custom_data;
    expect(cd).toEqual({ count: 1 });
    expect(JSON.stringify(sent().body)).not.toContain("IMG_0470");
  });

  it("a forged huge value is bounded away", async () => {
    await relayBrowserEvent(
      relayed({ event_name: "AddToCart", custom_data: { value: 9e9, currency: "USD" } }) as never,
    );
    expect(sent().body.data[0].custom_data).toEqual({ currency: "EGP" });
  });

  it("is rate limited per client", async () => {
    for (let i = 0; i < 120; i++) await relayBrowserEvent(relayed() as never);
    expect(fetchMock).toHaveBeenCalledTimes(120);
    const r = await relayBrowserEvent(relayed() as never);
    expect(r).toMatchObject({ skipped: true, reason: "rate_limited" });
    expect(fetchMock).toHaveBeenCalledTimes(120);
  });

  it("does nothing on a non-production host", async () => {
    state.prod = false;
    await relayBrowserEvent(relayed() as never);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sendPurchaseToMeta — the trusted server-side Purchase", () => {
  const purchase = buildPurchasePayload({
    orderRef: "BRW-1018",
    storedTotals: [1130, 89],
    items: [{ id: P1, quantity: 2 }],
    fallbackNumItems: 2,
  })!;

  it("sends a Purchase with the deterministic id and the STORED value", async () => {
    const r = await sendPurchaseToMeta({
      purchase,
      tracking: {
        fbp: "fb.1.1596403881668.1116446470",
        fbc: "fb.1.1554763741205.AbCdEfGhIjKlMn",
        event_source_url: "https://brwazwneon.com/cart",
      },
      guestSessionId: "visitor-1",
      phone: "01012345678",
      city: "Cairo",
    });
    expect(r.ok).toBe(true);
    const e = sent().body.data[0];
    expect(e.event_name).toBe("Purchase");
    expect(e.event_id).toBe("purchase_BRW-1018");
    expect(e.custom_data).toMatchObject({
      value: 1219,
      currency: "EGP",
      order_id: "BRW-1018",
      content_ids: [P1],
      contents: [{ id: P1, quantity: 2 }],
      num_items: 2,
    });
    expect(typeof e.custom_data.value).toBe("number");
    expect(e.user_data.ph).toEqual([sha("201012345678")]);
    expect(e.user_data.fbc).toBe("fb.1.1554763741205.AbCdEfGhIjKlMn");
  });

  it("the same order always yields the same event_id (retries / re-sends deduplicate)", async () => {
    await sendPurchaseToMeta({ purchase });
    await sendPurchaseToMeta({ purchase });
    expect(sent(0).body.data[0].event_id).toBe(sent(1).body.data[0].event_id);
  });

  it("a Meta outage returns a result — order creation can never be failed by it", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(sendPurchaseToMeta({ purchase })).resolves.toMatchObject({ ok: false });
  });

  it("no token, no Purchase", async () => {
    delete process.env.META_PIXEL_ACCESS_TOKEN;
    const r = await sendPurchaseToMeta({ purchase });
    expect(r).toMatchObject({ skipped: true, reason: "no_access_token" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dev/preview hosts never send a Purchase", async () => {
    state.prod = false;
    await sendPurchaseToMeta({ purchase });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("secrets and customer data are never logged", () => {
  it("no console output contains the token, the phone number or the payload", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    fetchMock.mockResolvedValue(new Response("{}", { status: 400 }));
    await sendMetaEvent({ ...baseEvent, user: { phone: "01012345678" } });
    await sendPurchaseToMeta({
      purchase: buildPurchasePayload({
        orderRef: "BRW-5",
        storedTotals: [100],
        fallbackNumItems: 1,
      })!,
      phone: "01012345678",
    });
    const logged = spies
      .flatMap((s) => s.mock.calls)
      .flat()
      .map(String)
      .join("\n");
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain("01012345678");
  });
});

describe("buildAdTracking (stored for the later OrderConfirmed event)", () => {
  it("keeps only valid Meta identifiers, adds server-observed IP / UA and the purchase ref", async () => {
    const t = await buildAdTracking(
      {
        fbp: "fb.1.1596403881668.1116446470",
        fbc: "not valid",
        fbclid: "AbCdEf123456",
        ttclid: "tiktok-should-be-ignored",
        event_source_url: "http://localhost:8080/cart",
        evil: "x",
      },
      "BRW-1018",
    );
    expect(t).toEqual({
      fbp: "fb.1.1596403881668.1116446470",
      fbclid: "AbCdEf123456",
      ip: "41.65.10.20",
      ua: "TestBrowser/1.0",
      purchase_ref: "BRW-1018",
    });
  });
});
