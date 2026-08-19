import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { faqAnswer, useStorefrontContent } from "@/lib/storefront-content";

export function StorefrontFAQ() {
  const { i18n } = useTranslation();
  const isArabic = i18n.language.startsWith("ar");
  const content = useStorefrontContent();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const items = content.faq.items.filter((item) => item.enabled);

  return (
    <section className="border-t border-border bg-background" dir={isArabic ? "rtl" : "ltr"}>
      <div className="container-page py-20">
        <p className="text-center text-[10px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">
          {isArabic ? content.faq.label.ar : content.faq.label.en}
        </p>
        <h2 className="text-display mt-3 text-center text-4xl sm:text-6xl">
          {isArabic ? content.faq.heading.ar : content.faq.heading.en}
        </h2>
        <div className="mx-auto mt-10 max-w-3xl space-y-2">
          {items.map((item, index) => {
            const open = openIndex === index;
            const answer = isArabic
              ? (item.answer?.ar ?? faqAnswer(item.id).ar)
              : (item.answer?.en ?? faqAnswer(item.id).en);
            return (
              <div
                key={item.id}
                className="overflow-hidden rounded-sm border border-border bg-card"
              >
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenIndex(open ? null : index)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-start text-sm font-bold leading-6 text-foreground"
                >
                  <span>{isArabic ? item.ar : item.en}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                  />
                </button>
                <div
                  className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                >
                  <div className="overflow-hidden">
                    <p className="border-t border-border px-5 py-4 text-sm leading-7 text-muted-foreground">
                      {answer}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
