import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getTheme,
  loadActiveTheme,
  rollbackActiveTheme,
  saveActiveTheme,
  setThemePreview,
  SITE_THEMES,
  type ThemeId,
} from "@/lib/theme-system";
import { useAdminI18n } from "@/lib/admin-i18n";

export function WebsiteAppearanceTab() {
  const qc = useQueryClient();
  const { lang, t } = useAdminI18n();
  const [selected, setSelected] = useState<ThemeId>("brw-classic");
  const [saving, setSaving] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);

  const { data: activeTheme, isLoading } = useQuery({
    queryKey: ["admin-website-theme"],
    queryFn: loadActiveTheme,
  });

  useEffect(() => {
    if (activeTheme) setSelected(activeTheme.id);
  }, [activeTheme]);

  const selectedTheme = getTheme(selected);
  const isArabic = lang === "ar";
  const themeName = (theme: (typeof SITE_THEMES)[number]) =>
    theme.nameKey
      ? t(theme.nameKey, isArabic ? (theme.nameAr ?? theme.name) : theme.name)
      : isArabic
        ? (theme.nameAr ?? theme.name)
        : theme.name;
  const themeDescription = (theme: (typeof SITE_THEMES)[number]) =>
    theme.descriptionKey
      ? t(
          theme.descriptionKey,
          isArabic ? (theme.descriptionAr ?? theme.description) : theme.description,
        )
      : isArabic
        ? (theme.descriptionAr ?? theme.description)
        : theme.description;

  const preview = () => {
    setThemePreview(selectedTheme);
    toast.success(isArabic ? "تم تفعيل المعاينة لهذه الجلسة" : "Preview enabled for this session");
  };

  const publish = async () => {
    setSaving(true);
    try {
      await saveActiveTheme(selectedTheme.id);
      await qc.invalidateQueries({ queryKey: ["admin-website-theme"] });
      toast.success(isArabic ? "تم نشر الثيم" : "Theme published");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : isArabic
            ? "تعذر حفظ الثيم"
            : "Could not save theme",
      );
    } finally {
      setSaving(false);
    }
  };

  const rollback = async () => {
    setRollingBack(true);
    try {
      const previous = await rollbackActiveTheme();
      if (!previous) {
        toast.info(isArabic ? "لا توجد نسخة سابقة" : "No previous theme to restore");
        return;
      }
      setSelected(previous.id);
      await qc.invalidateQueries({ queryKey: ["admin-website-theme"] });
      toast.success(isArabic ? "تمت استعادة الثيم السابق" : "Previous theme restored");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : isArabic
            ? "تعذر الاستعادة"
            : "Could not rollback theme",
      );
    } finally {
      setRollingBack(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            {t("appearance.title")}
          </div>
          <h2 className="text-display text-4xl">{t("appearance.theme")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {isArabic
              ? "اختَر الثيم من لوحة الإدارة فقط. العملاء لا يرون أي أداة لاختيار الثيم."
              : "Choose the storefront theme from admin only. Customers never see a theme selector."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={preview}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2 text-xs font-semibold uppercase tracking-widest transition hover:bg-accent disabled:opacity-50"
          >
            <Eye className="h-4 w-4" />
            {t("appearance.preview")}
          </button>
          <button
            type="button"
            onClick={publish}
            disabled={saving || isLoading}
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("appearance.publish")}
          </button>
          <button
            type="button"
            onClick={rollback}
            disabled={rollingBack || isLoading}
            className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2 text-xs font-semibold uppercase tracking-widest transition hover:bg-accent disabled:opacity-50"
          >
            {rollingBack ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isArabic ? "استعادة" : "Rollback"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SITE_THEMES.map((theme) => {
          const active = activeTheme?.id === theme.id;
          const checked = selected === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => setSelected(theme.id)}
              className={cn(
                "group relative overflow-hidden rounded-md border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/70",
                checked
                  ? "border-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.35)]"
                  : "border-border",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-foreground">{themeName(theme)}</div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {themeDescription(theme)}
                  </p>
                </div>
                {checked && <Check className="h-5 w-5 text-primary" aria-hidden />}
              </div>
              <div className="mt-5 flex h-24 overflow-hidden rounded-sm border border-border">
                {theme.preview.map((color) => (
                  <span key={color} className="flex-1" style={{ backgroundColor: color }} />
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between text-[11px] uppercase tracking-widest text-muted-foreground">
                <span>{theme.id}</span>
                <span className="flex items-center gap-2">
                  {theme.badge && (
                    <span className="rounded-full bg-secondary/15 px-2 py-1 text-[9px] text-secondary-foreground">
                      {theme.badgeKey
                        ? t(theme.badgeKey, isArabic ? theme.badgeAr : theme.badge)
                        : theme.badge}
                    </span>
                  )}
                  {active && <span className="text-primary">{isArabic ? "منشور" : "Live"}</span>}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-md border border-border bg-card p-5">
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          {isArabic ? "معاينة سريعة" : "Quick Preview"}
        </div>
        <div
          className="mt-4 rounded-md border border-border p-5"
          style={{
            background: selectedTheme.tokens.background,
            color: selectedTheme.tokens.foreground,
          }}
        >
          <div className="text-3xl" style={{ fontFamily: selectedTheme.tokens.fontDisplay }}>
            BRWAZWNEON
          </div>
          <p
            className="mt-2 text-sm opacity-75"
            style={{ fontFamily: selectedTheme.tokens.fontBody }}
          >
            {isArabic
              ? "الألوان والخطوط تطبق على واجهة العملاء عبر متغيرات CSS."
              : "Colors and fonts apply to the customer storefront through CSS variables."}
          </p>
          <div
            className="mt-4 inline-flex rounded-sm px-4 py-2 text-xs font-semibold uppercase tracking-widest"
            style={{
              background: selectedTheme.tokens.primary,
              color: selectedTheme.tokens.primaryForeground,
            }}
          >
            {isArabic ? "زر أساسي" : "Primary Button"}
          </div>
        </div>
      </div>
    </div>
  );
}
