import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  applyTheme,
  clearThemePreview,
  getTheme,
  loadActiveTheme,
  persistThemeLocally,
  THEME_PREVIEW_STORAGE_KEY,
} from "@/lib/theme-system";

export function ThemeBoot() {
  const isAdmin = useRouterState({ select: (s) => s.location.pathname.startsWith("/admin") });
  useEffect(() => {
    let cancelled = false;

    // The admin console keeps the dark console theme; the storefront theme is customer-facing only.
    if (isAdmin) {
      applyTheme(getTheme("brw-classic"));
      return;
    }

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
  }, [isAdmin]);

  return null;
}

function readSession(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
