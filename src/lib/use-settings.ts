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