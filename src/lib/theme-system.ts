import { useEffect, useState } from "react";
import { getSiteSettingsPublic } from "@/lib/db-public.functions";
import {
  setSiteSetting,
  setSiteSettingWithHistory,
  getSiteSettingHistory as getSiteSettingHistoryFn,
  restoreSiteSettingVersionToDraft,
} from "@/lib/db-admin.functions";
import {
  THEME_TOKEN_KEYS,
  isThemeTokenKey,
  isValidHexColor,
  SHADOW_VAR_KEYS,
  isShadowVarKey,
  isValidBoxShadowValue,
  isValidLogoUrl,
} from "@/lib/theme-tokens";

// One brand, one engine: Light / Dark / System — not a named-preset picker.
// "System" is never written to the DOM as a literal value; it's always
// resolved to a concrete "light" | "dark" before it reaches `data-theme`
// (server-side when we know the mode is explicit, client-side via
// matchMedia when it's "system" — see __root.tsx).
export type ThemeMode = "light" | "dark" | "system";
export type ResolvedThemeMode = "light" | "dark";

export const WEBSITE_THEME_KEY = "website_theme_settings_v1";
export const WEBSITE_THEME_DRAFT_KEY = "website_theme_settings_draft_v1";

// Client-side cache only (mirrors the published value for instant repeat
// paints / the system-mode pin script) — never the source of truth. The
// source of truth is always Neon (site_settings), read via
// getSiteSettingsPublic.
export const THEME_MODE_CACHE_KEY = "brw_theme_mode";
export const THEME_PREVIEW_MODE_KEY = "brw_theme_preview_mode";

export const DEFAULT_THEME_MODE: ThemeMode = "dark";

/** Hex overrides for a subset of THEME_TOKEN_KEYS. A key absent here means "use the stylesheet default". */
export type ThemeColorOverrides = Partial<Record<string, string>>;

/** box-shadow overrides for the "theme-shadow-sm/md/lg" keys. A key absent here means "use the soft/Tailwind default". */
export type ThemeShadowOverrides = Partial<Record<string, string>>;

/** Optional per-mode logo image URL. Absent/undefined means "use the site's default logo" (branding.ts's logoUrl). */
export type ThemeLogoOverrides = { light?: string; dark?: string };

export type ThemeTypography = {
  /** Base font size in px, applied to <html>. Browser/Tailwind default (16px) when unset. */
  fontSizeBasePx?: number;
  /** font-weight for h1-h3/.display. CSS default (700) when unset. */
  headingWeight?: number;
  /** font-weight for body text. CSS default (400) when unset. */
  bodyWeight?: number;
  /** Overrides --radius (rem). Stylesheet default (0.25rem) when unset. */
  radiusRem?: number;
};

export type WebsiteThemeSettings = {
  mode: ThemeMode;
  colors: { light: ThemeColorOverrides; dark: ThemeColorOverrides };
  shadows: { light: ThemeShadowOverrides; dark: ThemeShadowOverrides };
  typography: ThemeTypography;
  logos: ThemeLogoOverrides;
  updatedAt?: string;
};

export function normalizeThemeMode(value: unknown): ThemeMode {
  return value === "light" || value === "dark" || value === "system" ? value : DEFAULT_THEME_MODE;
}

/** Keeps only known token keys with a well-formed #rrggbb value — never trusts stored JSON blindly. */
function normalizeColorOverrides(value: unknown): ThemeColorOverrides {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const out: ThemeColorOverrides = {};
  for (const key of THEME_TOKEN_KEYS) {
    const v = raw[key];
    if (isThemeTokenKey(key) && isValidHexColor(v)) out[key] = v.toLowerCase();
  }
  return out;
}

/** Keeps only known shadow-var keys with a well-formed, safe box-shadow value. */
function normalizeShadowOverrides(value: unknown): ThemeShadowOverrides {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const out: ThemeShadowOverrides = {};
  for (const key of SHADOW_VAR_KEYS) {
    const v = raw[key];
    if (isShadowVarKey(key) && isValidBoxShadowValue(v)) out[key] = v.trim();
  }
  return out;
}

/** Keeps only well-formed https logo URLs — an invalid/missing value means "no override". */
function normalizeLogos(value: unknown): ThemeLogoOverrides {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const out: ThemeLogoOverrides = {};
  if (isValidLogoUrl(raw.light)) out.light = raw.light;
  if (isValidLogoUrl(raw.dark)) out.dark = raw.dark;
  return out;
}

function clampNumber(v: unknown, min: number, max: number): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}

function normalizeTypography(value: unknown): ThemeTypography {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const out: ThemeTypography = {};
  const fontSizeBasePx = clampNumber(raw.fontSizeBasePx, 13, 20);
  if (fontSizeBasePx !== undefined) out.fontSizeBasePx = fontSizeBasePx;
  const headingWeight = clampNumber(raw.headingWeight, 400, 900);
  if (headingWeight !== undefined) out.headingWeight = Math.round(headingWeight / 100) * 100;
  const bodyWeight = clampNumber(raw.bodyWeight, 300, 700);
  if (bodyWeight !== undefined) out.bodyWeight = Math.round(bodyWeight / 100) * 100;
  const radiusRem = clampNumber(raw.radiusRem, 0, 1.5);
  if (radiusRem !== undefined) out.radiusRem = Math.round(radiusRem * 100) / 100;
  return out;
}

export function normalizeThemeSettings(value: unknown): WebsiteThemeSettings {
  const empty: WebsiteThemeSettings = {
    mode: DEFAULT_THEME_MODE,
    colors: { light: {}, dark: {} },
    shadows: { light: {}, dark: {} },
    typography: {},
    logos: {},
  };
  if (!value || typeof value !== "object") return empty;
  const raw = value as Record<string, unknown>;
  const rawColors = (raw.colors ?? {}) as Record<string, unknown>;
  const rawShadows = (raw.shadows ?? {}) as Record<string, unknown>;
  return {
    mode: normalizeThemeMode(raw.mode),
    colors: {
      light: normalizeColorOverrides(rawColors.light),
      dark: normalizeColorOverrides(rawColors.dark),
    },
    shadows: {
      light: normalizeShadowOverrides(rawShadows.light),
      dark: normalizeShadowOverrides(rawShadows.dark),
    },
    typography: normalizeTypography(raw.typography),
    logos: normalizeLogos(raw.logos),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
  };
}

const isEmptyOverrides = (o: ThemeColorOverrides | ThemeShadowOverrides) =>
  Object.keys(o).length === 0;
const isEmptyTypography = (t: ThemeTypography) => Object.keys(t).length === 0;
const isEmptyLogos = (l: ThemeLogoOverrides) => !l.light && !l.dark;

/** True once the admin has customized ANYTHING beyond the plain mode. */
export function hasThemeCustomizations(s: WebsiteThemeSettings): boolean {
  return (
    !isEmptyOverrides(s.colors.light) ||
    !isEmptyOverrides(s.colors.dark) ||
    !isEmptyOverrides(s.shadows.light) ||
    !isEmptyOverrides(s.shadows.dark) ||
    !isEmptyTypography(s.typography) ||
    !isEmptyLogos(s.logos)
  );
}

function cssBlock(
  selector: string,
  colorOverrides: ThemeColorOverrides,
  shadowOverrides: ThemeShadowOverrides,
  typography?: ThemeTypography,
): string {
  const lines: string[] = [];
  for (const [key, hex] of Object.entries(colorOverrides)) lines.push(`--${key}:${hex};`);
  for (const [key, value] of Object.entries(shadowOverrides)) lines.push(`--${key}:${value};`);
  if (typography?.radiusRem !== undefined) lines.push(`--radius:${typography.radiusRem}rem;`);
  if (typography?.fontSizeBasePx !== undefined)
    lines.push(`--theme-font-size-base:${typography.fontSizeBasePx}px;`);
  if (typography?.headingWeight !== undefined)
    lines.push(`--theme-font-weight-heading:${typography.headingWeight};`);
  if (typography?.bodyWeight !== undefined)
    lines.push(`--theme-font-weight-body:${typography.bodyWeight};`);
  return lines.length ? `${selector}{${lines.join("")}}` : "";
}

/**
 * Renders the settings' customizations (colors + shadows + typography) as
 * plain CSS text, mirroring styles.css's own three-block structure exactly
 * (:root for dark, [data-theme="light"] for light, and the
 * prefers-color-scheme fallback for pre-JS "system"+light-OS) — so
 * overrides win the cascade no matter which of those three paths resolved
 * the visitor's theme.
 *
 * Returns "" when nothing was customized: the caller then skips rendering a
 * <style> tag at all, and the page is byte-identical to the un-customized
 * stylesheet (see hasThemeCustomizations).
 */
export function buildThemeOverrideCss(s: WebsiteThemeSettings): string {
  if (!hasThemeCustomizations(s)) return "";
  const dark = cssBlock(":root", s.colors.dark, s.shadows.dark, s.typography);
  const light = cssBlock('[data-theme="light"]', s.colors.light, s.shadows.light, s.typography);
  const lightVars = { ...s.colors.light, ...s.shadows.light };
  const lightFallback = Object.keys(lightVars).length
    ? `@media (prefers-color-scheme: light){html:not([data-theme]){${Object.entries(lightVars)
        .map(([key, value]) => `--${key}:${value};`)
        .join("")}}}`
    : "";
  return [dark, light, lightFallback].filter(Boolean).join("");
}

/** "system" resolves per-visitor from OS preference; light/dark pass through. */
export function resolveThemeMode(mode: ThemeMode, prefersDark: boolean): ResolvedThemeMode {
  if (mode === "system") return prefersDark ? "dark" : "light";
  return mode;
}

/** Safe to call on the server (during SSR/loaders) or the client. */
export async function loadPublishedThemeSettings(): Promise<WebsiteThemeSettings> {
  const settings = await getSiteSettingsPublic({ data: { keys: [WEBSITE_THEME_KEY] } });
  return normalizeThemeSettings(settings[WEBSITE_THEME_KEY]);
}

/** Draft falls back to the published value when no draft has been saved yet. */
export async function loadDraftThemeSettings(): Promise<WebsiteThemeSettings> {
  const settings = await getSiteSettingsPublic({
    data: { keys: [WEBSITE_THEME_DRAFT_KEY, WEBSITE_THEME_KEY] },
  });
  if (settings[WEBSITE_THEME_DRAFT_KEY])
    return normalizeThemeSettings(settings[WEBSITE_THEME_DRAFT_KEY]);
  return normalizeThemeSettings(settings[WEBSITE_THEME_KEY]);
}

export function applyResolvedThemeToDocument(resolved: ResolvedThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = resolved;
}

function readResolvedThemeFromDom(): ResolvedThemeMode {
  // SSR already put the real resolved mode into <html data-theme> before
  // this ever runs client-side (explicit light/dark server-side, or the
  // inline pin script / prefers-color-scheme CSS fallback for "system"
  // before hydration) — reading it back here is the single correct source
  // of truth, not a guess. The "dark" fallback only matters for the very
  // first server render, where it matches DEFAULT_THEME_MODE.
  if (typeof document === "undefined") return "dark";
  const value = document.documentElement.dataset.theme;
  return value === "light" ? "light" : "dark";
}

/**
 * Reactively tracks <html data-theme>, for the rare client component (e.g.
 * a per-mode logo) that needs the ACTUAL resolved mode rather than the
 * site's configured ThemeMode ("system" isn't itself renderable). Prefer
 * `themeMode` from the root loader directly when "system" doesn't need
 * special handling — this hook exists for the cases that do.
 */
export function useResolvedThemeMode(): ResolvedThemeMode {
  const [mode, setMode] = useState<ResolvedThemeMode>(readResolvedThemeFromDom);
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setMode(readResolvedThemeFromDom());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return mode;
}

export function cacheThemeModeLocally(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_MODE_CACHE_KEY, mode);
  } catch {
    // Storage can be unavailable (private browsing) — cache is best-effort only.
  }
}

export function readCachedThemeMode(): ThemeMode | null {
  try {
    const value = localStorage.getItem(THEME_MODE_CACHE_KEY);
    return value === "light" || value === "dark" || value === "system" ? value : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------
// Preview (draft, session-scoped) — mirrors homepage-sections.ts's
// draft/preview convention via preview-mode.ts's `?preview=1` flag.
// ---------------------------------------------------------------
export function setThemePreviewMode(mode: ThemeMode) {
  try {
    sessionStorage.setItem(THEME_PREVIEW_MODE_KEY, mode);
  } catch {
    // Storage can be unavailable; the caller still re-renders with the preview mode.
  }
}

export function readThemePreviewMode(): ThemeMode | null {
  try {
    const value = sessionStorage.getItem(THEME_PREVIEW_MODE_KEY);
    return value === "light" || value === "dark" || value === "system" ? value : null;
  } catch {
    return null;
  }
}

export function clearThemePreviewMode() {
  try {
    sessionStorage.removeItem(THEME_PREVIEW_MODE_KEY);
  } catch {
    // Storage can be unavailable; clearing preview persistence is best effort.
  }
}

// ---------------------------------------------------------------
// Admin actions — draft / publish / version history / rollback
// ---------------------------------------------------------------
/** Input helper: build a full settings object from partial edits over a base. */
export function withThemeChanges(
  base: WebsiteThemeSettings,
  changes: Partial<Pick<WebsiteThemeSettings, "mode">> & {
    colors?: Partial<{ light: ThemeColorOverrides; dark: ThemeColorOverrides }>;
    shadows?: Partial<{ light: ThemeShadowOverrides; dark: ThemeShadowOverrides }>;
    typography?: ThemeTypography;
    logos?: ThemeLogoOverrides;
  },
): WebsiteThemeSettings {
  return normalizeThemeSettings({
    mode: changes.mode ?? base.mode,
    colors: {
      light: changes.colors?.light ?? base.colors.light,
      dark: changes.colors?.dark ?? base.colors.dark,
    },
    shadows: {
      light: changes.shadows?.light ?? base.shadows.light,
      dark: changes.shadows?.dark ?? base.shadows.dark,
    },
    typography: changes.typography ?? base.typography,
    logos: changes.logos ?? base.logos,
  });
}

export async function saveThemeDraft(
  settings: WebsiteThemeSettings,
): Promise<WebsiteThemeSettings> {
  const normalized = normalizeThemeSettings({ ...settings, updatedAt: new Date().toISOString() });
  await setSiteSetting({ data: { key: WEBSITE_THEME_DRAFT_KEY, value: normalized } });
  return normalized;
}

export async function publishTheme(settings: WebsiteThemeSettings): Promise<WebsiteThemeSettings> {
  const normalized = normalizeThemeSettings({ ...settings, updatedAt: new Date().toISOString() });
  // Keep the draft in sync with what's now live, so the next edit starts from it.
  await setSiteSetting({ data: { key: WEBSITE_THEME_DRAFT_KEY, value: normalized } });
  await setSiteSettingWithHistory({ data: { key: WEBSITE_THEME_KEY, value: normalized } });
  return normalized;
}

export type ThemeHistoryEntry = {
  id: string;
  key: string;
  value: unknown;
  created_at: string;
  created_by: string | null;
  created_by_email: string | null;
};

export async function getThemeHistory(limit = 20): Promise<ThemeHistoryEntry[]> {
  const rows = await getSiteSettingHistoryFn({ data: { key: WEBSITE_THEME_KEY, limit } });
  return rows as ThemeHistoryEntry[];
}

/** Loads a past version back into the draft — admin still previews before re-publishing. */
export async function restoreThemeVersionToDraft(historyId: string): Promise<WebsiteThemeSettings> {
  const result = await restoreSiteSettingVersionToDraft({
    data: { historyId, draftKey: WEBSITE_THEME_DRAFT_KEY },
  });
  return normalizeThemeSettings(result.value);
}

/** Clears the draft's colors + shadows (+ logo) for ONE mode only — mode and the other palette are kept. */
export async function resetThemeDraftScope(
  base: WebsiteThemeSettings,
  scope: "light" | "dark" | "typography" | "all",
): Promise<WebsiteThemeSettings> {
  const next: WebsiteThemeSettings =
    scope === "all"
      ? {
          mode: DEFAULT_THEME_MODE,
          colors: { light: {}, dark: {} },
          shadows: { light: {}, dark: {} },
          typography: {},
          logos: {},
        }
      : scope === "typography"
        ? { ...base, typography: {} }
        : {
            ...base,
            colors: { ...base.colors, [scope]: {} },
            shadows: { ...base.shadows, [scope]: {} },
            logos: { ...base.logos, [scope]: undefined },
          };
  return saveThemeDraft(next);
}
