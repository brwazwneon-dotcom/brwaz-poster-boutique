import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FrameTypeId, SizeId } from "@/lib/poster-options";

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

/* -------------------- Admin-managed pricing -------------------- */

export type Pricing = {
  frame: Record<FrameTypeId, Partial<Record<SizeId, number>>>;
  customDesignFee: number;
  photo: Record<"10x15" | "13x18" | "15x20", number>;
  offers: { bundle6_20x30: number; bundle4_30x40: number };
  packagingFee: number;
  shippingFee: number;
  freeShippingThreshold: number;
  doubleFaceTapePrice: number;
  doubleFaceTapeEnabled: boolean;
};

export const PRICING_DEFAULTS: Pricing = {
  frame: {
    pvc:  { "20x30": 150, "30x40": 250, "40x50": 350 },
    wood: {
      "20x30": 190,
      "30x40": 270,
      "40x50": 400,
      "40x60": 450,
      "50x60": 500,
      "50x70": 580,
      "60x90": 850,
      "100x60": 950,
    },
  },
  customDesignFee: 20,
  photo: { "10x15": 10, "13x18": 15, "15x20": 20 },
  offers: { bundle6_20x30: 790, bundle4_30x40: 890 },
  packagingFee: 20,
  shippingFee: 89,
  freeShippingThreshold: 1600,
  doubleFaceTapePrice: 20,
  doubleFaceTapeEnabled: true,
};

export const PRICING_KEYS = {
  frame_pvc_20x30: ["frame", "pvc", "20x30"],
  frame_pvc_30x40: ["frame", "pvc", "30x40"],
  frame_pvc_40x50: ["frame", "pvc", "40x50"],
  frame_wood_20x30: ["frame", "wood", "20x30"],
  frame_wood_30x40: ["frame", "wood", "30x40"],
  frame_wood_40x50: ["frame", "wood", "40x50"],
  frame_wood_40x60: ["frame", "wood", "40x60"],
  frame_wood_50x60: ["frame", "wood", "50x60"],
  frame_wood_50x70: ["frame", "wood", "50x70"],
  frame_wood_60x90: ["frame", "wood", "60x90"],
  frame_wood_100x60: ["frame", "wood", "100x60"],
  custom_design_fee: ["customDesignFee"],
  photo_10x15: ["photo", "10x15"],
  photo_13x18: ["photo", "13x18"],
  photo_15x20: ["photo", "15x20"],
  offer_6_20x30: ["offers", "bundle6_20x30"],
  offer_4_30x40: ["offers", "bundle4_30x40"],
  packaging_fee: ["packagingFee"],
  shipping_fee: ["shippingFee"],
  free_shipping_threshold: ["freeShippingThreshold"],
  double_face_tape_price: ["doubleFaceTapePrice"],
  double_face_tape_enabled: ["doubleFaceTapeEnabled"],
} as const;

export function usePricing(): Pricing {
  const q = useQuery({
    queryKey: ["pricing"],
    staleTime: 60_000,
    queryFn: async (): Promise<Pricing> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("key,value")
        .in("key", Object.keys(PRICING_KEYS));
      if (error) throw error;
      const map = new Map((data ?? []).map((r) => [r.key, r.value as unknown]));
      const num = (k: keyof typeof PRICING_KEYS, fallback: number) => {
        const v = map.get(k);
        const n = typeof v === "number" ? v : Number(v);
        return Number.isFinite(n) ? n : fallback;
      };
      const d = PRICING_DEFAULTS;
      return {
        frame: {
          pvc: {
            "20x30": num("frame_pvc_20x30", d.frame.pvc["20x30"] ?? 0),
            "30x40": num("frame_pvc_30x40", d.frame.pvc["30x40"] ?? 0),
            "40x50": num("frame_pvc_40x50", d.frame.pvc["40x50"] ?? 0),
          },
          wood: {
            "20x30": num("frame_wood_20x30", d.frame.wood["20x30"] ?? 0),
            "30x40": num("frame_wood_30x40", d.frame.wood["30x40"] ?? 0),
            "40x50": num("frame_wood_40x50", d.frame.wood["40x50"] ?? 0),
            "40x60": num("frame_wood_40x60", d.frame.wood["40x60"] ?? 0),
            "50x60": num("frame_wood_50x60", d.frame.wood["50x60"] ?? 0),
            "50x70": num("frame_wood_50x70", d.frame.wood["50x70"] ?? 0),
            "60x90": num("frame_wood_60x90", d.frame.wood["60x90"] ?? 0),
            "100x60": num("frame_wood_100x60", d.frame.wood["100x60"] ?? 0),
          },
        },
        customDesignFee: num("custom_design_fee", d.customDesignFee),
        photo: {
          "10x15": num("photo_10x15", d.photo["10x15"]),
          "13x18": num("photo_13x18", d.photo["13x18"]),
          "15x20": num("photo_15x20", d.photo["15x20"]),
        },
        offers: {
          bundle6_20x30: num("offer_6_20x30", d.offers.bundle6_20x30),
          bundle4_30x40: num("offer_4_30x40", d.offers.bundle4_30x40),
        },
        packagingFee: num("packaging_fee", d.packagingFee),
        shippingFee: num("shipping_fee", d.shippingFee),
        freeShippingThreshold: num("free_shipping_threshold", d.freeShippingThreshold),
        doubleFaceTapePrice: num("double_face_tape_price", d.doubleFaceTapePrice),
        doubleFaceTapeEnabled: num("double_face_tape_enabled", d.doubleFaceTapeEnabled ? 1 : 0) !== 0,
      };
    },
  });
  return q.data ?? PRICING_DEFAULTS;
}

export function priceForFrame(
  pricing: Pricing,
  frameType: FrameTypeId,
  size: SizeId,
): number {
  return pricing.frame[frameType]?.[size] ?? 0;
}

export type FrameMockup = {
  image: string;
  top: number;
  left: number;
  width: number;
  height: number;
  /** Tilt angle in degrees applied to the artwork (matches frame board tilt). */
  rotate?: number;
  /** Perspective/skew in degrees on X axis. */
  skewX?: number;
  /** Perspective/skew in degrees on Y axis. */
  skewY?: number;
  /** Border radius of the printable area in % of its shorter side. */
  borderRadius?: number;
  /** Extra scale multiplier on the artwork. */
  scale?: number;
  /** 3D perspective depth in px applied to the printable area wrapper. */
  perspective?: number;
  /** 3D rotation around the X axis in degrees (tilt forward/back). */
  rotateX?: number;
  /** 3D rotation around the Y axis in degrees (tilt left/right). */
  rotateY?: number;
  /** Mirror the artwork horizontally. */
  flipX?: boolean;
  /** Mirror the artwork vertically. */
  flipY?: boolean;
};

export type FrameMockups = {
  black: FrameMockup;
  white: FrameMockup;
  wood: FrameMockup;
};

const MOCKUP_DEFAULTS: FrameMockups = {
  black: { image: "", top: 8, left: 8, width: 84, height: 84, rotate: 0, skewX: 0, skewY: 0, borderRadius: 0, scale: 1, perspective: 1000, rotateX: 0, rotateY: 0, flipX: false, flipY: false },
  white: { image: "", top: 8, left: 8, width: 84, height: 84, rotate: 0, skewX: 0, skewY: 0, borderRadius: 0, scale: 1, perspective: 1000, rotateX: 0, rotateY: 0, flipX: false, flipY: false },
  wood:  { image: "", top: 10, left: 10, width: 80, height: 80, rotate: 0, skewX: 0, skewY: 0, borderRadius: 0, scale: 1, perspective: 1000, rotateX: 0, rotateY: 0, flipX: false, flipY: false },
};

const MOCKUP_KEYS: Record<keyof FrameMockups, string> = {
  black: "frame_mockup_black",
  white: "frame_mockup_white",
  wood:  "frame_mockup_wood",
};

function parseMockup(raw: unknown, fallback: FrameMockup): FrameMockup {
  if (!raw || typeof raw !== "object") return fallback;
  const v = raw as Partial<FrameMockup>;
  const numOr = (x: unknown, fb: number) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : fb;
  };
  return {
    image: typeof v.image === "string" ? v.image : fallback.image,
    top: numOr(v.top, fallback.top),
    left: numOr(v.left, fallback.left),
    width: numOr(v.width, fallback.width),
    height: numOr(v.height, fallback.height),
    rotate: numOr(v.rotate, fallback.rotate ?? 0),
    skewX: numOr(v.skewX, fallback.skewX ?? 0),
    skewY: numOr(v.skewY, fallback.skewY ?? 0),
    borderRadius: numOr(v.borderRadius, fallback.borderRadius ?? 0),
    scale: numOr(v.scale, fallback.scale ?? 1),
    perspective: numOr(v.perspective, fallback.perspective ?? 1000),
    rotateX: numOr(v.rotateX, fallback.rotateX ?? 0),
    rotateY: numOr(v.rotateY, fallback.rotateY ?? 0),
    flipX: typeof v.flipX === "boolean" ? v.flipX : fallback.flipX ?? false,
    flipY: typeof v.flipY === "boolean" ? v.flipY : fallback.flipY ?? false,
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

/* -------------------- Grid display mode -------------------- */

export type GridDisplayMode = "black" | "white" | "wood";
export const GRID_DISPLAY_MODE_KEY = "grid_display_mode";
export const GRID_DISPLAY_MODE_DEFAULT: GridDisplayMode = "black";

export function useGridDisplayMode(): GridDisplayMode {
  const q = useQuery({
    queryKey: ["grid-display-mode"],
    staleTime: 60_000,
    queryFn: async (): Promise<GridDisplayMode> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", GRID_DISPLAY_MODE_KEY)
        .maybeSingle();
      if (error) throw error;
      const v = data?.value as unknown;
      const s = typeof v === "string" ? v : "";
      return (["black", "white", "wood"] as GridDisplayMode[]).includes(
        s as GridDisplayMode,
      )
        ? (s as GridDisplayMode)
        : GRID_DISPLAY_MODE_DEFAULT;
    },
  });
  return q.data ?? GRID_DISPLAY_MODE_DEFAULT;
}