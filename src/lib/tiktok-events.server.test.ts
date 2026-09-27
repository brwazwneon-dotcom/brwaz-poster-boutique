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
  _resetTikTokCacheForTests,
  getTikTokEventsStatus,
  relayTikTokBrowserEvent,
  sendTikTokEvent,
  sendTikTokPurchase,
  tiktokPhone,
} from "./tiktok-events.server";
import { DEFAULT_TIKTOK_PIXEL_CODE } from "./tiktok-events";
import { buildPurchasePayload } from "./meta-events";

const TOKEN = "tt-super-secret-token-value-123456";
const P1 = "11111111-1111-4111-8111-111111111111";
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const fetchMock = vi.fn();
const okResp = () => new Response(JSON.stringify({ code: 0, message: "OK" }), { status: 200 });

const enable = (over: Record<string, unknown> = {}) => {
  state.settings = Object.entries({
    tiktok_events_api_enabled: true,
    tiktok_advanced_matching_enabled: false,
    ...over,
  }).map(([key, value]) => ({ key, value }));
};

const sent = (i = -1) => {
  const call = fetchMock.mock.calls.at(i)!;
  return { url: String(call[0]), init: call[1], body: JSON.parse(String(call[1].body)) };
};

const base = {
  event: "AddToCart",
  event_id: "evt_11111111-2222",
  user: {} as Record<string, string>,
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  state.prod = true;
  state.headers = { "x-forwarded-for": "41.65.10.20, 10.0.0.1", "user-agent": "TestBrowser/1.0" };
  state.settingsThrows = false;
  state.settingsQueries = 0;
  enable();
  process.env.TIKTOK_EVENTS_ACCESS_TOKEN = TOKEN;
  delete process.env.TIKTOK_TEST_EVENT_CODE;
  _resetTikTokCacheForTests();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => okResp());
});
afterEach(() => vi.unstubAllGlobals());

describe("configuration gates — everything is OFF until switched on", () => {
  it("sends nothing while the Events API setting is off", async () => {
    enable({ tiktok_events_api_enabled: false });
    expect(await sendTikTokEvent(base)).toMatchObject({
      ok: true,
      skipped: true,
      reason: "events_api_disabled",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing (and says so) without a token", async () => {
    delete process.env.TIKTOK_EVENTS_ACCESS_TOKEN;
    expect(await sendTikTokEvent(base)).toMatchObject({
      ok: false,
      skipped: true,
      reason: "no_access_token",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays off if settings cannot be read (never guess)", async () => {
    state.settingsThrows = true;
    expect(await sendTikTokEvent(base)).toMatchObject({ skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never sends from a non-production host", async () => {
    state.prod = false;
    expect(await sendTikTokEvent(base)).toMatchObject({
      ok: true,
      skipped: true,
      reason: "non_production_host",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an explicit production decision beats the (unavailable) request headers", async () => {
    state.prod = false;
    await sendTikTokEvent(base, { production: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear();
    state.prod = true;
    expect(await sendTikTokEvent(base, { production: false })).toMatchObject({ skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the site's pixel by default and a valid configured one, ignoring a malformed setting", async () => {
    await sendTikTokEvent(base);
    expect(sent().body.event_source_id).toBe(DEFAULT_TIKTOK_PIXEL_CODE);
    _resetTikTokCacheForTests();
    enable({ tiktok_pixel_id: "CABCDEFGHIJKLMNOPQRS" });
    await sendTikTokEvent(base);
    expect(sent().body.event_source_id).toBe("CABCDEFGHIJKLMNOPQRS");
    _resetTikTokCacheForTests();
    enable({ tiktok_pixel_id: "'; drop table" });
    await sendTikTokEvent(base);
    expect(sent().body.event_source_id).toBe(DEFAULT_TIKTOK_PIXEL_CODE);
  });

  it("caches settings briefly (a burst of events is not a burst of queries)", async () => {
    await sendTikTokEvent(base);
    await sendTikTokEvent(base);
    expect(state.settingsQueries).toBe(1);
  });
});

describe("the request", () => {
  it("posts to the consolidated Events API endpoint, token in a header only", async () => {
    await sendTikTokEvent(base);
    const s = sent();
    expect(s.url).toBe("https://business-api.tiktok.com/open_api/v1.3/event/track/");
    expect(s.init.method).toBe("POST");
    expect(s.init.headers["Access-Token"]).toBe(TOKEN);
    expect(s.url).not.toContain(TOKEN);
    expect(JSON.stringify(s.body)).not.toContain(TOKEN);
    expect(s.body).toMatchObject({
      event_source: "web",
      event_source_id: DEFAULT_TIKTOK_PIXEL_CODE,
    });
    expect(s.body.data).toHaveLength(1);
    expect(s.body.data[0]).toMatchObject({ event: "AddToCart", event_id: "evt_11111111-2222" });
    expect(typeof s.body.data[0].event_time).toBe("number");
  });

  it("adds the test event code only while it is set", async () => {
    await sendTikTokEvent(base);
    expect(sent().body).not.toHaveProperty("test_event_code");
    process.env.TIKTOK_TEST_EVENT_CODE = "TEST12345";
    _resetTikTokCacheForTests();
    await sendTikTokEvent(base);
    expect(sent().body.test_event_code).toBe("TEST12345");
  });

  it("sends click ids as-is, IP / user agent, and only a HASHED external id", async () => {
    await sendTikTokEvent({
      ...base,
      user: {
        ttclid: "E.C.P.abcdefgh12",
        ttp: "b6uv1xU3p9zAB5lUBiqX",
        external_id: "visitor-1",
        ip: "41.65.10.20",
        user_agent: "TestBrowser/1.0",
      },
    });
    const u = sent().body.data[0].user;
    expect(u).toMatchObject({
      ttclid: "E.C.P.abcdefgh12",
      ttp: "b6uv1xU3p9zAB5lUBiqX",
      ip: "41.65.10.20",
      user_agent: "TestBrowser/1.0",
    });
    expect(u.external_id).toBe(sha("visitor-1"));
    expect(JSON.stringify(sent().body)).not.toContain("visitor-1");
  });

  it("drops malformed click ids", async () => {
    await sendTikTokEvent({ ...base, user: { ttclid: "bad id!", ttp: "x" } });
    const u = sent().body.data[0].user;
    expect(u).not.toHaveProperty("ttclid");
    expect(u).not.toHaveProperty("ttp");
  });

  it("customer email/phone are NEVER sent unless Advanced Matching is on; then hashed and normalised", async () => {
    await sendTikTokEvent({ ...base, user: { email: "Ali@Example.com ", phone: "01012345678" } });
    expect(sent().body.data[0].user).not.toHaveProperty("email");
    expect(sent().body.data[0].user).not.toHaveProperty("phone");
    expect(JSON.stringify(sent().body)).not.toMatch(/01012345678|ali@example/i);

    _resetTikTokCacheForTests();
    enable({ tiktok_advanced_matching_enabled: true });
    await sendTikTokEvent({ ...base, user: { email: "Ali@Example.com ", phone: "01012345678" } });
    const u = sent().body.data[0].user;
    expect(u.email).toBe(sha("ali@example.com"));
    expect(u.phone).toBe(sha("+201012345678"));
    expect(JSON.stringify(sent().body)).not.toMatch(/01012345678|ali@example/i);
  });

  it("phones use E.164 with the leading plus (Egyptian numbers get +20)", () => {
    expect(tiktokPhone("01012345678")).toBe("+201012345678");
    expect(tiktokPhone("+20 101 234 5678")).toBe("+201012345678");
    expect(tiktokPhone("")).toBe("");
  });

  it("only a production-host page URL is sent as the page", async () => {
    await sendTikTokEvent({ ...base, event_source_url: "https://brwazwneon.com/cart#x" });
    expect(sent().body.data[0].page).toEqual({ url: "https://brwazwneon.com/cart" });
    await sendTikTokEvent({ ...base, event_source_url: "http://localhost:8080/cart" });
    expect(sent().body.data[0]).not.toHaveProperty("page");
  });
});

describe("outcomes, retries and timeouts", () => {
  it("success needs HTTP 200 AND code 0", async () => {
    expect((await sendTikTokEvent(base)).ok).toBe(true);
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ code: 40001, message: "Invalid token" }), { status: 200 }),
    );
    const r = await sendTikTokEvent(base, { retries: 2 });
    expect(r).toMatchObject({ ok: false, status: 200 });
    expect(r.body).toContain("40001");
    expect(fetchMock).toHaveBeenCalledTimes(2); // 1 ok + ONE failed attempt: a business error is not retried
  });

  it("retries 5xx / 429 / network errors with the IDENTICAL payload (same event_id)", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("{}", { status: 502 }))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockImplementationOnce(async () => okResp());
    const r = await sendTikTokEvent(
      { ...base, event: "CompletePayment", event_id: "purchase_BRW-1" },
      { retries: 2 },
    );
    expect(r.ok).toBe(true);
    const bodies = fetchMock.mock.calls.map((c) => String(c[1].body));
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0]).data[0].event_id).toBe("purchase_BRW-1");
  });

  it("does not retry a 4xx", async () => {
    fetchMock.mockImplementation(async () => new Response("{}", { status: 400 }));
    await sendTikTokEvent(base, { retries: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("every attempt is time-boxed, and a hang never throws", async () => {
    fetchMock.mockImplementation(async (_u: string, init: { signal: AbortSignal }) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      throw new DOMException("aborted", "TimeoutError");
    });
    await expect(sendTikTokEvent(base, { retries: 1, timeoutMs: 50 })).resolves.toMatchObject({
      ok: false,
    });
  });

  it("a malformed body from TikTok is a failure, not a crash", async () => {
    fetchMock.mockImplementation(async () => new Response("not json", { status: 200 }));
    await expect(sendTikTokEvent(base)).resolves.toMatchObject({ ok: false });
  });
});

describe("sendTikTokPurchase — the server CompletePayment", () => {
  const purchase = buildPurchasePayload({
    orderRef: "BRW-1049",
    storedTotals: [4550],
    items: [{ id: P1, quantity: 20 }],
    fallbackNumItems: 20,
  })!;

  it("sends CompletePayment with the stored value and the deterministic order id", async () => {
    await sendTikTokPurchase({
      purchase,
      tracking: {
        ttclid: "E.C.P.abcdefgh12",
        ttp: "b6uv1xU3p9zAB5lUBiqX",
        event_source_url: "https://brwazwneon.com/cart",
      },
      guestSessionId: "visitor-9",
      phone: "01012345678",
      facts: { ctx: { ip: "41.65.10.20", ua: "CapturedBrowser/1.0" }, production: true },
    });
    const d = sent().body.data[0];
    expect(d.event).toBe("CompletePayment");
    expect(d.event_id).toBe("purchase_BRW-1049");
    expect(d.properties).toMatchObject({
      value: 4550,
      currency: "EGP",
      order_id: "BRW-1049",
      content_type: "product",
    });
    expect(d.user).toMatchObject({
      ttclid: "E.C.P.abcdefgh12",
      ip: "41.65.10.20",
      user_agent: "CapturedBrowser/1.0",
    });
    expect(d.user.external_id).toBe(sha("visitor-9"));
    expect(JSON.stringify(sent().body)).not.toMatch(/01012345678/); // phone: Advanced Matching is off
  });

  it("uses the request facts captured before the response, not the (gone) request", async () => {
    state.prod = false;
    state.headers = { "x-forwarded-for": "9.9.9.9", "user-agent": "WrongAfterResponse/0" };
    await sendTikTokPurchase({
      purchase,
      facts: { ctx: { ip: "41.65.10.20", ua: "Captured/1" }, production: true },
    });
    expect(JSON.stringify(sent().body)).not.toMatch(/9\.9\.9\.9|WrongAfterResponse/);
  });

  it("a captured non-production decision suppresses it", async () => {
    state.prod = true;
    await sendTikTokPurchase({ purchase, facts: { ctx: {}, production: false } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("by default it is not retried (it may hold a request open); the deferred path can allow one retry with the SAME id", async () => {
    fetchMock.mockImplementation(async () => new Response("{}", { status: 502 }));
    await sendTikTokPurchase({ purchase });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear();
    await sendTikTokPurchase({ purchase }, { retries: 1, timeoutMs: 3000 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      new Set(fetchMock.mock.calls.map((c) => JSON.parse(String(c[1].body)).data[0].event_id)),
    ).toEqual(new Set(["purchase_BRW-1049"]));
  });
});

describe("relayTikTokBrowserEvent — the public relay", () => {
  const relayed = (over: Record<string, unknown> = {}) => ({
    event_name: "ViewContent",
    event_id: "11111111-2222-3333-4444-555555555555",
    custom_data: {},
    user_data: {},
    ...over,
  });

  it("forwards an allowed event under TikTok's name with server-observed IP and user agent", async () => {
    await relayTikTokBrowserEvent(relayed({ event_name: "Lead" }) as never);
    const d = sent().body.data[0];
    expect(d.event).toBe("SubmitForm");
    expect(d.user).toMatchObject({ ip: "41.65.10.20", user_agent: "TestBrowser/1.0" });
  });

  it("refuses Purchase / CompletePayment / unknown names even if the schema were bypassed", async () => {
    for (const event_name of [
      "Purchase",
      "CompletePayment",
      "OrderConfirmed",
      "Fabricated",
      "PageView",
    ]) {
      expect(await relayTikTokBrowserEvent(relayed({ event_name }) as never)).toEqual({
        ok: false,
        skipped: true,
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-sanitises: unknown keys and file names never reach TikTok", async () => {
    await relayTikTokBrowserEvent(
      relayed({
        event_name: "AddToCart",
        custom_data: { name: "IMG_0470.jpeg", value: 230, content_ids: [P1], evil: "<x>" },
      }) as never,
    );
    expect(JSON.stringify(sent().body)).not.toMatch(/IMG_0470|evil|<x>/);
    expect(sent().body.data[0].properties).toMatchObject({ value: 230, currency: "EGP" });
  });

  it("rate-limits per client and answers ok+skipped", async () => {
    for (let i = 0; i < 120; i++) await relayTikTokBrowserEvent(relayed() as never);
    fetchMock.mockClear();
    expect(await relayTikTokBrowserEvent(relayed() as never)).toEqual({ ok: true, skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a public caller never learns TikTok's error text, reason codes or the configuration state", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ code: 40105, message: "Invalid access token" }), {
          status: 200,
        }),
    );
    expect(await relayTikTokBrowserEvent(relayed() as never)).toEqual({ ok: false });
    delete process.env.TIKTOK_EVENTS_ACCESS_TOKEN;
    expect(await relayTikTokBrowserEvent(relayed() as never)).toEqual({ ok: false, skipped: true });
    process.env.TIKTOK_EVENTS_ACCESS_TOKEN = TOKEN;
    state.prod = false;
    expect(await relayTikTokBrowserEvent(relayed() as never)).toEqual({ ok: true, skipped: true });
    const seen = JSON.stringify([await relayTikTokBrowserEvent(relayed() as never)]);
    expect(seen).not.toMatch(
      /token|invalid|no_access|disabled|non_production|reason|body|error|code/i,
    );
  });
});

describe("status for the admin never exposes the token", () => {
  it("reports booleans and the public pixel code only", async () => {
    const s = await getTikTokEventsStatus();
    expect(s).toEqual({
      pixelCode: DEFAULT_TIKTOK_PIXEL_CODE,
      eventsApiEnabled: true,
      tokenConfigured: true,
      advancedMatching: false,
      testModeOn: false,
    });
    expect(JSON.stringify(s)).not.toContain(TOKEN);
  });
});

describe("secrets are never logged", () => {
  it("no console output carries the token or a payload", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ code: 40001, message: "bad" }), { status: 200 }),
    );
    await sendTikTokEvent({ ...base, user: { ttclid: "E.C.P.abcdefgh12" } });
    for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toContain(TOKEN);
    spies.forEach((s) => s.mockRestore());
  });
});
