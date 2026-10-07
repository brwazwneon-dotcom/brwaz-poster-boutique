import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ar from "./locales/ar.json";

const SUPPORTED_LANGS = ["ar", "en"];

// The server always renders with SERVER_LANG. The client must render its FIRST pass with the same
// language, otherwise React throws a hydration mismatch (#418) and discards the server HTML for every
// visitor whose preferred language differs. The real preference is applied right after hydration
// (see `applyPreferredLanguage`, called from LanguageBoot).
const SERVER_LANG = "en";
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
}
i18n.on("languageChanged", (lang) => {
  if (persistEnabled && typeof window !== "undefined") persistLanguage(lang);
});

export function applyPreferredLanguage() {
  const lang = detectPreferredLanguage();
  persistEnabled = true;
  if (i18n.language !== lang) void i18n.changeLanguage(lang);
  else persistLanguage(lang);
}

export default i18n;
export { SUPPORTED_LANGS };
