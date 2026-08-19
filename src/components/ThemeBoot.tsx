import { useEffect } from "react";
import {
  applyTheme,
  clearThemePreview,
  getTheme,
  loadActiveTheme,
  persistThemeLocally,
  THEME_PREVIEW_STORAGE_KEY,
} from "@/lib/theme-system";

export function ThemeBoot() {
  useEffect(() => {
    let cancelled = false;

    const previewTheme = readSession(THEME_PREVIEW_STORAGE_KEY);
    if (previewTheme) {
      applyTheme(getTheme(previewTheme));
      return;
    }

    loadActiveTheme()
      .then((theme) => {
        if (cancelled) return;
        applyTheme(theme);
        persistThemeLocally(theme);
      })
      .catch(() => {
        clearThemePreview();
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

function readSession(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
