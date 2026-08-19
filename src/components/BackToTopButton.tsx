import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Z } from "@/lib/floating-tools";

export function BackToTopButton() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [fillWhite, setFillWhite] = useState(false);
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    let ticking = false;
    let lastY = window.scrollY;
    const update = () => {
      const currentY = window.scrollY;
      setVisible((wasVisible) => (wasVisible ? currentY > 120 : currentY > 400));

      const delta = currentY - lastY;
      if (Math.abs(delta) >= 6) {
        setFillWhite(delta > 0 && currentY > 120);
        lastY = currentY;
      }
      if (currentY <= 120) setFillWhite(false);
      ticking = false;
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className="floating-tool secondary fixed left-1/2 -translate-x-1/2"
      style={{
        bottom: "calc(20px + var(--sticky-bar-h, 0px) + env(safe-area-inset-bottom, 0px))",
        zIndex: Z.FLOATING_TOOLS,
      }}
    >
      <button
        type="button"
        aria-label={t("floatingTools.backToTop")}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        onMouseLeave={() => setPressed(false)}
        onClick={() => {
          setFillWhite(false);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        className={`group relative flex h-[50px] w-[42px] items-center justify-center overflow-hidden rounded-[2px] bg-transparent shadow-[0_14px_34px_rgba(0,0,0,0.22)] transition-[opacity,transform,box-shadow] duration-300 ease-out motion-reduce:animate-none sm:hidden ${
          visible
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-4 scale-[0.88] opacity-0"
        } ${pressed ? "scale-[0.94]" : "motion-safe:animate-[frame-float_2.4s_ease-in-out_infinite] hover:scale-[1.06]"}`}
        style={{ color: fillWhite ? "#050505" : "#ffffff" }}
      >
        <span
          className={`back-to-top-border-liquid pointer-events-none absolute inset-0 transition-transform duration-700 ease-out ${fillWhite ? "bg-white" : "bg-black"}`}
          style={{ transform: fillWhite ? "translateY(0%)" : "translateY(82%)" }}
        />
        <span
          className={`back-to-top-border-liquid back-to-top-border-liquid-inner pointer-events-none absolute inset-[5px] transition-transform duration-700 ease-out ${fillWhite ? "bg-white" : "bg-black"}`}
          style={{ transform: fillWhite ? "translateY(0%)" : "translateY(82%)" }}
        />
        <span
          className={`pointer-events-none absolute inset-0 border transition-colors duration-700 ${fillWhite ? "border-white/80" : "border-black"}`}
        />
        <span
          className={`pointer-events-none absolute inset-[5px] border transition-colors duration-700 group-hover:border-white/70 ${fillWhite ? "border-white/60" : "border-black/80"}`}
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="relative z-10 h-4 w-4 transition-transform duration-300 ease-out group-hover:-translate-y-0.5 sm:h-[18px] sm:w-[18px]"
          fill="none"
        >
          <path
            d="M12 19V5M6.5 10.5 12 5l5.5 5.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
