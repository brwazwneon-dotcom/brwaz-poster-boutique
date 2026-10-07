import { useEffect } from "react";
import { applyPreferredLanguage } from "@/lib/i18n";

/** Applies the visitor's language after hydration (see lib/i18n.ts for why not before). */
export function LanguageBoot() {
  useEffect(() => {
    applyPreferredLanguage();
  }, []);
  return null;
}
