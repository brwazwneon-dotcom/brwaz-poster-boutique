import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const PHOTO_ENHANCEMENT_KEY = "homepage_photo_enhancement";

export const PORSCHE_AFTER_WEBP = "/assets/photo-enhancement/porsche-911-after.webp";
export const PORSCHE_AFTER_AVIF = "/assets/photo-enhancement/porsche-911-after.avif";
const PORSCHE_BEFORE_WEBP = "/assets/photo-enhancement/porsche-911-before.webp";
const PORSCHE_BEFORE_AVIF = "/assets/photo-enhancement/porsche-911-before.avif";
const LEGACY_WEDDING_DEMO = "photo-1519741497674-611481863552";

export type PhotoEnhancementSettings = {
  enabled: boolean;
  beforeImage: string;
  beforeImageAvif?: string;
  afterImage: string;
  afterImageAvif?: string;
  beforeAspectRatio: number;
  afterAspectRatio: number;
  initialSlider: number;
  pixelationLevel: number;
  blurAmount: number;
  compressionLevel: number;
  colorFadeStrength: number;
  headingAr: string;
  headingEn: string;
  descriptionAr: string;
  descriptionEn: string;
  primaryCtaHref: string;
  secondaryCtaHref: string;
};

export const DEFAULT_PHOTO_ENHANCEMENT: PhotoEnhancementSettings = {
  enabled: true,
  beforeImage: PORSCHE_BEFORE_WEBP,
  beforeImageAvif: PORSCHE_BEFORE_AVIF,
  afterImage: PORSCHE_AFTER_WEBP,
  afterImageAvif: PORSCHE_AFTER_AVIF,
  beforeAspectRatio: 16 / 9,
  afterAspectRatio: 16 / 9,
  initialSlider: 50,
  pixelationLevel: 82,
  blurAmount: 0.6,
  compressionLevel: 66,
  colorFadeStrength: 32,
  headingAr: "حوّل صورتك القديمة لجودة تليق بذكرياتك",
  headingEn: "See the Difference Before You Print",
  descriptionAr:
    "حرّك السلايدر وشاهد الفرق بين الصورة الأصلية والصورة بعد تحسين الجودة والألوان والتفاصيل.",
  descriptionEn:
    "Compare your original image with our professionally enhanced print-ready version.",
  primaryCtaHref: "/custom-design",
  secondaryCtaHref: "/photo-printing",
};

export function normalizePhotoEnhancementSettings(value: unknown): PhotoEnhancementSettings {
  if (!value || typeof value !== "object") return DEFAULT_PHOTO_ENHANCEMENT;
  const raw = value as Partial<PhotoEnhancementSettings>;
  const beforeImage = cleanUrl(raw.beforeImage, DEFAULT_PHOTO_ENHANCEMENT.beforeImage);
  const afterImage = cleanUrl(raw.afterImage, DEFAULT_PHOTO_ENHANCEMENT.afterImage);
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_PHOTO_ENHANCEMENT.enabled,
    beforeImage,
    beforeImageAvif:
      cleanOptionalUrl(raw.beforeImageAvif) ??
      (beforeImage === DEFAULT_PHOTO_ENHANCEMENT.beforeImage
        ? DEFAULT_PHOTO_ENHANCEMENT.beforeImageAvif
        : undefined),
    afterImage,
    afterImageAvif:
      cleanOptionalUrl(raw.afterImageAvif) ??
      (afterImage === DEFAULT_PHOTO_ENHANCEMENT.afterImage
        ? DEFAULT_PHOTO_ENHANCEMENT.afterImageAvif
        : undefined),
    beforeAspectRatio: cleanRatio(
      raw.beforeAspectRatio,
      DEFAULT_PHOTO_ENHANCEMENT.beforeAspectRatio,
    ),
    afterAspectRatio: cleanRatio(raw.afterAspectRatio, DEFAULT_PHOTO_ENHANCEMENT.afterAspectRatio),
    initialSlider: cleanPercent(raw.initialSlider),
    pixelationLevel: cleanRange(
      raw.pixelationLevel,
      DEFAULT_PHOTO_ENHANCEMENT.pixelationLevel,
      1,
      100,
    ),
    blurAmount: cleanRange(raw.blurAmount, DEFAULT_PHOTO_ENHANCEMENT.blurAmount, 0, 3),
    compressionLevel: cleanRange(
      raw.compressionLevel,
      DEFAULT_PHOTO_ENHANCEMENT.compressionLevel,
      1,
      100,
    ),
    colorFadeStrength: cleanRange(
      raw.colorFadeStrength,
      DEFAULT_PHOTO_ENHANCEMENT.colorFadeStrength,
      0,
      100,
    ),
    headingAr: cleanText(raw.headingAr, DEFAULT_PHOTO_ENHANCEMENT.headingAr),
    headingEn: cleanText(raw.headingEn, DEFAULT_PHOTO_ENHANCEMENT.headingEn),
    descriptionAr: cleanText(raw.descriptionAr, DEFAULT_PHOTO_ENHANCEMENT.descriptionAr),
    descriptionEn: cleanText(raw.descriptionEn, DEFAULT_PHOTO_ENHANCEMENT.descriptionEn),
    primaryCtaHref: cleanPath(raw.primaryCtaHref, DEFAULT_PHOTO_ENHANCEMENT.primaryCtaHref),
    secondaryCtaHref: cleanPath(raw.secondaryCtaHref, DEFAULT_PHOTO_ENHANCEMENT.secondaryCtaHref),
  };
}

export function usePhotoEnhancementSettings() {
  const query = useQuery({
    queryKey: ["photo-enhancement-settings"],
    staleTime: 60_000,
    queryFn: async (): Promise<PhotoEnhancementSettings> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", PHOTO_ENHANCEMENT_KEY)
        .maybeSingle();
      if (error) throw error;
      return normalizePhotoEnhancementSettings(data?.value);
    },
  });
  return query.data ?? DEFAULT_PHOTO_ENHANCEMENT;
}

function cleanText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function cleanUrl(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  if (value.includes(LEGACY_WEDDING_DEMO)) return fallback;
  return /^https?:\/\//.test(value) || value.startsWith("/") ? value : fallback;
}

function cleanOptionalUrl(value: unknown) {
  if (typeof value !== "string" || !value) return undefined;
  if (value.includes(LEGACY_WEDDING_DEMO)) return undefined;
  return /^https?:\/\//.test(value) || value.startsWith("/") ? value : undefined;
}

function cleanPath(value: unknown, fallback: string) {
  return typeof value === "string" && value.startsWith("/") ? value : fallback;
}

function cleanRatio(value: unknown, fallback: number) {
  const ratio = Number(value);
  return Number.isFinite(ratio) && ratio > 0.4 && ratio < 3 ? ratio : fallback;
}

function cleanPercent(value: unknown) {
  const percent = Number(value);
  return Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 50;
}

function cleanRange(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}
