import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { X, Eye, Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  useSocialProofConfig,
  useLiveVisitors,
  useRecentOrdersCount,
  useIsAdminSession,
  EG_NAMES,
  EG_CITIES,
  SALE_MESSAGES,
  pick,
  randomInt,
  timeAgo,
} from "@/lib/social-proof";
type Poster = { id: string; title: string; image_url: string };
type Notice = {
  id: string;
  name: string;
  city: string;
  message: string;
  minsAgo: number;
  poster?: Poster;
};

function useIsMobileMedia(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => setM(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return m;
}

/** Global floating sales-notification popup. Mount once at root. */
export function SalesNotifications() {
  const cfg = useSocialProofConfig();
  const isMobile = useIsMobileMedia();
  const isAdmin = useIsAdminSession();
  const location = useLocation();
  const [notice, setNotice] = useState<Notice | null>(null);
  const shownCount = useRef(0);

  const paused =
    (cfg.pauseOnCheckout &&
      (location.pathname === "/cart" || location.pathname.startsWith("/checkout"))) ||
    (cfg.hideForAdmin && (isAdmin || location.pathname.startsWith("/admin")));

  const deviceOk =
    cfg.sales.device === "both" ||
    (cfg.sales.device === "mobile" && isMobile) ||
    (cfg.sales.device === "desktop" && !isMobile);

  const active = cfg.sales.enabled && deviceOk && !paused;

  // Pull a small pool of real posters for thumbnails.
  const { data: posters } = useQuery({
    queryKey: ["social-proof-posters"],
    enabled: active && cfg.sales.useRealProducts,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Poster[]> => {
      const { data } = await supabase
        .from("posters")
        .select("id,title,image_url")
        .eq("hidden", false)
        .limit(40);
      return (data ?? []) as Poster[];
    },
  });

  useEffect(() => {
    if (!active) return;
    const show = () => {
      if (shownCount.current >= cfg.sales.maxPerSession) return;
      const poster =
        cfg.sales.useRealProducts && posters && posters.length ? pick(posters) : undefined;
      const n: Notice = {
        id: Math.random().toString(36).slice(2),
        name: cfg.sales.useFakeNames ? pick(EG_NAMES) : "Someone",
        city: pick(EG_CITIES),
        message: pick(SALE_MESSAGES),
        minsAgo: randomInt(1, 42),
        poster,
      };
      setNotice(n);
      shownCount.current += 1;
      window.setTimeout(
        () => {
          setNotice((cur) => (cur?.id === n.id ? null : cur));
        },
        Math.max(3, cfg.sales.durationSec) * 1000,
      );
    };
    // First one after a short delay
    const first = window.setTimeout(show, 6000);
    const timer = window.setInterval(show, Math.max(10, cfg.sales.intervalSec) * 1000);
    return () => {
      window.clearTimeout(first);
      if (timer) window.clearInterval(timer);
    };
  }, [
    active,
    cfg.sales.intervalSec,
    cfg.sales.durationSec,
    cfg.sales.maxPerSession,
    cfg.sales.useFakeNames,
    cfg.sales.useRealProducts,
    posters,
  ]);

  if (!active || !notice) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        "fixed z-40 max-w-[calc(100vw-2rem)] w-[260px] sm:w-[280px] " +
        "left-4 bottom-24 sm:left-6 sm:bottom-8 " +
        "md:left-6 md:bottom-8 " +
        "animate-enter"
      }
      style={{
        // Mobile: bottom center above sticky/WhatsApp
        ...(isMobile ? { left: "50%", transform: "translateX(-50%)", bottom: "5.5rem" } : {}),
      }}
    >
      <div className="relative rounded-xl border border-white/10 bg-black/80 px-3.5 py-2.5 pr-8 text-white shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold leading-tight">
            {notice.name} <span className="font-normal text-white/60">from {notice.city}</span>
          </div>
          <div className="truncate text-[12px] leading-snug text-white/80">{notice.message}</div>
          <div className="mt-1 text-[10px] uppercase tracking-widest text-white/50">
            {timeAgo(notice.minsAgo)}
          </div>
        </div>
        <button
          onClick={() => setNotice(null)}
          aria-label="Dismiss"
          className="absolute right-2 top-2 rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Inline "N people viewing" badge. */
export function LiveVisitors({ variant = "product" }: { variant?: "product" | "offer" }) {
  const cfg = useSocialProofConfig();
  const show =
    cfg.visitors.enabled &&
    ((variant === "product" && cfg.visitors.onProduct) ||
      (variant === "offer" && cfg.visitors.onOffers));
  const count = useLiveVisitors(cfg.visitors.min, cfg.visitors.max, cfg.visitors.updateSec);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!show || !mounted) return null;
  const label =
    variant === "offer"
      ? `${count} customers are checking this offer now`
      : `${count} people are viewing this poster now`;
  const Icon = variant === "offer" ? Flame : Eye;
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-widest text-muted-foreground transition-opacity">
      <Icon className="h-3.5 w-3.5 text-primary" />
      <span key={count} className="animate-fade-in">
        {label}
      </span>
    </div>
  );
}

/** Inline "sold in last 7 days" counter. */
export function RecentOrdersBadge({
  posterId,
  surface = "product",
}: {
  posterId?: string | null;
  surface?: "product" | "offer" | "checkout";
}) {
  const cfg = useSocialProofConfig();
  const enabled =
    cfg.orders.enabled &&
    ((surface === "product" && cfg.orders.onProduct) ||
      (surface === "offer" && cfg.orders.onOffers) ||
      (surface === "checkout" && cfg.orders.onCheckout));
  const n = useRecentOrdersCount(posterId ?? null, cfg.orders.fallbackDemo);
  if (!enabled || n === null || n < 1) return null;
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-primary">
      <Flame className="h-3.5 w-3.5" />
      {n} sold in the last 7 days
    </div>
  );
}
