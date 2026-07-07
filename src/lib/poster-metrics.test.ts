import { describe, it, expect } from "vitest";
import {
  conversionRatePct,
  ctrPct,
  avgViewSeconds,
  formatRatePct,
  formatAvgTime,
} from "./poster-metrics";

describe("conversionRatePct", () => {
  it("returns 0 when views are 0/null/undefined/negative", () => {
    expect(conversionRatePct(5, 0)).toBe(0);
    expect(conversionRatePct(5, null)).toBe(0);
    expect(conversionRatePct(5, undefined)).toBe(0);
    expect(conversionRatePct(5, -3)).toBe(0);
  });
  it("computes sales / views as a percentage", () => {
    expect(conversionRatePct(1, 4)).toBe(25);
    expect(conversionRatePct(3, 10)).toBe(30);
  });
  it("treats null/negative sales as 0", () => {
    expect(conversionRatePct(null, 10)).toBe(0);
    expect(conversionRatePct(-2, 10)).toBe(0);
  });
});

describe("ctrPct", () => {
  it("returns 0 when views are 0/null/undefined", () => {
    expect(ctrPct(7, 0)).toBe(0);
    expect(ctrPct(7, null)).toBe(0);
    expect(ctrPct(7, undefined)).toBe(0);
  });
  it("computes cart_adds / views as a percentage", () => {
    expect(ctrPct(2, 8)).toBe(25);
    expect(ctrPct(5, 10)).toBe(50);
  });
});

describe("avgViewSeconds", () => {
  it("returns 0 when views are 0/null/undefined", () => {
    expect(avgViewSeconds(120, 0)).toBe(0);
    expect(avgViewSeconds(120, null)).toBe(0);
    expect(avgViewSeconds(120, undefined)).toBe(0);
  });
  it("computes total_seconds / views", () => {
    expect(avgViewSeconds(100, 4)).toBe(25);
    expect(avgViewSeconds(45, 3)).toBe(15);
  });
  it("never returns NaN or Infinity", () => {
    expect(Number.isFinite(avgViewSeconds(0, 0))).toBe(true);
    expect(Number.isFinite(avgViewSeconds(null, null))).toBe(true);
  });
});

describe("formatRatePct", () => {
  it('returns "—" when views are 0/null/undefined', () => {
    expect(formatRatePct(12.34, 0)).toBe("—");
    expect(formatRatePct(12.34, null)).toBe("—");
    expect(formatRatePct(12.34, undefined)).toBe("—");
  });
  it("formats to 2 decimals with % when views > 0", () => {
    expect(formatRatePct(12.3456, 10)).toBe("12.35%");
    expect(formatRatePct(0, 10)).toBe("0.00%");
  });
});

describe("formatAvgTime", () => {
  it('returns "—" when views are 0/null/undefined', () => {
    expect(formatAvgTime(90, 0)).toBe("—");
    expect(formatAvgTime(90, null)).toBe("—");
    expect(formatAvgTime(90, undefined)).toBe("—");
  });
  it("formats seconds under a minute as Ns", () => {
    expect(formatAvgTime(45, 3)).toBe("45s");
    expect(formatAvgTime(0, 1)).toBe("0s");
  });
  it("formats seconds >= 60 as Mm SSs with zero-padded seconds", () => {
    expect(formatAvgTime(65, 1)).toBe("1m 05s");
    expect(formatAvgTime(125, 1)).toBe("2m 05s");
    expect(formatAvgTime(3600, 1)).toBe("60m 00s");
  });
});