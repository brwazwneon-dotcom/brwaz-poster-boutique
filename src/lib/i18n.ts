import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import ar from "./locales/ar.json";

const SUPPORTED_LANGS = ["ar", "en"];
const STORAGE_KEY = "brw_preferred_lang";

type Lang = "ar" | "en";

function toLang(raw: string | null | undefined): Lang | null {
  const v = (raw ?? "").toLowerCase();
  if (v.startsWith("ar")) return "ar";
  if (v.startsWith("en")) return "en";
  return null;
}

// What the visitor actually wants: their stored choice, else the first
// supported language in their browser's list — the same order the language
// detector below used to apply (localStorage, then navigator). Read once,
// before init, because init itself writes to that same storage key.
function readVisitorPreference(): { stored: string | null; lang: Lang | null } {
  if (typeof window === "undefined") return { stored: null, lang: null };
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const fromStored = toLang(stored);
    if (fromStored) return { stored, lang: fromStored };
    const candidates = [...(navigator.languages ?? []), navigator.language];
    for (const c of candidates) {
      const l = toLang(c);
      if (l) return { stored, lang: l };
    }
    return { stored, lang: null };
  } catch {
    return { stored: null, lang: null };
  }
}

const visitor = readVisitorPreference();

// The server has no way to know a visitor's language (no per-request
// cookie), so it always renders Arabic, the store's primary language. If the
// browser were to pick its own language during hydration, an English visitor's
// first client render would differ from the server HTML: React throws a
// hydration error (#418), discards the server markup and re-renders the whole
// page. So both sides start in Arabic (`lng` below skips detection), and
// `applyVisitorLanguage()` switches to the visitor's language once hydration
// has finished.
export const i18nInitPromise = i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, ar: { translation: ar } },
    lng: "ar",
    fallbackLng: "ar",
    supportedLngs: SUPPORTED_LANGS,
    nonExplicitSupportedLngs: true,
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: STORAGE_KEY,
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
  })
  .then(() => {
    // Initialising in Arabic cached "ar" over the visitor's stored choice;
    // put back exactly what was there before.
    if (typeof window !== "undefined" && visitor.stored) {
      try {
        window.localStorage.setItem(STORAGE_KEY, visitor.stored);
      } catch {
        /* storage unavailable */
      }
    }
  });

let applied = false;

// A post-mount effect is not late enough: route pages are lazy components
// that React hydrates after the root's effects have already run, so a
// language change made there would make those pages hydrate in the wrong
// language. React tags every DOM node it has hydrated with an internal
// `__reactFiber$…` key; server-rendered nodes that don't have one yet are
// still waiting to be hydrated.
function serverContentHydrated(): boolean {
  const main = document.querySelector("main");
  if (!main) return true;
  const nodes = main.querySelectorAll("*");
  const limit = Math.min(nodes.length, 400);
  for (let i = 0; i < limit; i++) {
    const keys = Object.keys(nodes[i]);
    if (!keys.some((k) => k.startsWith("__reactFiber$"))) return false;
  }
  return true;
}

/** Call after mount: switches the UI to the visitor's own language once the
 *  server-rendered markup has been hydrated (or after a short timeout). */
export function applyVisitorLanguage() {
  if (applied || typeof window === "undefined") return;
  applied = true;
  const target = visitor.lang;
  if (!target || target === "ar") return;
  const started = Date.now();
  const tick = () => {
    if (serverContentHydrated() || Date.now() - started > 2500) {
      if (!i18n.language?.startsWith(target)) void i18n.changeLanguage(target);
      return;
    }
    window.setTimeout(tick, 50);
  };
  window.setTimeout(tick, 0);
}

export default i18n;
export { SUPPORTED_LANGS };
