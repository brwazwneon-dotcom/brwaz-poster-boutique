import { useEffect } from "react";
import { useLocale } from "@/lib/i18n";

const HEAD_STRINGS: Record<
  "en" | "ar",
  { title: string; description: string; ogLocale: string }
> = {
  en: {
    title: "BRWAZWNEON — Premium Framed Posters & Photo Printing",
    description:
      "Turn your favorite photo into a premium framed poster. Movie, football, anime, car & custom prints — delivered across Egypt. Cash on delivery.",
    ogLocale: "en_US",
  },
  ar: {
    title: "برواز و نيون — براويز فاخرة وطباعة صور بأعلى جودة",
    description:
      "حوّل صورتك المفضلة لبرواز فاخر يفضل معاك سنين. براويز أفلام، كورة، أنمي، عربيات وتصميمات خاصة — توصيل لكل المحافظات، الدفع عند الاستلام.",
    ogLocale: "ar_EG",
  },
};

/**
 * Keeps the document title, meta description, and og:locale in sync with the
 * active language on the client. SSR HTML still ships the English defaults
 * declared in each route's head() — this hook updates them after hydration
 * so users on Arabic see localised tab titles and social share text.
 *
 * Route-specific titles (product / category / cart) should still call this
 * pattern by overriding document.title in their own effect after mount.
 */
export function LocaleHead() {
  const { locale } = useLocale();
  useEffect(() => {
    if (typeof document === "undefined") return;
    const s = HEAD_STRINGS[locale];
    // Only override the homepage / generic root defaults — never override a
    // route that already set a more specific title (e.g. Product name).
    if (
      document.title === "" ||
      document.title.startsWith("BRWAZWNEON") ||
      document.title.startsWith("برواز")
    ) {
      document.title = s.title;
    }
    const setMeta = (selector: string, attr: "content", value: string) => {
      const el = document.querySelector<HTMLMetaElement>(selector);
      if (el) el.setAttribute(attr, value);
    };
    setMeta('meta[name="description"]', "content", s.description);
    setMeta('meta[property="og:title"]', "content", s.title);
    setMeta('meta[property="og:description"]', "content", s.description);
    setMeta('meta[name="twitter:title"]', "content", s.title);
    setMeta('meta[name="twitter:description"]', "content", s.description);
    // Ensure og:locale exists / is up to date
    let og = document.querySelector<HTMLMetaElement>('meta[property="og:locale"]');
    if (!og) {
      og = document.createElement("meta");
      og.setAttribute("property", "og:locale");
      document.head.appendChild(og);
    }
    og.setAttribute("content", s.ogLocale);
  }, [locale]);
  return null;
}