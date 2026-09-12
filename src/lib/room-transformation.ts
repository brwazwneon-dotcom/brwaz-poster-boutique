import { useQuery } from "@tanstack/react-query";
import { getSiteSettingsPublic, getRoomTransformationArtworkPublic } from "@/lib/db-public.functions";
import type { ResponsivePosterImage } from "@/lib/public-images";

export const ROOM_TRANSFORMATION_KEY = "homepage_room_transformation";

export type RoomPreset = "neutral-studio" | "warm-gallery" | "soft-loft";
export type RoomFrameStyle = "black-pvc" | "white-pvc" | "wooden-portrait" | "golden-frame";
export type RoomCtaDestination = "best-sellers" | "custom-design" | "photo-printing";

export type RoomTransformationSettings = {
  enabled: boolean;
  roomPreset: RoomPreset;
  posterId: string | null;
  frameStyle: RoomFrameStyle;
  headingAr: string;
  headingEn: string;
  subheadingAr: string;
  subheadingEn: string;
  ctaDestination: RoomCtaDestination;
  secondaryCtaEnabled: boolean;
};

export type RoomArtwork = {
  posterId: string;
  title: string;
  image: ResponsivePosterImage;
};

export const DEFAULT_ROOM_TRANSFORMATION: RoomTransformationSettings = {
  enabled: true,
  roomPreset: "neutral-studio",
  posterId: null,
  frameStyle: "black-pvc",
  headingAr: "من حائط فارغ لمساحة تحكي ذوقك",
  headingEn: "From an Empty Wall to a Room With Character",
  subheadingAr: "شاهد كيف يغيّر تصميم واحد شكل الغرفة ويمنحها شخصية مميزة.",
  subheadingEn:
    "See how one carefully chosen artwork changes the room and gives it a distinct personality.",
  ctaDestination: "best-sellers",
  secondaryCtaEnabled: true,
};

export type RoomPresetConfig = {
  label: string;
  wall: string;
  desktopAvif: string;
  desktopWebp: string;
  mobileAvif: string;
  mobileWebp: string;
  objectPosition: string;
  mobileObjectPosition: string;
  frame: {
    left: string;
    top: string;
    width: string;
    mobileLeft: string;
    mobileTop: string;
    mobileWidth: string;
  };
};

export const ROOM_PRESETS: Record<RoomPreset, RoomPresetConfig> = {
  "neutral-studio": {
    label: "Minimal Beige Wall",
    wall: "#e7e1d7",
    desktopAvif:
      "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&h=820&q=68&fm=avif",
    desktopWebp:
      "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&h=820&q=72&fm=webp",
    mobileAvif:
      "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=800&h=980&q=66&fm=avif",
    mobileWebp:
      "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=800&h=980&q=70&fm=webp",
    objectPosition: "center center",
    mobileObjectPosition: "48% center",
    frame: {
      left: "50%",
      top: "27%",
      width: "20%",
      mobileLeft: "43%",
      mobileTop: "20%",
      mobileWidth: "18%",
    },
  },
  "warm-gallery": {
    label: "Warm Gallery Wall",
    wall: "#eadfce",
    desktopAvif:
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&h=820&q=68&fm=avif",
    desktopWebp:
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&h=820&q=72&fm=webp",
    mobileAvif:
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&h=980&q=66&fm=avif",
    mobileWebp:
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&h=980&q=70&fm=webp",
    objectPosition: "center center",
    mobileObjectPosition: "52% center",
    frame: {
      left: "48%",
      top: "26%",
      width: "20%",
      mobileLeft: "50%",
      mobileTop: "25%",
      mobileWidth: "25%",
    },
  },
  "soft-loft": {
    label: "Soft Gray Bedroom Wall",
    wall: "#e4e6e1",
    desktopAvif:
      "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1200&h=820&q=68&fm=avif",
    desktopWebp:
      "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1200&h=820&q=72&fm=webp",
    mobileAvif:
      "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=800&h=980&q=66&fm=avif",
    mobileWebp:
      "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=800&h=980&q=70&fm=webp",
    objectPosition: "center center",
    mobileObjectPosition: "50% center",
    frame: {
      left: "51%",
      top: "25%",
      width: "19%",
      mobileLeft: "50%",
      mobileTop: "24%",
      mobileWidth: "24%",
    },
  },
};

export const ROOM_FRAME_STYLES: Record<
  RoomFrameStyle,
  { label: string; frame: string; mat: string; border: string }
> = {
  "black-pvc": { label: "Black PVC", frame: "#050505", mat: "#f7f5ef", border: "#171717" },
  "white-pvc": { label: "White PVC", frame: "#f8f8f5", mat: "#ffffff", border: "#dedbd2" },
  "wooden-portrait": {
    label: "Wooden Portrait",
    frame: "#7a4d2c",
    mat: "#f6efe4",
    border: "#4b2b16",
  },
  "golden-frame": { label: "Golden Frame", frame: "#b88a36", mat: "#fff8e8", border: "#6d4a18" },
};

export const ROOM_CTA_DESTINATIONS: Record<RoomCtaDestination, { label: string; href: string }> = {
  "best-sellers": { label: "Best Sellers", href: "/best-sellers" },
  "custom-design": { label: "Custom Design", href: "/custom-design" },
  "photo-printing": { label: "Photo Printing", href: "/photo-printing" },
};

export function normalizeRoomSettings(value: unknown): RoomTransformationSettings {
  if (!value || typeof value !== "object") return DEFAULT_ROOM_TRANSFORMATION;
  const raw = value as Partial<RoomTransformationSettings>;
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_ROOM_TRANSFORMATION.enabled,
    roomPreset:
      raw.roomPreset && raw.roomPreset in ROOM_PRESETS
        ? raw.roomPreset
        : DEFAULT_ROOM_TRANSFORMATION.roomPreset,
    posterId: typeof raw.posterId === "string" && raw.posterId ? raw.posterId : null,
    frameStyle:
      raw.frameStyle && raw.frameStyle in ROOM_FRAME_STYLES
        ? raw.frameStyle
        : DEFAULT_ROOM_TRANSFORMATION.frameStyle,
    headingAr: cleanText(raw.headingAr, DEFAULT_ROOM_TRANSFORMATION.headingAr),
    headingEn: cleanText(raw.headingEn, DEFAULT_ROOM_TRANSFORMATION.headingEn),
    subheadingAr: cleanText(raw.subheadingAr, DEFAULT_ROOM_TRANSFORMATION.subheadingAr),
    subheadingEn: cleanText(raw.subheadingEn, DEFAULT_ROOM_TRANSFORMATION.subheadingEn),
    ctaDestination:
      raw.ctaDestination && raw.ctaDestination in ROOM_CTA_DESTINATIONS
        ? raw.ctaDestination
        : DEFAULT_ROOM_TRANSFORMATION.ctaDestination,
    secondaryCtaEnabled:
      typeof raw.secondaryCtaEnabled === "boolean"
        ? raw.secondaryCtaEnabled
        : DEFAULT_ROOM_TRANSFORMATION.secondaryCtaEnabled,
  };
}

export function useRoomTransformationSettings() {
  const q = useQuery({
    queryKey: ["room-transformation-settings"],
    staleTime: 60_000,
    queryFn: async (): Promise<RoomTransformationSettings> => {
      const settings = await getSiteSettingsPublic({ data: { keys: [ROOM_TRANSFORMATION_KEY] } });
      return normalizeRoomSettings(settings[ROOM_TRANSFORMATION_KEY]);
    },
  });
  return q.data ?? DEFAULT_ROOM_TRANSFORMATION;
}

// Simplified vs. the old Supabase version (see fetchRoomTransformationArtworkFromDb
// in db-catalog.server.ts): no best_sellers table or image_variants pipeline
// exist on Neon yet, so this is a single poster lookup with the plain
// image_url as its own src — good enough for a homepage decorative widget.
export function useRoomTransformationArtwork(settings: RoomTransformationSettings) {
  return useQuery({
    queryKey: ["room-transformation-artwork", settings.posterId],
    enabled: settings.enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<RoomArtwork | null> => {
      const row = await getRoomTransformationArtworkPublic({ data: { posterId: settings.posterId } });
      if (!row) return null;
      const image: ResponsivePosterImage = { src: row.image_url, sizes: "(max-width: 640px) 72vw, 360px" };
      return { posterId: row.id, title: row.title, image };
    },
  });
}

function cleanText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 180) : fallback;
}
