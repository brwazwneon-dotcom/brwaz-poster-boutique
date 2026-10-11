import { describe, expect, it } from "vitest";
import {
  buildVisitorInsights,
  clampInsightDays,
  type InsightVisitorRow,
} from "./visitor-insights-core";

const SINCE = Date.parse("2026-10-01T00:00:00Z");
const row = (id: string, o: Partial<InsightVisitorRow> = {}): InsightVisitorRow => ({
  visitor_id: id,
  visits: 1,
  days: 1,
  first_ever: "2026-10-05T10:00:00Z",
  country: "Egypt",
  country_code: "EG",
  city: "Cairo",
  governorate: null,
  device: "mobile",
  ...o,
});

describe("buildVisitorInsights", () => {
  it("counts new and returning visitors", () => {
    const r = buildVisitorInsights(
      [
        row("a"), // new: first visit inside the range, one day
        row("b", { days: 2 }), // came back on a second day
        row("c", { first_ever: "2026-09-20T00:00:00Z" }), // visited before the range
      ],
      30,
      SINCE,
    );
    expect(r.visitors).toBe(3);
    expect(r.newVisitors).toBe(1);
    expect(r.returningVisitors).toBe(2);
    expect(r.returningPercent).toBe(67);
  });

  it("tallies countries and cities, and where returning visitors come from", () => {
    const r = buildVisitorInsights(
      [
        row("a", { city: "Cairo" }),
        row("b", { city: "Alexandria", days: 3 }),
        row("c", { city: "Cairo", first_ever: "2026-09-01T00:00:00Z" }),
        row("d", { country: "Saudi Arabia", city: null, governorate: null }),
      ],
      7,
      SINCE,
    );
    expect(r.countries[0]).toMatchObject({ label: "Egypt", count: 3 });
    expect(r.cities[0]).toMatchObject({ label: "Cairo, Egypt", count: 2 });
    expect(r.returningCities.map((c) => c.label).sort()).toEqual([
      "Alexandria, Egypt",
      "Cairo, Egypt",
    ]);
  });

  it("is safe with no data and clamps the range", () => {
    const r = buildVisitorInsights([], 30, SINCE);
    expect(r.returningPercent).toBe(0);
    expect(r.cities).toEqual([]);
    expect(clampInsightDays("7")).toBe(7);
    expect(clampInsightDays(1000)).toBe(30);
  });
});
