// @vitest-environment jsdom
/**
 * The Executive Dashboard's four marketing tiles: they show real Meta numbers
 * when synced, the real reason when not, and a failure there never takes the
 * rest of the dashboard down.
 */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MetaDashboardTiles } from "@/lib/meta-ads.types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fns = vi.hoisted(() => ({ dashboard: vi.fn(), alerts: vi.fn(), tiles: vi.fn() }));
vi.mock("@/lib/db-admin.functions", () => ({
  getExecutiveDashboardAdmin: fns.dashboard,
  getAlertsAdmin: fns.alerts,
}));
vi.mock("@/lib/meta-ads.functions", () => ({ getMetaDashboardTiles: fns.tiles }));

import { DashboardTab } from "./DashboardTab";

const dash = {
  orders: 1,
  ordersPrev: 0,
  revenue: 4550,
  revenuePrev: 0,
  averageOrderValue: 4550,
  cancelledOrders: 0,
  returnedOrders: 0,
  newCustomers: 1,
  returningCustomers: 0,
  visitors: 13,
  conversionRate: 0.077,
};

const tiles = (o: Partial<MetaDashboardTiles> = {}): MetaDashboardTiles => ({
  state: "ok",
  stale: false,
  lastSuccessAt: "2026-09-27T10:00:00Z",
  dataThrough: "2026-09-27",
  missing: [],
  currencyMismatch: false,
  spend: 607.29,
  orders: 5,
  revenueNet: 7084,
  cpa: 121.458,
  roas: 11.66,
  unmatchedOrders: 1,
  ...o,
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
    `Timed out waiting for ${pattern}. Rendered: ${(container.textContent ?? "").slice(0, 500)}`,
  );
}

beforeEach(() => {
  fns.dashboard.mockReset().mockResolvedValue(dash);
  fns.alerts.mockReset().mockResolvedValue([]);
  fns.tiles.mockReset();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
});

describe("Executive Dashboard — marketing tiles", () => {
  it("synced: shows spend, ROAS, cost per order and ad-sourced orders from Meta data", async () => {
    fns.tiles.mockResolvedValue(tiles());
    await mount(<DashboardTab />);
    const t = await settle("607 EGP");
    expect(t).toContain("Marketing spend (Meta)");
    expect(t).toContain("11.66×");
    expect(t).toContain("121 EGP"); // cost per order
    expect(t).toContain("Ad-sourced orders");
    expect(t).toContain("+1 untraced");
    expect(t).toContain("through 2026-09-27");
    expect(t).toContain("placed orders, not delivered");
    expect(t).not.toContain("Not connected");
    expect(fns.tiles).toHaveBeenCalledWith({ data: { range: "today" } });
  });

  it("not configured: every tile says why, names the variables, and shows no number", async () => {
    fns.tiles.mockResolvedValue(
      tiles({
        state: "not_configured",
        missing: ["META_MARKETING_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"],
        spend: null,
        orders: null,
        cpa: null,
        roas: null,
        lastSuccessAt: null,
      }),
    );
    await mount(<DashboardTab />);
    const t = await settle("META_MARKETING_ACCESS_TOKEN");
    expect(t).toContain("META_AD_ACCOUNT_ID");
    expect(t).not.toContain("Meta/TikTok");
    expect(t).toMatch(/—Marketing spendNot connected/);
  });

  it.each([
    ["migration_missing", "migration for Meta Ads is pending"],
    ["never_synced", "press Sync now"],
    ["not_covered", "Not synced for this period"],
    ["unavailable", "Temporarily unavailable"],
  ] as const)("%s → an honest explanation", async (state, text) => {
    fns.tiles.mockResolvedValue(tiles({ state, spend: null, orders: null, cpa: null, roas: null }));
    await mount(<DashboardTab />);
    await settle(text);
  });

  it("zero spend / zero orders show — with a reason, never Infinity or a fake 0×", async () => {
    fns.tiles.mockResolvedValue(
      tiles({ spend: 0, orders: 0, cpa: null, roas: null, revenueNet: 0, unmatchedOrders: 0 }),
    );
    await mount(<DashboardTab />);
    const t = await settle("no spend");
    expect(t).not.toMatch(/Infinity|NaN|0\.00×/);
  });

  it("stale data is labelled, not hidden", async () => {
    fns.tiles.mockResolvedValue(tiles({ stale: true }));
    await mount(<DashboardTab />);
    const t = await settle("stale");
    expect(t).toContain("older than 12 hours or the last sync failed");
    expect(t).toContain("607 EGP");
  });

  it("if reading the marketing tiles fails, the rest of the dashboard still renders", async () => {
    fns.tiles.mockRejectedValue(new Error("boom"));
    await mount(<DashboardTab />);
    const t = await settle("Temporarily unavailable");
    expect(t).toContain("4,550 EGP"); // Sales tiles are unaffected
    expect(t).toContain("Website visitors");
  });

  it("changing the period reloads the marketing tiles for that period", async () => {
    fns.tiles.mockResolvedValue(tiles());
    await mount(<DashboardTab />);
    await settle("607 EGP");
    const btn = [...container.querySelectorAll("button")].find((b) => b.textContent === "30 Days")!;
    await act(async () => btn.click());
    await settle("607 EGP");
    expect(fns.tiles).toHaveBeenLastCalledWith({ data: { range: "30d" } });
  });

  it("links to the Meta Ads breakdown when the parent supports navigation", async () => {
    fns.tiles.mockResolvedValue(tiles());
    const nav = vi.fn();
    await mount(<DashboardTab onNavigate={nav} />);
    await settle("Campaign breakdown");
    const link = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Campaign breakdown",
    )!;
    await act(async () => link.click());
    expect(nav).toHaveBeenCalledWith("analytics");
  });
});
