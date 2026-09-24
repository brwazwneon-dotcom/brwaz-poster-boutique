import { describe, expect, it, vi } from "vitest";

// The report module imports the AI backend and the database client; neither is
// exercised here (pure helpers only).
const ai = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/lib/gemini.server", () => ({ generateTextPriority: ai.generate }));
vi.mock("@/lib/neon.server", () => ({ sql: vi.fn() }));
vi.mock("@tanstack/react-start/server", () => ({ getRequestHeader: vi.fn() }));

import {
  buildNarrative,
  findUnverifiedNumbers,
  resolveReportRange,
} from "./analytics-report.server";
import type { ReportData } from "./analytics-center.types";

// 2026-09-24 12:00 UTC = 15:00 Cairo.
const NOW = new Date("2026-09-24T12:00:00Z");

describe("resolveReportRange — complete Cairo days only", () => {
  it("daily defaults to yesterday", () => {
    const r = resolveReportRange("daily", undefined, NOW);
    expect(r.start.toISOString()).toBe("2026-09-22T21:00:00.000Z"); // 23 Sep 00:00 Cairo
    expect(r.end.toISOString()).toBe("2026-09-23T21:00:00.000Z");
    expect(r.days).toBe(1);
  });
  it("daily with a chosen day", () => {
    const r = resolveReportRange("daily", "2026-09-10", NOW);
    expect(r.start.toISOString()).toBe("2026-09-09T21:00:00.000Z");
    expect(r.days).toBe(1);
  });
  it("weekly is the 7 days ending yesterday, compared with the 7 before", () => {
    const r = resolveReportRange("weekly", undefined, NOW);
    expect(r.days).toBe(7);
    expect(r.end.toISOString()).toBe("2026-09-23T21:00:00.000Z");
    expect(r.prevEnd.toISOString()).toBe(r.start.toISOString());
    expect(r.end.getTime() - r.start.getTime()).toBe(r.start.getTime() - r.prevStart.getTime());
  });
  it("monthly is the whole calendar month containing the chosen day", () => {
    const r = resolveReportRange("monthly", "2026-09-15", NOW);
    expect(r.start.toISOString()).toBe("2026-08-31T21:00:00.000Z"); // 1 Sep 00:00 Cairo
    expect(r.end.toISOString()).toBe("2026-09-30T21:00:00.000Z"); // 1 Oct 00:00 Cairo
    expect(r.days).toBe(30);
  });
  it("monthly handles February", () => {
    expect(resolveReportRange("monthly", "2026-02-10", NOW).days).toBe(28);
  });
});

describe("findUnverifiedNumbers — the AI may not introduce numbers", () => {
  const report =
    "Visitors: 1,234 — +12.5% vs previous (1,097)\nOrders: 8\nRevenue: 11,124 EGP\nConversion 2.5%";
  it("accepts figures that are in the report (with or without thousands separators / rounding)", () => {
    expect(
      findUnverifiedNumbers(
        "Visitors were 1234, up 12.5%. Revenue reached 11124 EGP from 8 orders.",
        report,
      ),
    ).toEqual([]);
    expect(findUnverifiedNumbers("Conversion was about 2.5 percent.", report)).toEqual([]);
  });
  it("flags invented or miscalculated figures", () => {
    expect(
      findUnverifiedNumbers("Revenue was 99999 EGP and orders rose 40%.", report).sort(),
    ).toEqual(["40", "99999"]);
  });
  it("a narrative with no numbers has nothing to flag", () => {
    expect(findUnverifiedNumbers("Traffic grew and orders increased.", report)).toEqual([]);
  });
});

describe("buildNarrative — the AI only sees the measured report", () => {
  const reportText =
    "BRWAZWNEON MARKETING REPORT\n- Visitors: 75 — -22.7% vs previous (97)\n- Orders: 1\n- Revenue: 2,584 EGP";
  const report = { text: reportText } as ReportData;

  it("sends only the rule prompt plus the report text (no other business data)", async () => {
    ai.generate.mockResolvedValueOnce({
      content: "Visitors were 75 and there was 1 order.",
      provider: "gemini",
      key: "k1",
    });
    await buildNarrative(report);
    const arg = ai.generate.mock.calls.at(-1)![0];
    expect(arg.user).toBe(`REPORT (measured data):\n${reportText}`);
    expect(arg.system).toMatch(/Use ONLY numbers that appear in the report/);
    expect(arg.system).toMatch(/NOT CONNECTED/);
    expect(arg.temperature).toBeLessThanOrEqual(0.2);
    expect(Object.keys(arg).sort()).toEqual(["system", "temperature", "user"]);
  });

  it("a grounded summary has nothing flagged", async () => {
    ai.generate.mockResolvedValueOnce({
      content: "Visitors fell to 75 from 97, and revenue was 2584 EGP from 1 order.",
      provider: "gemini",
      key: "k1",
    });
    const n = await buildNarrative(report);
    expect(n.unverifiedNumbers).toEqual([]);
    expect(n.provider).toBe("gemini:k1");
  });

  it("invented or recalculated figures are returned for the UI to flag", async () => {
    ai.generate.mockResolvedValueOnce({
      content: "Revenue was 2584 EGP, roughly 3100 next week, a 35% rise.",
      provider: "gemini",
      key: "k1",
    });
    const n = await buildNarrative(report);
    expect(n.unverifiedNumbers.sort()).toEqual(["3100", "35"]);
  });

  it("a provider failure propagates (nothing is invented as a fallback)", async () => {
    ai.generate.mockRejectedValueOnce(new Error("All Gemini keys are unavailable"));
    await expect(buildNarrative(report)).rejects.toThrow(/unavailable/);
  });
});
