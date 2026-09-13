import { useQuery } from "@tanstack/react-query";
import { getSiteSettingsPublic } from "@/lib/db-public.functions";
import type { LocalizedCopy, TrustPoint, FAQItem } from "@/lib/storefront-content";

// Same admin-editable content shape as storefront-content.ts (trust points +
// FAQ, merge-by-id so admin edits/enables existing items rather than
// inventing arbitrary new ones) — deliberately a separate key/file rather
// than reusing STOREFRONT_CONTENT_KEY, since that's the *homepage's*
// site-wide trust/FAQ block and this page's content is unrelated to it.
export const PHOTO_PRINTING_CONTENT_KEY = "photo_printing_content_v1";

export type PhotoPrintingContent = {
  hero: {
    eyebrow: LocalizedCopy;
    heading: LocalizedCopy;
    subheading: LocalizedCopy;
    ctaPrimary: LocalizedCopy;
    ctaSecondary: LocalizedCopy;
  };
  why: {
    label: LocalizedCopy;
    heading: LocalizedCopy;
    points: TrustPoint[];
  };
  howItWorks: {
    label: LocalizedCopy;
    heading: LocalizedCopy;
    steps: (LocalizedCopy & { id: string; icon: string })[];
  };
  faq: { label: LocalizedCopy; heading: LocalizedCopy; items: FAQItem[] };
  finalCta: { heading: LocalizedCopy; button: LocalizedCopy };
  payment: { instapayVodafonePhone: string; note: LocalizedCopy };
};

export const DEFAULT_PHOTO_PRINTING_CONTENT: PhotoPrintingContent = {
  hero: {
    eyebrow: { en: "AI-Enhanced Photo Printing", ar: "طباعة صور بجودة احترافية" },
    heading: { en: "Your Photos Deserve To Be Printed Right.", ar: "صورك تستاهل تتطبع صح." },
    subheading: {
      en: "Professional photo printing that keeps every detail of your memories — reviewed before printing, delivered across Egypt.",
      ar: "طباعة فوتوغرافية بجودة احترافية تحفظ كل تفاصيل ذكرياتك — بنراجع صورك قبل الطباعة، وبنوصلها لحد باب البيت في كل المحافظات.",
    },
    ctaPrimary: { en: "Print Your Photos Now", ar: "اطبع صورك الآن" },
    ctaSecondary: { en: "See The Quality First", ar: "شوف الجودة قبل الطباعة" },
  },
  why: {
    label: { en: "Why Print With Us", ar: "ليه تطبع صورك عندنا؟" },
    heading: { en: "Built For People Who Care About Their Photos", ar: "لكل حد بيهتم بصوره" },
    points: [
      {
        id: "quality",
        icon: "sparkles",
        enabled: true,
        en: "High-Quality Printing",
        ar: "جودة طباعة عالية",
        description: {
          en: "Professional printing equipment tuned for accurate, consistent results on every order.",
          ar: "معدات طباعة احترافية مضبوطة عشان نطلع نتيجة دقيقة وثابتة في كل طلب.",
        },
      },
      {
        id: "colors",
        icon: "palette",
        enabled: true,
        en: "Accurate Colors",
        ar: "ألوان دقيقة",
        description: {
          en: "Careful color preparation before printing so the result matches what you actually shot.",
          ar: "بنجهّز الألوان بعناية قبل الطباعة عشان النتيجة تبقى قريبة من اللي صورته فعلاً.",
        },
      },
      {
        id: "details",
        icon: "focus",
        enabled: true,
        en: "Clear, Sharp Details",
        ar: "تفاصيل واضحة",
        description: {
          en: "Fine detail and texture preserved, not lost to over-compression.",
          ar: "بنحافظ على التفاصيل الدقيقة والملمس، من غير ما يضيعوا في ضغط زيادة عن اللزوم.",
        },
      },
      {
        id: "paper",
        icon: "camera",
        enabled: true,
        en: "Professional Photo Paper",
        ar: "ورق فوتوغرافي احترافي",
        description: {
          en: "Original FUJIFILM paper for rich color depth and a longer-lasting print.",
          ar: "ورق FUJIFILM الأصلي، عشان الألوان تبقى غنية والصورة تعيش أطول.",
        },
      },
      {
        id: "review",
        icon: "eye",
        enabled: true,
        en: "Reviewed Before Printing",
        ar: "مراجعة الصور قبل الطباعة",
        description: {
          en: "Every photo is checked before it goes to print — not just uploaded and forgotten.",
          ar: "كل صورة بتتراجع قبل ما تدخل الطباعة — مش مجرد رفع وخلاص.",
        },
      },
      {
        id: "packaging",
        icon: "package",
        enabled: true,
        en: "Safe Packaging",
        ar: "تغليف آمن",
        description: {
          en: "Packed to survive shipping, so your prints arrive exactly as they left us.",
          ar: "بنغلفها كويس عشان توصلك زي ما طلعت بالظبط.",
        },
      },
      {
        id: "shipping",
        icon: "truck",
        enabled: true,
        en: "Delivery To Every Governorate",
        ar: "شحن لجميع المحافظات",
        description: {
          en: "Cash on delivery, wherever you are in Egypt.",
          ar: "الدفع عند الاستلام، في أي محافظة في مصر.",
        },
      },
      {
        id: "experience",
        icon: "badge-check",
        enabled: true,
        en: "Real Printing Experience",
        ar: "خبرة في الطباعة",
        description: {
          en: "Years of printing for customers who care about getting it right the first time.",
          ar: "سنين خبرة في الطباعة لعملاء بيهتموا إن الصورة تطلع صح من أول مرة.",
        },
      },
    ],
  },
  howItWorks: {
    label: { en: "How It Works", ar: "إزاي تطلب؟" },
    heading: { en: "From Photo To Doorstep", ar: "من صورتك لحد باب بيتك" },
    steps: [
      { id: "choose", icon: "images", en: "Choose your photos", ar: "اختار الصور" },
      { id: "size", icon: "ruler", en: "Pick a size or package", ar: "اختار المقاس أو الباقة" },
      { id: "review", icon: "eye", en: "Review your photos", ar: "راجع الصور" },
      { id: "confirm", icon: "check-circle", en: "Confirm your order", ar: "أكّد الطلب" },
      { id: "print", icon: "printer", en: "We print & prepare it", ar: "بنطبع ونجهّز طلبك" },
      { id: "deliver", icon: "truck", en: "It arrives at your door", ar: "يوصلك لباب البيت" },
    ],
  },
  faq: {
    label: { en: "Frequently Asked Questions", ar: "الأسئلة الشائعة" },
    heading: { en: "Everything Before You Order", ar: "كل حاجة محتاج تعرفها قبل الطلب" },
    items: [
      {
        id: "paper-type",
        enabled: true,
        en: "What kind of paper do you use?",
        ar: "ما نوع الورق المستخدم؟",
        answer: {
          en: "Original FUJIFILM photo paper, for rich colors and a longer-lasting print.",
          ar: "ورق FUJIFILM الأصلي، للحصول على ألوان غنية وعمر أطول للصورة.",
        },
      },
      {
        id: "reviewed",
        enabled: true,
        en: "Are photos reviewed before printing?",
        ar: "هل يتم مراجعة الصور قبل الطباعة؟",
        answer: {
          en: "Yes — every photo is checked before it's sent to print.",
          ar: "أيوه، كل صورة بتتراجع قبل ما تدخل الطباعة.",
        },
      },
      {
        id: "low-quality",
        enabled: true,
        en: "What happens if a photo's quality is low?",
        ar: "ماذا يحدث إذا كانت الصورة جودتها ضعيفة؟",
        answer: {
          en: "We'll flag it so you know before ordering, and our team reviews it to get the best possible result rather than rejecting it outright.",
          ar: "هنبلغك قبل ما تكمل الطلب، وهنراجعها عشان نطلع أفضل نتيجة ممكنة بدل ما نرفضها على طول.",
        },
      },
      {
        id: "duration",
        enabled: true,
        en: "How long does printing take?",
        ar: "كم تستغرق الطباعة؟",
        answer: {
          en: "Orders are usually prepared and delivered within 3–5 business days after confirmation.",
          ar: "بنجهز ونوصل الطلب عادة خلال 3 إلى 5 أيام عمل بعد التأكيد.",
        },
      },
      {
        id: "shipping",
        enabled: true,
        en: "Is shipping available?",
        ar: "هل يوجد شحن؟",
        answer: {
          en: "Yes, cash on delivery across all governorates of Egypt.",
          ar: "أيوه، الدفع عند الاستلام في كل محافظات مصر.",
        },
      },
      {
        id: "governorates",
        enabled: true,
        en: "Which governorates do you ship to?",
        ar: "ما المحافظات التي يتم الشحن إليها؟",
        answer: {
          en: "All 27 governorates of Egypt.",
          ar: "كل الـ 27 محافظة في مصر.",
        },
      },
      {
        id: "mobile-upload",
        enabled: true,
        en: "Can I print photos from my phone?",
        ar: "هل يمكن طباعة صور من الهاتف؟",
        answer: {
          en: "Yes — upload directly from your phone's gallery, no computer needed.",
          ar: "أيوه، ارفع مباشرة من معرض الصور في موبايلك، من غير ما تحتاج كمبيوتر.",
        },
      },
      {
        id: "multi-size",
        enabled: true,
        en: "Can I order more than one size in the same order?",
        ar: "هل يمكن طلب أكثر من مقاس؟",
        answer: {
          en: "For now each order uses one package size — contact us on WhatsApp if you need a mixed order.",
          ar: "حاليًا كل طلب بيكون بمقاس باقة واحدة — تواصل معانا على واتساب لو محتاج طلب مقاسات مختلطة.",
        },
      },
    ],
  },
  finalCta: {
    heading: { en: "Ready To Print Your Memories?", ar: "جاهز تطبع ذكرياتك؟" },
    button: { en: "Start Printing Now", ar: "ابدأ الطباعة الآن" },
  },
  payment: {
    instapayVodafonePhone: "01090771294",
    note: {
      en: "Send the transfer to this number, then share the receipt on WhatsApp with your order — we'll confirm right away.",
      ar: "حوّل المبلغ على الرقم ده، وابعت لنا صورة من التحويل على واتساب مع طلبك — وهنأكده على طول.",
    },
  },
};

function localized(value: LocalizedCopy | undefined, fallback: LocalizedCopy): LocalizedCopy {
  return {
    en: typeof value?.en === "string" && value.en.trim() ? value.en.trim() : fallback.en,
    ar: typeof value?.ar === "string" && value.ar.trim() ? value.ar.trim() : fallback.ar,
  };
}

function mergeItems<T extends { id: string; en: string; ar: string; enabled: boolean }>(
  source: T[] | undefined,
  defaults: T[],
): T[] {
  if (!Array.isArray(source)) return defaults;
  const defaultsById = new Map(defaults.map((item) => [item.id, item]));
  const ordered: Array<{ fallback: T; item?: T }> = source
    .filter((item) => item && typeof item.id === "string" && defaultsById.has(item.id))
    .map((item) => ({ fallback: defaultsById.get(item.id)!, item }));
  for (const fallback of defaults) {
    if (!ordered.some((entry) => entry.fallback.id === fallback.id)) ordered.push({ fallback });
  }
  return ordered.map(({ fallback, item }) => ({
    ...fallback,
    en: typeof item?.en === "string" && item.en.trim() ? item.en.trim() : fallback.en,
    ar: typeof item?.ar === "string" && item.ar.trim() ? item.ar.trim() : fallback.ar,
    enabled: typeof item?.enabled === "boolean" ? item.enabled : fallback.enabled,
    ...("icon" in (fallback as object) &&
    typeof (item as unknown as { icon?: string })?.icon === "string"
      ? { icon: (item as unknown as { icon: string }).icon }
      : {}),
    ...("description" in (item ?? {})
      ? {
          description: localized(
            (item as unknown as TrustPoint).description,
            (fallback as unknown as TrustPoint).description ?? { en: "", ar: "" },
          ),
        }
      : {}),
    ...("answer" in (item ?? {})
      ? {
          answer: localized(
            (item as unknown as FAQItem).answer,
            (fallback as unknown as FAQItem).answer ?? { en: "", ar: "" },
          ),
        }
      : {}),
  })) as T[];
}

export function normalizePhotoPrintingContent(value: unknown): PhotoPrintingContent {
  if (!value || typeof value !== "object") return DEFAULT_PHOTO_PRINTING_CONTENT;
  const raw = value as Partial<PhotoPrintingContent>;
  const d = DEFAULT_PHOTO_PRINTING_CONTENT;
  return {
    hero: {
      eyebrow: localized(raw.hero?.eyebrow, d.hero.eyebrow),
      heading: localized(raw.hero?.heading, d.hero.heading),
      subheading: localized(raw.hero?.subheading, d.hero.subheading),
      ctaPrimary: localized(raw.hero?.ctaPrimary, d.hero.ctaPrimary),
      ctaSecondary: localized(raw.hero?.ctaSecondary, d.hero.ctaSecondary),
    },
    why: {
      label: localized(raw.why?.label, d.why.label),
      heading: localized(raw.why?.heading, d.why.heading),
      points: mergeItems(raw.why?.points, d.why.points),
    },
    howItWorks: {
      label: localized(raw.howItWorks?.label, d.howItWorks.label),
      heading: localized(raw.howItWorks?.heading, d.howItWorks.heading),
      steps: mergeItems(raw.howItWorks?.steps as never, d.howItWorks.steps as never) as never,
    },
    faq: {
      label: localized(raw.faq?.label, d.faq.label),
      heading: localized(raw.faq?.heading, d.faq.heading),
      items: mergeItems(raw.faq?.items, d.faq.items),
    },
    finalCta: {
      heading: localized(raw.finalCta?.heading, d.finalCta.heading),
      button: localized(raw.finalCta?.button, d.finalCta.button),
    },
    payment: {
      instapayVodafonePhone:
        typeof raw.payment?.instapayVodafonePhone === "string" &&
        raw.payment.instapayVodafonePhone.trim()
          ? raw.payment.instapayVodafonePhone.trim()
          : d.payment.instapayVodafonePhone,
      note: localized(raw.payment?.note, d.payment.note),
    },
  };
}

export function usePhotoPrintingContent() {
  const query = useQuery({
    queryKey: ["photo-printing-content"],
    staleTime: 60_000,
    queryFn: async (): Promise<PhotoPrintingContent> => {
      const settings = await getSiteSettingsPublic({
        data: { keys: [PHOTO_PRINTING_CONTENT_KEY] },
      });
      return normalizePhotoPrintingContent(settings[PHOTO_PRINTING_CONTENT_KEY]);
    },
  });
  return query.data ?? DEFAULT_PHOTO_PRINTING_CONTENT;
}
