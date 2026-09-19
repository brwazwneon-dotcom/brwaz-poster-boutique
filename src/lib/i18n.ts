import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import ar from "./locales/ar.json";

const SUPPORTED_LANGS = ["ar", "en"];
const STORAGE_KEY = "brw_preferred_lang";

export type Lang = "ar" | "en";

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
//
// The server now picks the language per request (see resolveRequestLanguage
// and router.tsx), so an English visitor normally gets English HTML straight
// away. The browser starts in whatever language the server rendered
// (<html lang>), which keeps hydration identical, and only switches after
// hydration when the visitor's stored choice differs from that.
const renderedLang: Lang | null =
  typeof document !== "undefined" ? toLang(document.documentElement.lang) : null;

export const i18nInitPromise = i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, ar: { translation: ar } },
    lng: renderedLang ?? "ar",
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
    if (typeof window === "undefined") return;
    // Initialising cached the rendered language over the visitor's stored
    // choice; put back exactly what was there before.
    if (visitor.stored) {
      try {
        window.localStorage.setItem(STORAGE_KEY, visitor.stored);
      } catch {
        /* storage unavailable */
      }
    }
    // From here on, every real language change also updates the cookie.
    i18n.on("languageChanged", writeLanguageCookie);
  });

const COOKIE_NAME = "brw_lang";

/** Language for a server request: the visitor's saved choice (cookie), else
 *  the highest-priority Arabic/English entry of Accept-Language, else Arabic
 *  (also what crawlers, which send no preference, get). */
export function resolveRequestLanguage(
  cookie: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Lang {
  const fromCookie = new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=(ar|en)\\b`).exec(cookie ?? "");
  if (fromCookie) return fromCookie[1] as Lang;
  if (acceptLanguage) {
    const ranked = acceptLanguage
      .split(",")
      .map((part, index) => {
        const [tag, ...params] = part.trim().split(";");
        const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
        return { lang: toLang(tag), q: qParam ? parseFloat(qParam.slice(2)) : 1, index };
      })
      .filter((c) => c.lang && !Number.isNaN(c.q) && c.q > 0)
      .sort((a, b) => b.q - a.q || a.index - b.index);
    if (ranked.length > 0) return ranked[0].lang as Lang;
  }
  return "ar";
}

/** A separate i18n instance for one server request, so concurrent requests
 *  in different languages can't overwrite each other's language. Shares the
 *  loaded translations with the main instance. */
export function createRequestI18n(lang: Lang) {
  return i18n.cloneInstance({ lng: lang });
}

// Remember the language in a cookie so the server can render it next time.
function writeLanguageCookie(lang: string) {
  if (typeof document === "undefined") return;
  const value = lang.toLowerCase().startsWith("ar") ? "ar" : "en";
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${COOKIE_NAME}=${value}; path=/; max-age=31536000; samesite=lax${secure}`;
}

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
  if (!target || i18n.language?.startsWith(target)) {
    // Already showing their language: just make sure the server can see it.
    writeLanguageCookie(i18n.language ?? "ar");
    return;
  }
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
