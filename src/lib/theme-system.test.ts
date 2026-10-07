import { describe, expect, it } from "vitest";
import { DEFAULT_THEME_ID, SITE_THEMES, getTheme } from "./theme-system";

describe("theme system", () => {
  it("V2 poster-wall is the default and resolves", () => {
    expect(DEFAULT_THEME_ID).toBe("poster-wall");
    expect(getTheme(DEFAULT_THEME_ID).id).toBe("poster-wall");
  });

  it("unknown ids fall back to the first theme (the default)", () => {
    expect(getTheme("nope").id).toBe(SITE_THEMES[0].id);
    expect(SITE_THEMES[0].id).toBe(DEFAULT_THEME_ID);
  });

  it("keeps the legacy dark theme available", () => {
    expect(getTheme("brw-classic").id).toBe("brw-classic");
  });

  it("poster-wall text/background tokens meet WCAG AA contrast", () => {
    const lum = (hex: string) => {
      const c = [1, 3, 5]
        .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
      return (x + 0.05) / (y + 0.05);
    };
    const t = getTheme("poster-wall").tokens;
    expect(ratio(t.foreground, t.background)).toBeGreaterThan(7);
    expect(ratio(t.mutedForeground, t.background)).toBeGreaterThan(4.5);
    expect(ratio(t.mutedForeground, t.muted)).toBeGreaterThan(4.5);
    expect(ratio(t.primaryForeground, t.primary)).toBeGreaterThan(7);
  });
});
