import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SizeGuideItem = {
  id: string;
  label: string;
  width: number;  // cm
  height: number; // cm
};

export type SizeGuideConfig = {
  enabled: boolean;
  roomEnabled: boolean;
  roomImageUrl: string;
  /** Base wall size in cm represented by the room mockup width, used to scale overlays. */
  wallWidthCm: number;
  sizes: SizeGuideItem[];
};

export const SIZE_GUIDE_KEY = "size_guide_v1";

export const DEFAULT_SIZE_GUIDE: SizeGuideConfig = {
  enabled: true,
  roomEnabled: true,
  roomImageUrl: "",
  wallWidthCm: 300,
  sizes: [
    { id: "20x30",  label: "20 × 30 cm",  width: 20,  height: 30 },
    { id: "30x40",  label: "30 × 40 cm",  width: 30,  height: 40 },
    { id: "40x50",  label: "40 × 50 cm",  width: 40,  height: 50 },
    { id: "40x60",  label: "40 × 60 cm",  width: 40,  height: 60 },
    { id: "50x60",  label: "50 × 60 cm",  width: 50,  height: 60 },
    { id: "50x70",  label: "50 × 70 cm",  width: 50,  height: 70 },
    { id: "60x90",  label: "60 × 90 cm",  width: 60,  height: 90 },
    { id: "100x60", label: "100 × 60 cm", width: 100, height: 60 },
  ],
};

function normalize(raw: unknown): SizeGuideConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_SIZE_GUIDE;
  const v = raw as Partial<SizeGuideConfig>;
  const sizes = Array.isArray(v.sizes)
    ? v.sizes
        .filter((s): s is SizeGuideItem => !!s && typeof s === "object" && typeof (s as SizeGuideItem).id === "string")
        .map((s) => ({
          id: String(s.id),
          label: String(s.label ?? s.id),
          width: Number(s.width) || 0,
          height: Number(s.height) || 0,
        }))
        .filter((s) => s.width > 0 && s.height > 0)
    : DEFAULT_SIZE_GUIDE.sizes;
  return {
    enabled: v.enabled !== false,
    roomEnabled: v.roomEnabled !== false,
    roomImageUrl: typeof v.roomImageUrl === "string" ? v.roomImageUrl : "",
    wallWidthCm: Number(v.wallWidthCm) > 0 ? Number(v.wallWidthCm) : DEFAULT_SIZE_GUIDE.wallWidthCm,
    sizes: sizes.length ? sizes : DEFAULT_SIZE_GUIDE.sizes,
  };
}

export function useSizeGuide() {
  const q = useQuery({
    queryKey: ["size-guide-config"],
    staleTime: 60_000,
    queryFn: async (): Promise<SizeGuideConfig> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", SIZE_GUIDE_KEY)
        .maybeSingle();
      if (error) throw error;
      return normalize(data?.value);
    },
  });
  return q.data ?? DEFAULT_SIZE_GUIDE;
}