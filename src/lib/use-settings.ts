import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Frame mockups are served from /public so they work on every host
// (Lovable preview, Lovable published, custom domains on Vercel, etc.).
// The Lovable CDN paths (/__l5e/...) return 404 on non-Lovable hosts.
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
      const { data, error } = await supabase.from("site_settings").select("key,value");
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
    pvc: { "20x30": 190, "30x40": 250, "40x50": 350 },
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
        doubleFaceTapeEnabled:
          num("double_face_tape_enabled", d.doubleFaceTapeEnabled ? 1 : 0) !== 0,
      };
    },
  });
  return q.data ?? PRICING_DEFAULTS;
}

export function priceForFrame(pricing: Pricing, frameType: FrameTypeId, size: SizeId): number {
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
  /** When false, this frame variant is hidden from the storefront. Defaults to true. */
  enabled?: boolean;
};

export type FrameMockups = {
  black: FrameMockup;
  white: FrameMockup;
  wood: FrameMockup;
};

const LOCAL_MOCKUP_IMAGES: Record<keyof FrameMockups, string> = {
  black: "/assets/mockups/frame-black.webp",
  white: "/assets/mockups/frame-white.webp",
  wood: "/assets/mockups/frame-wood.webp",
};

const MOCKUP_DEFAULTS: FrameMockups = {
  black: {
    image: LOCAL_MOCKUP_IMAGES.black,
    top: 13.59,
    left: 14.19,
    width: 71.63,
    height: 70.78,
    rotate: 0,
    skewX: 0,
    skewY: 0,
    borderRadius: 0,
    scale: 1,
    perspective: 1000,
    rotateX: 0,
    rotateY: 0,
    flipX: false,
    flipY: false,
    enabled: true,
  },
  white: {
    image: LOCAL_MOCKUP_IMAGES.white,
    top: 13.83,
    left: 14.07,
    width: 71.4,
    height: 70.47,
    rotate: 0,
    skewX: 0,
    skewY: 0,
    borderRadius: 0,
    scale: 1,
    perspective: 1000,
    rotateX: 0,
    rotateY: 0,
    flipX: false,
    flipY: false,
    enabled: true,
  },
  wood: {
    image: LOCAL_MOCKUP_IMAGES.wood,
    top: 14.06,
    left: 17.72,
    width: 69.72,
    height: 74.06,
    rotate: 0,
    skewX: 0,
    skewY: 0,
    borderRadius: 0,
    scale: 1,
    perspective: 1000,
    rotateX: 0,
    rotateY: 0,
    flipX: false,
    flipY: false,
    enabled: true,
  },
};

const MOCKUP_KEYS: Record<keyof FrameMockups, string> = {
  black: "frame_mockup_black",
  white: "frame_mockup_white",
  wood: "frame_mockup_wood",
};

function parseMockup(raw: unknown, fallback: FrameMockup): FrameMockup {
  if (!raw || typeof raw !== "object") return fallback;
  const v = raw as Partial<FrameMockup>;
  const numOr = (x: unknown, fb: number) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : fb;
  };
  const imgRaw = typeof v.image === "string" ? v.image.trim() : "";
  // Ignore host-specific URLs that only work on preview/CDN hosts
  // (they 404 on custom-domain deploys). Fall back to the
  // locally-served optimized mockup so every host renders correctly.
  const isLegacy =
    imgRaw.startsWith("/assets/mockups/") ||
    imgRaw.startsWith("/__l5e/") ||
    imgRaw.includes(".lovableproject.com/__l5e/");
  return {
    image: imgRaw && !isLegacy ? imgRaw : fallback.image,
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
    flipX: typeof v.flipX === "boolean" ? v.flipX : (fallback.flipX ?? false),
    flipY: typeof v.flipY === "boolean" ? v.flipY : (fallback.flipY ?? false),
    enabled: typeof v.enabled === "boolean" ? v.enabled : (fallback.enabled ?? true),
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
        wood: parseMockup(map.get(MOCKUP_KEYS.wood), MOCKUP_DEFAULTS.wood),
      };
    },
  });
  return q.data ?? MOCKUP_DEFAULTS;
}

export { MOCKUP_DEFAULTS, MOCKUP_KEYS };

/** IDs of frame variants that the admin has enabled for the storefront. */
export function useEnabledFrameVariants(): Array<keyof FrameMockups> {
  const m = useFrameMockups();
  const all: Array<keyof FrameMockups> = ["black", "white", "wood"];
  const on = all.filter((k) => m[k].enabled !== false);
  return on.length ? on : all;
}

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
      return (["black", "white", "wood"] as GridDisplayMode[]).includes(s as GridDisplayMode)
        ? (s as GridDisplayMode)
        : GRID_DISPLAY_MODE_DEFAULT;
    },
  });
  return q.data ?? GRID_DISPLAY_MODE_DEFAULT;
}

/* -------------------- 4x6 Photo Printing config -------------------- */

export type Photo4x6Package = {
  key: string;
  photos: number;
  price: number;
  label: string;
};

export type Photo4x6Config = {
  enabled: boolean;
  packages: Photo4x6Package[];
  aiEnhanceEnabled: boolean;
  aiSuitEnabled: boolean;
  upsellEnabled: boolean;
  upsellExampleImage: string;
  upsellTitle: string;
  upsellSubtitle: string;
};

export const PHOTO_4X6_DEFAULTS: Photo4x6Config = {
  enabled: true,
  packages: [
    { key: "p8", photos: 8, price: 80, label: "8 Photos 4×6" },
    { key: "p12", photos: 12, price: 99, label: "12 Photos 4×6" },
  ],
  aiEnhanceEnabled: true,
  aiSuitEnabled: true,
  upsellEnabled: true,
  upsellExampleImage: "",
  upsellTitle: "Print Your Personal Photos 4×6",
  upsellSubtitle: "Upload your favorite photos and we'll enhance the quality before printing.",
};

export const PHOTO_4X6_KEY = "photo_4x6_config";

function parsePhoto4x6(raw: unknown): Photo4x6Config {
  if (!raw || typeof raw !== "object") return PHOTO_4X6_DEFAULTS;
  const v = raw as Partial<Photo4x6Config>;
  const packages =
    Array.isArray(v.packages) && v.packages.length
      ? v.packages
          .map((p) => {
            const photos = Number(p?.photos);
            const price = Number(p?.price);
            if (!Number.isFinite(photos) || !Number.isFinite(price)) return null;
            return {
              key: String(p?.key ?? `p${photos}`),
              photos,
              price,
              label: String(p?.label ?? `${photos} Photos 4×6`),
            } as Photo4x6Package;
          })
          .filter((p): p is Photo4x6Package => !!p)
      : PHOTO_4X6_DEFAULTS.packages;
  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : true,
    packages: packages.length ? packages : PHOTO_4X6_DEFAULTS.packages,
    aiEnhanceEnabled: typeof v.aiEnhanceEnabled === "boolean" ? v.aiEnhanceEnabled : true,
    aiSuitEnabled: typeof v.aiSuitEnabled === "boolean" ? v.aiSuitEnabled : true,
    upsellEnabled: typeof v.upsellEnabled === "boolean" ? v.upsellEnabled : true,
    upsellExampleImage: typeof v.upsellExampleImage === "string" ? v.upsellExampleImage : "",
    upsellTitle:
      typeof v.upsellTitle === "string" && v.upsellTitle
        ? v.upsellTitle
        : PHOTO_4X6_DEFAULTS.upsellTitle,
    upsellSubtitle:
      typeof v.upsellSubtitle === "string" && v.upsellSubtitle
        ? v.upsellSubtitle
        : PHOTO_4X6_DEFAULTS.upsellSubtitle,
  };
}

export function usePhoto4x6Config(): Photo4x6Config {
  const q = useQuery({
    queryKey: ["photo-4x6-config"],
    staleTime: 60_000,
    queryFn: async (): Promise<Photo4x6Config> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", PHOTO_4X6_KEY)
        .maybeSingle();
      if (error) throw error;
      return parsePhoto4x6(data?.value);
    },
  });
  return q.data ?? PHOTO_4X6_DEFAULTS;
}

/* -------------------- Photo Printing media -------------------- */

export type PhotoPrintingBanner = {
  id: string;
  desktopImageUrl: string;
  mobileImageUrl: string;
  enabled: boolean;
  linkUrl: string;
  altText: string;
  title: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PhotoPrintingPageImage = {
  id: string;
  imageUrl: string;
  enabled: boolean;
  isPrimary: boolean;
  altText: string;
  title: string;
  description: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PhotoPrintingMediaConfig = {
  banners: PhotoPrintingBanner[];
  images: PhotoPrintingPageImage[];
};

export const PHOTO_PRINTING_MEDIA_KEY = "photo_printing_media";
export const PHOTO_PRINTING_MEDIA_DEFAULTS: PhotoPrintingMediaConfig = {
  banners: [],
  images: [],
};

const asString = (value: unknown): string => (typeof value === "string" ? value : "");
const asBool = (value: unknown, fallback = false): boolean =>
  typeof value === "boolean" ? value : fallback;
const asNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export function parsePhotoPrintingMediaConfig(raw: unknown): PhotoPrintingMediaConfig {
  if (!raw || typeof raw !== "object") return PHOTO_PRINTING_MEDIA_DEFAULTS;
  const value = raw as Partial<PhotoPrintingMediaConfig>;
  const banners = Array.isArray(value.banners)
    ? value.banners
        .map((item, index) => {
          if (!item || typeof item !== "object") return null;
          const b = item as Partial<PhotoPrintingBanner>;
          const desktopImageUrl = asString(b.desktopImageUrl);
          const mobileImageUrl = asString(b.mobileImageUrl);
          if (!desktopImageUrl && !mobileImageUrl) return null;
          return {
            id: asString(b.id) || `banner-${index}`,
            desktopImageUrl,
            mobileImageUrl,
            enabled: asBool(b.enabled, true),
            linkUrl: asString(b.linkUrl),
            altText: asString(b.altText),
            title: asString(b.title),
            sortOrder: asNumber(b.sortOrder, index),
            createdAt: asString(b.createdAt),
            updatedAt: asString(b.updatedAt),
          } satisfies PhotoPrintingBanner;
        })
        .filter((item): item is PhotoPrintingBanner => !!item)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    : [];
  const images = Array.isArray(value.images)
    ? value.images
        .map((item, index) => {
          if (!item || typeof item !== "object") return null;
          const image = item as Partial<PhotoPrintingPageImage>;
          const imageUrl = asString(image.imageUrl);
          if (!imageUrl) return null;
          return {
            id: asString(image.id) || `image-${index}`,
            imageUrl,
            enabled: asBool(image.enabled, true),
            isPrimary: asBool(image.isPrimary, false),
            altText: asString(image.altText),
            title: asString(image.title),
            description: asString(image.description),
            sortOrder: asNumber(image.sortOrder, index),
            createdAt: asString(image.createdAt),
            updatedAt: asString(image.updatedAt),
          } satisfies PhotoPrintingPageImage;
        })
        .filter((item): item is PhotoPrintingPageImage => !!item)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    : [];
  return { banners, images };
}

export function usePhotoPrintingMediaConfig(): PhotoPrintingMediaConfig {
  const q = useQuery({
    queryKey: ["photo-printing-media"],
    staleTime: 30_000,
    queryFn: async (): Promise<PhotoPrintingMediaConfig> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", PHOTO_PRINTING_MEDIA_KEY)
        .maybeSingle();
      if (error) throw error;
      return parsePhotoPrintingMediaConfig(data?.value);
    },
  });
  return q.data ?? PHOTO_PRINTING_MEDIA_DEFAULTS;
}

/* -------------------- Post-order success message -------------------- */

export const POST_ORDER_MESSAGE_ENABLED_KEY = "post_order_success_message_enabled";

/** Params the stored site_settings value of the post-order message toggle. */
export function parsePostOrderMessageEnabled(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v !== "false" && v !== "0";
  return true;
}

/**
 * Read the CURRENT value of the post-order message toggle straight from
 * Supabase. Called at the moment of order success so the toast always reflects
 * the setting stored in the database — never a cached value. Defaults to ON.
 */
export async function readPostOrderMessageEnabled(): Promise<boolean> {
  const { data, error } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", POST_ORDER_MESSAGE_ENABLED_KEY)
    .maybeSingle();
  if (error) throw error;
  return parsePostOrderMessageEnabled(data?.value);
}

/**
 * Whether the storefront shows the post-order success message to the customer.
 * Defaults to ON. When OFF, order completion keeps working exactly as before —
 * only the success toast is suppressed.
 */
export function usePostOrderMessageEnabled(): boolean {
  const q = useQuery({
    queryKey: ["post-order-message-enabled"],
    staleTime: 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", POST_ORDER_MESSAGE_ENABLED_KEY)
        .maybeSingle();
      if (error) throw error;
      return parsePostOrderMessageEnabled(data?.value);
    },
  });
  return q.data ?? true;
}
