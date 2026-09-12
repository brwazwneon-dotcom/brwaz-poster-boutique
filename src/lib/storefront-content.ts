import { useQuery } from "@tanstack/react-query";
import { getSiteSettingsPublic } from "@/lib/db-public.functions";

export const STOREFRONT_CONTENT_KEY = "storefront_trust_faq_content";

export type LocalizedCopy = { en: string; ar: string };
export type TrustPoint = LocalizedCopy & {
  id: string;
  icon: string;
  enabled: boolean;
  description?: LocalizedCopy;
};
export type FAQItem = LocalizedCopy & { id: string; enabled: boolean; answer?: LocalizedCopy };
export type StorefrontContent = {
  trust: {
    label: LocalizedCopy;
    heading: LocalizedCopy;
    description: LocalizedCopy;
    points: TrustPoint[];
  };
  faq: { label: LocalizedCopy; heading: LocalizedCopy; items: FAQItem[] };
};

export const DEFAULT_STOREFRONT_CONTENT: StorefrontContent = {
  trust: {
    label: { en: "The Quality Your Images Deserve", ar: "الجودة التي تستحقها صورك" },
    heading: { en: "Why Choose BRWAZWNEON?", ar: "لماذا تختار برواز ونيون؟" },
    description: {
      en: "Professional printing, careful preparation, and dependable service from file to final delivery.",
      ar: "طباعة احترافية، وتجهيز دقيق، وخدمة موثوقة من الملف حتى وصول طلبك.",
    },
    points: [
      {
        id: "print-quality",
        icon: "sparkles",
        enabled: true,
        en: "Professional Printing at the Highest Quality",
        ar: "طباعة احترافية بأعلى جودة",
      },
      {
        id: "fujifilm",
        icon: "camera",
        enabled: true,
        en: "Original FUJIFILM Photo Paper",
        ar: "ورق FUJIFILM الأصلي",
      },
      {
        id: "professional-expertise",
        icon: "badge-check",
        enabled: true,
        en: "Professional Expertise You Can Trust",
        ar: "خبرة يثق بها المحترفون",
      },
      {
        id: "preview",
        icon: "eye",
        enabled: true,
        en: "Preview Before Printing",
        ar: "معاينة قبل الطباعة",
      },
      {
        id: "delivery",
        icon: "truck",
        enabled: true,
        en: "Delivery to All Governorates",
        ar: "توصيل إلى جميع المحافظات",
      },
      {
        id: "cash-on-delivery",
        icon: "wallet",
        enabled: true,
        en: "Cash on Delivery",
        ar: "الدفع عند الاستلام",
      },
      {
        id: "custom-design",
        icon: "palette",
        enabled: true,
        en: "Custom Design for Your Photos",
        ar: "تصميم مخصص لصورك",
      },
      {
        id: "materials",
        icon: "frame",
        enabled: true,
        en: "Carefully Selected Materials",
        ar: "خامات مختارة بعناية",
      },
    ],
  },
  faq: {
    label: { en: "Frequently Asked Questions", ar: "الأسئلة الشائعة" },
    heading: { en: "Everything You Need to Know Before Ordering", ar: "إجابات واضحة قبل طلبك" },
    items: [
      {
        id: "delivery-time",
        enabled: true,
        en: "How long does preparation and delivery take?",
        ar: "كم يستغرق تجهيز وتوصيل الطلب؟",
      },
      {
        id: "paper",
        enabled: true,
        en: "What photo paper do you use?",
        ar: "ما نوع الورق المستخدم في طباعة الصور؟",
      },
      {
        id: "print-quality",
        enabled: true,
        en: "What makes your print quality different?",
        ar: "ما الذي يميّز جودة الطباعة لديكم؟",
      },
      {
        id: "design-preview",
        enabled: true,
        en: "Can I review my design before printing?",
        ar: "هل يمكنني مراجعة التصميم قبل الطباعة؟",
      },
      {
        id: "enhancement",
        enabled: true,
        en: "Can you improve a low-quality photo?",
        ar: "هل يمكن تحسين صورة جودتها ضعيفة؟",
      },
      {
        id: "colors",
        enabled: true,
        en: "Will printed colors look exactly like my phone screen?",
        ar: "هل تختلف الألوان بين الهاتف والصورة المطبوعة؟",
      },
      {
        id: "cod",
        enabled: true,
        en: "Is cash on delivery available?",
        ar: "هل يوجد دفع عند الاستلام؟",
      },
      {
        id: "care",
        enabled: true,
        en: "How should I care for the print or frame?",
        ar: "كيف أحافظ على جودة الصور والبراويز؟",
      },
      {
        id: "damage",
        enabled: true,
        en: "What if my order arrives damaged?",
        ar: "ماذا يحدث إذا وصل الطلب تالفًا؟",
      },
      {
        id: "custom",
        enabled: true,
        en: "Can I order a custom size or design?",
        ar: "هل يمكنني طلب مقاس أو تصميم خاص؟",
      },
    ],
  },
};

const TRUST_DESCRIPTIONS: Record<string, LocalizedCopy> = {
  "print-quality": {
    en: "We use advanced professional printing techniques to deliver accurate colors, clear details, and a result worthy of your images and designs.",
    ar: "نستخدم أحدث وأفضل تقنيات الطباعة الاحترافية لنقدّم ألوانًا دقيقة، وتفاصيل واضحة، ونتيجة تليق بصورك وتصاميمك.",
  },
  fujifilm: {
    en: "We print on high-quality FUJIFILM paper for rich colors, natural tonal transitions, and a longer-lasting image.",
    ar: "نطبع الصور على ورق FUJIFILM عالي الجودة للحصول على ألوان غنية، وتدرجات طبيعية، وعمر أطول للصورة.",
  },
  "professional-expertise": {
    en: "We work with professional photographers and handle work that requires precise color and detail, with care at every stage from file preparation to final print.",
    ar: "نتعامل مع مصورين محترفين وننفّذ أعمالًا تحتاج إلى دقة عالية في الألوان والتفاصيل، لذلك نهتم بكل خطوة من تجهيز الملف حتى الطباعة النهائية.",
  },
  preview: {
    en: "You can review the design and confirm the result before printing, especially for custom orders.",
    ar: "يمكنك مراجعة التصميم والتأكد من النتيجة قبل بدء الطباعة، خصوصًا في الطلبات المخصصة.",
  },
  delivery: {
    en: "Your order usually arrives within 3–5 business days after confirmation, with protective packaging for prints and frames during shipping.",
    ar: "يصل طلبك خلال 3 إلى 5 أيام عمل بعد تأكيده، مع تغليف مناسب لحماية المطبوعات والبراويز أثناء الشحن.",
  },
  "cash-on-delivery": {
    en: "Pay when your order arrives according to the available order-confirmation policy.",
    ar: "يمكنك الدفع عند استلام الطلب وفقًا لسياسة تأكيد الطلب المتاحة.",
  },
  "custom-design": {
    en: "Upload your image, choose the size and material, and we will prepare it to look its best before printing.",
    ar: "ارفع صورتك، واختر المقاس والخامة، وسنجهّزها لتظهر بأفضل شكل ممكن قبل الطباعة.",
  },
  materials: {
    en: "We use materials selected for printing and display, with attention to finish and final details.",
    ar: "نستخدم خامات مناسبة للطباعة والعرض، مع الاهتمام بالتفاصيل النهائية وجودة التشطيب.",
  },
};

const FAQ_ANSWERS: Record<string, LocalizedCopy> = {
  "delivery-time": {
    en: "Orders are usually prepared and delivered within 3–5 business days after confirmation. Timing may vary slightly by governorate, order size, or custom-design requirements.",
    ar: "يتم تجهيز وتوصيل الطلب عادة خلال 3 إلى 5 أيام عمل بعد تأكيده. قد تختلف المدة قليلًا حسب المحافظة، حجم الطلب، أو وجود تصميم مخصص.",
  },
  paper: {
    en: "We use high-quality FUJIFILM photo paper for rich colors, clear details, and natural tonal transitions.",
    ar: "نستخدم ورق FUJIFILM عالي الجودة، لما يقدمه من ألوان غنية، وتفاصيل واضحة، وتدرجات طبيعية مناسبة للصور الشخصية والاحترافية.",
  },
  "print-quality": {
    en: "We use professional printing equipment and carefully prepare colors and image details before printing to achieve a clear, balanced result.",
    ar: "نعتمد على معدات وتقنيات طباعة احترافية متقدمة، مع ضبط دقيق للألوان والتفاصيل قبل الطباعة، لضمان نتيجة واضحة ومتوازنة قدر الإمكان.",
  },
  "design-preview": {
    en: "Yes. For custom orders, you can review the design or preview before printing to confirm the size, orientation, and image placement.",
    ar: "نعم، في الطلبات المخصصة يمكنك مراجعة التصميم أو المعاينة قبل بدء الطباعة للتأكد من المقاس، الاتجاه، وترتيب الصورة.",
  },
  enhancement: {
    en: "Yes. We can improve clarity, color, and some visible noise depending on the original file. Facial features will not be changed unless specifically requested.",
    ar: "نعم، يمكن تحسين الوضوح والألوان وتقليل بعض التشويش حسب جودة الصورة الأصلية. النتيجة النهائية تعتمد على تفاصيل الملف المرفوع، ولن يتم تغيير ملامح الأشخاص دون طلب واضح.",
  },
  colors: {
    en: "Small differences may occur because screens use different brightness and color settings. We prepare the file for printing to produce a balanced and accurate result.",
    ar: "قد توجد فروق بسيطة بسبب اختلاف إضاءة وسطوع الشاشات، لكننا نراجع الألوان ونجهّز الملف للطباعة للحصول على نتيجة قريبة ومتوازنة.",
  },
  cod: {
    en: "Yes, cash on delivery is available according to the order-confirmation policy. Some large or custom orders may require a deposit.",
    ar: "نعم، الدفع عند الاستلام متاح وفقًا لسياسة تأكيد الطلب. قد تتطلب بعض الطلبات المخصصة أو الكبيرة مقدمًا قبل التنفيذ.",
  },
  care: {
    en: "Keep it away from moisture and prolonged direct sunlight, and clean it gently with a soft, dry cloth.",
    ar: "يُفضّل إبعاد المنتج عن الرطوبة وأشعة الشمس المباشرة لفترات طويلة، وتنظيفه بقطعة ناعمة وجافة دون استخدام مواد قوية.",
  },
  damage: {
    en: "Contact us immediately after delivery and send clear photos of the packaging and product. The case will be reviewed under the shipping-damage and replacement policy.",
    ar: "تواصل معنا فور الاستلام وأرسل صورًا واضحة للتغليف والمنتج، وسنراجع الحالة وفق سياسة الاستبدال والتلف أثناء الشحن.",
  },
  custom: {
    en: "Yes. Upload your image or request a custom design and select from the available sizes and materials.",
    ar: "نعم، يمكنك رفع صورتك أو طلب تصميم مخصص، واختيار المقاس والخامة المتاحة من صفحة التصميم المخصص.",
  },
};

export function trustDescription(id: string) {
  return TRUST_DESCRIPTIONS[id] ?? { en: "", ar: "" };
}

export function faqAnswer(id: string) {
  return FAQ_ANSWERS[id] ?? { en: "", ar: "" };
}

export function normalizeStorefrontContent(value: unknown): StorefrontContent {
  if (!value || typeof value !== "object") return DEFAULT_STOREFRONT_CONTENT;
  const raw = value as Partial<StorefrontContent>;
  return {
    trust: {
      label: localized(raw.trust?.label, DEFAULT_STOREFRONT_CONTENT.trust.label),
      heading: localized(raw.trust?.heading, DEFAULT_STOREFRONT_CONTENT.trust.heading),
      description: localized(raw.trust?.description, DEFAULT_STOREFRONT_CONTENT.trust.description),
      points: mergeItems(raw.trust?.points, DEFAULT_STOREFRONT_CONTENT.trust.points),
    },
    faq: {
      label: localized(raw.faq?.label, DEFAULT_STOREFRONT_CONTENT.faq.label),
      heading: localized(raw.faq?.heading, DEFAULT_STOREFRONT_CONTENT.faq.heading),
      items: mergeItems(raw.faq?.items, DEFAULT_STOREFRONT_CONTENT.faq.items),
    },
  };
}

export function useStorefrontContent() {
  const query = useQuery({
    queryKey: ["storefront-content"],
    staleTime: 60_000,
    queryFn: async (): Promise<StorefrontContent> => {
      const settings = await getSiteSettingsPublic({ data: { keys: [STOREFRONT_CONTENT_KEY] } });
      return normalizeStorefrontContent(settings[STOREFRONT_CONTENT_KEY]);
    },
  });
  return query.data ?? DEFAULT_STOREFRONT_CONTENT;
}

function localized(value: LocalizedCopy | undefined, fallback: LocalizedCopy): LocalizedCopy {
  return {
    en: typeof value?.en === "string" && value.en.trim() ? value.en.trim() : fallback.en,
    ar: typeof value?.ar === "string" && value.ar.trim() ? value.ar.trim() : fallback.ar,
  };
}

function mergeItems<T extends TrustPoint | FAQItem>(source: T[] | undefined, defaults: T[]) {
  if (!Array.isArray(source)) return defaults;
  const defaultsById = new Map(defaults.map((item) => [item.id, item]));
  const ordered: Array<{ fallback: T; item?: T }> = source
    .filter((item) => item && typeof item.id === "string" && defaultsById.has(item.id))
    .map((item) => ({ fallback: defaultsById.get(item.id)!, item }));
  for (const fallback of defaults) {
    if (!ordered.some((entry) => entry.fallback.id === fallback.id)) ordered.push({ fallback });
  }
  return ordered.map(({ fallback, item }) => {
    return {
      ...fallback,
      en: typeof item?.en === "string" && item.en.trim() ? item.en.trim() : fallback.en,
      ar: typeof item?.ar === "string" && item.ar.trim() ? item.ar.trim() : fallback.ar,
      enabled: typeof item?.enabled === "boolean" ? item.enabled : fallback.enabled,
      ...("icon" in fallback && typeof (item as TrustPoint | undefined)?.icon === "string"
        ? { icon: (item as TrustPoint).icon }
        : {}),
      ...("description" in (item ?? {})
        ? {
            description: localized((item as TrustPoint).description, trustDescription(fallback.id)),
          }
        : {}),
      ...("answer" in (item ?? {})
        ? { answer: localized((item as FAQItem).answer, faqAnswer(fallback.id)) }
        : {}),
    };
  }) as T[];
}
