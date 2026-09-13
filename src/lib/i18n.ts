import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import ar from "./locales/ar.json";

const SUPPORTED_LANGS = ["ar", "en"];

// i18next's `.init()` is async (it returns a Promise once the detector/
// resources are resolved) but was previously called fire-and-forget at
// module scope. SSR reads `i18n.language` synchronously on import, so a
// server render could land mid-init and see i18next's own pre-init
// default rather than `fallbackLng` — while by the time the client
// hydrates a few hundred ms later, init has long since settled to "ar"
// (no stored preference + LanguageDetector's own fallback). Every piece
// of header/nav text then mismatches between server and client markup,
// which is exactly the "Hydration failed" error reproduced by diffing
// the fetched SSR HTML against the live DOM: SSR rendered in English,
// the hydrated page in Arabic. Exporting the init promise lets the root
// route's loader `await` it (see __root.tsx) so both server and client
// render from the same fully-resolved language before first paint.
export const i18nInitPromise = i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, ar: { translation: ar } },
    fallbackLng: "ar",
    supportedLngs: SUPPORTED_LANGS,
    nonExplicitSupportedLngs: true,
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "brw_preferred_lang",
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
  })
  .then(async () => {
    // i18next-browser-languagedetector's "navigator" source has no real
    // meaning in Node's SSR environment (no browser locale to read), but
    // some environments expose a stand-in `navigator` that it can still
    // read from — resolving to "en" instead of falling through to
    // fallbackLng. The client's own real navigator/localStorage detection
    // then resolves independently and can land on "ar", diverging from
    // whatever the server rendered. Since there's no per-request language
    // cookie (yet) for the server to read a real user preference from,
    // force the deterministic, correct-for-the-large-majority answer here:
    // this store's fallback and primary audience is Arabic. This does
    // mean a *returning* visitor who explicitly switched to English will
    // see a brief server-rendered Arabic flash before their stored
    // preference re-applies client-side — a real but narrower gap than
    // the sitewide mismatch this replaces, left for a future cookie-based
    // fix rather than expanding scope here.
    if (typeof window === "undefined" && i18n.language !== "ar") {
      await i18n.changeLanguage("ar");
    }
  });

export default i18n;
export { SUPPORTED_LANGS };
