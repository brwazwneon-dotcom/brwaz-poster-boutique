import { useEffect, useState } from "react";
import { Eye, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { clearThemePreviewMode, readThemePreviewMode, type ThemeMode } from "@/lib/theme-system";

const MODE_LABEL: Record<ThemeMode, { en: string; ar: string }> = {
  light: { en: "Light", ar: "فاتح" },
  dark: { en: "Dark", ar: "داكن" },
  system: { en: "System", ar: "النظام" },
};

export function ThemePreviewBanner() {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<ThemeMode | null>(null);
  const isArabic = i18n.language?.startsWith("ar");

  useEffect(() => {
    setMode(readThemePreviewMode());
  }, []);

  if (!mode) return null;

  const closePreview = () => {
    clearThemePreviewMode();
    window.location.reload();
  };

  const label = isArabic ? MODE_LABEL[mode].ar : MODE_LABEL[mode].en;

  return (
    <div
      className="fixed bottom-20 left-1/2 z-[9998] flex -translate-x-1/2 items-center gap-3 rounded-full border border-primary/40 bg-background/95 px-4 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur"
      role="status"
      aria-live="polite"
    >
      <Eye className="h-4 w-4 text-primary" aria-hidden />
      <span className="uppercase tracking-widest">
        {t("admin.themePreviewLabel", { name: label })}
      </span>
      <button
        type="button"
        onClick={closePreview}
        className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-primary-foreground transition hover:brightness-110"
      >
        <X className="h-3 w-3" aria-hidden />
        {t("admin.exitPreview")}
      </button>
    </div>
  );
}
