import { useTranslation } from "react-i18next";
import { useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useLanguage() {
  const { i18n } = useTranslation();

  const currentLanguage = i18n.language?.startsWith("ar") ? "ar" : "en";

  const setLanguage = useCallback(
    async (lang: "ar" | "en") => {
      await i18n.changeLanguage(lang);
      document.documentElement.lang = lang;
      document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";

      try {
        const { data } = await supabase.auth.getUser();
        if (data?.user) {
          await supabase.auth.updateUser({ data: { preferred_language: lang } });
        }
      } catch {
        // User not logged in or update failed — localStorage fallback is enough
      }
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
