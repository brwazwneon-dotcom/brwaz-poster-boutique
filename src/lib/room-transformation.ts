import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", ROOM_TRANSFORMATION_KEY)
        .maybeSingle();
      if (error) throw error;
      return normalizeRoomSettings(data?.value);
    },
  });
  return q.data ?? DEFAULT_ROOM_TRANSFORMATION;
}

export function useRoomTransformationArtwork(settings: RoomTransformationSettings) {
  return useQuery({
    queryKey: ["room-transformation-artwork", settings.posterId],
    enabled: settings.enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<RoomArtwork | null> => {
      const posterId = settings.posterId ?? (await findDefaultPosterId());
      if (!posterId) return null;
      const selected = await loadPosterArtwork(posterId);
      return selected ?? (await loadFallbackArtwork(posterId));
    },
  });
}

export async function findDefaultPosterId(): Promise<string | null> {
  const { data: best } = await supabase
    .from("best_sellers")
    .select("poster_id,hidden,posters!inner(id,title,hidden)")
    .eq("hidden", false)
    .order("pinned", { ascending: false })
    .order("position", { ascending: true })
    .limit(24);
  const { data: trending } = await supabase
    .from("posters")
    .select("id,title,hidden")
    .eq("trending", true)
    .eq("hidden", false)
    .limit(24);

  const candidates = [
    ...(
      (best ?? []) as Array<{
        poster_id: string;
        posters: { title: string; hidden: boolean } | null;
      }>
    ).map((row, index) => ({
      id: row.poster_id,
      title: row.posters?.title ?? "",
      hidden: row.posters?.hidden ?? true,
      sourceBoost: 40 - index,
    })),
    ...((trending ?? []) as Array<{ id: string; title: string; hidden: boolean }>).map(
      (row, index) => ({
        id: row.id,
        title: row.title,
        hidden: row.hidden,
        sourceBoost: 24 - index,
      }),
    ),
  ].filter((row) => row.id && !row.hidden);

  const ids = Array.from(new Set(candidates.map((row) => row.id)));
  const { data: variants } = ids.length
    ? await supabase
        .from("image_variants")
        .select("source_id")
        .eq("source_table", "posters")
        .eq("status", "done")
        .in("source_id", ids)
        .in("variant", ["medium_webp", "medium_avif", "small_webp", "small_avif"])
    : { data: [] };
  const withImage = new Set((variants ?? []).map((row) => String(row.source_id)));
  const ranked = candidates
    .filter((row) => withImage.has(row.id))
    .sort((a, b) => scorePoster(b.title, b.sourceBoost) - scorePoster(a.title, a.sourceBoost));
  if (ranked[0]) return ranked[0].id;
  const { data: posters } = await supabase
    .from("posters")
    .select("id")
    .eq("hidden", false)
    .limit(1);
  return posters?.[0]?.id ?? null;
}

export async function loadPosterArtwork(posterId: string): Promise<RoomArtwork | null> {
  const [{ data: poster }, { data: rows }] = await Promise.all([
    supabase.from("posters").select("id,title,hidden").eq("id", posterId).maybeSingle(),
    supabase
      .from("image_variants")
      .select("source_id,url,variant")
      .eq("source_table", "posters")
      .eq("status", "done")
      .eq("source_id", posterId)
      .in("variant", [
        "thumb_avif",
        "thumb_webp",
        "small_avif",
        "small_webp",
        "medium_avif",
        "medium_webp",
        "thumb",
        "small",
        "medium",
      ]),
  ]);
  if (!poster || poster.hidden) return null;
  const image = responsiveImageFromRows(
    (rows ?? []) as Array<{ url: string | null; variant: string | null }>,
  );
  if (!image) return null;
  return { posterId: poster.id, title: poster.title, image };
}

async function loadFallbackArtwork(excludeId: string): Promise<RoomArtwork | null> {
  const { data: rows } = await supabase
    .from("image_variants")
    .select("source_id,url,variant")
    .eq("source_table", "posters")
    .eq("status", "done")
    .neq("source_id", excludeId)
    .in("variant", [
      "medium_webp",
      "medium_avif",
      "small_webp",
      "small_avif",
      "thumb_webp",
      "thumb_avif",
    ])
    .limit(120);
  const grouped = new Map<string, Array<{ url: string | null; variant: string | null }>>();
  for (const row of (rows ?? []) as Array<{
    source_id: string;
    url: string | null;
    variant: string | null;
  }>) {
    if (!row.source_id) continue;
    if (!grouped.has(row.source_id)) grouped.set(row.source_id, []);
    grouped.get(row.source_id)!.push({ url: row.url, variant: row.variant });
  }
  const ids = Array.from(grouped.keys()).slice(0, 80);
  const { data: posters } = ids.length
    ? await supabase
        .from("posters")
        .select("id,title,hidden,categories(name,slug)")
        .in("id", ids)
        .eq("hidden", false)
    : { data: [] };
  const titleById = new Map(
    (posters ?? []).map((poster) => [
      poster.id,
      `${poster.title} ${poster.categories?.name ?? ""} ${poster.categories?.slug ?? ""}`,
    ]),
  );
  const rankedIds = ids
    .filter((id) => titleById.has(id))
    .sort(
      (a, b) => scorePoster(titleById.get(b) ?? "", 0) - scorePoster(titleById.get(a) ?? "", 0),
    );
  for (const posterId of rankedIds) {
    const variants = grouped.get(posterId) ?? [];
    const image = responsiveImageFromRows(variants);
    if (image) return { posterId, title: titleById.get(posterId) ?? "Featured artwork", image };
  }
  return null;
}

function responsiveImageFromRows(
  rows: Array<{ url: string | null; variant: string | null }>,
): ResponsivePosterImage | null {
  const found: Record<string, string> = {};
  for (const row of rows) {
    const key = String(row.variant ?? "");
    const url = String(row.url ?? "");
    if (!url || url.startsWith("data:")) continue;
    found[key] = url;
  }
  const src =
    found.medium_webp ??
    found.small_webp ??
    found.thumb_webp ??
    found.medium ??
    found.small ??
    found.thumb;
  if (!src) return null;
  const avifSrcSet = [
    found.thumb_avif ? `${found.thumb_avif} 240w` : "",
    found.small_avif ? `${found.small_avif} 480w` : "",
    found.medium_avif ? `${found.medium_avif} 800w` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const webpSrcSet = [
    found.thumb_webp || found.thumb ? `${found.thumb_webp ?? found.thumb} 240w` : "",
    found.small_webp || found.small ? `${found.small_webp ?? found.small} 480w` : "",
    found.medium_webp || found.medium ? `${found.medium_webp ?? found.medium} 800w` : "",
  ]
    .filter(Boolean)
    .join(", ");
  return {
    src,
    avifSrcSet: avifSrcSet || undefined,
    webpSrcSet: webpSrcSet || undefined,
    sizes: "(max-width: 640px) 72vw, 360px",
  };
}

function cleanText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 180) : fallback;
}

function scorePoster(title: string, sourceBoost: number) {
  const lower = title.toLowerCase();
  const keywords = [
    ["messi", 80],
    ["cristiano", 78],
    ["ronaldo", 78],
    ["salah", 74],
    ["pedri", 68],
    ["football", 50],
    ["soccer", 50],
    ["barcelona", 42],
    ["real madrid", 42],
    ["ferrari", 62],
    ["porsche", 62],
    ["lamborghini", 62],
    ["car", 42],
    ["movie", 44],
    ["cinematic", 48],
    ["film", 38],
    ["batman", 34],
    ["spider", 34],
    ["marvel", 32],
  ] as const;
  const penalty =
    /black\s*and\s*white|monochrome|bw|b&w|white\s+black|anime|typography|quote|text poster|juventus/.test(
      lower,
    )
      ? 120
      : 0;
  return (
    sourceBoost +
    keywords.reduce((total, [keyword, value]) => total + (lower.includes(keyword) ? value : 0), 0) -
    penalty
  );
}
