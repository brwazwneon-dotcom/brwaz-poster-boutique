import { useState, type ReactNode } from "react";
import { Globe, HelpCircle, X, ChevronDown } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAdminI18n, type AdminLang } from "@/lib/admin-i18n";
import { cn } from "@/lib/utils";

export function LanguageSwitcher() {
  const { lang, setLang, t } = useAdminI18n();
  const [open, setOpen] = useState(false);
  const options: { code: AdminLang; label: string; flag: string }[] = [
    { code: "en", label: t("shell.english"), flag: "🇺🇸" },
    { code: "ar", label: t("shell.arabic"), flag: "🇪🇬" },
  ];
  const current = options.find((o) => o.code === lang)!;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
        aria-label={t("shell.language")}
      >
        <Globe className="h-4 w-4" />
        <span>{current.flag}</span>
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute end-0 top-full z-50 mt-1 w-40 rounded-sm border border-border bg-card shadow-lg">
          {options.map((o) => (
            <button
              key={o.code}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setLang(o.code);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-xs uppercase tracking-widest hover:bg-accent",
                o.code === lang && "bg-accent/50",
              )}
            >
              <span>{o.flag}</span>
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type GuideSection = { key: string; title: { en: string; ar: string }; body: { en: string[]; ar: string[] } };

const GUIDE: GuideSection[] = [
  {
    key: "analytics",
    title: { en: "Analytics", ar: "التحليلات" },
    body: {
      en: [
        "Overview of revenue, orders, visitors and top products across chosen date ranges.",
        "Use it daily to spot trends and jump straight into the sections that need attention.",
      ],
      ar: [
        "نظرة عامة على الإيرادات والطلبات والزوار وأفضل المنتجات لفترة زمنية محددة.",
        "استخدمها يومياً لرصد الاتجاهات والانتقال مباشرة إلى الأقسام التي تحتاج تدخّل.",
      ],
    },
  },
  {
    key: "realtime",
    title: { en: "Realtime", ar: "الزوار المباشرون" },
    body: {
      en: [
        "Live visitor feed with country, device, browser and current page.",
        "Shows funnel from visit to checkout, plus top traffic sources.",
      ],
      ar: [
        "تدفّق مباشر للزوّار مع الدولة والجهاز والمتصفح والصفحة الحالية.",
        "يعرض القمع من الزيارة حتى الدفع بالإضافة إلى أفضل مصادر الترافيك.",
      ],
    },
  },
  {
    key: "posters",
    title: { en: "Products", ar: "المنتجات" },
    body: {
      en: [
        "Manage every poster: title, slug, SEO fields, category, tags, badges, images and gallery.",
        "Toggle Featured / Hidden and edit or delete individual products.",
      ],
      ar: [
        "إدارة كل بوستر: العنوان، الرابط، حقول السيو، القسم، الوسوم، الشارات، والصور.",
        "يمكنك تفعيل «مميز» / «مخفي» وتعديل أو حذف أي منتج.",
      ],
    },
  },
  {
    key: "ai-upload",
    title: { en: "AI Upload", ar: "الرفع بالذكاء الاصطناعي" },
    body: {
      en: [
        "Upload dozens or thousands of images. AI detects category, subject, tags and generates SEO metadata.",
        "Review suggestions, then publish. Manual edits are never overwritten.",
      ],
      ar: [
        "ارفع عشرات أو آلاف الصور. يكتشف الذكاء الاصطناعي القسم والموضوع والوسوم ويولّد بيانات السيو.",
        "راجع الاقتراحات ثم انشرها. لن تُستبدل أي تعديلات يدوية.",
      ],
    },
  },
  {
    key: "categories",
    title: { en: "Categories", ar: "الأقسام" },
    body: {
      en: [
        "Nested categories with icon, hidden flag and drag-to-reorder.",
        "Use “Clean Categories” to detect duplicates or empty subcategories.",
      ],
      ar: [
        "أقسام متداخلة مع أيقونات وإمكانية الإخفاء وإعادة الترتيب بالسحب.",
        "استخدم زر «تنظيف الأقسام» لاكتشاف التكرارات أو الأقسام الفارغة.",
      ],
    },
  },
  {
    key: "orders",
    title: { en: "Orders", ar: "الطلبات" },
    body: {
      en: [
        "All customer orders. Change status, print invoice, contact the customer or refund.",
        "Filter by status, date or governorate and export to Excel.",
      ],
      ar: [
        "جميع طلبات العملاء. غيّر الحالة، اطبع الفاتورة، تواصل مع العميل أو استرجع الطلب.",
        "يمكنك التصفية حسب الحالة، التاريخ، أو المحافظة، والتصدير إلى Excel.",
      ],
    },
  },
  {
    key: "mockups",
    title: { en: "Frame Mockups", ar: "معاينات الإطارات" },
    body: {
      en: [
        "Calibrate how artwork sits inside each mockup: Position (X/Y), Size, Scale, Rotation, Perspective, Skew and Flip.",
        "One calibration applies to every product on the storefront.",
      ],
      ar: [
        "قم بمعايرة كيفية ظهور العمل الفني داخل كل إطار: الموقع (X/Y)، الحجم، التكبير، الدوران، المنظور، الميلان، والقلب.",
        "معايرة واحدة تُطبَّق على كل المنتجات في المتجر.",
      ],
    },
  },
  {
    key: "collections",
    title: { en: "Collections", ar: "الكولكشنات" },
    body: {
      en: ["Group posters into curated collections that appear on the homepage and shop menu."],
      ar: ["قم بتجميع البوسترات في كولكشنات منسّقة تظهر في الصفحة الرئيسية وقائمة التسوّق."],
    },
  },
  {
    key: "system-health",
    title: { en: "System Health", ar: "صحة النظام" },
    body: {
      en: [
        "Live health score across database, storage, backups, Firebase, analytics and integrations.",
        "Refreshes every 30s and lets you export a PDF/CSV report.",
      ],
      ar: [
        "درجة صحة مباشرة تشمل قاعدة البيانات، التخزين، النسخ الاحتياطي، Firebase، التحليلات والتكاملات.",
        "يتم التحديث كل 30 ثانية مع إمكانية تصدير تقرير PDF/CSV.",
      ],
    },
  },
  {
    key: "backups",
    title: { en: "Backups", ar: "النسخ الاحتياطية" },
    body: {
      en: [
        "Encrypted daily / weekly / monthly backups. Create manual snapshot, download or restore selective scopes.",
      ],
      ar: [
        "نسخ احتياطية يومية / أسبوعية / شهرية مشفّرة. أنشئ نسخة يدوية أو نزّلها أو استرجع نطاقات محدّدة.",
      ],
    },
  },
  {
    key: "maintenance",
    title: { en: "Maintenance Mode", ar: "وضع الصيانة" },
    body: {
      en: [
        "Take the storefront offline with a branded page. Whitelist admin IPs/emails or use a bypass password.",
      ],
      ar: [
        "أوقف المتجر عن العمل مؤقتاً مع صفحة صيانة مخصّصة. يمكنك السماح لعناوين IP/بريد المسؤولين أو استخدام كلمة مرور تجاوز.",
      ],
    },
  },
  {
    key: "settings",
    title: { en: "Settings", ar: "الإعدادات" },
    body: {
      en: [
        "Pricing, packaging fee, upsells, shipping thresholds and branding options.",
      ],
      ar: [
        "الأسعار، رسوم التغليف، العروض الإضافية، حدود الشحن، وخيارات الهوية.",
      ],
    },
  },
];

export function HelpButton() {
  const { t, lang } = useAdminI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 end-6 z-40 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-3 text-xs uppercase tracking-widest shadow-lg hover:bg-accent"
        aria-label={t("shell.help")}
        title={t("shell.help")}
      >
        <HelpCircle className="h-4 w-4" />
        <span className="hidden sm:inline">{t("shell.help")}</span>
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side={lang === "ar" ? "left" : "right"} className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t("shell.guide_title")}</SheetTitle>
            <SheetDescription>{t("shell.guide_subtitle")}</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-6">
            {GUIDE.map((section) => (
              <div key={section.key} className="rounded-sm border border-border p-4">
                <h3 className="text-sm font-semibold uppercase tracking-widest">
                  {section.title[lang]}
                </h3>
                <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                  {section.body[lang].map((line, i) => (
                    <li key={i}>• {line}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function AdminTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{children as any}</TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { X };