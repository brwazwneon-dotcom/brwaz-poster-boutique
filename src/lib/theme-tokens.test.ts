import { describe, expect, it } from "vitest";
import {
  THEME_TOKENS,
  THEME_TOKEN_KEYS,
  THEME_TOKEN_GROUPS,
  isThemeTokenKey,
  isValidHexColor,
  oklchToHex,
  getDefaultTokenHex,
  SHADOW_SIZES,
  SHADOW_VAR_KEYS,
  SHADOW_PRESETS,
  SHADOW_SIZE_TO_VAR_KEY,
  isShadowVarKey,
  isValidBoxShadowValue,
  getDefaultShadowValue,
  isValidLogoUrl,
} from "./theme-tokens";

describe("THEME_TOKENS catalog", () => {
  it("has a unique key for every token", () => {
    expect(new Set(THEME_TOKEN_KEYS).size).toBe(THEME_TOKEN_KEYS.length);
  });

  it("every token belongs to a known group", () => {
    const groupIds = new Set(THEME_TOKEN_GROUPS.map((g) => g.id));
    for (const token of THEME_TOKENS) {
      expect(groupIds.has(token.group)).toBe(true);
    }
  });

  it("every token has both a light and dark default, and en+ar labels", () => {
    for (const token of THEME_TOKENS) {
      expect(token.defaultDark).toMatch(/^oklch\(/);
      expect(token.defaultLight).toMatch(/^oklch\(/);
      expect(token.label.en.length).toBeGreaterThan(0);
      expect(token.label.ar.length).toBeGreaterThan(0);
    }
  });

  it("isThemeTokenKey recognizes real keys and rejects unknown ones", () => {
    expect(isThemeTokenKey("background")).toBe(true);
    expect(isThemeTokenKey("primary")).toBe(true);
    expect(isThemeTokenKey("not-a-real-token")).toBe(false);
    expect(isThemeTokenKey("__proto__")).toBe(false);
  });
});

describe("isValidHexColor", () => {
  it("accepts well-formed 6-digit hex, case-insensitively", () => {
    expect(isValidHexColor("#ff0000")).toBe(true);
    expect(isValidHexColor("#FF0000")).toBe(true);
    expect(isValidHexColor("#a1b2c3")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isValidHexColor("ff0000")).toBe(false); // missing #
    expect(isValidHexColor("#fff")).toBe(false); // 3-digit shorthand not supported
    expect(isValidHexColor("#gggggg")).toBe(false); // not hex digits
    expect(isValidHexColor("red")).toBe(false);
    expect(isValidHexColor("")).toBe(false);
    expect(isValidHexColor(undefined)).toBe(false);
    expect(isValidHexColor(123)).toBe(false);
    expect(isValidHexColor("#ff0000; background: url(x)")).toBe(false);
  });
});

describe("oklchToHex", () => {
  it("converts pure black and pure white correctly", () => {
    expect(oklchToHex("oklch(0 0 0)")).toBe("#000000");
    expect(oklchToHex("oklch(1 0 0)")).toBe("#ffffff");
  });

  it("parses an alpha suffix without throwing and drops the alpha channel", () => {
    const hex = oklchToHex("oklch(0.5 0.1 217 / 50%)");
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("returns null for garbage input instead of throwing", () => {
    expect(oklchToHex("not-a-color")).toBeNull();
    expect(oklchToHex("rgb(0,0,0)")).toBeNull();
    expect(oklchToHex("")).toBeNull();
  });

  it("round-trips every token default to a well-formed hex string", () => {
    for (const token of THEME_TOKENS) {
      expect(oklchToHex(token.defaultDark)).toMatch(/^#[0-9a-f]{6}$/);
      expect(oklchToHex(token.defaultLight)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("getDefaultTokenHex", () => {
  it("returns the correct mode's default and is memoized (stable across calls)", () => {
    const darkFirst = getDefaultTokenHex("background", "dark");
    const darkSecond = getDefaultTokenHex("background", "dark");
    const light = getDefaultTokenHex("background", "light");
    expect(darkFirst).toBe(darkSecond);
    expect(darkFirst).not.toBe(light);
    expect(darkFirst).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("falls back to a neutral gray for an unknown key instead of throwing", () => {
    expect(getDefaultTokenHex("totally-made-up-token", "dark")).toBe("#888888");
  });
});

describe("shadow tokens", () => {
  it("SHADOW_SIZE_TO_VAR_KEY covers exactly the sm/md/lg sizes and matches SHADOW_VAR_KEYS", () => {
    for (const { size } of SHADOW_SIZES) {
      const key = SHADOW_SIZE_TO_VAR_KEY[size];
      expect(SHADOW_VAR_KEYS).toContain(key);
      expect(isShadowVarKey(key)).toBe(true);
    }
  });

  it("isShadowVarKey rejects unknown keys", () => {
    expect(isShadowVarKey("theme-shadow-xl")).toBe(false);
    expect(isShadowVarKey("background")).toBe(false);
  });

  it("every size has a 'none' and a 'soft' (default-equivalent) preset, for both modes", () => {
    for (const { size } of SHADOW_SIZES) {
      const presets = SHADOW_PRESETS[size];
      expect(presets.find((p) => p.id === "none")).toBeTruthy();
      const soft = presets.find((p) => p.id === "soft");
      expect(soft).toBeTruthy();
      expect(soft!.light).toMatch(/rgb\(0 0 0/);
      expect(soft!.dark).toMatch(/rgb\(0 0 0/);
    }
  });

  it("getDefaultShadowValue returns the 'soft' preset for the given mode", () => {
    expect(getDefaultShadowValue("md", "light")).toBe(
      SHADOW_PRESETS.md.find((p) => p.id === "soft")!.light,
    );
    expect(getDefaultShadowValue("md", "dark")).toBe(
      SHADOW_PRESETS.md.find((p) => p.id === "soft")!.dark,
    );
  });
});

describe("isValidBoxShadowValue", () => {
  it("accepts 'none' and every built-in preset value", () => {
    expect(isValidBoxShadowValue("none")).toBe(true);
    for (const size of Object.keys(SHADOW_PRESETS) as (keyof typeof SHADOW_PRESETS)[]) {
      for (const preset of SHADOW_PRESETS[size]) {
        expect(isValidBoxShadowValue(preset.light)).toBe(true);
        expect(isValidBoxShadowValue(preset.dark)).toBe(true);
      }
    }
  });

  it("accepts a well-formed hand-typed multi-layer value", () => {
    expect(isValidBoxShadowValue("0 4px 12px 0 rgba(0,0,0,0.3), inset 0 1px 0 #ffffff")).toBe(true);
  });

  it("rejects anything that could break out of a CSS declaration", () => {
    expect(isValidBoxShadowValue("0 0 0 red; } body { background: url(evil)")).toBe(false);
    expect(isValidBoxShadowValue("0 0 0 red}</style><script>alert(1)</script>")).toBe(false);
    expect(isValidBoxShadowValue("expression(alert(1))")).toBe(false);
    expect(isValidBoxShadowValue("0 0 0 url(javascript:alert(1))")).toBe(false);
  });

  it("rejects malformed or non-string values", () => {
    expect(isValidBoxShadowValue("")).toBe(false);
    expect(isValidBoxShadowValue("not a shadow")).toBe(false);
    expect(isValidBoxShadowValue(undefined)).toBe(false);
    expect(isValidBoxShadowValue(42)).toBe(false);
    expect(isValidBoxShadowValue("a".repeat(301))).toBe(false); // over the length cap
  });
});

describe("isValidLogoUrl", () => {
  it("accepts well-formed https URLs", () => {
    expect(isValidLogoUrl("https://res.cloudinary.com/demo/image/upload/logo.png")).toBe(true);
  });

  it("rejects non-https and malformed values", () => {
    expect(isValidLogoUrl("http://example.com/logo.png")).toBe(false); // not https
    expect(isValidLogoUrl("javascript:alert(1)")).toBe(false);
    expect(isValidLogoUrl("not a url")).toBe(false);
    expect(isValidLogoUrl("")).toBe(false);
    expect(isValidLogoUrl(undefined)).toBe(false);
    expect(isValidLogoUrl(123)).toBe(false);
  });
});
