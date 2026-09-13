export type AdminThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "brwaz-admin-theme";

// Admin-only UI preference — per-browser, not business data, so localStorage
// is the right place (see the website's own, still-unbuilt theme engine for
// the server-controlled/draft-publish version that applies to storefront
// visitors instead).
export function getStoredAdminTheme(): AdminThemeMode {
  if (typeof window === "undefined") return "dark";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // localStorage can throw (private browsing, blocked storage) — fall through
  }
  return "dark";
}

export function setStoredAdminTheme(mode: AdminThemeMode) {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // per-browser convenience only — safe to silently drop
  }
}
