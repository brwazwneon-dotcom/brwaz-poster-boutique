import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SiteSettings = {
  shippingFee: number;
  freeShippingThreshold: number;
};

const DEFAULTS: SiteSettings = {
  shippingFee: 89,
  freeShippingThreshold: 1600,
};

export function useSiteSettings() {
  const q = useQuery({
    queryKey: ["site-settings"],
    staleTime: 60_000,
    queryFn: async (): Promise<SiteSettings> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("key,value");
      if (error) throw error;
      const map = new Map((data ?? []).map((r) => [r.key, r.value as unknown]));
      const num = (k: string, fallback: number) => {
        const v = map.get(k);
        const n = typeof v === "number" ? v : Number(v);
        return Number.isFinite(n) ? n : fallback;
      };
      return {
        shippingFee: num("shipping_fee", DEFAULTS.shippingFee),
        freeShippingThreshold: num("free_shipping_threshold", DEFAULTS.freeShippingThreshold),
      };
    },
  });
  return q.data ?? DEFAULTS;
}

export function computeShipping(subtotal: number, s: SiteSettings) {
  return subtotal >= s.freeShippingThreshold ? 0 : s.shippingFee;
}

export type FrameMockup = {
  image: string;
  top: number;
  left: number;
  width: number;
  height: number;
};

export type FrameMockups = {
  black: FrameMockup;
  white: FrameMockup;
  wood: FrameMockup;
};

const MOCKUP_DEFAULTS: FrameMockups = {
  black: { image: "", top: 8, left: 8, width: 84, height: 84 },
  white: { image: "", top: 8, left: 8, width: 84, height: 84 },
  wood:  { image: "", top: 10, left: 10, width: 80, height: 80 },
};

const MOCKUP_KEYS: Record<keyof FrameMockups, string> = {
  black: "frame_mockup_black",
  white: "frame_mockup_white",
  wood:  "frame_mockup_wood",
};

function parseMockup(raw: unknown, fallback: FrameMockup): FrameMockup {
  if (!raw || typeof raw !== "object") return fallback;
  const v = raw as Partial<FrameMockup>;
  return {
    image: typeof v.image === "string" ? v.image : fallback.image,
    top: Number.isFinite(Number(v.top)) ? Number(v.top) : fallback.top,
    left: Number.isFinite(Number(v.left)) ? Number(v.left) : fallback.left,
    width: Number.isFinite(Number(v.width)) ? Number(v.width) : fallback.width,
    height: Number.isFinite(Number(v.height)) ? Number(v.height) : fallback.height,
  };
}

export function useFrameMockups(): FrameMockups {
  const q = useQuery({
    queryKey: ["frame-mockups"],
    staleTime: 60_000,
    queryFn: async (): Promise<FrameMockups> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("key,value")
        .in("key", Object.values(MOCKUP_KEYS));
      if (error) throw error;
      const map = new Map((data ?? []).map((r) => [r.key, r.value as unknown]));
      return {
        black: parseMockup(map.get(MOCKUP_KEYS.black), MOCKUP_DEFAULTS.black),
        white: parseMockup(map.get(MOCKUP_KEYS.white), MOCKUP_DEFAULTS.white),
        wood:  parseMockup(map.get(MOCKUP_KEYS.wood),  MOCKUP_DEFAULTS.wood),
      };
    },
  });
  return q.data ?? MOCKUP_DEFAULTS;
}

export { MOCKUP_DEFAULTS, MOCKUP_KEYS };