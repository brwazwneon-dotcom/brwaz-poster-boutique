import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getSiteSettingsPublic, getPosterSalesCountPublic } from "@/lib/db-public.functions";

export const SOCIAL_PROOF_KEY = "social_proof_config";

export type SocialProofConfig = {
  sales: {
    enabled: boolean;
    device: "desktop" | "mobile" | "both";
    intervalSec: number; // seconds between notifications
    durationSec: number; // how long each stays
    useRealProducts: boolean;
    useFakeNames: boolean;
    maxPerSession: number;
  };
  visitors: {
    enabled: boolean;
    min: number;
    max: number;
    updateSec: number;
    onProduct: boolean;
    onOffers: boolean;
  };
  orders: {
    enabled: boolean;
    useRealOrders: boolean;
    fallbackDemo: boolean;
    onProduct: boolean;
    onOffers: boolean;
    onCheckout: boolean;
  };
  pauseOnCheckout: boolean;
  hideForAdmin: boolean;
};

export const DEFAULT_SOCIAL_PROOF: SocialProofConfig = {
  sales: {
    enabled: true,
    device: "both",
    intervalSec: 35,
    durationSec: 7,
    useRealProducts: true,
    useFakeNames: true,
    maxPerSession: 8,
  },
  visitors: {
    enabled: true,
    min: 3,
    max: 25,
    updateSec: 30,
    onProduct: true,
    onOffers: true,
  },
  orders: {
    enabled: true,
    useRealOrders: true,
    fallbackDemo: true,
    onProduct: true,
    onOffers: true,
    onCheckout: true,
  },
  pauseOnCheckout: true,
  hideForAdmin: true,
};

export const EG_NAMES = [
  "Salma E.",
  "Omar A.",
  "Yasmine H.",
  "Ahmed M.",
  "Mariam S.",
  "Youssef K.",
  "Nour I.",
  "Hana R.",
  "Karim T.",
  "Farida N.",
  "Mostafa G.",
  "Rana F.",
  "Adam Z.",
  "Laila B.",
  "Hassan O.",
  "Malak D.",
  "Ziad W.",
  "Habiba Y.",
  "Kareem H.",
  "Nada M.",
  "Seif A.",
  "Jana E.",
  "Tarek S.",
  "Dina K.",
];

export const EG_CITIES = [
  "Cairo",
  "Alexandria",
  "Giza",
  "Mansoura",
  "Tanta",
  "Zagazig",
  "Port Said",
  "Ismailia",
  "Suez",
  "Aswan",
  "Luxor",
  "Minya",
  "Assiut",
  "Sohag",
];

export const SALE_MESSAGES = [
  "purchased a framed poster",
  "ordered 2 framed posters",
  "ordered a custom portrait",
  "bought a football poster",
  "ordered anime posters",
  "purchased 4 posters",
  "bought a premium frame",
  "purchased 3 Black Poster Frames",
];

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function timeAgo(mins: number): string {
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export function useSocialProofConfig(): SocialProofConfig {
  const q = useQuery({
    queryKey: ["social-proof-config"],
    staleTime: 60_000,
    queryFn: async (): Promise<SocialProofConfig> => {
      const settings = await getSiteSettingsPublic({ data: { keys: [SOCIAL_PROOF_KEY] } });
      const v = (settings[SOCIAL_PROOF_KEY] ?? {}) as Partial<SocialProofConfig>;
      return {
        ...DEFAULT_SOCIAL_PROOF,
        ...v,
        sales: { ...DEFAULT_SOCIAL_PROOF.sales, ...(v.sales ?? {}) },
        visitors: { ...DEFAULT_SOCIAL_PROOF.visitors, ...(v.visitors ?? {}) },
        orders: { ...DEFAULT_SOCIAL_PROOF.orders, ...(v.orders ?? {}) },
      };
    },
  });
  return q.data ?? DEFAULT_SOCIAL_PROOF;
}

/** Live visitor counter that drifts slowly within [min,max]. */
export function useLiveVisitors(min: number, max: number, updateSec: number): number {
  const safeMin = Math.max(1, Math.min(min, max));
  const safeMax = Math.max(safeMin, max);
  const [count, setCount] = useState<number>(() => randomInt(safeMin, safeMax));
  const ref = useRef(count);
  ref.current = count;
  useEffect(() => {
    const tick = () => {
      const delta = randomInt(-2, 2);
      let next = ref.current + delta;
      if (next < safeMin) next = safeMin + randomInt(0, 2);
      if (next > safeMax) next = safeMax - randomInt(0, 2);
      setCount(next);
    };
    const jitter = () => (updateSec + randomInt(-10, 15)) * 1000;
    let t = window.setTimeout(
      function loop() {
        tick();
        t = window.setTimeout(loop, Math.max(5000, jitter()));
      },
      Math.max(5000, jitter()),
    );
    return () => window.clearTimeout(t);
  }, [safeMin, safeMax, updateSec]);
  return count;
}

/** Recent orders count for a poster — real data with demo fallback. */
export function useRecentOrdersCount(
  posterId: string | null,
  fallbackDemo: boolean,
): number | null {
  const q = useQuery({
    queryKey: ["recent-orders-count", posterId ?? "any"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (posterId) {
        const n = await getPosterSalesCountPublic({ data: { id: posterId } });
        if (n > 0) return n;
      }
      if (fallbackDemo) return randomInt(12, 68);
      return 0;
    },
  });
  return q.data ?? null;
}

export function useIsAdminSession(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem("brw-admin-seen") === "1") setIsAdmin(true);
    } catch {
      /* ignore */
    }
  }, []);
  return isAdmin;
}
