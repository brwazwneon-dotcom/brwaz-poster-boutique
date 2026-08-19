import { useEffect, useState } from "react";
import { HelpCircle, MessageCircle, Percent, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { whatsappLink } from "@/lib/whatsapp";
import { trackEvent } from "@/lib/meta-pixel";
import { Z } from "@/lib/floating-tools";
import { cn } from "@/lib/utils";

export function MobileFloatingActions({ offersEnabled = true }: { offersEnabled?: boolean }) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith("ar");
  const [open, setOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const onNavOpen = (event: Event) => {
      const custom = event as CustomEvent<boolean>;
      setNavOpen(Boolean(custom.detail));
      if (custom.detail) setOpen(false);
    };
    window.addEventListener("brw:mobile-nav-open", onNavOpen);
    setNavOpen(document.documentElement.dataset.mobileNavOpen === "true");
    return () => window.removeEventListener("brw:mobile-nav-open", onNavOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (navOpen) return null;

  const sideStyle = isRtl ? ({ left: "16px" } as const) : ({ right: "16px" } as const);
  const bottom = "calc(16px + var(--sticky-bar-h, 0px) + env(safe-area-inset-bottom, 0px))";
  const stackBottom = "calc(84px + var(--sticky-bar-h, 0px) + env(safe-area-inset-bottom, 0px))";

  const openWhatsapp = () => {
    try {
      trackEvent("Contact", { method: "whatsapp" });
      trackEvent("Lead", { method: "whatsapp" });
    } catch {
      /* noop */
    }
  };

  const actions = [
    {
      key: "assistant",
      label: t("floatingTools.photoAssistant"),
      icon: Sparkles,
      onClick: () => {
        setOpen(false);
        window.dispatchEvent(new CustomEvent("brw:open-assistant"));
      },
    },
    ...(offersEnabled
      ? [
          {
            key: "offers",
            label: t("floatingTools.todaysOffers"),
            icon: Percent,
            href: "/offers",
          },
        ]
      : []),
    {
      key: "help",
      label: t("nav.help"),
      icon: HelpCircle,
      href: "/#home-faq",
    },
  ];

  return (
    <div className="sm:hidden" dir={isRtl ? "rtl" : "ltr"}>
      {open && (
        <button
          type="button"
          aria-label={t("common.close")}
          className="fixed inset-0 bg-transparent"
          style={{ zIndex: Z.FLOATING_TOOLS - 1 }}
          onClick={() => setOpen(false)}
        />
      )}

      <div
        className={cn(
          "fixed flex flex-col gap-2 transition duration-200",
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none translate-y-2 opacity-0",
        )}
        style={{ ...sideStyle, bottom: stackBottom, zIndex: Z.FLOATING_TOOLS }}
      >
        {actions.map((action) => {
          const Icon = action.icon;
          const content = (
            <span className="flex min-h-11 items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-[#111] shadow-[0_8px_26px_rgba(0,0,0,0.18)]">
              <Icon className="h-4 w-4 text-[#c9a24a]" />
              <span>{action.label}</span>
            </span>
          );
          if (action.href) {
            return (
              <a key={action.key} href={action.href} onClick={() => setOpen(false)}>
                {content}
              </a>
            );
          }
          return (
            <button key={action.key} type="button" onClick={action.onClick} className="text-start">
              {content}
            </button>
          );
        })}
      </div>

      <div className="fixed" style={{ ...sideStyle, bottom, zIndex: Z.FLOATING_TOOLS }}>
        {open && (
          <a
            href={whatsappLink(t("whatsapp.defaultMessage"))}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              openWhatsapp();
              setOpen(false);
            }}
            className="mb-2 flex min-h-11 items-center gap-2 rounded-full bg-[#25D366] px-3 py-2 text-sm font-bold text-white shadow-[0_8px_26px_rgba(37,211,102,0.35)]"
          >
            <MessageCircle className="h-4 w-4" />
            <span>{t("floatingTools.whatsapp")}</span>
          </a>
        )}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? t("common.close") : t("floatingTools.moreTools")}
          aria-expanded={open}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_10px_30px_rgba(37,211,102,0.36)] transition-transform active:scale-95"
        >
          {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-7 w-7" />}
        </button>
      </div>
    </div>
  );
}
