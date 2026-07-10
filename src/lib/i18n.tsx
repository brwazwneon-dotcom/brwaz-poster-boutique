import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Locale = "en" | "ar";

const STORAGE_KEY = "brwaz-locale";
const MANUAL_KEY = "brwaz-locale-manual";

/**
 * Bilingual dictionary — Arabic strings are marketing-tone (not literal),
 * English is the default. Add new keys here as you translate more pages.
 * If a key is missing in the active locale, we fall back to English, then
 * to the raw key (with a console.warn logged once per key).
 */
export const DICT: Record<Locale, Record<string, string>> = {
  en: {
    // Common
    "common.orderNow": "Order Now",
    "common.addToCart": "Add to Cart",
    "common.buyNow": "Buy Now",
    "common.completeOrder": "Complete Order",
    "common.viewAll": "View All",
    "common.close": "Close",
    "common.loading": "Loading…",
    "common.retry": "Try again",
    "common.search": "Search…",
    "common.egp": "EGP",

    // Header
    "header.wishlist": "Wishlist",
    "header.cart": "Cart",
    "header.search": "Search posters, frames, photos…",
    "header.menu": "Menu",

    // Menu items
    "menu.football": "Football",
    "menu.movies": "Movies",
    "menu.tvSeries": "TV Series",
    "menu.marvelDc": "Marvel & DC",
    "menu.anime": "Anime",
    "menu.cars": "Cars",
    "menu.customDesign": "Custom Design",
    "menu.photoPrinting": "Photo Printing",
    "menu.photos4x6": "4×6 Photos",
    "menu.sets": "Sets",
    "menu.bestSellers": "Best Sellers",
    "menu.offers": "Today's Offers",

    // Language switcher
    "lang.arabic": "العربية",
    "lang.english": "English",
    "lang.switchAria": "Switch language",

    // Hero / marketing
    "hero.subtitle": "Turn your favorite photo into a premium frame made to last.",
    "hero.cta": "Print your photo in premium quality",

    // Generic errors / success
    "err.uploadFailed": "Something went wrong while uploading your photos. Please try again.",
    "err.invalidPhone": "Please enter a valid WhatsApp number.",
    "err.pickSize": "Please choose a size before completing your order.",
    "err.needPhoto": "Please upload at least one photo.",
    "err.lowQuality": "This image may be low quality. Please upload a clearer version.",
    "success.uploaded": "Your photos were uploaded successfully.",
    "success.orderPlaced": "Your order was placed. We'll confirm on WhatsApp shortly.",

    // Trust
    "trust.cod": "Cash on delivery is available",
    "trust.shipping": "Delivery is available across Egypt",
    "trust.review": "We review your image before printing",
    "trust.whatsapp": "We'll confirm your order on WhatsApp before production",

    // Home / hero
    "home.hero.eyebrow": "BRWAZWNEON · Framed in Egypt · Cash on delivery",
    "home.hero.title": "Turn Your Room\nInto A Piece\nOf Art.",
    "home.hero.desc": "Premium framed posters of the films, players, shows, anime and cars you actually care about. Gallery-grade frames, hand-printed.",
    "home.hero.shop": "Shop Posters",
    "home.hero.mostPopular": "⭐ Most Popular",
    "home.hero.customize": "🎨 Customize Your Frame",
    "home.hero.customizeDesc": "Upload your own photo or artwork and our designers will prepare it for premium-quality printing.",
    "home.hero.printPhotos": "Print Your Photos",
    "home.hero.b1": "Professional Designer Included",
    "home.hero.b2": "We Enhance Your Photo Before Printing",
    "home.hero.b3": "Preview Before Printing",
    "home.trust.banner": "Over 7 Million Photos Printed — And We're Still Creating Memories With You.",
    "home.benefits.1": "Premium PVC Frames",
    "home.benefits.2": "Wooden Portraits",
    "home.benefits.3": "Photo Printing",
    "home.benefits.4": "Cash On Delivery",
    "home.benefits.5": "Shipping Across Egypt",
    "home.offers.eyebrow": "Limited time",
    "home.offers.title": "Special Offers",
    "home.offers.claim": "Claim an offer",
    "home.offers.bundle": "Bundle",
    "home.offers.6frames": "6 Frames",
    "home.offers.4frames": "4 Frames",
    "home.offers.order": "Order →",
    "home.category.eyebrow": "Collection",
    "home.category.suffix": "Posters",
    "home.category.viewAll": "View all →",
    "home.category.viewAllName": "View all {name} →",
    "home.category.empty": "New {name} posters dropping soon.",

    // Footer
    "footer.tagline": "Premium framed posters. Cinema, sport, anime, motors — printed and framed to gallery standard.",
    "footer.shop": "Shop",
    "footer.help": "Help",
    "footer.payment": "Payment",
    "footer.paymentDesc": "Cash on delivery across Egypt.",
    "footer.offers": "Special offers",
    "footer.cart": "Cart",
    "footer.admin": "Admin",
    "footer.rights": "All rights reserved.",
  },
  ar: {
    // Common
    "common.orderNow": "اطلب الآن",
    "common.addToCart": "أضف للسلة",
    "common.buyNow": "اشترِ الآن",
    "common.completeOrder": "كمّل الطلب",
    "common.viewAll": "شوف الكل",
    "common.close": "إغلاق",
    "common.loading": "جاري التحميل…",
    "common.retry": "حاول تاني",
    "common.search": "دور على أي حاجة…",
    "common.egp": "جنيه",

    // Header
    "header.wishlist": "المفضلة",
    "header.cart": "السلة",
    "header.search": "دوّر على براويز، صور، أفلام…",
    "header.menu": "القائمة",

    // Menu items
    "menu.football": "كرة قدم",
    "menu.movies": "أفلام",
    "menu.tvSeries": "مسلسلات",
    "menu.marvelDc": "مارفل و DC",
    "menu.anime": "أنمي",
    "menu.cars": "عربيات",
    "menu.customDesign": "تصميم خاص",
    "menu.photoPrinting": "طباعة صور",
    "menu.photos4x6": "صور 4×6",
    "menu.sets": "سيتات",
    "menu.bestSellers": "الأكثر مبيعًا",
    "menu.offers": "عروض اليوم",

    // Language switcher
    "lang.arabic": "العربية",
    "lang.english": "English",
    "lang.switchAria": "غيّر اللغة",

    // Hero / marketing
    "hero.subtitle": "حوّل صورتك لبرواز يفضل معاك سنين.",
    "hero.cta": "اطبع صورتك بأعلى جودة",

    // Generic errors / success
    "err.uploadFailed": "حصلت مشكلة أثناء رفع الصور، جرّب تاني.",
    "err.invalidPhone": "من فضلك اكتب رقم واتساب صحيح.",
    "err.pickSize": "من فضلك اختار المقاس قبل إتمام الطلب.",
    "err.needPhoto": "من فضلك ارفع صورة واحدة على الأقل.",
    "err.lowQuality": "الصورة جودتها ضعيفة، يفضل ترفع صورة أوضح.",
    "success.uploaded": "صورك اترفعت بنجاح.",
    "success.orderPlaced": "طلبك اتسجل، هنأكدلك على واتساب حالًا.",

    // Trust
    "trust.cod": "الدفع عند الاستلام متاح",
    "trust.shipping": "الشحن متاح لكل المحافظات",
    "trust.review": "هنراجع الصورة قبل الطباعة",
    "trust.whatsapp": "هنبعتلك تأكيد على واتساب قبل التنفيذ",

    // Home / hero
    "home.hero.eyebrow": "براوز نيون · مصنوع في مصر · الدفع عند الاستلام",
    "home.hero.title": "حوّل غرفتك\nلقطعة\nفنية.",
    "home.hero.desc": "براويز فاخرة لأفلامك ولاعيبتك ومسلسلاتك وأنميك وعربياتك المفضلة. جودة معرض فني، وطباعة يدوية بأدق التفاصيل.",
    "home.hero.shop": "تسوّق البراويز",
    "home.hero.mostPopular": "⭐ الأكثر طلبًا",
    "home.hero.customize": "🎨 صمّم برواز صورتك",
    "home.hero.customizeDesc": "ارفع صورتك أو تصميمك ومصممينا هيجهزوه لأعلى جودة طباعة.",
    "home.hero.printPhotos": "اطبع صورك",
    "home.hero.b1": "مصمم محترف معاك",
    "home.hero.b2": "بنحسّن صورتك قبل الطباعة",
    "home.hero.b3": "معاينة قبل الطباعة",
    "home.trust.banner": "أكتر من 7 مليون صورة اتطبعت — ولسه بنصنع معاك ذكريات.",
    "home.benefits.1": "براويز PVC فاخرة",
    "home.benefits.2": "بورتريهات خشب",
    "home.benefits.3": "طباعة صور",
    "home.benefits.4": "الدفع عند الاستلام",
    "home.benefits.5": "شحن لكل المحافظات",
    "home.offers.eyebrow": "عرض لفترة محدودة",
    "home.offers.title": "عروض خاصة",
    "home.offers.claim": "احجز العرض",
    "home.offers.bundle": "باقة",
    "home.offers.6frames": "٦ براويز",
    "home.offers.4frames": "٤ براويز",
    "home.offers.order": "اطلب →",
    "home.category.eyebrow": "مجموعة",
    "home.category.suffix": "براويز",
    "home.category.viewAll": "شوف الكل ←",
    "home.category.viewAllName": "شوف كل {name} ←",
    "home.category.empty": "براويز {name} جديدة قريبًا.",

    // Footer
    "footer.tagline": "براويز فاخرة. سينما، رياضة، أنمي، عربيات — مطبوعة بجودة معرض فني.",
    "footer.shop": "تسوّق",
    "footer.help": "مساعدة",
    "footer.payment": "الدفع",
    "footer.paymentDesc": "الدفع عند الاستلام في كل المحافظات.",
    "footer.offers": "العروض الخاصة",
    "footer.cart": "السلة",
    "footer.admin": "الإدارة",
    "footer.rights": "جميع الحقوق محفوظة.",
  },
};

type Ctx = {
  locale: Locale;
  dir: "ltr" | "rtl";
  setLocale: (l: Locale, manual?: boolean) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nCtx = createContext<Ctx | null>(null);

const warned = new Set<string>();

function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const raw =
    DICT[locale]?.[key] ??
    DICT.en[key] ??
    (() => {
      if (!warned.has(key)) {
        warned.add(key);
        if (typeof console !== "undefined") console.warn(`[i18n] Missing translation: ${key}`);
      }
      return key;
    })();
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "ar" || saved === "en") return saved;
  } catch { /* noop */ }
  try {
    const langs = [
      ...(Array.isArray(navigator.languages) ? navigator.languages : []),
      navigator.language ?? "",
    ];
    for (const l of langs) {
      if (l && l.toLowerCase().startsWith("ar")) return "ar";
    }
  } catch { /* noop */ }
  return "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // SSR renders English (matches shellComponent lang="en"), client updates
  // in an effect once localStorage + navigator.language are readable.
  const [locale, setLocaleState] = useState<Locale>("en");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const detected = detectInitialLocale();
    setLocaleState(detected);
    setHydrated(true);
  }, []);

  // Sync <html dir/lang> whenever locale changes.
  useEffect(() => {
    if (!hydrated || typeof document === "undefined") return;
    const html = document.documentElement;
    html.setAttribute("lang", locale);
    html.setAttribute("dir", locale === "ar" ? "rtl" : "ltr");
  }, [locale, hydrated]);

  const setLocale = useCallback((l: Locale, manual = true) => {
    setLocaleState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
      if (manual) window.localStorage.setItem(MANUAL_KEY, "1");
    } catch { /* noop */ }
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      locale,
      dir: locale === "ar" ? "rtl" : "ltr",
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
    }),
    [locale, setLocale],
  );

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nCtx);
  if (!ctx) {
    // Safe fallback for components rendered before provider mounts.
    return {
      locale: "en",
      dir: "ltr",
      setLocale: () => { /* noop */ },
      t: (key, vars) => translate("en", key, vars),
    };
  }
  return ctx;
}

/** Convenience: `const t = useT();` */
export function useT() {
  return useI18n().t;
}

export function useLocale() {
  const { locale, setLocale, dir } = useI18n();
  return { locale, setLocale, dir };
}