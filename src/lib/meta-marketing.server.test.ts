import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_VERSION,
  MetaApiError,
  classifyFailure,
  fetchAds,
  fetchAdsets,
  fetchCampaigns,
  fetchInsights,
  graphGet,
  graphPaginate,
  mapInsight,
  normalizeAccountId,
  num,
  readMarketingConfig,
  scrub,
  type MarketingConfig,
} from "./meta-marketing.server";

const TOKEN = "EAAB-test-token-1234567890abcdefghijk";
const cfg: MarketingConfig = { token: TOKEN, accountId: "276172695816769", version: "v25.0" };
const noSleep = async () => {};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("configuration", () => {
  it("is configured only with a token and a valid account id; act_ is optional", () => {
    const ok = readMarketingConfig({
      META_MARKETING_ACCESS_TOKEN: TOKEN,
      META_AD_ACCOUNT_ID: "act_276172695816769",
    });
    expect(ok.configured).toBe(true);
    if (ok.configured) {
      expect(ok.config.accountId).toBe("276172695816769");
      expect(ok.config.version).toBe(DEFAULT_VERSION);
    }
  });

  it("names what is missing or invalid — never a value", () => {
    const none = readMarketingConfig({});
    expect(none).toEqual({
      configured: false,
      missing: ["META_MARKETING_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"],
      invalid: [],
    });
    const bad = readMarketingConfig({
      META_MARKETING_ACCESS_TOKEN: TOKEN,
      META_AD_ACCOUNT_ID: "not-an-id",
      META_MARKETING_API_VERSION: "latest",
    });
    expect(bad).toMatchObject({
      configured: false,
      invalid: ["META_AD_ACCOUNT_ID", "META_MARKETING_API_VERSION"],
    });
    expect(JSON.stringify([none, bad])).not.toContain(TOKEN);
  });

  it("does not reuse the Pixel / Conversions API token", () => {
    const r = readMarketingConfig({
      META_PIXEL_ACCESS_TOKEN: "pixel-token",
      META_AD_ACCOUNT_ID: "276172695816769",
    });
    expect(r.configured).toBe(false);
  });

  it("normalises the account id", () => {
    expect(normalizeAccountId(" act_123456 ")).toBe("123456");
    expect(normalizeAccountId("276172695816769")).toBe("276172695816769");
    expect(normalizeAccountId("act_")).toBeNull();
    expect(normalizeAccountId("12; drop table")).toBeNull();
  });
});

describe("error classification", () => {
  it.each([
    [400, { error: { message: "bad", code: 100 } }, "bad_request"],
    [401, { error: { message: "nope", code: 190 } }, "auth"],
    [200, { error: { message: "token", code: 190 } }, "auth"],
    [403, { error: { message: "perm", code: 200 } }, "permission"],
    [400, { error: { message: "perm", code: 10 } }, "permission"],
    [429, {}, "rate_limit"],
    [400, { error: { message: "too many", code: 17 } }, "rate_limit"],
    [400, { error: { message: "bucu", code: 80004 } }, "rate_limit"],
    [500, {}, "server"],
    [503, { error: { message: "down" } }, "server"],
  ])("HTTP %i %j -> %s", (status, body, kind) => {
    expect(classifyFailure(status as number, body).kind).toBe(kind);
  });
});

describe("scrub", () => {
  it("removes the token, token-shaped strings and URLs", () => {
    const text = `failed https://graph.facebook.com/v25.0/x?access_token=${TOKEN}&a=1 with ${TOKEN} and EAAxxxxxxxxxxxxxxxxxxxxxxxx`;
    const out = scrub(text, TOKEN);
    expect(out).not.toContain(TOKEN);
    expect(out).not.toMatch(/access_token=EAA/);
    expect(out).not.toContain("graph.facebook.com");
    expect(out).not.toMatch(/EAA[A-Za-z0-9]{20,}/);
    expect(out.length).toBeLessThanOrEqual(300);
  });
});

describe("graphGet", () => {
  it("sends the request to graph.facebook.com with the version and token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ data: [] }));
    await graphGet(cfg, "act_1/campaigns", { fields: "id" }, { fetchImpl: fetchImpl as never });
    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url.startsWith("https://graph.facebook.com/v25.0/act_1/campaigns?")).toBe(true);
    expect(url).toContain("fields=id");
  });

  it.each([
    [401, { error: { message: "Invalid OAuth access token", code: 190 } }, "auth"],
    [403, { error: { message: "no permission", code: 200 } }, "permission"],
    [400, { error: { message: "bad field", code: 100 } }, "bad_request"],
  ])("does not retry a %i (%s)", async (status, body, kind) => {
    const fetchImpl = vi.fn().mockResolvedValue(json(body, status as number));
    const e = await graphGet(cfg, "x", {}, { fetchImpl: fetchImpl as never, sleep: noSleep }).catch(
      (err) => err,
    );
    expect(e).toBeInstanceOf(MetaApiError);
    expect((e as MetaApiError).kind).toBe(kind);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 and a 500 with backoff, then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ error: { message: "slow down", code: 4 } }, 429))
      .mockResolvedValueOnce(json({ error: { message: "oops" } }, 500))
      .mockResolvedValueOnce(json({ data: [{ id: "1" }] }));
    const sleep = vi.fn(async (_ms: number) => {});
    const body = await graphGet(cfg, "x", {}, { fetchImpl: fetchImpl as never, sleep, retries: 2 });
    expect(body).toEqual({ data: [{ id: "1" }] });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000]);
  });

  it("gives up after the retry budget and reports the rate limit", async () => {
    // a fresh Response per call: a body can only be read once
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => json({ error: { message: "x", code: 17 } }, 400));
    const e = await graphGet(
      cfg,
      "x",
      {},
      { fetchImpl: fetchImpl as never, sleep: noSleep, retries: 1 },
    ).catch((err) => err);
    expect((e as MetaApiError).kind).toBe("rate_limit");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("treats an HTTP 200 carrying an error object as an error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ error: { message: "expired", code: 190 } }));
    const e = await graphGet(cfg, "x", {}, { fetchImpl: fetchImpl as never, sleep: noSleep }).catch(
      (err) => err,
    );
    expect((e as MetaApiError).kind).toBe("auth");
  });

  it("network failures are retried and classified", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const e = await graphGet(
      cfg,
      "x",
      {},
      { fetchImpl: fetchImpl as never, sleep: noSleep, retries: 1 },
    ).catch((err) => err);
    expect((e as MetaApiError).kind).toBe("network");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([["not json"], ["[]"], ["null"]])("rejects a malformed body: %s", async (raw) => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(raw, { status: 200 }));
    const e = await graphGet(cfg, "x", {}, { fetchImpl: fetchImpl as never, sleep: noSleep }).catch(
      (err) => err,
    );
    expect((e as MetaApiError).kind).toBe("malformed");
  });

  it("an error never carries the token or a URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json(
        {
          error: {
            message: `bad token ${TOKEN} at https://graph.facebook.com/?access_token=${TOKEN}`,
            code: 190,
          },
        },
        401,
      ),
    );
    const e = (await graphGet(cfg, "x", {}, { fetchImpl: fetchImpl as never }).catch(
      (err) => err,
    )) as MetaApiError;
    expect(e.message).not.toContain(TOKEN);
    expect(e.message).not.toContain("graph.facebook.com");
  });
});

describe("pagination", () => {
  it("follows the cursor with our own request and never fetches paging.next", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          data: [{ id: "1" }, { id: "2" }],
          paging: {
            cursors: { after: "CUR1" },
            next: `https://graph.facebook.com/next?access_token=${TOKEN}`,
          },
        }),
      )
      .mockResolvedValueOnce(json({ data: [{ id: "3" }], paging: { cursors: { after: "CUR2" } } }));
    const { rows, complete } = await graphPaginate(
      cfg,
      "x",
      { limit: 2 },
      { fetchImpl: fetchImpl as never },
    );
    expect(rows.map((r) => r.id)).toEqual(["1", "2", "3"]);
    expect(complete).toBe(true);
    const urls = fetchImpl.mock.calls.map((c) => String(c[0]));
    expect(urls[1]).toContain("after=CUR1");
    expect(urls.some((u) => u.includes("/next"))).toBe(false);
  });

  it("an empty result is complete with no rows", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ data: [] }));
    expect(await graphPaginate(cfg, "x", {}, { fetchImpl: fetchImpl as never })).toEqual({
      rows: [],
      complete: true,
    });
  });

  it("stops at the page cap and says it is incomplete", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () =>
        json({ data: [{ id: "1" }], paging: { cursors: { after: "C" }, next: "n" } }),
      );
    const r = await graphPaginate(cfg, "x", {}, { fetchImpl: fetchImpl as never, maxPages: 3 });
    expect(r.complete).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("stops at the deadline", async () => {
    const fetchImpl = vi.fn();
    const r = await graphPaginate(
      cfg,
      "x",
      {},
      { fetchImpl: fetchImpl as never, deadline: Date.now() - 1 },
    );
    expect(r).toEqual({ rows: [], complete: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("a response without a data array is malformed", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ nope: true }));
    const e = await graphPaginate(cfg, "x", {}, { fetchImpl: fetchImpl as never }).catch(
      (err) => err,
    );
    expect((e as MetaApiError).kind).toBe("malformed");
  });
});

describe("row mapping", () => {
  it("parses Meta's string numbers and picks the purchase action", () => {
    const r = mapInsight({
      date_start: "2026-09-20",
      ad_id: "52575869248376",
      adset_id: "111",
      campaign_id: "52575575055376",
      ad_name: "Ad",
      spend: "607.29",
      impressions: "6273",
      reach: "4506",
      clicks: "240",
      inline_link_clicks: "180",
      ctr: "3.83",
      cpc: "2.53",
      cpm: "96.81",
      account_currency: "EGP",
      actions: [
        { action_type: "link_click", value: "180" },
        { action_type: "omni_purchase", value: "5" },
        { action_type: "purchase", value: "4" },
      ],
      action_values: [{ action_type: "omni_purchase", value: "2500.50" }],
    });
    expect(r).toMatchObject({
      date: "2026-09-20",
      meta_ad_id: "52575869248376",
      spend: 607.29,
      impressions: 6273,
      clicks: 240,
      link_clicks: 180,
      purchases: 5,
      purchase_value: 2500.5,
      currency: "EGP",
    });
  });

  it("falls back to the next purchase action type and to null when there is none", () => {
    const base = {
      date_start: "2026-09-20",
      ad_id: "1",
      spend: "1",
      impressions: "1",
      clicks: "1",
    };
    expect(
      mapInsight({
        ...base,
        actions: [{ action_type: "offsite_conversion.fb_pixel_purchase", value: "2" }],
      })?.purchases,
    ).toBe(2);
    expect(
      mapInsight({ ...base, actions: [{ action_type: "link_click", value: "9" }] })?.purchases,
    ).toBeNull();
    expect(mapInsight(base)?.purchases).toBeNull();
  });

  it("rejects rows without an ad id or with a bad date", () => {
    expect(mapInsight({ date_start: "2026-09-20", spend: "1" })).toBeNull();
    expect(mapInsight({ date_start: "yesterday", ad_id: "1" })).toBeNull();
  });

  it("num handles junk without producing NaN", () => {
    expect(num("12.5")).toBe(12.5);
    expect(num("")).toBeNull();
    expect(num("abc")).toBeNull();
    expect(num(undefined)).toBeNull();
  });
});

describe("edge fetchers", () => {
  it("campaigns / ad sets / ads map budgets (minor units) and skip unreadable rows", async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/campaigns"))
        return json({
          data: [
            {
              id: "c1",
              name: "Sales",
              status: "PAUSED",
              objective: "OUTCOME_SALES",
              daily_budget: "22500",
              created_time: "2026-09-01T10:00:00+0000",
            },
            { name: "no id" },
          ],
        });
      if (url.includes("/adsets"))
        return json({
          data: [
            {
              id: "s1",
              campaign_id: "c1",
              name: "Set",
              optimization_goal: "OFFSITE_CONVERSIONS",
              billing_event: "IMPRESSIONS",
            },
          ],
        });
      return json({
        data: [
          { id: "a1", adset_id: "s1", campaign_id: "c1", name: "Ad", creative: { id: "cr1" } },
        ],
      });
    });
    const opts = { fetchImpl: fetchImpl as never };
    const c = await fetchCampaigns(cfg, opts);
    expect(c.rows).toHaveLength(1);
    expect(c.skipped).toBe(1);
    expect(c.rows[0]).toMatchObject({
      meta_campaign_id: "c1",
      daily_budget: 225,
      objective: "OUTCOME_SALES",
    });
    expect((await fetchAdsets(cfg, opts)).rows[0]).toMatchObject({
      meta_adset_id: "s1",
      meta_campaign_id: "c1",
    });
    expect((await fetchAds(cfg, opts)).rows[0]).toMatchObject({
      meta_ad_id: "a1",
      creative_id: "cr1",
    });
  });

  it("insights ask for ad level, daily rows and the given range", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ data: [] }));
    await fetchInsights(cfg, "2026-09-01", "2026-09-30", { fetchImpl: fetchImpl as never });
    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.pathname).toBe("/v25.0/act_276172695816769/insights");
    expect(url.searchParams.get("level")).toBe("ad");
    expect(url.searchParams.get("time_increment")).toBe("1");
    expect(JSON.parse(url.searchParams.get("time_range")!)).toEqual({
      since: "2026-09-01",
      until: "2026-09-30",
    });
  });

  it("rejects an invalid or reversed range before calling Meta", async () => {
    const fetchImpl = vi.fn();
    for (const [a, b] of [
      ["x", "2026-09-01"],
      ["2026-09-30", "2026-09-01"],
    ]) {
      await expect(
        fetchInsights(cfg, a, b, { fetchImpl: fetchImpl as never }),
      ).rejects.toBeInstanceOf(MetaApiError);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
