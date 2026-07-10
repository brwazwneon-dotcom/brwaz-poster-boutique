import { Languages } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * AR | EN pill switcher. Compact enough for the header, full-width friendly
 * inside a mobile menu. Instant toggle — no reload. Persists to localStorage
 * via useLocale.setLocale (manual=true so auto-detect stops overriding).
 */
export function LanguageSwitcher({
  className,
  variant = "pill",
}: {
  className?: string;
  variant?: "pill" | "block";
}) {
  const { locale, setLocale } = useLocale();
  const isAr = locale === "ar";

  if (variant === "block") {
    return (
      <div className={cn("flex items-center gap-1 rounded-sm border border-border p-1", className)}>
        <button
          type="button"
          onClick={() => setLocale("ar")}
          className={cn(
            "flex-1 rounded-sm px-3 py-2 text-xs font-semibold uppercase tracking-widest transition-colors",
            isAr ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={isAr}
        >
          العربية
        </button>
        <button
          type="button"
          onClick={() => setLocale("en")}
          className={cn(
            "flex-1 rounded-sm px-3 py-2 text-xs font-semibold uppercase tracking-widest transition-colors",
            !isAr ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={!isAr}
        >
          English
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setLocale(isAr ? "en" : "ar")}
      aria-label="Switch language"
      title={isAr ? "Switch to English" : "التبديل للعربية"}
      className={cn(
        "inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs font-semibold uppercase tracking-widest hover:bg-accent",
        className,
      )}
    >
      <Languages className="h-4 w-4" />
      <span className={cn(isAr && "text-primary")}>AR</span>
      <span className="text-muted-foreground">|</span>
      <span className={cn(!isAr && "text-primary")}>EN</span>
    </button>
  );
}