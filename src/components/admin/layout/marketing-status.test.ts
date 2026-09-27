import { describe, expect, it } from "vitest";
import { marketingStatusLabel } from "./marketing-status";
import type { MetaAdsStatusView } from "@/lib/meta-ads.types";

const NOW = new Date("2026-09-27T12:00:00Z");
const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const status = (o: Partial<MetaAdsStatusView> = {}): MetaAdsStatusView => ({
  configured: true,
  missing: [],
  invalid: [],
  migrationApplied: true,
  apiVersion: "v25.0",
  lastAttempt: null,
  lastSuccess: { finishedAt: ago(2), dateFrom: null, dateTo: null },
  ...o,
});

describe("marketingStatusLabel", () => {
  it("unknown status never claims a connection", () => {
    expect(marketingStatusLabel(null, NOW)).toEqual({
      text: "Marketing: status unavailable",
      tone: "muted",
    });
  });
  it("not migrated / no credentials → not connected", () => {
    expect(
      marketingStatusLabel(status({ migrationApplied: false, lastSuccess: null }), NOW).text,
    ).toBe("Meta Ads: not connected");
    expect(marketingStatusLabel(status({ configured: false, lastSuccess: null }), NOW).text).toBe(
      "Meta Ads: not connected",
    );
  });
  it("credentials but never synced", () => {
    expect(marketingStatusLabel(status({ lastSuccess: null }), NOW)).toEqual({
      text: "Meta Ads: connected, not synced",
      tone: "warn",
    });
  });
  it("fresh sync", () => {
    expect(marketingStatusLabel(status(), NOW)).toEqual({
      text: "Meta Ads: synced 2h ago",
      tone: "ok",
    });
    expect(
      marketingStatusLabel(
        status({ lastSuccess: { finishedAt: ago(0.2), dateFrom: null, dateTo: null } }),
        NOW,
      ).text,
    ).toBe("Meta Ads: synced just now");
  });
  it("older than 12 hours is stale, and days are shown as days", () => {
    expect(
      marketingStatusLabel(
        status({ lastSuccess: { finishedAt: ago(13), dateFrom: null, dateTo: null } }),
        NOW,
      ),
    ).toEqual({ text: "Meta Ads: stale, last synced 13h ago", tone: "warn" });
    expect(
      marketingStatusLabel(
        status({ lastSuccess: { finishedAt: ago(72), dateFrom: null, dateTo: null } }),
        NOW,
      ).text,
    ).toBe("Meta Ads: stale, last synced 3d ago");
  });
  it("a failed attempt after the last success is stale even if recent", () => {
    const s = status({
      lastAttempt: {
        status: "failed",
        startedAt: ago(1),
        finishedAt: ago(1),
        dateFrom: null,
        dateTo: null,
        rows: 0,
        message: null,
        errorKind: "auth",
      },
    });
    expect(marketingStatusLabel(s, NOW).tone).toBe("warn");
  });
});
