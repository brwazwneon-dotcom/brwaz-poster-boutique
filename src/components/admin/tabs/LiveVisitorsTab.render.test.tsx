// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildLiveSnapshot, type LiveRow } from "@/lib/live-visitors-core";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fns = vi.hoisted(() => ({ live: vi.fn() }));
vi.mock("@/lib/live-visitors.functions", () => ({
  getLiveVisitorsAdmin: fns.live,
  getVisitorInsightsAdmin: async () => ({ ok: false, message: "n/a" }),
}));

import { LiveVisitorsTab } from "./LiveVisitorsTab";

const NOW = Date.now();
const iso = (s: number) => new Date(NOW - s * 1000).toISOString();
const row = (id: string, o: Partial<LiveRow> = {}): LiveRow => ({
  visitor_id: id,
  first_seen: iso(200),
  last_seen: iso(8),
  path: "/",
  title: null,
  country_code: "EG",
  country: "Egypt",
  region: null,
  city: "Alexandria",
  device: "mobile",
  browser: "Chrome",
  source: "instagram",
  screen: "small",
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
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}

beforeEach(() => fns.live.mockReset());
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
});

describe("Live Visitors tab", () => {
  it("shows the online count, locations, pages, devices and the privacy note", async () => {
    const rows = [
      row("aaaaaaaa-1", { city: "Alexandria" }),
      row("aaaaaaaa-2", {
        city: "Cairo",
        path: "/category/movies",
        device: "desktop",
        last_seen: iso(12),
      }),
      row("aaaaaaaa-3", {
        country_code: "SA",
        country: "Saudi Arabia",
        city: "Riyadh",
        path: "/cart",
      }),
    ];
    fns.live.mockResolvedValue({
      ok: true,
      snapshot: buildLiveSnapshot(rows, NOW, 90),
      serverTime: new Date(NOW).toISOString(),
    });
    await mount(<LiveVisitorsTab />);
    const t = container.textContent ?? "";
    expect(fns.live).toHaveBeenCalledWith({ data: { windowSeconds: 90 } });
    expect(t).toContain("Currently online");
    expect(t).toMatch(/Currently online\s*3/);
    expect(t).toContain("Egypt");
    expect(t).toContain("Saudi Arabia");
    expect(t).toContain("Alexandria");
    expect(t).toContain("Category: movies");
    expect(t).toContain("Cart");
    expect(t).toContain("90 seconds");
    expect(t).toContain("not precise GPS location");
    // no raw IP shape anywhere on screen
    expect(t).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
  });

  it("says so when nobody is online", async () => {
    fns.live.mockResolvedValue({
      ok: true,
      snapshot: buildLiveSnapshot([], NOW, 90),
      serverTime: "",
    });
    await mount(<LiveVisitorsTab />);
    expect(container.textContent).toContain("Nobody is on the site right now.");
  });

  it("explains a missing migration instead of failing", async () => {
    fns.live.mockResolvedValue({
      ok: false,
      reason: "migration_missing",
      message:
        "Live visitor tracking is not set up yet: database migration 027 has not been applied.",
    });
    await mount(<LiveVisitorsTab />);
    expect(container.querySelector("[role=alert]")?.textContent).toContain("migration 027");
  });

  it("does not poll while its tab is hidden", async () => {
    await mount(<LiveVisitorsTab active={false} />);
    expect(fns.live).not.toHaveBeenCalled();
  });
});
