import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePricing } from "@/lib/use-settings";
import { usePerformanceFlags } from "@/lib/performance-flags";
import { motionAllowed } from "@/lib/motion";

/**
 * Three small tags that pop up over the hero one after another and drop away again.
 * Every line is a real fact taken from the store's own settings (free-shipping
 * threshold, cheapest PVC frame, cash on delivery) — nothing invented.
 * Client-only and decorative: renders nothing on the server or when motion is off.
 */
export function HeroStickers() {
  const { i18n } = useTranslation();
  const pricing = usePricing();
  const flags = usePerformanceFlags();
  const [on, setOn] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    setOn(
      motionAllowed({
        prefersReducedMotion: !!mq?.matches,
        emergencyFastMode: !!flags.emergency_fast_mode,
        safeMode: !!flags.safe_mode,
        disabledByOwner: !!flags.disable_motion,
        search: window.location.search,
      }),
    );
  }, [flags.emergency_fast_mode, flags.safe_mode, flags.disable_motion]);

  if (!on) return null;
  const isAr = (i18n.language ?? "ar").startsWith("ar");
  const pvcFrom = Math.min(
    ...Object.values(pricing.frame.pvc).filter((v): v is number => typeof v === "number" && v > 0),
  );
  const tags = [
    {
      cls: "brw-sticker-yellow",
      text: isAr
        ? `شحن مجاني فوق ${pricing.freeShippingThreshold} جنيه`
        : `Free shipping over ${pricing.freeShippingThreshold} EGP`,
    },
    {
      cls: "brw-sticker-blue",
      text: Number.isFinite(pvcFrom)
        ? isAr
          ? `براويز PVC من ${pvcFrom} جنيه`
          : `PVC frames from ${pvcFrom} EGP`
        : isAr
          ? "براويز بجودة عالية"
          : "Premium frames",
    },
    {
      cls: "brw-sticker-ink",
      text: isAr ? "الدفع عند الاستلام" : "Cash on delivery",
    },
  ];
  return (
    <div className="brw-stickers" aria-hidden="true">
      {tags.map((tag, i) => (
        <span
          key={i}
          className={`brw-sticker ${tag.cls}`}
          style={{ animationDelay: `${i * 2.4}s` }}
        >
          {tag.text}
        </span>
      ))}
    </div>
  );
}
