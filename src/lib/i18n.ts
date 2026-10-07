import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ar from "./locales/ar.json";

const SUPPORTED_LANGS = ["ar", "en"];

// The server picks the language per request (cookie / Accept-Language, see request-lang.ts) and writes it
// to <html lang>. The client must render its FIRST pass in that same language, otherwise React throws a
// hydration mismatch (#418) and discards the server HTML. We read it back from <html lang>. If the visitor's
// own preference differs (e.g. localStorage from before the cookie existed), `applyPreferredLanguage`
// (LanguageBoot) reconciles right after hydration and writes the cookie so the next visit is clean.
const SERVER_LANG: "ar" | "en" =
  typeof document !== "undefined" && document.documentElement.lang === "ar" ? "ar" : "en";
const STORAGE_KEY = "brw_preferred_lang";

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: SERVER_LANG,
  fallbackLng: "ar",
  supportedLngs: SUPPORTED_LANGS,
  nonExplicitSupportedLngs: true,
  interpolation: { escapeValue: false },
});

/** Same order as the previous detector: stored choice, then browser language; unsupported -> "ar". */
export function detectPreferredLanguage(): "ar" | "en" {
  const pick = (v: string | null | undefined) => {
    const l = (v ?? "").toLowerCase();
    if (l.startsWith("ar")) return "ar" as const;
    if (l.startsWith("en")) return "en" as const;
    return null;
  };
  try {
    const stored = pick(localStorage.getItem(STORAGE_KEY));
    if (stored) return stored;
  } catch {
    /* storage unavailable */
  }
  const nav =
    typeof navigator !== "undefined" ? [...(navigator.languages ?? []), navigator.language] : [];
  for (const l of nav) {
    const p = pick(l);
    if (p) return p;
  }
  return "ar";
}

// The removed LanguageDetector also cached the language in localStorage on every change; keep that
// behaviour, but only after the preference has been read (init itself must not overwrite it).
let persistEnabled = false;
function persistLanguage(lang: string) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* storage unavailable */
  }
  try {
    document.cookie = `brw_lang=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`;
  } catch {
    /* cookies unavailable */
  }
}
i18n.on("languageChanged", (lang) => {
  if (persistEnabled && typeof window !== "undefined") persistLanguage(lang);
});

// Resolves once the visitor's language has been applied. UI that would visibly reorder/relabel on the
// language switch (e.g. the fixed mobile nav, which flips in RTL) waits for it so it never causes a layout shift.
let markLanguageReady: () => void = () => {};
export const languageReady: Promise<void> = new Promise((resolve) => {
  markLanguageReady = resolve;
});

export function applyPreferredLanguage() {
  const lang = detectPreferredLanguage();
  persistEnabled = true;
  if (i18n.language !== lang) {
    void i18n.changeLanguage(lang).finally(markLanguageReady);
  } else {
    persistLanguage(lang);
    markLanguageReady();
  }
}

export default i18n;
export { SUPPORTED_LANGS };
