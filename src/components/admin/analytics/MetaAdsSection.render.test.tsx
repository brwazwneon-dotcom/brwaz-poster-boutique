// @vitest-environment jsdom
/**
 * Renders the Meta Ads section with its server functions mocked, to pin the
 * honesty rules: not-configured / not-migrated states say what is missing (by
 * variable NAME only), a failed sync still shows the last successful data,
 * unmeasurable ratios show "—" (never Infinity), and Sync now works.
 */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PeriodInfo } from "@/lib/analytics-center.types";
import type { MetaAdsReport, MetaAdsStatusView, SiteMetrics } from "@/lib/meta-ads.types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fns = vi.hoisted(() => ({ report: vi.fn(), sync: vi.fn(), exportFn: vi.fn() }));
vi.mock("@/lib/meta-ads.functions", () => ({
  getMetaAdsReport: fns.report,
  syncMetaAdsNow: fns.sync,
  exportMetaAds: fns.exportFn,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { MetaAdsSection } from "./MetaAdsSection";

const period: PeriodInfo = {
  key: "30d",
  start: "2026-08-26T21:00:00.000Z",
  end: "2026-09-25T21:00:00.000Z",
  prevStart: "2026-07-27T21:00:00.000Z",
  prevEnd: "2026-08-26T21:00:00.000Z",
  days: 30,
};
const input = { range: "30d" as const };
const site = (o: Partial<SiteMetrics> = {}): SiteMetrics => ({
  sessions: 0,
  visitors: 0,
  addToCart: 0,
  checkout: 0,
  orders: 0,
  ordersAll: 0,
  cancelled: 0,
  revenueGross: 0,
  revenueNet: 0,
  revenueConfirmed: 0,
  revenueDelivered: 0,
  ...o,
});
const plat = (spend: number) => ({
  spend,
  impressions: 6273,
  clicks: 240,
  linkClicks: 180,
  ctr: 3.8,
  cpc: 2.53,
  cpm: 96.8,
  metaPurchases: 5,
  metaPurchaseValue: 2500,
});

const status = (o: Partial<MetaAdsStatusView> = {}): MetaAdsStatusView => ({
  configured: true,
  missing: [],
  invalid: [],
  migrationApplied: true,
  apiVersion: "v25.0",
  lastAttempt: null,
  lastSuccess: {
    finishedAt: new Date().toISOString(),
    dateFrom: "2026-08-27",
    dateTo: "2026-09-25",
  },
  ...o,
});

const report = (): MetaAdsReport => ({
  period,
  model: "last",
  currency: "EGP",
  currencyMismatch: false,
  totals: {
    platform: plat(607.29),
    matched: site({
      sessions: 54,
      orders: 1,
      ordersAll: 1,
      revenueNet: 1000,
      revenueConfirmed: 1000,
    }),
    unmatchedMeta: site({ sessions: 3, ordersAll: 1 }),
    storeOrders: 8,
    storeRevenueNet: 7084,
    cpa: 607.29,
    roas: 1.65,
  },
  campaigns: [
    {
      id: "52575575055376",
      name: "IG | Sales | Offers 790-890 | Test 1",
      status: "PAUSED",
      objective: "OUTCOME_SALES",
      platform: plat(607.29),
      site: site({ sessions: 54, orders: 1, ordersAll: 1, revenueNet: 1000 }),
      cpa: 607.29,
      roas: 1.65,
      siteWithoutAd: site({ sessions: 2 }),
      adsets: [
        {
          id: "S1",
          name: "Egypt 18-45",
          status: "PAUSED",
          campaignId: "52575575055376",
          platform: plat(607.29),
          site: site({ sessions: 52, orders: 1, ordersAll: 1, revenueNet: 1000 }),
          cpa: 607.29,
          roas: 1.65,
          ads: [
            {
              id: "52575869248376",
              name: "Video ad",
              status: "PAUSED",
              adsetId: "S1",
              campaignId: "52575575055376",
              platform: plat(0),
              site: site({ sessions: 52, orders: 1, ordersAll: 1, revenueNet: 1000 }),
              cpa: null,
              roas: null,
            },
          ],
        },
      ],
    },
  ],
  matching: { byId: 55, byName: 0 },
  dataThrough: "2026-09-25",
  notes: ["Reach is not shown: it cannot be added across days without double counting people."],
});

let root: Root | null = null;
let container: HTMLElement;
async function mount(ui: ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(ui);
  });
}
async function settle(pattern: RegExp | string, timeout = 4000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });
    const t = container.textContent ?? "";
    if (typeof pattern === "string" ? t.includes(pattern) : pattern.test(t)) return t;
  }
  throw new Error(
    `Timed out waiting for ${pattern}. Rendered: ${(container.textContent ?? "").slice(0, 400)}`,
  );
}
const button = (label: RegExp) =>
  [...container.querySelectorAll("button")].find((b) => label.test(b.textContent ?? "")) as
    HTMLButtonElement | undefined;

beforeEach(() => {
  fns.report.mockReset();
  fns.sync.mockReset();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
});

describe("MetaAdsSection", () => {
  it("not configured: names the missing variables, never a value, and disables Sync now", async () => {
    fns.report.mockResolvedValue({
      status: status({
        configured: false,
        missing: ["META_MARKETING_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"],
        lastSuccess: null,
      }),
      report: report(),
    });
    await mount(<MetaAdsSection input={input} model="last" />);
    const t = await settle("META_MARKETING_ACCESS_TOKEN");
    expect(t).toContain("META_AD_ACCOUNT_ID");
    expect(t).toContain("ads_read");
    expect(t).toContain("No successful sync yet");
    expect(button(/Sync now/)!.disabled).toBe(true);
    expect(fns.sync).not.toHaveBeenCalled(); // no automatic sync without credentials
  });

  it("migration missing: says so and shows no table", async () => {
    fns.report.mockResolvedValue({
      status: status({ migrationApplied: false, lastSuccess: null }),
      report: null,
    });
    await mount(<MetaAdsSection input={input} model="last" />);
    const t = await settle("025_meta_ads_reporting.sql");
    expect(t).toContain("needs the database migration");
    expect(container.querySelector("table")).toBeNull();
  });

  it("shows spend, orders, revenue, CPA and ROAS, and drills campaign → ad set → ad", async () => {
    fns.report.mockResolvedValue({ status: status(), report: report() });
    await mount(<MetaAdsSection input={input} model="last" />);
    let t = await settle("IG | Sales | Offers 790-890 | Test 1");
    expect(t).toContain("1.65×");
    expect(t).toContain("Of 8 orders");
    expect(t).toContain("0 EGP from delivered ones");
    expect(t).toContain("Reach is not shown");
    expect(t).not.toContain("Infinity");
    expect(t).not.toContain("NaN");
    expect(t).not.toContain("Egypt 18-45"); // collapsed by default

    await act(async () => {
      (container.querySelector('button[aria-label="Expand"]') as HTMLButtonElement).click();
    });
    t = container.textContent ?? "";
    expect(t).toContain("Egypt 18-45");
    expect(t).toContain("Site traffic with no ad id in the link");

    await act(async () => {
      (container.querySelectorAll('button[aria-label="Expand"]')[0] as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("Video ad");
  });

  it("a row with no spend shows — for ROAS, not Infinity or 0×", async () => {
    fns.report.mockResolvedValue({ status: status(), report: report() });
    await mount(<MetaAdsSection input={input} model="last" />);
    await settle("IG | Sales");
    for (const b of container.querySelectorAll('button[aria-label="Expand"]'))
      (b as HTMLButtonElement).click();
    await act(async () => {});
    for (const b of container.querySelectorAll('button[aria-label="Expand"]'))
      (b as HTMLButtonElement).click();
    await act(async () => {});
    const adRow = [...container.querySelectorAll("tr")].find((r) =>
      r.textContent?.includes("Video ad"),
    )!;
    expect(adRow.textContent).toContain("—");
    expect(adRow.textContent).not.toMatch(/Infinity|NaN/);
  });

  it("a failed last sync keeps showing the last successful data and says why", async () => {
    fns.report.mockResolvedValue({
      status: status({
        lastAttempt: {
          status: "failed",
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          dateFrom: null,
          dateTo: null,
          rows: 0,
          message: "Invalid OAuth access token",
          errorKind: "auth",
        },
      }),
      report: report(),
    });
    await mount(<MetaAdsSection input={input} model="last" />);
    const t = await settle("Last attempt");
    expect(t).toContain("failed");
    expect(t).toContain("Meta rejected the access token");
    expect(t).toContain("Showing the last successful data");
    expect(t).toContain("IG | Sales | Offers 790-890 | Test 1");
  });

  it("Sync now calls the server, then reloads the report", async () => {
    fns.report.mockResolvedValue({ status: status(), report: report() });
    fns.sync.mockResolvedValue({
      ok: true,
      status: "success",
      dateFrom: "2026-08-27",
      dateTo: "2026-09-25",
      campaigns: 1,
      adsets: 1,
      ads: 1,
      insightRows: 30,
      message: null,
      errorKind: null,
    });
    await mount(<MetaAdsSection input={input} model="last" />);
    await settle("IG | Sales");
    const before = fns.report.mock.calls.length;
    await act(async () => {
      button(/Sync now/)!.click();
    });
    await settle(/Sync now/);
    expect(fns.sync).toHaveBeenCalledTimes(1);
    expect(fns.sync).toHaveBeenCalledWith({ data: {} });
    expect(fns.report.mock.calls.length).toBeGreaterThan(before);
  });

  it("refreshes itself once when the last sync is older than 12 hours", async () => {
    fns.report.mockResolvedValue({
      status: status({
        lastSuccess: {
          finishedAt: new Date(Date.now() - 20 * 3_600_000).toISOString(),
          dateFrom: null,
          dateTo: null,
        },
      }),
      report: report(),
    });
    fns.sync.mockResolvedValue({
      ok: true,
      status: "success",
      dateFrom: "",
      dateTo: "",
      campaigns: 0,
      adsets: 0,
      ads: 0,
      insightRows: 0,
      message: null,
      errorKind: null,
    });
    await mount(<MetaAdsSection input={input} model="last" />);
    await settle("IG | Sales");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(fns.sync).toHaveBeenCalledTimes(1);
  });

  it("does not auto-sync right after a failed attempt (no retry loop)", async () => {
    fns.report.mockResolvedValue({
      status: status({
        lastSuccess: {
          finishedAt: new Date(Date.now() - 20 * 3_600_000).toISOString(),
          dateFrom: null,
          dateTo: null,
        },
        lastAttempt: {
          status: "failed",
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          dateFrom: null,
          dateTo: null,
          rows: 0,
          message: null,
          errorKind: "rate_limit",
        },
      }),
      report: report(),
    });
    await mount(<MetaAdsSection input={input} model="last" />);
    await settle("IG | Sales");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(fns.sync).not.toHaveBeenCalled();
  });
});
