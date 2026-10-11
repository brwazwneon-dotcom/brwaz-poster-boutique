import { Link } from "@tanstack/react-router";
import { Check, ChevronRight, Share2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { categoryUrl, shareOrCopy } from "@/lib/category-link";

type Cat = { id: string; name: string; slug: string; name_ar?: string | null };

/**
 * Under a collection's title: a way back to its parent collection and a button that
 * shares (phones) or copies this collection's own address, to send to someone.
 */
export function CategoryLinkBar({ category, parent }: { category: Cat; parent?: Cat }) {
  const { i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith("ar");
  const [done, setDone] = useState(false);
  const nameOf = (c: Cat) => (isArabic ? c.name_ar || c.name : c.name);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
      {parent && (
        <Link
          to="/category/$slug"
          params={{ slug: parent.slug }}
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          {nameOf(parent)}
          <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
        </Link>
      )}
      <button
        type="button"
        onClick={async () => {
          const r = await shareOrCopy(categoryUrl(category.slug), nameOf(category));
          if (r !== "failed") {
            setDone(true);
            window.setTimeout(() => setDone(false), 2200);
          }
        }}
        className="inline-flex min-h-9 items-center gap-2 rounded-sm border border-border px-3 text-xs font-semibold uppercase tracking-widest hover:bg-accent"
      >
        {done ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
        ) : (
          <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        <span aria-live="polite">
          {done
            ? isArabic
              ? "تم نسخ الرابط"
              : "Link copied"
            : isArabic
              ? "شارك رابط القسم"
              : "Share this collection"}
        </span>
      </button>
    </div>
  );
}
