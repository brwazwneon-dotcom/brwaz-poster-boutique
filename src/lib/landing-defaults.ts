/**
 * Built-in landing pages for the two campaign audiences (see audience.ts).
 *
 * Why built in: the campaign pages must work the day the ads start, with nothing to set up. Until an admin saves a
 * landing page with the same key (/landing/youth, /landing/album) in the dashboard, these are shown; as soon as one is
 * saved and visible, it replaces the built-in one. The built-in text is a first draft, written to be edited.
 *
 * Pure: no network here. The two fetchers are passed in, so the fallback rules are testable without a server.
 */
import type { LandingBundle, LandingPage, LandingPoster } from "@/lib/landing-pages";
import { AUDIENCES, parseAudience, type Audience } from "@/lib/audience";

/** "posters": a poster grid like every landing page. "photo": a page that sends people to photo printing. */
export type LandingKind = "posters" | "photo";

export type DefaultLanding = { kind: LandingKind; page: LandingPage };

export const DEFAULT_ID_PREFIX = "default-";

const base = (audience: Audience): Omit<LandingPage, "title_ar" | "title_en"> => ({
  id: `${DEFAULT_ID_PREFIX}${audience}`,
  // The landing route accepts any key (not only the five legacy AudienceKey values); the type is narrower than the data.
  audience_key: audience as unknown as LandingPage["audience_key"],
  visible: true,
  subtitle_ar: null,
  subtitle_en: null,
  hero_image: null,
  whatsapp_message: null,
  cta_text: null,
  source_category_id: null,
  display_mode: "smart_mix",
  poster_limit: 24,
  seo_title: null,
  meta_description: null,
  updated_at: "",
});

const DEFAULTS: Record<Audience, DefaultLanding> = {
  youth: {
    kind: "posters",
    page: {
      ...base("youth"),
      title_ar: "بوسترات مطرقعة تفرق في أوضتك",
      title_en: "Bold & Quirky Posters",
      subtitle_ar: "تصاميم مجنونة وأشكال غريبة... خلّي حيطتك تتكلم عنك.",
      subtitle_en: "Loud, unusual designs for your wall",
      cta_text: "اطلب عبر واتساب",
      whatsapp_message: "أهلًا، عايز أطلب بوستر مطرقع من BRWAZWNEON.",
      seo_title: "Bold & Quirky Framed Posters — BRWAZWNEON",
      meta_description:
        "Loud, unusual framed posters for your room. Choose your design and size. Delivery across Egypt.",
    },
  },
  album: {
    kind: "photo",
    page: {
      ...base("album"),
      title_ar: "صورك في ألبوم... مش على الموبايل",
      title_en: "Print Your Photos",
      subtitle_ar: "اطبع صورك بجودة عالية واحتفظ بيها في ألبوم بدل ما تفضل ضايعة في الموبايل.",
      subtitle_en: "Keep your memories in an album, not on your phone",
      cta_text: "ابدأ اطبع صورك",
      whatsapp_message: "أهلًا، عايز أطبع صوري وأحتفظ بيها في ألبوم.",
      seo_title: "Print Your Photos & Keep Them in an Album — BRWAZWNEON",
      meta_description:
        "Print lots of photos in high quality and keep them in an album instead of on your phone. Delivery across Egypt.",
    },
  },
};

/** The built-in page for a campaign audience, or null for any other landing key. */
export function getDefaultLanding(key: string): DefaultLanding | null {
  const audience = parseAudience(key);
  return audience ? DEFAULTS[audience] : null;
}

/** True when this page is the built-in one (not saved by an admin). */
export function isDefaultLanding(page: Pick<LandingPage, "id"> | null | undefined): boolean {
  return !!page && page.id.startsWith(DEFAULT_ID_PREFIX);
}

/** Landing keys that always have a page (the campaign audiences). */
export const BUILT_IN_LANDING_KEYS: readonly string[] = AUDIENCES;

type PosterRow = {
  id: string;
  title: string;
  image_url: string | null;
  category_id: string | null;
  sales_count?: number | null;
  views_count?: number | null;
  sort_order?: number;
  pinned?: boolean;
};

export type LandingFetchers = {
  /** The admin-saved landing page and its posters (null when none is visible). May throw (e.g. the table is missing). */
  fetchBundle: (audience: string) => Promise<LandingBundle>;
  /** Posters to show on a built-in poster page, best first (trending, then best sellers). */
  fetchPosters: () => Promise<PosterRow[]>;
};

const toLandingPoster = (p: PosterRow): LandingPoster => ({
  id: p.id,
  title: p.title,
  image_url: p.image_url,
  category_id: p.category_id,
  sales_count: p.sales_count ?? null,
  views_count: p.views_count ?? null,
  ...(p.sort_order !== undefined ? { sort_order: p.sort_order } : {}),
  ...(p.pinned !== undefined ? { pinned: p.pinned } : {}),
});

/**
 * The page to show for /landing/<audience>:
 *  1. the admin's page, when one is saved and visible;
 *  2. otherwise, for the two campaign audiences, the built-in page (with posters for the poster kind);
 *  3. otherwise null (the route then says the page is unavailable).
 * A failing fetch is never an error for the visitor: it only means "use the built-in page".
 */
export async function resolveLandingBundle(
  audience: string,
  fetchers: LandingFetchers,
): Promise<LandingBundle> {
  let saved: LandingBundle = null;
  try {
    saved = await fetchers.fetchBundle(audience);
  } catch {
    saved = null;
  }
  if (saved) return saved;

  const fallback = getDefaultLanding(audience);
  if (!fallback) return null;
  if (fallback.kind === "photo") return { page: fallback.page, posters: [] };

  let posters: PosterRow[] = [];
  try {
    posters = await fetchers.fetchPosters();
  } catch {
    posters = [];
  }
  const limit = Math.max(1, fallback.page.poster_limit);
  return { page: fallback.page, posters: posters.slice(0, limit).map(toLandingPoster) };
}
