import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type AdminLang = "en" | "ar";

const STORAGE_KEY = "brw_admin_lang";

type Dict = Record<string, string>;

const EN: Dict = {
  "shell.dashboard": "Dashboard",
  "shell.admin": "Admin",
  "shell.sign_out": "Sign out",
  "shell.language": "Language",
  "shell.english": "English",
  "shell.arabic": "العربية",
  "shell.help": "Help",
  "shell.guide_title": "Dashboard Guide",
  "shell.guide_subtitle": "Learn what every section of the admin does.",
  "shell.close": "Close",
  "shell.preview": "Preview as client",
  "shell.no_admin": "No admin access",

  "tab.analytics": "Analytics",
  "tab.realtime": "Realtime",
  "tab.posters": "Products",
  "tab.ai-upload": "AI Upload",
  "tab.ai-settings": "AI Settings",
  "tab.assistant": "AI Assistant",
  "tab.categories": "Categories",
  "tab.subcategories": "Sub Categories",
  "tab.display-order": "Display Order",
  "tab.orders": "Orders",
  "tab.custom": "Custom Designs",
  "tab.photo-4x6": "4×6 Photos",
  "tab.post-order": "Post-Order Settings",
  "tab.slider": "Slider",
  "tab.hero-banners": "Hero Banners",
  "tab.highlights": "Highlights",
  "tab.best-sellers": "Best Sellers",
  "tab.sections": "Homepage Layout",
  "tab.home-categories": "Home Category Picks",
  "tab.room-transformation": "Room Transformation",
  "tab.sets": "Sets",
  "tab.collections": "Collections",
  "tab.quickbar": "Quick Bar",
  "tab.footer-menu": "Footer Menu",
  "tab.mockups": "Frame Mockups",
  "tab.wishlists": "Wishlists",
  "tab.reviews": "Reviews",
  "tab.before-after": "Before / After",
  "tab.photo-enhancement": "Photo Enhancement Before & After",
  "tab.storefront-content": "Trust & FAQ Content",
  "tab.marketing": "Marketing",
  "tab.catalog": "Product Catalogs",
  "tab.social-proof": "Social Proof",
  "tab.announcement": "Announcement",
  "tab.size-guide": "Size Guide",
  "tab.notifications": "Notifications",
  "tab.backups": "Backups",
  "tab.system-health": "System Health",
  "tab.env-check": "Env Check",
  "tab.maintenance": "Maintenance",
  "tab.exports": "Exports",
  "tab.branding": "Branding",
  "tab.appearance": "Theme Manager",
  "tab.settings": "Settings",
  "tab.error-logs": "Error Logs",
  "tab.performance": "Performance",
  "tab.images": "Image Optimizer",
  "tab.alerts": "Smart Alerts",
  "tab.assistant-requests": "Assistant Requests",
  "tab.customers": "Customers",
  "tab.abandoned": "Abandoned Carts",
  "tab.reports": "Reports",
  "appearance.title": "Website Appearance",
  "appearance.theme": "Storefront Theme",
  "appearance.preview": "Preview",
  "appearance.publish": "Publish",
  "theme.gallery-white.name": "Gallery White",
  "theme.gallery-white.description":
    "Clean premium white storefront with black typography and subtle BRWAZWNEON accents.",
  "theme.lightTheme": "LIGHT THEME",
};

const AR: Dict = {
  "shell.dashboard": "لوحة التحكم",
  "shell.admin": "المسؤول",
  "shell.sign_out": "تسجيل الخروج",
  "shell.language": "اللغة",
  "shell.english": "English",
  "shell.arabic": "العربية",
  "shell.help": "مساعدة",
  "shell.guide_title": "دليل لوحة التحكم",
  "shell.guide_subtitle": "تعرّف على وظيفة كل قسم في لوحة الإدارة.",
  "shell.close": "إغلاق",
  "shell.preview": "معاينة كعميل",
  "shell.no_admin": "لا توجد صلاحية إدارية",

  "tab.analytics": "التحليلات",
  "tab.realtime": "الزوار المباشرون",
  "tab.posters": "المنتجات",
  "tab.ai-upload": "رفع بالذكاء الاصطناعي",
  "tab.ai-settings": "إعدادات الذكاء الاصطناعي",
  "tab.assistant": "المساعد الذكي",
  "tab.categories": "الأقسام",
  "tab.subcategories": "الأقسام الفرعية",
  "tab.display-order": "ترتيب العرض",
  "tab.orders": "الطلبات",
  "tab.custom": "التصاميم المخصصة",
  "tab.photo-4x6": "طباعة 4×6",
  "tab.post-order": "إعدادات ما بعد إتمام الطلب",
  "tab.slider": "السلايدر",
  "tab.hero-banners": "بانرات الهيرو",
  "tab.highlights": "العروض المميزة",
  "tab.best-sellers": "الأكثر مبيعاً",
  "tab.sections": "تخطيط الصفحة الرئيسية",
  "tab.home-categories": "اختيار صور الأقسام",
  "tab.room-transformation": "تحوّل الغرفة",
  "tab.sets": "المجموعات",
  "tab.collections": "الكولكشنات",
  "tab.quickbar": "شريط الوصول السريع",
  "tab.footer-menu": "قائمة التذييل",
  "tab.mockups": "معاينات الإطارات",
  "tab.wishlists": "قوائم الأمنيات",
  "tab.reviews": "المراجعات",
  "tab.before-after": "قبل / بعد",
  "tab.photo-enhancement": "قسم قبل وبعد لتحسين الصور",
  "tab.storefront-content": "محتوى الثقة والأسئلة الشائعة",
  "tab.marketing": "التسويق",
  "tab.catalog": "كتالوجات المنتجات",
  "tab.social-proof": "الدليل الاجتماعي",
  "tab.announcement": "الشريط الإعلاني",
  "tab.size-guide": "دليل المقاسات",
  "tab.notifications": "الإشعارات",
  "tab.backups": "النسخ الاحتياطية",
  "tab.system-health": "صحة النظام",
  "tab.env-check": "فحص الإعدادات",
  "tab.maintenance": "وضع الصيانة",
  "tab.exports": "التصدير",
  "tab.branding": "الهوية",
  "tab.appearance": "مدير الثيمات",
  "tab.settings": "الإعدادات",
  "tab.error-logs": "سجل الأخطاء",
  "tab.performance": "الأداء",
  "tab.images": "تحسين الصور",
  "tab.alerts": "التنبيهات الذكية",
  "tab.assistant-requests": "طلبات المساعد",
  "tab.customers": "العملاء",
  "tab.abandoned": "السلات المتروكة",
  "tab.reports": "التقارير",
  "appearance.title": "مظهر الموقع",
  "appearance.theme": "ثيم واجهة المتجر",
  "appearance.preview": "معاينة",
  "appearance.publish": "نشر",
  "theme.gallery-white.name": "المعرض الأبيض",
  "theme.gallery-white.description":
    "واجهة بيضاء نظيفة وفاخرة، بخطوط سوداء واضحة ولمسات بسيطة من ألوان برواز ونيون.",
  "theme.lightTheme": "ثيم فاتح",
};

const DICTS: Record<AdminLang, Dict> = { en: EN, ar: AR };

type Ctx = {
  lang: AdminLang;
  setLang: (l: AdminLang) => void;
  t: (key: string, fallback?: string) => string;
  dir: "ltr" | "rtl";
};

const AdminI18nContext = createContext<Ctx | null>(null);

export function AdminI18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<AdminLang>("en");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as AdminLang | null;
      if (saved === "en" || saved === "ar") setLangState(saved);
    } catch {
      // localStorage can be unavailable; keep the default language.
    }
  }, []);

  const setLang = (l: AdminLang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // localStorage can be unavailable; state is already updated in memory.
    }
  };

  const value = useMemo<Ctx>(() => {
    const dict = DICTS[lang];
    return {
      lang,
      setLang,
      dir: lang === "ar" ? "rtl" : "ltr",
      t: (key: string, fallback?: string) => dict[key] ?? fallback ?? key,
    };
  }, [lang]);

  return (
    <AdminI18nContext.Provider value={value}>
      <div
        dir={value.dir}
        lang={value.lang}
        className={value.dir === "rtl" ? "font-sans" : undefined}
      >
        {children}
      </div>
    </AdminI18nContext.Provider>
  );
}

export function useAdminI18n() {
  const ctx = useContext(AdminI18nContext);
  if (!ctx) {
    // Safe fallback so components can be rendered outside the provider (e.g. storybook).
    return {
      lang: "en" as AdminLang,
      setLang: () => {},
      t: (key: string, fallback?: string) => fallback ?? key,
      dir: "ltr" as const,
    };
  }
  return ctx;
}

export function tabLabel(t: (k: string, f?: string) => string, key: string): string {
  return t(`tab.${key}`, key.replace(/-/g, " "));
}
