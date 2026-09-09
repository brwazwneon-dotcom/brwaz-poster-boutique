import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { setStickyBarHeight, setBottomSheetOpen, Z } from "@/lib/floating-tools";
import { cn } from "@/lib/utils";

export type BarAction =
  | { kind: "customize"; label: string; onClick: () => void; loading?: boolean }
  | { kind: "cart"; label: string; onClick: () => void; loading?: boolean; compact?: boolean }
  | { kind: "whatsapp"; label: string; href: string };

type BarContent =
  | {
      /** Price to display (formatted with currency). */
      price: string;
      /** Optional size label. */
      size?: string;
      /** Optional color label. */
      color?: string;
    }
  | {
      /** When no product selected yet, show a simpler bar */
      placeholder?: true;
    };

interface StickyProductBarProps {
  /** The content to show in the left/compact summary area. */
  content: BarContent;
  /** Primary action (always Customize). */
  primary: BarAction;
  /** Optional secondary action (Add to Cart / WhatsApp). */
  secondary?: BarAction;
  /** When true the bar slides out of view. */
  hidden?: boolean;
  /** Additional classes. */
  className?: string;
}

const BAR_HEIGHT = 72; // px — keep in sync with CSS logic

export function StickyProductBar({
  content,
  primary,
  secondary,
  hidden,
  className,
}: StickyProductBarProps) {
  const { i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith("ar");
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStickyBarHeight(BAR_HEIGHT);
    return () => setStickyBarHeight(null);
  }, []);

  if (hidden) return null;

  return (
    <>
      {/* Spacer so page content doesn't sit under the bar */}
      <div style={{ height: BAR_HEIGHT + 16 }} />

      <div
        ref={barRef}
        className={cn(
          "sticky-product-bar",
          hidden && "hidden",
          isRtl ? "rtl" : "ltr",
          className,
        )}
        style={{ zIndex: Z.STICKY_BAR }}
        role="toolbar"
        aria-label="Product actions"
      >
        <div className="bar-content mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          {/* ── Left: product summary ── */}
          <div className="min-w-0 flex-1">
            {"placeholder" in content && content.placeholder ? (
              <div className="h-5" />
            ) : (
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold text-foreground leading-tight whitespace-nowrap">
                    {"price" in content ? content.price : ""}
                  </span>
                  {"size" in content && content.size && (
                    <span className="text-xs text-muted-foreground truncate">
                      {content.size}
                      {content.color ? ` · ${content.color}` : ""}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Right: actions ── */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Secondary (Add to Cart / WhatsApp) — hidden on small mobile */}
            {secondary && secondary.kind === "cart" && (
              <button
                type="button"
                onClick={secondary.onClick}
                disabled={secondary.loading}
                className="hidden sm:inline-flex items-center justify-center rounded-md border border-border bg-card px-3 py-2.5 text-xs font-semibold uppercase tracking-widest text-foreground hover:bg-accent disabled:opacity-50 transition-colors min-h-[44px]"
                aria-label={secondary.label}
              >
                {secondary.label}
              </button>
            )}
            {secondary && secondary.kind === "whatsapp" && (
              <a
                href={secondary.href}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center justify-center rounded-md border border-border bg-card px-3 py-2.5 text-xs font-semibold uppercase tracking-widest text-foreground hover:bg-accent transition-colors min-h-[44px]"
                aria-label={secondary.label}
              >
                {secondary.label}
              </a>
            )}

            {/* Primary — Customize */}
            {primary.kind === "customize" && (
              <button
                type="button"
                onClick={primary.onClick}
                disabled={primary.loading}
                className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-colors min-h-[48px] min-w-[140px] sm:min-w-[180px] shadow-sm"
                aria-label={primary.label}
              >
                {primary.loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="hidden sm:inline">Loading</span>
                  </span>
                ) : (
                  primary.label
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
