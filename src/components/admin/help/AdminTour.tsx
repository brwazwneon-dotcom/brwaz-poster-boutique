import { useEffect, useState } from "react";
import { useHelpMode } from "@/hooks/useHelpMode";
import { useAdminI18n } from "@/lib/admin-i18n";
import { cn } from "@/lib/utils";

type Step = { title: { en: string; ar: string }; body: { en: string; ar: string } };

const STEPS: Step[] = [
  {
    title: { en: "New orders", ar: "الطلبات الجديدة" },
    body: {
      en: "Here you see all incoming orders. Click any order to review details, confirm and change its status.",
      ar: "هنا تشوف كل الأوردرات الجديدة. اضغط على أي طلب لمراجعته وتأكيده وتغيير حالته.",
    },
  },
  {
    title: { en: "Images", ar: "الصور" },
    body: {
      en: "Review, optimize and mark images as ready or needing edits before they appear on the site.",
      ar: "هنا تراجع الصور وتحسّنها وتحدد إذا كانت جاهزة أو تحتاج تعديل قبل ظهورها على الموقع.",
    },
  },
  {
    title: { en: "Order status", ar: "حالة الطلب" },
    body: {
      en: "Change the stage of each order (Confirmed → Printing → Shipped). The customer is notified automatically.",
      ar: "غيّر مرحلة كل طلب (مؤكد ← طباعة ← تم الشحن). سيتم إخطار العميل تلقائياً.",
    },
  },
  {
    title: { en: "WhatsApp", ar: "واتساب" },
    body: {
      en: "Send a ready-made WhatsApp message to the customer in one click.",
      ar: "أرسل رسالة واتساب جاهزة للعميل بضغطة واحدة.",
    },
  },
  {
    title: { en: "Performance", ar: "الأداء" },
    body: {
      en: "Monitor site speed and image weight. Run automatic optimization when needed.",
      ar: "راقب سرعة الموقع وحجم الصور، وشغّل التحسين التلقائي وقت الحاجة.",
    },
  },
  {
    title: { en: "Homepage", ar: "الصفحة الرئيسية" },
    body: {
      en: "Edit the homepage: reorder sections, pick trending items, and preview the result.",
      ar: "عدّل الصفحة الرئيسية: أعد ترتيب الأقسام، اختر عناصر Trending، وشاهد المعاينة.",
    },
  },
];

export function AdminTour() {
  const { tourSeen, markTourSeen } = useHelpMode();
  const { lang, dir } = useAdminI18n();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [dontShow, setDontShow] = useState(false);

  useEffect(() => {
    if (!tourSeen) {
      const t = setTimeout(() => setOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, [tourSeen]);

  if (!open) return null;

  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const finish = () => {
    if (dontShow) markTourSeen();
    setOpen(false);
  };

  const T = {
    next: lang === "ar" ? "التالي" : "Next",
    back: lang === "ar" ? "السابق" : "Back",
    skip: lang === "ar" ? "تخطّي" : "Skip Tour",
    finish: lang === "ar" ? "إنهاء" : "Finish",
    dont: lang === "ar" ? "لا تعرض مرة أخرى" : "Don't show again",
    stepOf: (a: number, b: number) => (lang === "ar" ? `الخطوة ${a} من ${b}` : `Step ${a} of ${b}`),
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      dir={dir}
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-2xl">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {T.stepOf(step + 1, STEPS.length)}
        </div>
        <h3 className="mt-2 text-xl font-semibold">{s.title[lang]}</h3>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{s.body[lang]}</p>

        <div className="mt-6 flex items-center gap-1">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-primary" : "bg-border")}
            />
          ))}
        </div>

        <label className="mt-5 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          {T.dont}
        </label>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={finish}
            className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            {T.skip}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent disabled:opacity-40"
            >
              {T.back}
            </button>
            <button
              type="button"
              onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
              className="rounded-sm bg-primary px-3 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:opacity-90"
            >
              {isLast ? T.finish : T.next}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
