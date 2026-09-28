// The website's editable design tokens: which CSS custom property each one
// maps to, its admin-facing label, which group it belongs to in the Theme
// Settings UI, and its DEFAULT value (copied verbatim from styles.css's
// :root / [data-theme="light"] blocks — the single source of truth for what
// "no customization" looks like). Colors are oklch() strings, exactly as
// written in styles.css, because that lets `getDefaultTokenHex` compute the
// TRUE default swatch via real color math instead of a hand-guessed hex.
//
// Admin-picked colors are stored and applied as plain hex — CSS custom
// properties accept any valid color, so overriding an oklch() default with a
// #rrggbb value needs no format conversion, no library, and can't drift from
// what the picker showed.
export type ThemeTokenGroup = "surfaces" | "brand" | "feedback" | "chrome" | "commerce";

export type ThemeTokenDef = {
  key: string; // matches the CSS custom property name, minus the leading "--"
  group: ThemeTokenGroup;
  label: { en: string; ar: string };
  /** oklch() default for DARK mode (this is what :root defines today). */
  defaultDark: string;
  /** oklch() default for LIGHT mode (what [data-theme="light"] defines today). */
  defaultLight: string;
};

// One row per token: key, group, label, and the two defaults, copied
// character-for-character from styles.css. `product-card-background` and
// `navigation-background`/`navigation-text` alias another token in the
// stylesheet (`var(--card)` / `var(--background)` / `var(--foreground)`) —
// their defaults below are written as that token's OWN resolved value so a
// fresh admin sees the color that is actually on screen today.
export const THEME_TOKENS: readonly ThemeTokenDef[] = [
  // ---- Surfaces --------------------------------------------------------
  {
    key: "background",
    group: "surfaces",
    label: { en: "Main background", ar: "الخلفية الرئيسية" },
    defaultDark: "oklch(0.06 0 0)",
    defaultLight: "oklch(0.99 0 0)",
  },
  {
    key: "foreground",
    group: "surfaces",
    label: { en: "Main text", ar: "النص الرئيسي" },
    defaultDark: "oklch(0.98 0 0)",
    defaultLight: "oklch(0.145 0 0)",
  },
  {
    key: "surface",
    group: "surfaces",
    label: { en: "Secondary background", ar: "الخلفية الثانوية" },
    defaultDark: "oklch(0.1 0 0)",
    defaultLight: "oklch(0.97 0 0)",
  },
  {
    key: "surface-elevated",
    group: "surfaces",
    label: { en: "Elevated surface", ar: "سطح مرتفع" },
    defaultDark: "oklch(0.14 0 0)",
    defaultLight: "oklch(1 0 0)",
  },
  {
    key: "card",
    group: "surfaces",
    label: { en: "Card background", ar: "خلفية البطاقة" },
    defaultDark: "oklch(0.1 0 0)",
    defaultLight: "oklch(1 0 0)",
  },
  {
    key: "card-foreground",
    group: "surfaces",
    label: { en: "Card text", ar: "نص البطاقة" },
    defaultDark: "oklch(0.98 0 0)",
    defaultLight: "oklch(0.145 0 0)",
  },
  {
    key: "popover",
    group: "surfaces",
    label: { en: "Popover / dropdown background", ar: "خلفية القوائم المنبثقة" },
    defaultDark: "oklch(0.1 0 0)",
    defaultLight: "oklch(1 0 0)",
  },
  {
    key: "popover-foreground",
    group: "surfaces",
    label: { en: "Popover / dropdown text", ar: "نص القوائم المنبثقة" },
    defaultDark: "oklch(0.98 0 0)",
    defaultLight: "oklch(0.145 0 0)",
  },
  {
    key: "muted",
    group: "surfaces",
    label: { en: "Muted background", ar: "خلفية باهتة" },
    defaultDark: "oklch(0.14 0 0)",
    defaultLight: "oklch(0.96 0 0)",
  },
  {
    key: "muted-foreground",
    group: "surfaces",
    label: { en: "Muted text", ar: "نص باهت" },
    defaultDark: "oklch(0.65 0 0)",
    defaultLight: "oklch(0.5 0 0)",
  },

  // ---- Brand -------------------------------------------------------------
  {
    key: "primary",
    group: "brand",
    label: { en: "Primary brand color", ar: "اللون الأساسي للعلامة" },
    defaultDark: "oklch(0.98 0 0)",
    defaultLight: "oklch(0.145 0 0)",
  },
  {
    key: "primary-foreground",
    group: "brand",
    label: { en: "Text on primary", ar: "النص فوق اللون الأساسي" },
    defaultDark: "oklch(0.06 0 0)",
    defaultLight: "oklch(0.99 0 0)",
  },
  {
    key: "secondary",
    group: "brand",
    label: { en: "Secondary color", ar: "اللون الثانوي" },
    defaultDark: "oklch(0.16 0 0)",
    defaultLight: "oklch(0.72 0.13 217)",
  },
  {
    key: "secondary-foreground",
    group: "brand",
    label: { en: "Text on secondary", ar: "النص فوق اللون الثانوي" },
    defaultDark: "oklch(0.98 0 0)",
    defaultLight: "oklch(0.145 0 0)",
  },
  {
    key: "accent",
    group: "brand",
    label: { en: "Accent color", ar: "لون التمييز" },
    defaultDark: "oklch(0.2 0 0)",
    defaultLight: "oklch(0.86 0.17 95)",
  },
  {
    key: "accent-foreground",
    group: "brand",
    label: { en: "Text on accent", ar: "النص فوق لون التمييز" },
    defaultDark: "oklch(0.98 0 0)",
    defaultLight: "oklch(0.145 0 0)",
  },

  // ---- Feedback / status ---------------------------------------------------
  {
    key: "destructive",
    group: "feedback",
    label: { en: "Danger / error", ar: "لون الخطر" },
    defaultDark: "oklch(0.6 0.22 27)",
    defaultLight: "oklch(0.58 0.22 27)",
  },
  {
    key: "destructive-foreground",
    group: "feedback",
    label: { en: "Text on danger", ar: "النص فوق لون الخطر" },
    defaultDark: "oklch(0.98 0 0)",
    defaultLight: "oklch(0.99 0 0)",
  },
  {
    key: "success",
    group: "feedback",
    label: { en: "Success", ar: "لون النجاح" },
    defaultDark: "oklch(0.72 0.17 145)",
    defaultLight: "oklch(0.65 0.17 145)",
  },
  {
    key: "warning",
    group: "feedback",
    label: { en: "Warning", ar: "لون التحذير" },
    defaultDark: "oklch(0.8 0.16 85)",
    defaultLight: "oklch(0.78 0.16 85)",
  },
  {
    key: "info",
    group: "feedback",
    label: { en: "Info", ar: "لون المعلومة" },
    defaultDark: "oklch(0.78 0.13 217)",
    defaultLight: "oklch(0.72 0.13 217)",
  },

  // ---- Chrome (structural UI) ----------------------------------------------
  {
    key: "border",
    group: "chrome",
    label: { en: "Border", ar: "الحدود" },
    defaultDark: "oklch(0.22 0 0)",
    defaultLight: "oklch(0.9 0 0)",
  },
  {
    key: "input",
    group: "chrome",
    label: { en: "Input background", ar: "خلفية الحقول" },
    defaultDark: "oklch(0.18 0 0)",
    defaultLight: "oklch(0.93 0 0)",
  },
  {
    key: "ring",
    group: "chrome",
    label: { en: "Focus ring", ar: "حلقة التركيز" },
    defaultDark: "oklch(0.55 0 0)",
    defaultLight: "oklch(0.72 0.13 217)",
  },
  {
    key: "header-background",
    group: "chrome",
    label: { en: "Header background", ar: "خلفية الهيدر" },
    defaultDark: "oklch(0.06 0 0 / 92%)",
    defaultLight: "oklch(0.99 0 0 / 94%)",
  },
  {
    key: "footer-background",
    group: "chrome",
    label: { en: "Footer background", ar: "خلفية الفوتر" },
    defaultDark: "oklch(0.06 0 0)", // = --background dark
    defaultLight: "oklch(0.99 0 0)", // = --background light
  },
  {
    key: "footer-foreground",
    group: "chrome",
    label: { en: "Footer text", ar: "نص الفوتر" },
    defaultDark: "oklch(0.98 0 0)", // = --foreground dark
    defaultLight: "oklch(0.145 0 0)", // = --foreground light
  },
  {
    key: "hero-background",
    group: "chrome",
    label: { en: "Hero section background", ar: "خلفية قسم البطل" },
    defaultDark: "oklch(0.05 0 0)",
    defaultLight: "oklch(0.97 0 0)",
  },
  {
    key: "overlay",
    group: "chrome",
    label: { en: "Modal overlay", ar: "طبقة الخلفية للنوافذ" },
    defaultDark: "oklch(0 0 0 / 70%)",
    defaultLight: "oklch(0 0 0 / 50%)",
  },

  // ---- Commerce -----------------------------------------------------------
  {
    key: "product-card-background",
    group: "commerce",
    label: { en: "Product card background", ar: "خلفية بطاقة المنتج" },
    defaultDark: "oklch(0.1 0 0)", // = --card
    defaultLight: "oklch(1 0 0)", // = --card
  },
  {
    key: "price-color",
    group: "commerce",
    label: { en: "Price text", ar: "لون السعر" },
    defaultDark: "oklch(0.98 0 0)",
    defaultLight: "oklch(0.145 0 0)",
  },
  {
    key: "sale-color",
    group: "commerce",
    label: { en: "Sale / discount text", ar: "لون التخفيض" },
    defaultDark: "oklch(0.7 0.19 35)",
    defaultLight: "oklch(0.52 0.21 27)",
  },
];

export const THEME_TOKEN_KEYS = THEME_TOKENS.map((t) => t.key);
const TOKEN_SET = new Set(THEME_TOKEN_KEYS);
export function isThemeTokenKey(key: string): boolean {
  return TOKEN_SET.has(key);
}

export const THEME_TOKEN_GROUPS: readonly {
  id: ThemeTokenGroup;
  label: { en: string; ar: string };
}[] = [
  { id: "surfaces", label: { en: "Surfaces", ar: "الأسطح" } },
  { id: "brand", label: { en: "Brand", ar: "العلامة التجارية" } },
  { id: "feedback", label: { en: "Feedback & status", ar: "التنبيهات والحالة" } },
  { id: "chrome", label: { en: "Header, footer & structure", ar: "الهيدر والفوتر والبنية" } },
  { id: "commerce", label: { en: "Products & pricing", ar: "المنتجات والأسعار" } },
];

/* ------------------------------------------------------------------ */
/* oklch(L C H [/ A]) -> #rrggbb[aa]                                   */
/* Standard Björn Ottosson OKLab matrices — used ONLY to compute the    */
/* default swatch a color picker shows before any customization; the   */
/* live site never runs this (it renders the oklch() strings directly, */
/* or an admin's own hex override, unmodified).                        */
/* ------------------------------------------------------------------ */
const OKLCH_RE = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)%?\s*)?\)$/i;

function srgbCompand(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.min(1, Math.max(0, v));
}

function toHex2(n: number): string {
  return Math.round(Math.min(255, Math.max(0, n)))
    .toString(16)
    .padStart(2, "0");
}

/** Parses one `oklch(L C H)` or `oklch(L C H / A%)` string into #rrggbb (alpha dropped: a background swatch has no meaningful transparency). */
export function oklchToHex(oklch: string): string | null {
  const m = OKLCH_RE.exec(oklch.trim());
  if (!m) return null;
  const L = Number(m[1]);
  const C = Number(m[2]);
  const Hdeg = Number(m[3]);
  if (!Number.isFinite(L) || !Number.isFinite(C) || !Number.isFinite(Hdeg)) return null;
  const h = (Hdeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const mm = m_ ** 3;
  const s = s_ ** 3;

  const rLin = +4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s;

  const r = srgbCompand(rLin) * 255;
  const g = srgbCompand(gLin) * 255;
  const bl = srgbCompand(bLin) * 255;
  return `#${toHex2(r)}${toHex2(g)}${toHex2(bl)}`;
}

const hexCache = new Map<string, string>();
/** Cached default hex for a token in a given mode — what the color picker shows before any override. */
export function getDefaultTokenHex(key: string, mode: "light" | "dark"): string {
  const def = THEME_TOKENS.find((t) => t.key === key);
  if (!def) return "#888888";
  const cacheKey = `${mode}:${key}`;
  const cached = hexCache.get(cacheKey);
  if (cached) return cached;
  const hex = oklchToHex(mode === "light" ? def.defaultLight : def.defaultDark) ?? "#888888";
  hexCache.set(cacheKey, hex);
  return hex;
}

export function isValidHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
}

/* ------------------------------------------------------------------ */
/* Shadow tokens — Small / Medium / Large, per mode.                    */
/*                                                                      */
/* Stored as the CSS custom property NAME they override, so the exact   */
/* same generic `--${key}:${value};` emission in theme-system.ts's      */
/* cssBlock() works for shadows with zero extra code — see              */
/* `@theme inline`'s `--shadow-sm/md/lg: var(--theme-shadow-sm/md/lg,   */
/* <tailwind default>)` in styles.css: unset (no admin override) always *
/* resolves to Tailwind's own default box-shadow, so a non-customized   */
/* site is byte-identical to today, exactly like the color tokens.      */
/* ------------------------------------------------------------------ */
export type ShadowSize = "sm" | "md" | "lg";
export const SHADOW_VAR_KEYS = ["theme-shadow-sm", "theme-shadow-md", "theme-shadow-lg"] as const;
export type ShadowVarKey = (typeof SHADOW_VAR_KEYS)[number];
const SHADOW_VAR_KEY_SET = new Set<string>(SHADOW_VAR_KEYS);
export function isShadowVarKey(key: string): key is ShadowVarKey {
  return SHADOW_VAR_KEY_SET.has(key);
}

export const SHADOW_SIZE_TO_VAR_KEY: Record<ShadowSize, ShadowVarKey> = {
  sm: "theme-shadow-sm",
  md: "theme-shadow-md",
  lg: "theme-shadow-lg",
};

export const SHADOW_SIZES: readonly { size: ShadowSize; label: { en: string; ar: string } }[] = [
  { size: "sm", label: { en: "Small shadow", ar: "ظل صغير" } },
  { size: "md", label: { en: "Medium shadow", ar: "ظل متوسط" } },
  { size: "lg", label: { en: "Large shadow", ar: "ظل كبير" } },
];

export type ShadowPresetId = "none" | "subtle" | "soft" | "crisp" | "elevated";

type ShadowPresetDef = {
  id: ShadowPresetId;
  label: { en: string; ar: string };
  /** box-shadow value for LIGHT mode. */
  light: string;
  /** box-shadow value for DARK mode (deliberately higher-opacity — a black shadow this faint wouldn't read on a near-black background). */
  dark: string;
};

// "soft" intentionally matches Tailwind v4's own shadow-sm/md/lg defaults
// (node_modules/tailwindcss/theme.css) — picking it is an explicit,
// professional "no real change" choice for an admin who just wants the
// customization UI to feel populated without picking a deliberately
// different look.
export const SHADOW_PRESETS: Record<ShadowSize, readonly ShadowPresetDef[]> = {
  sm: [
    { id: "none", label: { en: "None", ar: "بدون" }, light: "none", dark: "none" },
    {
      id: "subtle",
      label: { en: "Subtle", ar: "خفيف" },
      light: "0 1px 2px 0 rgb(0 0 0 / 0.04)",
      dark: "0 1px 2px 0 rgb(0 0 0 / 0.5)",
    },
    {
      id: "soft",
      label: { en: "Soft (default)", ar: "ناعم (افتراضي)" },
      light: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
      dark: "0 1px 3px 0 rgb(0 0 0 / 0.4), 0 1px 2px -1px rgb(0 0 0 / 0.4)",
    },
    {
      id: "crisp",
      label: { en: "Crisp", ar: "حاد" },
      light: "0 1px 2px 0 rgb(0 0 0 / 0.22)",
      dark: "0 1px 3px 0 rgb(0 0 0 / 0.65)",
    },
    {
      id: "elevated",
      label: { en: "Elevated", ar: "مرتفع" },
      light: "0 3px 10px 0 rgb(0 0 0 / 0.18)",
      dark: "0 3px 12px 0 rgb(0 0 0 / 0.6)",
    },
  ],
  md: [
    { id: "none", label: { en: "None", ar: "بدون" }, light: "none", dark: "none" },
    {
      id: "subtle",
      label: { en: "Subtle", ar: "خفيف" },
      light: "0 2px 4px 0 rgb(0 0 0 / 0.05)",
      dark: "0 2px 6px 0 rgb(0 0 0 / 0.45)",
    },
    {
      id: "soft",
      label: { en: "Soft (default)", ar: "ناعم (افتراضي)" },
      light: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
      dark: "0 4px 8px -1px rgb(0 0 0 / 0.45), 0 2px 4px -2px rgb(0 0 0 / 0.4)",
    },
    {
      id: "crisp",
      label: { en: "Crisp", ar: "حاد" },
      light: "0 4px 10px 0 rgb(0 0 0 / 0.2)",
      dark: "0 4px 12px 0 rgb(0 0 0 / 0.6)",
    },
    {
      id: "elevated",
      label: { en: "Elevated", ar: "مرتفع" },
      light: "0 10px 28px 0 rgb(0 0 0 / 0.16)",
      dark: "0 10px 30px 0 rgb(0 0 0 / 0.55)",
    },
  ],
  lg: [
    { id: "none", label: { en: "None", ar: "بدون" }, light: "none", dark: "none" },
    {
      id: "subtle",
      label: { en: "Subtle", ar: "خفيف" },
      light: "0 6px 14px 0 rgb(0 0 0 / 0.08)",
      dark: "0 6px 16px 0 rgb(0 0 0 / 0.45)",
    },
    {
      id: "soft",
      label: { en: "Soft (default)", ar: "ناعم (افتراضي)" },
      light: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
      dark: "0 10px 18px -3px rgb(0 0 0 / 0.5), 0 4px 8px -4px rgb(0 0 0 / 0.45)",
    },
    {
      id: "crisp",
      label: { en: "Crisp", ar: "حاد" },
      light: "0 14px 28px 0 rgb(0 0 0 / 0.24)",
      dark: "0 14px 30px 0 rgb(0 0 0 / 0.65)",
    },
    {
      id: "elevated",
      label: { en: "Elevated", ar: "مرتفع" },
      light: "0 24px 48px 0 rgb(0 0 0 / 0.22)",
      dark: "0 24px 50px 0 rgb(0 0 0 / 0.6)",
    },
  ],
};

// Deliberately conservative allowlist grammar for a hand-typed custom
// box-shadow value — this string is injected server-side into a raw
// <style> tag (see buildThemeOverrideCss), so it must never admit `{`,
// `}`, `;`, `<`, `url(`, escapes, or anything else that could break out
// of a CSS declaration. Accepts 1+ comma-separated layers of
// "[inset] offsetX offsetY [blur] [spread] color", where color is
// #hex / rgb() / rgba() / oklch() — or the literal "none".
const SHADOW_LAYER_RE =
  /^(inset\s+)?(-?\d+(\.\d+)?(px|rem)?\s+){2,4}(#[0-9a-fA-F]{3,8}|rgba?\([\d.,%\s/]+\)|oklch\([\d.%\s/]+\))$/;

/** Splits "layer1, layer2, ..." on top-level commas only — a plain `.split(",")`
 * would also cut inside `rgba(0,0,0,0.3)`'s own argument commas. */
function splitShadowLayers(value: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      layers.push(value.slice(start, i));
      start = i + 1;
    }
  }
  layers.push(value.slice(start));
  return layers;
}

export function isValidBoxShadowValue(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const trimmed = v.trim();
  if (!trimmed || trimmed.length > 300) return false;
  if (trimmed.toLowerCase() === "none") return true;
  return splitShadowLayers(trimmed)
    .map((layer) => layer.trim())
    .every((layer) => SHADOW_LAYER_RE.test(layer));
}

/** The shadow value a given size/mode shows before any admin override — the "soft" preset, i.e. Tailwind's own default. */
export function getDefaultShadowValue(size: ShadowSize, mode: "light" | "dark"): string {
  const preset = SHADOW_PRESETS[size].find((p) => p.id === "soft")!;
  return mode === "light" ? preset.light : preset.dark;
}

/* ------------------------------------------------------------------ */
/* Logo overrides — optional per-mode logo image, stored as a plain     *
/* HTTPS URL (the result of the existing admin Cloudinary upload).      */
/* ------------------------------------------------------------------ */
export function isValidLogoUrl(v: unknown): v is string {
  if (typeof v !== "string" || v.length === 0 || v.length > 2000) return false;
  try {
    const url = new URL(v);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}
