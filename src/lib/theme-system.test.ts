// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME_MODE,
  buildThemeOverrideCss,
  hasThemeCustomizations,
  normalizeThemeMode,
  normalizeThemeSettings,
  resolveThemeMode,
  withThemeChanges,
  type WebsiteThemeSettings,
} from "./theme-system";

const EMPTY: WebsiteThemeSettings = {
  mode: DEFAULT_THEME_MODE,
  colors: { light: {}, dark: {} },
  shadows: { light: {}, dark: {} },
  typography: {},
  logos: {},
};

describe("normalizeThemeMode", () => {
  it("passes through the three valid modes", () => {
    expect(normalizeThemeMode("light")).toBe("light");
    expect(normalizeThemeMode("dark")).toBe("dark");
    expect(normalizeThemeMode("system")).toBe("system");
  });

  it("falls back to the default for anything else", () => {
    expect(normalizeThemeMode("auto")).toBe(DEFAULT_THEME_MODE);
    expect(normalizeThemeMode(undefined)).toBe(DEFAULT_THEME_MODE);
    expect(normalizeThemeMode(null)).toBe(DEFAULT_THEME_MODE);
    expect(normalizeThemeMode(123)).toBe(DEFAULT_THEME_MODE);
  });
});

describe("resolveThemeMode", () => {
  it("resolves system by OS preference, and passes explicit modes through", () => {
    expect(resolveThemeMode("system", true)).toBe("dark");
    expect(resolveThemeMode("system", false)).toBe("light");
    expect(resolveThemeMode("light", true)).toBe("light");
    expect(resolveThemeMode("dark", false)).toBe("dark");
  });
});

describe("normalizeThemeSettings", () => {
  it("returns the empty default for garbage input, never throws", () => {
    expect(normalizeThemeSettings(null)).toEqual(EMPTY);
    expect(normalizeThemeSettings(undefined)).toEqual(EMPTY);
    expect(normalizeThemeSettings("nonsense")).toEqual(EMPTY);
    expect(normalizeThemeSettings(42)).toEqual(EMPTY);
  });

  it("strips unknown token keys and malformed hex values from color overrides", () => {
    const out = normalizeThemeSettings({
      mode: "dark",
      colors: {
        dark: {
          background: "#123ABC", // valid, should be lowercased
          "not-a-real-token": "#ffffff", // unknown key, dropped
          primary: "rgb(0,0,0)", // malformed hex, dropped
          foreground: "#zzzzzz", // malformed hex, dropped
        },
        light: {},
      },
    });
    expect(out.colors.dark).toEqual({ background: "#123abc" });
    expect(out.colors.light).toEqual({});
  });

  it("clamps and rounds typography to sane ranges", () => {
    const out = normalizeThemeSettings({
      mode: "light",
      typography: { fontSizeBasePx: 999, headingWeight: 550, bodyWeight: 50, radiusRem: 10 },
    });
    expect(out.typography.fontSizeBasePx).toBe(20); // clamped to max
    expect(out.typography.headingWeight).toBe(600); // 550 rounds up to the nearest 100
    expect(out.typography.bodyWeight).toBe(300); // clamped to min (300) then rounded
    expect(out.typography.radiusRem).toBe(1.5); // clamped to max
  });

  it("never trusts a raw prototype-polluting key", () => {
    const out = normalizeThemeSettings(
      JSON.parse('{"__proto__": {"polluted": true}, "mode": "dark"}'),
    );
    expect(out.mode).toBe("dark");
    expect((out as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("hasThemeCustomizations", () => {
  it("is false for a totally default settings object", () => {
    expect(hasThemeCustomizations(EMPTY)).toBe(false);
  });

  it("is true when either palette has an override", () => {
    expect(
      hasThemeCustomizations({ ...EMPTY, colors: { light: { background: "#ffffff" }, dark: {} } }),
    ).toBe(true);
    expect(
      hasThemeCustomizations({ ...EMPTY, colors: { light: {}, dark: { primary: "#000000" } } }),
    ).toBe(true);
  });

  it("is true when typography alone is customized", () => {
    expect(hasThemeCustomizations({ ...EMPTY, typography: { fontSizeBasePx: 18 } })).toBe(true);
  });
});

describe("buildThemeOverrideCss", () => {
  it("renders an empty string when nothing is customized — zero markup diff", () => {
    expect(buildThemeOverrideCss(EMPTY)).toBe("");
  });

  it("emits dark overrides under :root and light overrides under [data-theme=light]", () => {
    const css = buildThemeOverrideCss({
      ...EMPTY,
      colors: { dark: { background: "#0a0a0a" }, light: { background: "#ffffff" } },
    });
    expect(css).toContain(":root{--background:#0a0a0a;}");
    expect(css).toContain('[data-theme="light"]{--background:#ffffff;}');
  });

  it("adds a prefers-color-scheme fallback ONLY for light overrides (system+no-SSR-known-preference case)", () => {
    const lightOnly = buildThemeOverrideCss({
      ...EMPTY,
      colors: { dark: {}, light: { background: "#ffffff" } },
    });
    expect(lightOnly).toContain("@media (prefers-color-scheme: light)");

    const darkOnly = buildThemeOverrideCss({
      ...EMPTY,
      colors: { dark: { background: "#0a0a0a" }, light: {} },
    });
    expect(darkOnly).not.toContain("@media (prefers-color-scheme: light)");
  });

  it("includes typography custom properties on the dark (:root) block", () => {
    const css = buildThemeOverrideCss({
      ...EMPTY,
      typography: { radiusRem: 0.5, fontSizeBasePx: 18, headingWeight: 800, bodyWeight: 500 },
    });
    expect(css).toContain("--radius:0.5rem;");
    expect(css).toContain("--theme-font-size-base:18px;");
    expect(css).toContain("--theme-font-weight-heading:800;");
    expect(css).toContain("--theme-font-weight-body:500;");
  });
});

describe("withThemeChanges", () => {
  it("merges a partial change over a base without mutating the base", () => {
    const base = normalizeThemeSettings({
      mode: "dark",
      colors: { dark: { background: "#000000" } },
    });
    const next = withThemeChanges(base, { mode: "light" });
    expect(next.mode).toBe("light");
    expect(next.colors.dark).toEqual({ background: "#000000" }); // preserved
    expect(base.mode).toBe("dark"); // base untouched
  });

  it("replaces only the given palette when colors.light/dark is passed", () => {
    const base = normalizeThemeSettings({
      colors: { light: { background: "#ffffff" }, dark: { background: "#000000" } },
    });
    const next = withThemeChanges(base, { colors: { dark: { primary: "#ff0000" } } });
    expect(next.colors.dark).toEqual({ primary: "#ff0000" });
    expect(next.colors.light).toEqual({ background: "#ffffff" }); // untouched palette preserved
  });
});
