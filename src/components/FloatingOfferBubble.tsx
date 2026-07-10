import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

/**
 * Small floating "Today's Offers" bubble anchored to the bottom-left,
 * mirroring WhatsAppButton on the right. Routes to /offers.
 *
 * Design: gold outline, glassy black surface, subtle pulse ring — matches
 * the site's black + #c9a24a luxury palette.
 */
export function FloatingOfferBubble() {
  const GOLD = "#c9a24a";
  return (
    <Link
      to="/offers"
      aria-label="Today's offers"
      className="group fixed left-5 z-40 flex items-center gap-2 rounded-full border border-white/15 bg-black/80 py-2.5 pl-3 pr-4 text-white shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-md transition-transform duration-200 will-change-transform hover:scale-[1.04] sm:!bottom-8 sm:left-8"
      style={{
        boxShadow: `0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px ${GOLD}33`,
        bottom: "calc(1.25rem + var(--mobile-bar-h, 0px))",
      }}
    >
      <span className="relative grid h-8 w-8 place-items-center rounded-full" style={{ background: `radial-gradient(circle at 50% 50%, ${GOLD}66, transparent 70%)` }}>
        <span aria-hidden className="absolute inset-0 animate-ping rounded-full opacity-40" style={{ background: `${GOLD}55`, animationDuration: "2.4s" }} />
        <Sparkles className="relative h-4 w-4" strokeWidth={1.75} style={{ color: GOLD }} />
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.25em]">
        Today's Offers
      </span>
    </Link>
  );
}