import { describe, expect, it } from "vitest";
import { resolveAnalyticsRange } from "./store-time";

// 2026-09-24 12:00 UTC = 15:00 in Cairo (UTC+3, summer time).
const NOW = new Date("2026-09-24T12:00:00Z");
const iso = (d: Date) => d.toISOString();

describe("resolveAnalyticsRange (Cairo days)", () => {
  it("today = Cairo midnight to next Cairo midnight, previous = yesterday", () => {
    const r = resolveAnalyticsRange("today", undefined, NOW);
    expect(iso(r.start)).toBe("2026-09-23T21:00:00.000Z");
    expect(iso(r.end)).toBe("2026-09-24T21:00:00.000Z");
    expect(iso(r.prevStart)).toBe("2026-09-22T21:00:00.000Z");
    expect(iso(r.prevEnd)).toBe(iso(r.start));
    expect(r.days).toBe(1);
  });

  it("an order at 01:30 Cairo belongs to that Cairo day, not the previous UTC day", () => {
    const r = resolveAnalyticsRange("today", undefined, new Date("2026-09-23T22:30:00Z")); // 01:30 Cairo on the 24th
    expect(iso(r.start)).toBe("2026-09-23T21:00:00.000Z");
  });

  it("yesterday", () => {
    const r = resolveAnalyticsRange("yesterday", undefined, NOW);
    expect(iso(r.start)).toBe("2026-09-22T21:00:00.000Z");
    expect(iso(r.end)).toBe("2026-09-23T21:00:00.000Z");
  });

  it("7d and 30d are N calendar days ending today, compared with an equal-length previous period", () => {
    const w = resolveAnalyticsRange("7d", undefined, NOW);
    expect(w.days).toBe(7);
    expect(iso(w.start)).toBe("2026-09-17T21:00:00.000Z");
    expect(w.end.getTime() - w.start.getTime()).toBe(w.start.getTime() - w.prevStart.getTime());
    expect(iso(w.prevEnd)).toBe(iso(w.start));
    const m = resolveAnalyticsRange("30d", undefined, NOW);
    expect(m.days).toBe(30);
  });

  it("this month compares with the same elapsed span of last month", () => {
    const r = resolveAnalyticsRange("this_month", undefined, NOW);
    expect(iso(r.start)).toBe("2026-08-31T21:00:00.000Z"); // 1 Sep 00:00 Cairo
    expect(iso(r.end)).toBe("2026-09-24T21:00:00.000Z");
    expect(iso(r.prevStart)).toBe("2026-07-31T21:00:00.000Z"); // 1 Aug 00:00 Cairo
    expect(r.prevEnd.getTime() - r.prevStart.getTime()).toBe(r.end.getTime() - r.start.getTime());
  });

  it("previous month is the full month, compared with the month before it", () => {
    const r = resolveAnalyticsRange("last_month", undefined, NOW);
    expect(iso(r.start)).toBe("2026-07-31T21:00:00.000Z");
    expect(iso(r.end)).toBe("2026-08-31T21:00:00.000Z");
    expect(iso(r.prevStart)).toBe("2026-06-30T21:00:00.000Z");
    expect(iso(r.prevEnd)).toBe(iso(r.start));
  });

  it("custom range is inclusive of both dates and compared with the equal period before", () => {
    const r = resolveAnalyticsRange("custom", { from: "2026-09-10", to: "2026-09-12" }, NOW);
    expect(iso(r.start)).toBe("2026-09-09T21:00:00.000Z");
    expect(iso(r.end)).toBe("2026-09-12T21:00:00.000Z");
    expect(r.days).toBe(3);
    expect(iso(r.prevStart)).toBe("2026-09-06T21:00:00.000Z");
  });

  it("a reversed custom range is swapped rather than rejected", () => {
    const r = resolveAnalyticsRange("custom", { from: "2026-09-12", to: "2026-09-10" }, NOW);
    expect(r.days).toBe(3);
    expect(r.start.getTime()).toBeLessThan(r.end.getTime());
  });

  it("an incomplete custom range falls back to the last 7 days", () => {
    expect(resolveAnalyticsRange("custom", { from: "2026-09-10" }, NOW).days).toBe(7);
  });

  it("a huge custom range is capped", () => {
    const r = resolveAnalyticsRange("custom", { from: "2000-01-01", to: "2026-09-12" }, NOW);
    expect(r.days).toBeLessThanOrEqual(366);
  });
});
