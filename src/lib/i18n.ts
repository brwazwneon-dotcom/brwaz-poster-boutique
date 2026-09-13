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
  });

export default i18n;
export { SUPPORTED_LANGS };
