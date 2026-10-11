import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type Shortcut = { id: string; name: string; slug: string; name_ar?: string | null };

/**
 * Buttons to the collections / sub-collections a search names. Each opens that
 * collection's own page (/category/<slug>), which is also the link to send someone.
 */
export function CategoryShortcuts({
  categories,
  onNavigate,
  compact = false,
  className,
}: {
  categories: Shortcut[];
  onNavigate?: () => void;
  compact?: boolean;
  className?: string;
}) {
  const { i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith("ar");
  if (categories.length === 0) return null;
  return (
    <div className={cn(compact ? "border-b border-border bg-card/60 px-3 py-2.5" : "", className)}>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {isArabic ? "افتح القسم" : "Open the collection"}
      </div>
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <Link
            key={c.id}
            to="/category/$slug"
            params={{ slug: c.slug }}
            onClick={onNavigate}
            className={cn(
              "inline-flex items-center gap-2 rounded-sm border border-primary bg-primary/10 font-semibold text-foreground transition hover:bg-primary hover:text-primary-foreground",
              compact ? "px-3 py-1.5 text-xs" : "min-h-11 px-4 py-2 text-sm",
            )}
          >
            <span>{isArabic ? c.name_ar || c.name : c.name}</span>
            <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </div>
  );
}
