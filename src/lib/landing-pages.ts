/**
 * Ad Campaign Landing Pages — types and helpers.
 * Landing pages target a specific audience (movies/anime/music/cars/decor),
 * are edited from the Admin Dashboard, and used as destinations for Meta Ads.
 */
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { getLandingBundlePublic } from "@/lib/db-public.functions";

export const AUDIENCE_KEYS = ["movies", "anime", "music", "cars", "decor"] as const;
export type AudienceKey = (typeof AUDIENCE_KEYS)[number];

export const AUDIENCE_LABEL: Record<AudienceKey, { ar: string; en: string }> = {
  movies: { ar: "أفلام ومسلسلات", en: "Movies & TV" },
  anime: { ar: "أنمي", en: "Anime" },
  music: { ar: "ميوزك", en: "Music" },
  cars: { ar: "عربيات", en: "Cars" },
  decor: { ar: "ديكور", en: "Home Decor" },
};

export type LandingPage = {
  id: string;
  audience_key: AudienceKey;
  visible: boolean;
  title_ar: string | null;
  title_en: string | null;
  subtitle_ar: string | null;
  subtitle_en: string | null;
  hero_image: string | null;
  whatsapp_message: string | null;
  cta_text: string | null;
  source_category_id: string | null;
  display_mode: "manual" | "category" | "smart_mix";
  poster_limit: number;
  seo_title: string | null;
  meta_description: string | null;
  updated_at: string;
};

export type LandingPoster = {
  id: string;
  title: string;
  image_url: string | null;
  category_id: string | null;
  sales_count: number | null;
  views_count: number | null;
  sort_order?: number;
  pinned?: boolean;
};

export type LandingBundle = { page: LandingPage; posters: LandingPoster[] } | null;

export function landingPath(audience: AudienceKey) {
  return `/landing/${audience}`;
}

export function landingUtmUrl(origin: string, audience: AudienceKey) {
  return `${origin}/landing/${audience}?utm_source=meta&utm_medium=messages&utm_campaign=${audience}_ads`;
}

/** Persist audience attribution for later tracking (orders/leads). */
export function persistAudienceAttribution(audience: string, params: URLSearchParams) {
  if (typeof window === "undefined") return;
  try {
    const payload = {
      audience_type: audience,
      utm_source: params.get("utm_source") || "direct",
      utm_medium: params.get("utm_medium") || "",
      utm_campaign: params.get("utm_campaign") || "",
      landing_page: `/landing/${audience}`,
      first_visit_time: new Date().toISOString(),
    };
    const existing = window.localStorage.getItem("brw-audience");
    if (!existing) {
      window.localStorage.setItem("brw-audience", JSON.stringify(payload));
    }
    window.sessionStorage.setItem("brw-audience-current", JSON.stringify(payload));
  } catch {
    /* noop */
  }
}

export function getAudienceAttribution(): Record<string, string> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("brw-audience");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Client fetch of a landing page bundle (page + posters). */
export function useLandingBundle(audience: string) {
  return useQuery({
    queryKey: ["landing-bundle", audience],
    queryFn: async (): Promise<LandingBundle> => {
      return (await getLandingBundlePublic({ data: { audience } })) as unknown as LandingBundle;
    },
    staleTime: 60_000,
  });
}

/** Fetch all landing pages (admin manager). */
export function useAllLandingPages() {
  return useQuery({
    queryKey: ["landing-pages-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("landing_pages")
        .select("*")
        .order("audience_key", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as LandingPage[];
    },
  });
}

/** Return the list of audience keys a specific poster belongs to (for badges). */
export function usePosterAudiences(posterId: string | null | undefined) {
  return useQuery({
    queryKey: ["poster-audiences", posterId],
    queryFn: async () => {
      if (!posterId) return [] as AudienceKey[];
      const { data, error } = await supabase
        .from("landing_page_posters")
        .select("landing_page:landing_pages(audience_key)")
        .eq("poster_id", posterId);
      if (error) throw error;
      return ((data ?? []) as Array<{ landing_page: { audience_key: AudienceKey } | null }>)
        .map((r) => r.landing_page?.audience_key)
        .filter((v): v is AudienceKey => !!v);
    },
    enabled: !!posterId,
    staleTime: 30_000,
  });
}
