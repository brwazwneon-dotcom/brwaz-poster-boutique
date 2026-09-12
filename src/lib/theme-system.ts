import { getSiteSettingsPublic } from "@/lib/db-public.functions";
import { setSiteSetting } from "@/lib/db-admin.functions";

export const ACTIVE_THEME_KEY = "active_theme";
export const THEME_SETTINGS_KEY = "theme_settings";
export const THEME_STORAGE_KEY = "brw_active_theme";
export const THEME_SETTINGS_STORAGE_KEY = "brw_theme_settings";
export const THEME_PREVIEW_STORAGE_KEY = "brw_theme_preview";

export type ThemeId =
  "brw-classic" | "neon-gallery" | "warm-studio" | "midnight-luxe" | "gallery-white";

export type ThemeTokens = {
  radius: string;
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  sidebar: string;
  sidebarForeground: string;
  sidebarPrimary: string;
  sidebarPrimaryForeground: string;
  sidebarAccent: string;
  sidebarAccentForeground: string;
  sidebarBorder: string;
  sidebarRing: string;
  fontDisplay: string;
  fontBody: string;
  surface?: string;
  textSecondary?: string;
  textMuted?: string;
  headerBackground?: string;
  footerBackground?: string;
  footerText?: string;
  cardShadow?: string;
  floatingShadow?: string;
  focusRing?: string;
  inputBackground?: string;
};

export type SiteTheme = {
  id: ThemeId;
  name: string;
  description: string;
  preview: string[];
  tokens: ThemeTokens;
  nameAr?: string;
  descriptionAr?: string;
  nameKey?: string;
  descriptionKey?: string;
  badge?: string;
  badgeAr?: string;
  badgeKey?: string;
  isLight?: boolean;
};

export type ThemeSettings = {
  activeTheme: ThemeId;
  previousTheme?: ThemeId;
  updatedAt?: string;
};

export const DEFAULT_THEME_ID: ThemeId = "brw-classic";

export const SITE_THEMES: SiteTheme[] = [
  {
    id: "brw-classic",
    name: "BRW Classic",
    description: "Current black-and-white storefront with sharp gallery contrast.",
    preview: ["#050505", "#ffffff", "#242424"],
    tokens: {
      radius: "0.25rem",
      background: "oklch(0.06 0 0)",
      foreground: "oklch(0.98 0 0)",
      card: "oklch(0.10 0 0)",
      cardForeground: "oklch(0.98 0 0)",
      popover: "oklch(0.10 0 0)",
      popoverForeground: "oklch(0.98 0 0)",
      primary: "oklch(0.98 0 0)",
      primaryForeground: "oklch(0.06 0 0)",
      secondary: "oklch(0.16 0 0)",
      secondaryForeground: "oklch(0.98 0 0)",
      muted: "oklch(0.14 0 0)",
      mutedForeground: "oklch(0.65 0 0)",
      accent: "oklch(0.20 0 0)",
      accentForeground: "oklch(0.98 0 0)",
      destructive: "oklch(0.60 0.22 27)",
      destructiveForeground: "oklch(0.98 0 0)",
      border: "oklch(0.22 0 0)",
      input: "oklch(0.18 0 0)",
      ring: "oklch(0.55 0 0)",
      sidebar: "oklch(0.08 0 0)",
      sidebarForeground: "oklch(0.98 0 0)",
      sidebarPrimary: "oklch(0.98 0 0)",
      sidebarPrimaryForeground: "oklch(0.06 0 0)",
      sidebarAccent: "oklch(0.16 0 0)",
      sidebarAccentForeground: "oklch(0.98 0 0)",
      sidebarBorder: "oklch(0.22 0 0)",
      sidebarRing: "oklch(0.55 0 0)",
      fontDisplay: '"Bebas Neue", "Archivo Black", system-ui, sans-serif',
      fontBody: '"Inter", system-ui, sans-serif',
    },
  },
  {
    id: "neon-gallery",
    name: "Neon Gallery",
    description: "Dark gallery base with electric cyan highlights for promo moments.",
    preview: ["#030712", "#22d3ee", "#a855f7"],
    tokens: {
      radius: "0.35rem",
      background: "oklch(0.10 0.035 263)",
      foreground: "oklch(0.97 0.015 250)",
      card: "oklch(0.15 0.045 263)",
      cardForeground: "oklch(0.97 0.015 250)",
      popover: "oklch(0.13 0.045 263)",
      popoverForeground: "oklch(0.97 0.015 250)",
      primary: "oklch(0.82 0.16 205)",
      primaryForeground: "oklch(0.10 0.035 263)",
      secondary: "oklch(0.22 0.06 275)",
      secondaryForeground: "oklch(0.94 0.03 250)",
      muted: "oklch(0.19 0.04 263)",
      mutedForeground: "oklch(0.72 0.035 250)",
      accent: "oklch(0.67 0.22 310)",
      accentForeground: "oklch(0.98 0.01 300)",
      destructive: "oklch(0.65 0.24 25)",
      destructiveForeground: "oklch(0.98 0.01 20)",
      border: "oklch(0.30 0.065 263)",
      input: "oklch(0.24 0.055 263)",
      ring: "oklch(0.82 0.16 205)",
      sidebar: "oklch(0.12 0.04 263)",
      sidebarForeground: "oklch(0.97 0.015 250)",
      sidebarPrimary: "oklch(0.82 0.16 205)",
      sidebarPrimaryForeground: "oklch(0.10 0.035 263)",
      sidebarAccent: "oklch(0.22 0.06 275)",
      sidebarAccentForeground: "oklch(0.94 0.03 250)",
      sidebarBorder: "oklch(0.30 0.065 263)",
      sidebarRing: "oklch(0.82 0.16 205)",
      fontDisplay: '"Bebas Neue", "Archivo Black", system-ui, sans-serif',
      fontBody: '"Inter", system-ui, sans-serif',
    },
  },
  {
    id: "warm-studio",
    name: "Warm Studio",
    description: "Editorial off-black with warm paper, amber accents, and softer borders.",
    preview: ["#17120d", "#f6dfb7", "#d97706"],
    tokens: {
      radius: "0.5rem",
      background: "oklch(0.13 0.025 55)",
      foreground: "oklch(0.94 0.035 80)",
      card: "oklch(0.18 0.03 55)",
      cardForeground: "oklch(0.94 0.035 80)",
      popover: "oklch(0.17 0.03 55)",
      popoverForeground: "oklch(0.94 0.035 80)",
      primary: "oklch(0.82 0.12 78)",
      primaryForeground: "oklch(0.16 0.025 55)",
      secondary: "oklch(0.25 0.04 55)",
      secondaryForeground: "oklch(0.94 0.035 80)",
      muted: "oklch(0.23 0.035 55)",
      mutedForeground: "oklch(0.70 0.045 75)",
      accent: "oklch(0.64 0.16 58)",
      accentForeground: "oklch(0.11 0.02 55)",
      destructive: "oklch(0.60 0.20 30)",
      destructiveForeground: "oklch(0.98 0.02 70)",
      border: "oklch(0.31 0.045 58)",
      input: "oklch(0.25 0.04 55)",
      ring: "oklch(0.74 0.12 68)",
      sidebar: "oklch(0.15 0.025 55)",
      sidebarForeground: "oklch(0.94 0.035 80)",
      sidebarPrimary: "oklch(0.82 0.12 78)",
      sidebarPrimaryForeground: "oklch(0.16 0.025 55)",
      sidebarAccent: "oklch(0.25 0.04 55)",
      sidebarAccentForeground: "oklch(0.94 0.035 80)",
      sidebarBorder: "oklch(0.31 0.045 58)",
      sidebarRing: "oklch(0.74 0.12 68)",
      fontDisplay: '"Bebas Neue", Georgia, serif',
      fontBody: '"Inter", system-ui, sans-serif',
    },
  },
  {
    id: "midnight-luxe",
    name: "Midnight Luxe",
    description: "Deep navy storefront with champagne primary actions and premium contrast.",
    preview: ["#060817", "#e8c872", "#3949ab"],
    tokens: {
      radius: "0.4rem",
      background: "oklch(0.09 0.035 270)",
      foreground: "oklch(0.96 0.018 92)",
      card: "oklch(0.14 0.04 270)",
      cardForeground: "oklch(0.96 0.018 92)",
      popover: "oklch(0.13 0.04 270)",
      popoverForeground: "oklch(0.96 0.018 92)",
      primary: "oklch(0.82 0.10 88)",
      primaryForeground: "oklch(0.10 0.035 270)",
      secondary: "oklch(0.22 0.06 270)",
      secondaryForeground: "oklch(0.94 0.02 92)",
      muted: "oklch(0.19 0.045 270)",
      mutedForeground: "oklch(0.70 0.035 270)",
      accent: "oklch(0.52 0.17 275)",
      accentForeground: "oklch(0.98 0.01 92)",
      destructive: "oklch(0.62 0.22 25)",
      destructiveForeground: "oklch(0.98 0.01 92)",
      border: "oklch(0.28 0.055 270)",
      input: "oklch(0.22 0.055 270)",
      ring: "oklch(0.82 0.10 88)",
      sidebar: "oklch(0.11 0.035 270)",
      sidebarForeground: "oklch(0.96 0.018 92)",
      sidebarPrimary: "oklch(0.82 0.10 88)",
      sidebarPrimaryForeground: "oklch(0.10 0.035 270)",
      sidebarAccent: "oklch(0.22 0.06 270)",
      sidebarAccentForeground: "oklch(0.94 0.02 92)",
      sidebarBorder: "oklch(0.28 0.055 270)",
      sidebarRing: "oklch(0.82 0.10 88)",
      fontDisplay: '"Bebas Neue", "Archivo Black", system-ui, sans-serif',
      fontBody: '"Inter", system-ui, sans-serif',
    },
  },
  {
    id: "gallery-white",
    name: "Gallery White",
    nameAr: "المعرض الأبيض",
    nameKey: "theme.gallery-white.name",
    description:
      "Clean premium white storefront with black typography and subtle BRWAZWNEON accents.",
    descriptionAr: "واجهة بيضاء نظيفة وفاخرة، بخطوط سوداء واضحة ولمسات بسيطة من ألوان برواز ونيون.",
    descriptionKey: "theme.gallery-white.description",
    badge: "LIGHT THEME",
    badgeAr: "ثيم فاتح",
    badgeKey: "theme.lightTheme",
    isLight: true,
    preview: ["#FFFFFF", "#F7F7F7", "#111111", "#00BEE8", "#FFD400"],
    tokens: {
      radius: "0.875rem",
      background: "#FFFFFF",
      foreground: "#111111",
      card: "#FFFFFF",
      cardForeground: "#111111",
      popover: "#FFFFFF",
      popoverForeground: "#111111",
      primary: "#111111",
      primaryForeground: "#FFFFFF",
      secondary: "#00BEE8",
      secondaryForeground: "#111111",
      muted: "#F7F7F7",
      mutedForeground: "#999999",
      accent: "#FFD400",
      accentForeground: "#111111",
      destructive: "#B42318",
      destructiveForeground: "#FFFFFF",
      border: "#E5E5E5",
      input: "#E5E5E5",
      ring: "#00BEE8",
      sidebar: "#F7F7F7",
      sidebarForeground: "#111111",
      sidebarPrimary: "#111111",
      sidebarPrimaryForeground: "#FFFFFF",
      sidebarAccent: "#FFD400",
      sidebarAccentForeground: "#111111",
      sidebarBorder: "#E5E5E5",
      sidebarRing: "#00BEE8",
      fontDisplay: '"Inter", system-ui, sans-serif',
      fontBody: '"Inter", system-ui, sans-serif',
      surface: "#F7F7F7",
      textSecondary: "#666666",
      textMuted: "#999999",
      headerBackground: "rgba(255,255,255,0.94)",
      footerBackground: "#050505",
      footerText: "#FFFFFF",
      cardShadow: "0 8px 30px rgba(0,0,0,0.07)",
      floatingShadow: "0 12px 35px rgba(0,0,0,0.12)",
      focusRing: "0 0 0 3px rgba(0,190,232,0.24)",
      inputBackground: "#FFFFFF",
    },
  },
];

export function getTheme(id: unknown): SiteTheme {
  return SITE_THEMES.find((theme) => theme.id === id) ?? SITE_THEMES[0];
}

export function applyTheme(themeOrId: SiteTheme | ThemeId) {
  if (typeof document === "undefined") return;
  const theme = typeof themeOrId === "string" ? getTheme(themeOrId) : themeOrId;
  const root = document.documentElement;
  root.dataset.siteTheme = theme.id;
  root.dataset.theme = theme.id;
  for (const [key, value] of Object.entries(toCssVariables(theme.tokens))) {
    root.style.setProperty(key, value);
  }
}

export function persistThemeLocally(theme: SiteTheme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme.id);
    localStorage.setItem(THEME_SETTINGS_STORAGE_KEY, JSON.stringify(toCssVariables(theme.tokens)));
  } catch {
    // Storage can be unavailable; applying the theme still keeps the UI current.
  }
}

export function setThemePreview(theme: SiteTheme) {
  try {
    sessionStorage.setItem(THEME_PREVIEW_STORAGE_KEY, theme.id);
    sessionStorage.setItem(
      THEME_SETTINGS_STORAGE_KEY,
      JSON.stringify(toCssVariables(theme.tokens)),
    );
  } catch {
    // Storage can be unavailable; the preview theme is still applied below.
  }
  applyTheme(theme);
}

export function clearThemePreview() {
  try {
    sessionStorage.removeItem(THEME_PREVIEW_STORAGE_KEY);
    sessionStorage.removeItem(THEME_SETTINGS_STORAGE_KEY);
  } catch {
    // Storage can be unavailable; clearing preview persistence is best effort.
  }
}

export async function loadActiveTheme(): Promise<SiteTheme> {
  const settings = await getSiteSettingsPublic({ data: { keys: [ACTIVE_THEME_KEY, THEME_SETTINGS_KEY] } });
  const themeSettings = normalizeThemeSettings(settings[THEME_SETTINGS_KEY]);
  return getTheme(themeSettings?.activeTheme ?? settings[ACTIVE_THEME_KEY] ?? DEFAULT_THEME_ID);
}

export async function saveActiveTheme(themeId: ThemeId) {
  const theme = getTheme(themeId);
  const current = await loadActiveTheme();
  const settings: ThemeSettings = {
    activeTheme: theme.id,
    previousTheme: current.id === theme.id ? undefined : current.id,
    updatedAt: new Date().toISOString(),
  };
  await setSiteSetting({ data: { key: ACTIVE_THEME_KEY, value: theme.id } });
  await setSiteSetting({ data: { key: THEME_SETTINGS_KEY, value: settings } });
  persistThemeLocally(theme);
  applyTheme(theme);
}

export async function rollbackActiveTheme() {
  const raw = await getSiteSettingsPublic({ data: { keys: [THEME_SETTINGS_KEY] } });
  const settings = normalizeThemeSettings(raw[THEME_SETTINGS_KEY]);
  if (!settings?.previousTheme) return null;

  const previous = getTheme(settings.previousTheme);
  const nextSettings: ThemeSettings = {
    activeTheme: previous.id,
    previousTheme: settings.activeTheme,
    updatedAt: new Date().toISOString(),
  };
  await setSiteSetting({ data: { key: ACTIVE_THEME_KEY, value: previous.id } });
  await setSiteSetting({ data: { key: THEME_SETTINGS_KEY, value: nextSettings } });
  persistThemeLocally(previous);
  applyTheme(previous);
  return previous;
}

export function normalizeThemeSettings(value: unknown): ThemeSettings | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const theme = getTheme(raw.activeTheme).id;
  return {
    activeTheme: theme,
    previousTheme: raw.previousTheme ? getTheme(raw.previousTheme).id : undefined,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
  };
}

function toCssVariables(tokens: ThemeTokens): Record<string, string> {
  return {
    "--radius": tokens.radius,
    "--background": tokens.background,
    "--foreground": tokens.foreground,
    "--card": tokens.card,
    "--card-foreground": tokens.cardForeground,
    "--popover": tokens.popover,
    "--popover-foreground": tokens.popoverForeground,
    "--primary": tokens.primary,
    "--primary-foreground": tokens.primaryForeground,
    "--secondary": tokens.secondary,
    "--secondary-foreground": tokens.secondaryForeground,
    "--muted": tokens.muted,
    "--muted-foreground": tokens.mutedForeground,
    "--accent": tokens.accent,
    "--accent-foreground": tokens.accentForeground,
    "--destructive": tokens.destructive,
    "--destructive-foreground": tokens.destructiveForeground,
    "--border": tokens.border,
    "--input": tokens.input,
    "--ring": tokens.ring,
    "--sidebar": tokens.sidebar,
    "--sidebar-foreground": tokens.sidebarForeground,
    "--sidebar-primary": tokens.sidebarPrimary,
    "--sidebar-primary-foreground": tokens.sidebarPrimaryForeground,
    "--sidebar-accent": tokens.sidebarAccent,
    "--sidebar-accent-foreground": tokens.sidebarAccentForeground,
    "--sidebar-border": tokens.sidebarBorder,
    "--sidebar-ring": tokens.sidebarRing,
    "--font-display": tokens.fontDisplay,
    "--font-body": tokens.fontBody,
    ...(tokens.surface ? { "--surface": tokens.surface } : {}),
    ...(tokens.textSecondary ? { "--text-secondary": tokens.textSecondary } : {}),
    ...(tokens.textMuted ? { "--text-muted": tokens.textMuted } : {}),
    ...(tokens.headerBackground ? { "--header-background": tokens.headerBackground } : {}),
    ...(tokens.footerBackground ? { "--footer-background": tokens.footerBackground } : {}),
    ...(tokens.footerText ? { "--footer-text": tokens.footerText } : {}),
    ...(tokens.cardShadow ? { "--shadow-card": tokens.cardShadow } : {}),
    ...(tokens.floatingShadow ? { "--shadow-floating": tokens.floatingShadow } : {}),
    ...(tokens.focusRing ? { "--focus-ring": tokens.focusRing } : {}),
    ...(tokens.inputBackground ? { "--input-background": tokens.inputBackground } : {}),
  };
}
