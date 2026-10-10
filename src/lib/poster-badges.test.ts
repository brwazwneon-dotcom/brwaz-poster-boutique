import { describe, expect, it } from "vitest";
import {
  MIN_VIEWS_TO_SHOW,
  formatCompactCount,
  formatCount,
  shouldShowViews,
} from "./poster-badges";

describe("poster view counts", () => {
  it("formats big real counts compactly", () => {
    expect(formatCompactCount(7)).toBe("7");
    expect(formatCompactCount(999)).toBe("999");
    expect(formatCompactCount(1000)).toBe("1K");
    expect(formatCompactCount(1234)).toBe("1.2K");
    expect(formatCompactCount(12_500)).toBe("12.5K");
    expect(formatCompactCount(1_200_000)).toBe("1.2M");
  });

  it("handles empty and invalid input", () => {
    expect(formatCompactCount(null)).toBe("0");
    expect(formatCompactCount(undefined)).toBe("0");
    expect(formatCompactCount(Number.NaN)).toBe("0");
    expect(formatCompactCount(-5)).toBe("0");
    expect(formatCount(1234)).toBe("1,234");
  });

  it("leaves the views line out until the real count says something", () => {
    expect(shouldShowViews(0)).toBe(false);
    expect(shouldShowViews(1)).toBe(false);
    expect(shouldShowViews(MIN_VIEWS_TO_SHOW - 1)).toBe(false);
    expect(shouldShowViews(MIN_VIEWS_TO_SHOW)).toBe(true);
    expect(shouldShowViews(null)).toBe(false);
  });
});
