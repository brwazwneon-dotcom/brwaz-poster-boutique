import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles, MessageCircle, Percent, X } from "lucide-react";
import { whatsappLink } from "@/lib/whatsapp";
import { setBottomSheetOpen, Z } from "@/lib/floating-tools";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface MobileToolsSheetProps {
  /** Whether to show the trigger button. Default true. */
  enabled?: boolean;
}

export function MobileToolsSheet({ enabled = true }: MobileToolsSheetProps) {
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith("ar");

  useEffect(() => {
    setBottomSheetOpen(open);
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      setBottomSheetOpen(false);
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!enabled) return null;

  const tools = [
    {
      key: "photoAssistant",
      icon: Sparkles,
      label: t("floatingTools.photoAssistant"),
      href: null,
      onClick: () => {
        setOpen(false);
        // Dispatch a custom event that AssistantButton listens to
        window.dispatchEvent(new CustomEvent("brw:open-assistant"));
      },
      color: "text-[#c9a24a]",
      bg: "bg-[#c9a24a]/10",
    },
    {
      key: "todaysOffers",
      icon: Percent,
      label: t("floatingTools.todaysOffers"),
      to: "/offers",
      color: "text-[#111]",
      bg: "bg-[#111]/5",
    },
    {
      key: "whatsapp",
      icon: MessageCircle,
      label: t("floatingTools.whatsapp"),
      href: whatsappLink("Hi BRWAZWNEON, I'd like to order a poster."),
      color: "text-[#25D366]",
      bg: "bg-[#25D366]/10",
    },
  ];

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "floating-tool secondary fixed z-[var(--z-floating-tools)] flex h-11 w-11 items-center justify-center rounded-full border border-[#e5e5e5] bg-white text-[#111] shadow-[0_4px_16px_rgba(0,0,0,0.1)] transition hover:shadow-[0_6px_20px_rgba(0,0,0,0.14)] sm:hidden",
          open && "opacity-0 pointer-events-none",
        )}
        style={{
          bottom: "calc(80px + var(--sticky-bar-h, 0px) + env(safe-area-inset-bottom, 0px))",
          [isRtl ? "left" : "right"]: "12px",
          zIndex: Z.FLOATING_TOOLS,
        }}
        aria-label={t("floatingTools.moreTools")}
      >
        <span className="text-lg leading-none">⋯</span>
      </button>

      {/* Overlay */}
      <div
        className={cn("mobile-tools-overlay", open && "open")}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={cn("mobile-tools-sheet", open && "open")}
        role="dialog"
        aria-modal="true"
        aria-label={t("floatingTools.moreTools")}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 className="text-sm font-semibold text-[#111]">{t("floatingTools.moreTools")}</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("common.close")}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[#f5f5f5]"
          >
            <X className="h-4 w-4 text-[#666]" />
          </button>
        </div>
        <div className="px-4 pb-6 space-y-1">
          {tools.map((tool) => {
            const content = (
              <div className="flex items-center gap-3 rounded-lg px-4 py-3.5 hover:bg-[#f7f7f7] transition-colors min-h-[52px]">
                <span className={cn("flex h-10 w-10 items-center justify-center rounded-full", tool.bg)}>
                  <tool.icon className={cn("h-5 w-5", tool.color)} />
                </span>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-[#111]">{tool.label}</span>
                </div>
              </div>
            );
            if (tool.to) {
              return (
                <Link
                  key={tool.key}
                  to={tool.to}
                  onClick={() => setOpen(false)}
                  className="block"
                  aria-label={tool.label}
                >
                  {content}
                </Link>
              );
            }
            if (tool.href) {
              return (
                <a
                  key={tool.key}
                  href={tool.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="block"
                  aria-label={tool.label}
                >
                  {content}
                </a>
              );
            }
            return (
              <button
                key={tool.key}
                type="button"
                onClick={tool.onClick}
                className="block w-full text-left"
                aria-label={tool.label}
              >
                {content}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
