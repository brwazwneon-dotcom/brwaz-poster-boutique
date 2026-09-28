import { useEffect } from "react";
import {
  applyResolvedThemeToDocument,
  buildThemeOverrideCss,
  cacheThemeModeLocally,
  loadDraftThemeSettings,
  resolveThemeMode,
  type ThemeMode,
} from "@/lib/theme-system";
import { isPreviewMode } from "@/lib/preview-mode";

const PREVIEW_STYLE_ID = "brw-theme-preview-overrides";

function applyOverrideCss(css: string) {
  let tag = document.getElementById(PREVIEW_STYLE_ID) as HTMLStyleElement | null;
  if (!css) {
    tag?.remove();
    return;
  }
  if (!tag) {
    tag = document.createElement("style");
    tag.id = PREVIEW_STYLE_ID;
    document.head.appendChild(tag);
  }
  tag.textContent = css;
}

/**
 * The published mode (light/dark) is already resolved server-side and
 * rendered straight into `<html data-theme>` by __root.tsx's RootShell —
 * no flash, no client work needed for the common case. This component
 * only has two jobs left:
 *  1. Preview mode (`?preview=1`, admin-only): swap to the DRAFT theme
 *     client-side, overriding whatever SSR rendered.
 *  2. "System" mode: keep `data-theme` pinned to the OS preference live,
 *     including if the OS preference changes while the tab is open.
 */
export function ThemeBoot({ publishedMode }: { publishedMode: ThemeMode }) {
  useEffect(() => {
    cacheThemeModeLocally(publishedMode);

    if (isPreviewMode()) {
      let cancelled = false;
      loadDraftThemeSettings()
        .then((draft) => {
          if (cancelled) return;
          applyResolvedThemeToDocument(resolveThemeMode(draft.mode, matchesDark()));
          applyOverrideCss(buildThemeOverrideCss(draft));
        })
        .catch(() => {
          /* keep whatever SSR rendered if the draft fetch fails */
        });
      return () => {
        cancelled = true;
      };
    }

    if (publishedMode !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applyResolvedThemeToDocument(media.matches ? "dark" : "light");
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [publishedMode]);

  return null;
}

function matchesDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
