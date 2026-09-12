import { useTranslation } from "react-i18next";
import { useCallback, useEffect } from "react";

export function useLanguage() {
  const { i18n } = useTranslation();

  const currentLanguage = i18n.language?.startsWith("ar") ? "ar" : "en";

  // No customer auth system exists (only the single Neon-backed admin
  // account), so language preference is i18next's own localStorage
  // persistence only — no per-user profile sync.
  const setLanguage = useCallback(
    async (lang: "ar" | "en") => {
      await i18n.changeLanguage(lang);
      document.documentElement.lang = lang;
      document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    },
    [i18n],
  );

  useEffect(() => {
    const lang = currentLanguage;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [currentLanguage]);

  return { currentLanguage, setLanguage, isRTL: currentLanguage === "ar" };
}
