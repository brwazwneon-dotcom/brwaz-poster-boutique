import { useTranslation } from "react-i18next";
import { whatsappLink } from "@/lib/whatsapp";
import { trackEvent } from "@/lib/meta-pixel";
import { Z } from "@/lib/floating-tools";

export function WhatsAppButton() {
  const { t } = useTranslation();
  return (
    <a
      href={whatsappLink("Hi BRWAZWNEON, I'd like to order a poster.")}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("floatingTools.whatsapp")}
      onClick={() => {
        try {
          trackEvent("Contact", { method: "whatsapp" });
          trackEvent("Lead", { method: "whatsapp" });
        } catch {
          /* noop */
        }
      }}
      className="floating-tool group fixed right-4 hidden h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition hover:scale-105 hover:animate-none hover:shadow-[0_12px_28px_rgba(37,211,102,0.45)] motion-safe:animate-[whatsapp-soft-scale_3s_ease-in-out_infinite] motion-reduce:animate-none sm:right-6 sm:flex sm:h-16 sm:w-16"
      style={{
        bottom: "calc(16px + var(--sticky-bar-h, 0px) + env(safe-area-inset-bottom, 0px))",
        zIndex: Z.FLOATING_TOOLS,
      }}
    >
      <span className="pointer-events-none absolute inset-0 rounded-full border border-[#25D366]/70 motion-safe:animate-[whatsapp-ring_3s_ease-out_infinite] group-hover:animate-none motion-reduce:animate-none" />
      <span className="pointer-events-none absolute inset-0 rounded-full bg-[#25D366]/20 motion-safe:animate-[whatsapp-ripple_3s_ease-out_infinite] group-hover:animate-none motion-reduce:animate-none" />
      <svg
        viewBox="0 0 32 32"
        className="relative h-7 w-7 sm:h-8 sm:w-8"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M19.11 17.205c-.372 0-1.088 1.39-1.518 1.39a.63.63 0 0 1-.315-.1c-.802-.402-1.504-.817-2.163-1.447-.545-.516-1.146-1.29-1.46-1.963a.426.426 0 0 1-.073-.215c0-.33.99-.945.99-1.49 0-.143-.73-2.09-.832-2.335-.143-.372-.214-.487-.6-.487-.187 0-.36-.043-.53-.043-.302 0-.53.115-.746.315-.688.645-1.032 1.318-1.06 2.264v.114c-.015.99.472 1.977 1.017 2.78 1.23 1.82 2.506 3.41 4.554 4.34.616.287 2.035.888 2.722.888.817 0 2.15-.515 2.478-1.318.13-.302.13-.602.13-.92 0-.157-.13-.443-.245-.5-.42-.215-1.91-.94-2.234-.94zM16 0C7.163 0 0 7.163 0 16c0 2.778.72 5.392 1.985 7.667L.39 31.61l8.27-1.59A15.962 15.962 0 0 0 16 32c8.837 0 16-7.163 16-16S24.837 0 16 0zm0 29.5c-2.49 0-4.83-.69-6.84-1.89l-4.78.92.92-4.78A13.43 13.43 0 0 1 2.5 16c0-7.456 6.044-13.5 13.5-13.5S29.5 8.544 29.5 16 23.456 29.5 16 29.5z" />
      </svg>
    </a>
  );
}
