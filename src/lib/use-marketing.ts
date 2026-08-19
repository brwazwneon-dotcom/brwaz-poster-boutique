import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MarketingConfig = {
  pixelId: string;
  pixelEnabled: boolean;
  capiEnabled: boolean;
  advancedMatchingEnabled: boolean;
  ga4MeasurementId: string;
  ga4Enabled: boolean;
};

const DEFAULTS: MarketingConfig = {
  pixelId: "",
  pixelEnabled: false,
  capiEnabled: false,
  advancedMatchingEnabled: false,
  ga4MeasurementId: "",
  ga4Enabled: false,
};

const KEYS = [
  "meta_pixel_id",
  "meta_pixel_enabled",
  "meta_capi_enabled",
  "meta_advanced_matching_enabled",
  "ga4_measurement_id",
  "ga4_enabled",
];

export function useMarketingConfig(): MarketingConfig {
  const q = useQuery({
    queryKey: ["marketing-config"],
    staleTime: 60_000,
    queryFn: async (): Promise<MarketingConfig> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("key,value")
        .in("key", KEYS);
      if (error) throw error;
      const map = new Map((data ?? []).map((r) => [r.key, r.value as unknown]));
      const bool = (k: string) => map.get(k) === true || map.get(k) === "true";
      const pixelId = String(map.get("meta_pixel_id") ?? "").trim();
      const ga4Id = String(map.get("ga4_measurement_id") ?? "").trim();
      return {
        pixelId,
        pixelEnabled: bool("meta_pixel_enabled") && /^\d{6,20}$/.test(pixelId),
        capiEnabled: bool("meta_capi_enabled"),
        advancedMatchingEnabled: bool("meta_advanced_matching_enabled"),
        ga4MeasurementId: ga4Id,
        ga4Enabled: bool("ga4_enabled") && /^G-[A-Z0-9]{6,}$/.test(ga4Id),
      };
    },
  });
  return q.data ?? DEFAULTS;
}

export const MARKETING_KEYS = KEYS;
