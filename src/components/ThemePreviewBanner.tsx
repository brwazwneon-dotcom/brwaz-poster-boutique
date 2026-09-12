import { useEffect, useState } from "react";
import { Eye, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  clearThemePreview,
  getTheme,
  THEME_PREVIEW_STORAGE_KEY,
  type ThemeId,
} from "@/lib/theme-system";

export function ThemePreviewBanner() {
  const { t } = useTranslation();
  const [themeId, setThemeId] = useState<ThemeId | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(THEME_PREVIEW_STORAGE_KEY);
      if (raw) setThemeId(getTheme(raw).id);
    } catch {
      /* sessionStorage may be unavailable in hardened browsers */
    }
  }, []);

  if (!themeId) return null;

  const theme = getTheme(themeId);
  const closePreview = () => {
    clearThemePreview();
    window.location.reload();
  };

  return (
    <div
      className="fixed bottom-20 left-1/2 z-[9998] flex -translate-x-1/2 items-center gap-3 rounded-full border border-primary/40 bg-background/95 px-4 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur"
      role="status"
      aria-live="polite"
    >
      <Eye className="h-4 w-4 text-primary" aria-hidden />
      <span className="uppercase tracking-widest">
        {t("admin.themePreviewLabel", { name: theme.name })}
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
