import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Eye,
  Loader2,
  RotateCcw,
  Save,
  Upload,
  History,
  Sun,
  Moon,
  Palette,
  Type,
  LayoutTemplate,
  Layers,
  ImageIcon,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  loadDraftThemeSettings,
  loadPublishedThemeSettings,
  saveThemeDraft,
  publishTheme,
  getThemeHistory,
  restoreThemeVersionToDraft,
  resetThemeDraftScope,
  setThemePreviewMode,
  withThemeChanges,
  hasThemeCustomizations,
  normalizeThemeSettings,
  DEFAULT_THEME_MODE,
  type ThemeMode,
  type WebsiteThemeSettings,
  type ThemeColorOverrides,
  type ThemeShadowOverrides,
  type ThemeTypography,
} from "@/lib/theme-system";
import {
  THEME_TOKENS,
  THEME_TOKEN_GROUPS,
  getDefaultTokenHex,
  isValidHexColor,
  SHADOW_SIZES,
  SHADOW_PRESETS,
  SHADOW_SIZE_TO_VAR_KEY,
  getDefaultShadowValue,
  isValidBoxShadowValue,
  type ThemeTokenDef,
  type ThemeTokenGroup,
  type ShadowSize,
} from "@/lib/theme-tokens";
import { openPreviewWindow } from "@/lib/preview-mode";
import { useConfirm } from "@/components/admin/layout/ConfirmDialogProvider";
import { optimizeImage } from "@/lib/image-optimize";
import { uploadPosterImage } from "@/lib/image-upload.functions";
import { fileToDataUrl } from "@/components/admin/tabs/shared";
import { useBranding } from "@/lib/branding";
import { useAdminI18n } from "@/lib/admin-i18n";

const MODE_OPTIONS: {
  value: ThemeMode;
  en: string;
  ar: string;
  hint: { en: string; ar: string };
}[] = [
  {
    value: "light",
    en: "Light",
    ar: "فاتح",
    hint: { en: "Always the light palette", ar: "دائمًا الوضع الفاتح" },
  },
  {
    value: "dark",
    en: "Dark",
    ar: "داكن",
    hint: { en: "Always the dark palette", ar: "دائمًا الوضع الداكن" },
  },
  {
    value: "system",
    en: "System",
    ar: "النظام",
    hint: { en: "Follows each visitor's device", ar: "يتبع إعداد جهاز كل زائر" },
  },
];

function modeLabel(mode: ThemeMode, isArabic: boolean) {
  const opt = MODE_OPTIONS.find((o) => o.value === mode);
  if (!opt) return mode;
  return isArabic ? opt.ar : opt.en;
}

type SubTab = "mode" | "light" | "dark" | "general" | "preview";

/* ------------------------------------------------------------------ */
/* Live preview — a self-contained mockup. Its wrapper carries the      */
/* CURRENTLY EDITED (unsaved) colors as inline CSS custom properties,   */
/* so every element inside that uses the site's normal bg-background /  */
/* text-foreground / bg-primary / bg-card / etc. utility classes picks  */
/* up the edit instantly — no save, no re-render plumbing, nothing      */
/* component-specific to maintain.                                      */
/* ------------------------------------------------------------------ */
function effectivePreviewStyle(
  mode: "light" | "dark",
  colorOverrides: ThemeColorOverrides,
  shadowOverrides: ThemeShadowOverrides,
  typography: ThemeTypography,
): React.CSSProperties {
  const style: Record<string, string> = {};
  for (const token of THEME_TOKENS) {
    style[`--${token.key}`] = colorOverrides[token.key] ?? getDefaultTokenHex(token.key, mode);
  }
  // Same direct-var-on-wrapper trick as colors above, but for
  // `--theme-shadow-*` specifically (NOT the derived `--shadow-sm/md/lg`
  // Tailwind utility variables, which are only ever computed once at the
  // real page's :root and wouldn't pick up a value scoped to this preview
  // subtree) — preview elements below reference `var(--theme-shadow-*)`
  // directly so an unsaved shadow edit shows immediately.
  for (const { size } of SHADOW_SIZES) {
    const key = SHADOW_SIZE_TO_VAR_KEY[size];
    style[`--${key}`] = shadowOverrides[key] ?? getDefaultShadowValue(size, mode);
  }
  if (typography.radiusRem !== undefined) style["--radius"] = `${typography.radiusRem}rem`;
  if (typography.fontSizeBasePx !== undefined) style.fontSize = `${typography.fontSizeBasePx}px`;
  if (typography.bodyWeight !== undefined) style.fontWeight = String(typography.bodyWeight);
  return style as React.CSSProperties;
}

function LivePreview({
  mode,
  overrides,
  shadows,
  typography,
  isArabic,
}: {
  mode: "light" | "dark";
  overrides: ThemeColorOverrides;
  shadows: ThemeShadowOverrides;
  typography: ThemeTypography;
  isArabic: boolean;
}) {
  const style = effectivePreviewStyle(mode, overrides, shadows, typography);
  const headingWeight = typography.headingWeight ?? 700;
  return (
    <div
      style={{ ...style, boxShadow: "var(--theme-shadow-lg)" }}
      className="overflow-hidden rounded-md border"
      // Scoped color-scheme so native form controls (e.g. a stray checkbox)
      // inside the preview also render for the mode being shown.
      data-color-scheme={mode}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{
          background: "var(--header-background)",
          borderColor: "var(--border)",
          color: "var(--foreground)",
        }}
      >
        <span
          className="text-sm font-bold uppercase tracking-widest"
          style={{ fontWeight: headingWeight }}
        >
          BRWAZWNEON
        </span>
        <div
          className="flex items-center gap-3 text-xs"
          style={{ color: "var(--muted-foreground)" }}
        >
          <span>{isArabic ? "المنتجات" : "Shop"}</span>
          <span>{isArabic ? "السلة" : "Cart"}</span>
        </div>
      </div>

      <div className="p-4" style={{ background: "var(--background)", color: "var(--foreground)" }}>
        <div
          className="mb-4 rounded-sm px-4 py-6 text-center"
          style={{ background: "var(--hero-background)" }}
        >
          <p
            className="text-xs uppercase tracking-widest"
            style={{ color: "var(--muted-foreground)" }}
          >
            {isArabic ? "معاينة حية" : "Live preview"}
          </p>
          <p className="mt-1 text-lg font-bold" style={{ fontWeight: headingWeight }}>
            {isArabic ? "بوسترات مؤطرة مميزة" : "Premium framed posters"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div
            className="rounded-sm border p-3"
            style={{
              background: "var(--product-card-background)",
              borderColor: "var(--border)",
              boxShadow: "var(--theme-shadow-sm)",
            }}
          >
            <div
              className="mb-2 flex h-16 items-center justify-center rounded-sm text-[10px] uppercase"
              style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
            >
              {isArabic ? "صورة" : "Image"}
            </div>
            <p className="truncate text-xs font-medium">
              {isArabic ? "بوستر ميسي" : "Messi Poster"}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm font-bold" style={{ color: "var(--price-color)" }}>
                230 EGP
              </span>
              <span
                className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold"
                style={{ background: "var(--sale-color)", color: "var(--card)" }}
              >
                -20%
              </span>
            </div>
          </div>
          <div
            className="hidden rounded-sm border p-3 sm:block"
            style={{
              background: "var(--card)",
              borderColor: "var(--border)",
              color: "var(--card-foreground)",
              boxShadow: "var(--theme-shadow-md)",
            }}
          >
            <p className="text-xs font-semibold">{isArabic ? "بطاقة" : "Card"}</p>
            <p className="mt-1 text-[11px]" style={{ color: "var(--muted-foreground)" }}>
              {isArabic ? "نص وصفي هنا" : "Descriptive text here"}
            </p>
          </div>
          <div className="hidden flex-col gap-2 sm:flex">
            <button
              type="button"
              className="rounded-sm px-3 py-1.5 text-xs font-semibold"
              style={{
                background: "var(--primary)",
                color: "var(--primary-foreground)",
                boxShadow: "var(--theme-shadow-sm)",
              }}
            >
              {isArabic ? "أضف للسلة" : "Add to cart"}
            </button>
            <button
              type="button"
              className="rounded-sm border px-3 py-1.5 text-xs font-semibold"
              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
            >
              {isArabic ? "التفاصيل" : "Details"}
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input
            readOnly
            value=""
            placeholder={isArabic ? "رقم الهاتف" : "Phone number"}
            className="flex-1 rounded-sm border px-2 py-1.5 text-xs outline-none"
            style={{
              background: "var(--input)",
              borderColor: "var(--border)",
              color: "var(--foreground)",
            }}
          />
          <span
            className="rounded-full px-2 py-1 text-[10px] font-semibold"
            style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}
          >
            {isArabic ? "شارة" : "Badge"}
          </span>
          <span
            className="rounded-full px-2 py-1 text-[10px] font-semibold"
            style={{ background: "var(--success)", color: "var(--card)" }}
          >
            {isArabic ? "نجاح" : "OK"}
          </span>
        </div>
      </div>

      <div
        className="px-4 py-3 text-center text-[11px]"
        style={{ background: "var(--footer-background)", color: "var(--footer-foreground)" }}
      >
        © BRWAZWNEON
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One color row: swatch, native picker, hex text input, reset.         */
/* ------------------------------------------------------------------ */
function ColorRow({
  label,
  hex,
  isCustom,
  onChange,
  onReset,
}: {
  label: string;
  hex: string;
  isCustom: boolean;
  onChange: (hex: string) => void;
  onReset: () => void;
}) {
  const [text, setText] = useState(hex);
  useEffect(() => setText(hex), [hex]);

  const commit = (v: string) => {
    const withHash = v.startsWith("#") ? v : `#${v}`;
    if (isValidHexColor(withHash)) onChange(withHash.toLowerCase());
  };

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{label}</span>
      <div className="flex shrink-0 items-center gap-2">
        <input
          type="color"
          value={hex}
          onChange={(e) => {
            setText(e.target.value);
            onChange(e.target.value);
          }}
          className="h-8 w-8 cursor-pointer rounded-sm border border-border bg-transparent p-0.5"
          aria-label={label}
        />
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
          }}
          spellCheck={false}
          className="w-24 rounded-sm border border-border bg-background px-2 py-1 font-mono text-xs uppercase text-foreground outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={onReset}
          disabled={!isCustom}
          title="Reset to default"
          className="rounded-sm p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-20"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function ColorGroupEditor({
  mode,
  overrides,
  onSetToken,
  onResetToken,
  isArabic,
}: {
  mode: "light" | "dark";
  overrides: ThemeColorOverrides;
  onSetToken: (key: string, hex: string) => void;
  onResetToken: (key: string) => void;
  isArabic: boolean;
}) {
  const byGroup = useMemo(() => {
    const map = new Map<ThemeTokenGroup, ThemeTokenDef[]>();
    for (const g of THEME_TOKEN_GROUPS) map.set(g.id, []);
    for (const t of THEME_TOKENS) map.get(t.group)!.push(t);
    return map;
  }, []);

  return (
    <div className="space-y-5">
      {THEME_TOKEN_GROUPS.map((group) => (
        <div key={group.id} className="rounded-md border border-border bg-card p-4">
          <h4 className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            {isArabic ? group.label.ar : group.label.en}
          </h4>
          <div className="mt-2 divide-y divide-border">
            {byGroup.get(group.id)!.map((token) => {
              const custom = overrides[token.key];
              const hex = custom ?? getDefaultTokenHex(token.key, mode);
              return (
                <ColorRow
                  key={token.key}
                  label={isArabic ? token.label.ar : token.label.en}
                  hex={hex}
                  isCustom={!!custom}
                  onChange={(v) => onSetToken(token.key, v)}
                  onReset={() => onResetToken(token.key)}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shadows: Small / Medium / Large, per mode. Primary control is a row  */
/* of professional presets (each swatch rendered with its REAL box-     */
/* shadow value, so it previews itself); "Custom" reveals a validated   */
/* free-text box-shadow input for admins who want an exact value.       */
/* ------------------------------------------------------------------ */
function ShadowPresetSwatch({
  presetLabel,
  value,
  active,
  onClick,
}: {
  presetLabel: string;
  value: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={presetLabel}
      className={cn(
        "flex h-11 w-16 shrink-0 items-center justify-center rounded-sm border bg-card transition",
        active
          ? "border-primary ring-1 ring-primary"
          : "border-border hover:border-muted-foreground",
      )}
    >
      <span
        className="h-6 w-9 rounded-[3px] bg-background"
        style={{ boxShadow: value === "none" ? "inset 0 0 0 1px var(--border)" : value }}
      />
    </button>
  );
}

function ShadowSizeRow({
  size,
  label,
  mode,
  value,
  isCustom,
  onSelectPreset,
  onCustomChange,
  onReset,
  isArabic,
}: {
  size: ShadowSize;
  label: string;
  mode: "light" | "dark";
  value: string;
  isCustom: boolean;
  onSelectPreset: (value: string) => void;
  onCustomChange: (value: string) => void;
  onReset: () => void;
  isArabic: boolean;
}) {
  const presets = SHADOW_PRESETS[size];
  const activePresetId = presets.find((p) => (mode === "light" ? p.light : p.dark) === value)?.id;
  const [customOpen, setCustomOpen] = useState(!activePresetId && isCustom);
  const [customText, setCustomText] = useState(value);
  useEffect(() => {
    setCustomText(value);
    if (activePresetId) setCustomOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commitCustom = (v: string) => {
    if (isValidBoxShadowValue(v)) onCustomChange(v.trim());
  };

  return (
    <div className="py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm text-foreground">{label}</span>
        <button
          type="button"
          onClick={onReset}
          disabled={!isCustom}
          title={isArabic ? "إعادة تعيين" : "Reset to default"}
          className="rounded-sm p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-20"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <ShadowPresetSwatch
            key={p.id}
            presetLabel={isArabic ? p.label.ar : p.label.en}
            value={mode === "light" ? p.light : p.dark}
            active={activePresetId === p.id}
            onClick={() => onSelectPreset(mode === "light" ? p.light : p.dark)}
          />
        ))}
        <button
          type="button"
          onClick={() => setCustomOpen((v) => !v)}
          className={cn(
            "h-11 shrink-0 rounded-sm border px-3 text-[11px] font-semibold uppercase tracking-widest transition",
            customOpen || (!activePresetId && isCustom)
              ? "border-primary text-primary"
              : "border-border text-muted-foreground hover:bg-accent",
          )}
        >
          {isArabic ? "مخصص" : "Custom"}
        </button>
      </div>
      {customOpen && (
        <div className="mt-2 space-y-1">
          <input
            type="text"
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onBlur={(e) => commitCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitCustom((e.target as HTMLInputElement).value);
            }}
            spellCheck={false}
            placeholder="0 4px 12px 0 rgba(0,0,0,0.3)"
            className={cn(
              "w-full rounded-sm border bg-background px-2 py-1.5 font-mono text-xs text-foreground outline-none",
              !isValidBoxShadowValue(customText) && customText !== value
                ? "border-destructive"
                : "border-border focus:border-primary",
            )}
          />
          <p className="text-[10px] text-muted-foreground">
            {isArabic
              ? "قيمة box-shadow صالحة فقط (مثال: 0 4px 12px 0 rgba(0,0,0,0.3))"
              : "A safe box-shadow value only (e.g. 0 4px 12px 0 rgba(0,0,0,0.3))"}
          </p>
        </div>
      )}
    </div>
  );
}

function ShadowGroupEditor({
  mode,
  overrides,
  onSetShadow,
  onResetShadow,
  isArabic,
}: {
  mode: "light" | "dark";
  overrides: ThemeShadowOverrides;
  onSetShadow: (key: string, value: string) => void;
  onResetShadow: (key: string) => void;
  isArabic: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
        <Layers className="h-3.5 w-3.5" />
        {isArabic ? "الظلال" : "Shadows"}
      </h4>
      <div className="divide-y divide-border">
        {SHADOW_SIZES.map(({ size, label }) => {
          const key = SHADOW_SIZE_TO_VAR_KEY[size];
          const custom = overrides[key];
          const value = custom ?? getDefaultShadowValue(size, mode);
          return (
            <ShadowSizeRow
              key={key}
              size={size}
              label={isArabic ? label.ar : label.en}
              mode={mode}
              value={value}
              isCustom={!!custom}
              onSelectPreset={(v) => onSetShadow(key, v)}
              onCustomChange={(v) => onSetShadow(key, v)}
              onReset={() => onResetShadow(key)}
              isArabic={isArabic}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One mode's logo: preview, Upload, Remove — draft-scoped like every    */
/* other control here (needs Save Draft + Publish to reach the site).   */
/* ------------------------------------------------------------------ */
function LogoField({
  label,
  previewSrc,
  isDefault,
  swatchMode,
  uploading,
  onUpload,
  onRemove,
  isArabic,
}: {
  label: string;
  previewSrc: string | null;
  isDefault: boolean;
  /** Renders the preview box against THAT mode's actual background — a light-mode logo is usually dark-colored and vice versa, so previewing on the admin's own (possibly opposite) theme would be misleading. */
  swatchMode: "light" | "dark";
  uploading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
  isArabic: boolean;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div
        className="flex h-16 w-32 shrink-0 items-center justify-center rounded-sm border border-dashed border-border"
        style={{ background: getDefaultTokenHex("background", swatchMode) }}
      >
        {previewSrc ? (
          <img src={previewSrc} alt={label} className="max-h-14 max-w-28 object-contain" />
        ) : (
          <span className="text-[10px] text-muted-foreground">{isArabic ? "لا يوجد" : "None"}</span>
        )}
      </div>
      <div className="flex-1 space-y-1.5">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-[11px] text-muted-foreground">
          {isDefault
            ? isArabic
              ? "يستخدم الشعار الافتراضي للموقع"
              : "Using the site's default logo"
            : isArabic
              ? "شعار مخصص لهذا الوضع"
              : "Custom logo for this mode"}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest transition hover:bg-accent disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {isArabic ? "رفع" : "Upload"}
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={isDefault || uploading}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground transition hover:bg-accent disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {isArabic ? "إزالة" : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}

const SUB_TABS: { id: SubTab; en: string; ar: string; icon: typeof Sun }[] = [
  { id: "mode", en: "Mode", ar: "الوضع", icon: LayoutTemplate },
  { id: "light", en: "Light Mode", ar: "الوضع الفاتح", icon: Sun },
  { id: "dark", en: "Dark Mode", ar: "الوضع الداكن", icon: Moon },
  { id: "general", en: "General", ar: "عام", icon: Type },
  { id: "preview", en: "Preview", ar: "معاينة", icon: Eye },
];

export function WebsiteAppearanceTab() {
  const qc = useQueryClient();
  const { lang, t } = useAdminI18n();
  const confirm = useConfirm();
  const isArabic = lang === "ar";

  const [tab, setTab] = useState<SubTab>("mode");
  const [edited, setEdited] = useState<WebsiteThemeSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState<"light" | "dark" | null>(null);
  const defaultLogoUrl = useBranding().logoUrl;

  const {
    data: draft,
    isLoading: draftLoading,
    isError: draftError,
  } = useQuery({
    queryKey: ["admin-website-theme-draft"],
    queryFn: loadDraftThemeSettings,
  });
  const { data: published, isLoading: publishedLoading } = useQuery({
    queryKey: ["admin-website-theme-published"],
    queryFn: loadPublishedThemeSettings,
  });
  const { data: history } = useQuery({
    queryKey: ["admin-website-theme-history"],
    queryFn: () => getThemeHistory(10),
  });

  useEffect(() => {
    if (draft) setEdited(draft);
  }, [draft]);

  const isLoading = draftLoading || publishedLoading || !edited;
  const dirty = draft && edited ? JSON.stringify(draft) !== JSON.stringify(edited) : false;

  const refreshAll = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["admin-website-theme-draft"] }),
      qc.invalidateQueries({ queryKey: ["admin-website-theme-published"] }),
      qc.invalidateQueries({ queryKey: ["admin-website-theme-history"] }),
    ]);

  const update = (fn: (s: WebsiteThemeSettings) => WebsiteThemeSettings) =>
    setEdited((prev) => (prev ? fn(prev) : prev));

  const setToken = (mode: "light" | "dark", key: string, hex: string) =>
    update((s) => withThemeChanges(s, { colors: { [mode]: { ...s.colors[mode], [key]: hex } } }));
  const resetToken = (mode: "light" | "dark", key: string) =>
    update((s) => {
      const next = { ...s.colors[mode] };
      delete next[key];
      return withThemeChanges(s, { colors: { [mode]: next } });
    });
  const setTypography = (patch: Partial<ThemeTypography>) =>
    update((s) => withThemeChanges(s, { typography: { ...s.typography, ...patch } }));

  const setShadow = (mode: "light" | "dark", key: string, value: string) =>
    update((s) =>
      withThemeChanges(s, { shadows: { [mode]: { ...s.shadows[mode], [key]: value } } }),
    );
  const resetShadow = (mode: "light" | "dark", key: string) =>
    update((s) => {
      const next = { ...s.shadows[mode] };
      delete next[key];
      return withThemeChanges(s, { shadows: { [mode]: next } });
    });
  const setLogo = (mode: "light" | "dark", url: string | undefined) =>
    update((s) => withThemeChanges(s, { logos: { ...s.logos, [mode]: url } }));

  const handleLogoUpload = async (mode: "light" | "dark", file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error(isArabic ? "الرجاء اختيار ملف صورة." : "Please choose an image file.");
      return;
    }
    setUploadingLogo(mode);
    try {
      // PNG (not the usual JPEG re-encode) to keep a transparent background —
      // logos are almost always uploaded as transparent PNG/SVG.
      const optimized = await optimizeImage(file, {
        maxDim: 600,
        quality: 0.92,
        mime: "image/png",
      });
      const dataUrl = await fileToDataUrl(optimized);
      const { url } = await uploadPosterImage({ data: { dataUrl, filename: file.name } });
      setLogo(mode, url);
      toast.success(
        isArabic
          ? "تم الرفع — لا يزال يحتاج Save Draft ثم Publish."
          : "Uploaded — still needs Save Draft then Publish.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : isArabic ? "فشل الرفع" : "Upload failed",
      );
    } finally {
      setUploadingLogo(null);
    }
  };

  const handleSaveDraft = async () => {
    if (!edited) return;
    setSaving(true);
    try {
      await saveThemeDraft(edited);
      await qc.invalidateQueries({ queryKey: ["admin-website-theme-draft"] });
      toast.success(isArabic ? "تم حفظ المسودة" : "Draft saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : isArabic ? "تعذر الحفظ" : "Could not save",
      );
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    if (!edited) return;
    setSaving(true);
    try {
      await saveThemeDraft(edited);
      await qc.invalidateQueries({ queryKey: ["admin-website-theme-draft"] });
      setThemePreviewMode(edited.mode);
      openPreviewWindow("/", "desktop");
      toast.success(isArabic ? "تم فتح المعاينة في نافذة جديدة" : "Preview opened in a new window");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : isArabic
            ? "تعذر تجهيز المعاينة"
            : "Could not prepare preview",
      );
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!edited) return;
    const fromLabel = published ? modeLabel(published.mode, isArabic) : "—";
    const toLabel = modeLabel(edited.mode, isArabic);
    const customNote = hasThemeCustomizations(edited)
      ? isArabic
        ? " مع تخصيصات الألوان/الخطوط."
        : " with your color/typography customizations."
      : "";
    const ok = await confirm({
      title: isArabic ? "نشر الثيم؟" : "Publish theme?",
      description: isArabic
        ? `سيتغير مظهر الموقع لجميع الزوار من "${fromLabel}" إلى "${toLabel}" فورًا.${customNote}`
        : `The live website will switch from "${fromLabel}" to "${toLabel}" for every visitor, immediately.${customNote}`,
      confirmLabel: isArabic ? "نشر" : "Publish",
      destructive: false,
    });
    if (!ok) return;

    setPublishing(true);
    try {
      await publishTheme(edited);
      await refreshAll();
      toast.success(isArabic ? "تم نشر الثيم" : "Theme published");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : isArabic ? "تعذر النشر" : "Could not publish",
      );
    } finally {
      setPublishing(false);
    }
  };

  const handleReset = async (scope: "light" | "dark" | "typography" | "all") => {
    if (!edited) return;
    const labels: Record<typeof scope, { en: string; ar: string }> = {
      light: {
        en: "the Light theme (colors, shadows and logo)",
        ar: "الوضع الفاتح (الألوان والظلال والشعار)",
      },
      dark: {
        en: "the Dark theme (colors, shadows and logo)",
        ar: "الوضع الداكن (الألوان والظلال والشعار)",
      },
      typography: { en: "typography & layout", ar: "الخطوط والتخطيط" },
      all: {
        en: "ALL theme settings (mode, colors, shadows, logos and typography)",
        ar: "كل إعدادات الثيم (الوضع والألوان والظلال والشعارات والخطوط)",
      },
    };
    const ok = await confirm({
      title: isArabic ? "إعادة التعيين؟" : "Reset?",
      description: isArabic
        ? `سيتم استبدال المسودة الحالية لـ "${labels[scope].ar}" بالإعدادات الافتراضية. هذا لا ينشر شيئًا بعد.`
        : `This replaces the current draft's ${labels[scope].en} with the defaults. It doesn't publish anything yet.`,
      confirmLabel: isArabic ? "إعادة التعيين" : "Reset",
      destructive: true,
    });
    if (!ok) return;

    setResetting(scope);
    try {
      const next = await resetThemeDraftScope(edited, scope);
      setEdited(next);
      await qc.invalidateQueries({ queryKey: ["admin-website-theme-draft"] });
      toast.success(isArabic ? "تمت إعادة التعيين" : "Reset");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : isArabic
            ? "تعذرت إعادة التعيين"
            : "Could not reset",
      );
    } finally {
      setResetting(null);
    }
  };

  const handleRestore = async (historyId: string, mode: ThemeMode) => {
    const ok = await confirm({
      title: isArabic ? "استعادة إلى المسودة؟" : "Restore to draft?",
      description: isArabic
        ? `سيتم تحميل هذه النسخة ("${modeLabel(mode, isArabic)}") في المسودة — يمكنك معاينتها قبل النشر.`
        : `Loads this version ("${modeLabel(mode, isArabic)}") into the draft — you can preview it before publishing.`,
      confirmLabel: isArabic ? "استعادة" : "Restore",
      destructive: false,
    });
    if (!ok) return;

    setRestoringId(historyId);
    try {
      const next = await restoreThemeVersionToDraft(historyId);
      setEdited(next);
      await qc.invalidateQueries({ queryKey: ["admin-website-theme-draft"] });
      toast.success(isArabic ? "تم تحميل النسخة في المسودة" : "Version loaded into draft");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : isArabic ? "تعذرت الاستعادة" : "Could not restore",
      );
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            {t("appearance.title", isArabic ? "المظهر" : "Appearance")}
          </div>
          <h2 className="text-display text-3xl">{isArabic ? "إعدادات الثيم" : "Theme Settings"}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {isArabic
              ? "يتحكم هذا في مظهر الموقع بالكامل لكل الزوار — الوضع، الألوان، والخطوط — مستقل تمامًا عن ثيم لوحة الإدارة."
              : "Controls the entire storefront's appearance for every visitor — mode, colors and typography — completely independent from the Admin dashboard's own theme."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handlePreview}
            disabled={isLoading || saving}
            className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2 text-xs font-semibold uppercase tracking-widest transition hover:bg-accent disabled:opacity-50"
          >
            <Eye className="h-4 w-4" />
            {isArabic ? "معاينة كاملة" : "Full preview"}
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isLoading || saving || !dirty}
            className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2 text-xs font-semibold uppercase tracking-widest transition hover:bg-accent disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isArabic ? "حفظ المسودة" : "Save Draft"}
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing || isLoading}
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
          >
            {publishing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {isArabic ? "نشر" : "Publish"}
          </button>
        </div>
      </div>

      {draftError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {isArabic
            ? "تعذر تحميل إعدادات الثيم — الموقع سيستمر بالإعداد الافتراضي حتى يُحل هذا."
            : "Could not load theme settings — the site keeps using its default theme until this is resolved."}
        </div>
      )}

      {dirty && (
        <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
          {isArabic
            ? "لديك تعديلات غير محفوظة. احفظ المسودة، ثم انشر لتطبيقها على الموقع الحي."
            : "You have unsaved edits. Save the draft, then Publish to apply them to the live site."}
        </div>
      )}

      {/* Sub-tabs */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="flex min-w-max gap-1 border-b border-border pb-2">
          {SUB_TABS.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setTab(s.id)}
                aria-current={tab === s.id ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-3 py-1.5 text-xs font-medium uppercase tracking-widest",
                  tab === s.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {isArabic ? s.ar : s.en}
              </button>
            );
          })}
        </div>
      </div>

      {isLoading || !edited ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {isArabic ? "جارٍ التحميل..." : "Loading..."}
        </div>
      ) : (
        <>
          {tab === "mode" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {MODE_OPTIONS.map((opt) => {
                const checked = edited.mode === opt.value;
                const isLive = published?.mode === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => update((s) => withThemeChanges(s, { mode: opt.value }))}
                    className={cn(
                      "group relative overflow-hidden rounded-md border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/70",
                      checked
                        ? "border-primary shadow-[0_0_0_1px_color-mix(in_oklch,var(--primary)_35%,transparent)]"
                        : "border-border",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-foreground">
                          {isArabic ? opt.ar : opt.en}
                        </div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {isArabic ? opt.hint.ar : opt.hint.en}
                        </p>
                      </div>
                      {checked && <Check className="h-5 w-5 text-primary" aria-hidden />}
                    </div>
                    <div
                      className={cn(
                        "mt-4 flex h-16 overflow-hidden rounded-sm border border-border",
                        opt.value === "system" &&
                          "bg-[linear-gradient(90deg,#0a0a0a_50%,#ffffff_50%)]",
                        opt.value === "light" && "bg-white",
                        opt.value === "dark" && "bg-[#0a0a0a]",
                      )}
                    />
                    {isLive && (
                      <span className="mt-3 inline-block text-[11px] uppercase tracking-widest text-primary">
                        {isArabic ? "منشور حاليًا" : "Currently live"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {(tab === "light" || tab === "dark") && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-5">
                <ColorGroupEditor
                  mode={tab}
                  overrides={edited.colors[tab]}
                  onSetToken={(key, hex) => setToken(tab, key, hex)}
                  onResetToken={(key) => resetToken(tab, key)}
                  isArabic={isArabic}
                />
                <ShadowGroupEditor
                  mode={tab}
                  overrides={edited.shadows[tab]}
                  onSetShadow={(key, value) => setShadow(tab, key, value)}
                  onResetShadow={(key) => resetShadow(tab, key)}
                  isArabic={isArabic}
                />
              </div>
              <div className="lg:sticky lg:top-4 lg:self-start">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                    {isArabic ? "معاينة حية" : "Live preview"}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleReset(tab)}
                    disabled={
                      resetting === tab ||
                      (Object.keys(edited.colors[tab]).length === 0 &&
                        Object.keys(edited.shadows[tab]).length === 0)
                    }
                    className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground transition hover:bg-accent disabled:opacity-40"
                  >
                    {resetting === tab ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3 w-3" />
                    )}
                    {isArabic
                      ? `إعادة تعيين ${tab === "light" ? "الفاتح" : "الداكن"}`
                      : `Reset ${tab}`}
                  </button>
                </div>
                <LivePreview
                  mode={tab}
                  overrides={edited.colors[tab]}
                  shadows={edited.shadows[tab]}
                  typography={edited.typography}
                  isArabic={isArabic}
                />
              </div>
            </div>
          )}

          {tab === "general" && (
            <div className="max-w-xl space-y-5">
              <div className="rounded-md border border-border bg-card p-4">
                <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                  <Type className="h-3.5 w-3.5" />
                  {isArabic ? "الخطوط" : "Typography"}
                </h4>
                <div className="mt-3 space-y-4">
                  <label className="block">
                    <span className="text-xs text-muted-foreground">
                      {isArabic ? "حجم الخط الأساسي" : "Base font size"} (
                      {edited.typography.fontSizeBasePx ?? 16}px)
                    </span>
                    <input
                      type="range"
                      min={13}
                      max={20}
                      step={1}
                      value={edited.typography.fontSizeBasePx ?? 16}
                      onChange={(e) => setTypography({ fontSizeBasePx: Number(e.target.value) })}
                      className="mt-1 w-full accent-primary"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground">
                      {isArabic ? "سُمك خط العناوين" : "Heading weight"}
                    </span>
                    <select
                      value={edited.typography.headingWeight ?? 700}
                      onChange={(e) => setTypography({ headingWeight: Number(e.target.value) })}
                      className="mt-1 w-full rounded-sm border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                    >
                      {[400, 500, 600, 700, 800, 900].map((w) => (
                        <option key={w} value={w}>
                          {w}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground">
                      {isArabic ? "سُمك خط النص" : "Body weight"}
                    </span>
                    <select
                      value={edited.typography.bodyWeight ?? 400}
                      onChange={(e) => setTypography({ bodyWeight: Number(e.target.value) })}
                      className="mt-1 w-full rounded-sm border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                    >
                      {[300, 400, 500, 600, 700].map((w) => (
                        <option key={w} value={w}>
                          {w}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="rounded-md border border-border bg-card p-4">
                <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                  <Palette className="h-3.5 w-3.5" />
                  {isArabic ? "استدارة الحواف" : "Corner radius"}
                </h4>
                <label className="mt-3 block">
                  <span className="text-xs text-muted-foreground">
                    {(edited.typography.radiusRem ?? 0.25).toFixed(2)}rem
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1.25}
                    step={0.05}
                    value={edited.typography.radiusRem ?? 0.25}
                    onChange={(e) => setTypography({ radiusRem: Number(e.target.value) })}
                    className="mt-1 w-full accent-primary"
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={() => handleReset("typography")}
                disabled={resetting === "typography" || Object.keys(edited.typography).length === 0}
                className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground transition hover:bg-accent disabled:opacity-40"
              >
                {resetting === "typography" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                {isArabic ? "إعادة تعيين الخطوط" : "Reset typography"}
              </button>

              <div className="rounded-md border border-border bg-card p-4">
                <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                  <ImageIcon className="h-3.5 w-3.5" />
                  {isArabic ? "إعدادات الشعار" : "Logo Settings"}
                </h4>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {isArabic
                    ? "اختياري. إن لم يُحدد شعار لوضع ما، يُستخدم الشعار الافتراضي للموقع تلقائيًا — لن يتغير الشعار الحالي إلا إذا رفعت شعارًا جديدًا هنا."
                    : "Optional. A mode with no logo set here automatically falls back to the site's default logo — nothing changes until you upload one."}
                </p>
                <div className="mt-4 space-y-4 divide-y divide-border">
                  <LogoField
                    label={isArabic ? "شعار الوضع الفاتح" : "Light Mode Logo"}
                    previewSrc={edited.logos.light ?? defaultLogoUrl}
                    isDefault={!edited.logos.light}
                    swatchMode="light"
                    uploading={uploadingLogo === "light"}
                    onUpload={(f) => handleLogoUpload("light", f)}
                    onRemove={() => setLogo("light", undefined)}
                    isArabic={isArabic}
                  />
                  <div className="pt-4">
                    <LogoField
                      label={isArabic ? "شعار الوضع الداكن" : "Dark Mode Logo"}
                      previewSrc={edited.logos.dark ?? defaultLogoUrl}
                      isDefault={!edited.logos.dark}
                      swatchMode="dark"
                      uploading={uploadingLogo === "dark"}
                      onUpload={(f) => handleLogoUpload("dark", f)}
                      onRemove={() => setLogo("dark", undefined)}
                      isArabic={isArabic}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "preview" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    <Sun className="h-3.5 w-3.5" /> {isArabic ? "الوضع الفاتح" : "Light mode"}
                  </p>
                  <LivePreview
                    mode="light"
                    overrides={edited.colors.light}
                    shadows={edited.shadows.light}
                    typography={edited.typography}
                    isArabic={isArabic}
                  />
                </div>
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    <Moon className="h-3.5 w-3.5" /> {isArabic ? "الوضع الداكن" : "Dark mode"}
                  </p>
                  <LivePreview
                    mode="dark"
                    overrides={edited.colors.dark}
                    shadows={edited.shadows.dark}
                    typography={edited.typography}
                    isArabic={isArabic}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleReset("all")}
                disabled={resetting === "all"}
                className="inline-flex items-center gap-1 rounded-sm border border-destructive/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-destructive transition hover:bg-destructive/10 disabled:opacity-40"
              >
                {resetting === "all" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                {isArabic
                  ? "إعادة تعيين كل شيء إلى الافتراضي"
                  : "Reset ALL theme settings to default"}
              </button>
            </div>
          )}
        </>
      )}

      <div className="rounded-md border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-muted-foreground">
          <History className="h-3.5 w-3.5" />
          {isArabic ? "سجل النسخ" : "Version history"}
        </div>
        {!history || history.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {isArabic ? "لا يوجد سجل نشر بعد." : "No publish history yet."}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {history.map((entry) => {
              const normalized = normalizeThemeSettings(entry.value);
              const mode = normalized.mode;
              const customized = hasThemeCustomizations(normalized);
              return (
                <li key={entry.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div>
                    <span className="font-medium text-foreground">{modeLabel(mode, isArabic)}</span>
                    {customized && (
                      <span className="ml-2 text-[10px] uppercase tracking-widest text-primary">
                        {isArabic ? "+ ألوان مخصصة" : "+ custom colors"}
                      </span>
                    )}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {new Date(entry.created_at).toLocaleString(isArabic ? "ar-EG" : "en-US")}
                      {entry.created_by_email ? ` · ${entry.created_by_email}` : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRestore(entry.id, mode)}
                    disabled={restoringId === entry.id}
                    className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-1 text-[11px] font-semibold uppercase tracking-widest transition hover:bg-accent disabled:opacity-50"
                  >
                    {restoringId === entry.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : isArabic ? (
                      "استعادة"
                    ) : (
                      "Restore"
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
