// Shared types and helpers used by more than one admin tab module.
// Extracted verbatim from the former monolithic src/routes/admin.lazy.tsx
// (no logic changes) — see the module split in the Business OS Phase 1 plan.

// Build a wa.me link to a CUSTOMER's own number (not the business line —
// see src/lib/whatsapp.ts's whatsappLink, which always targets the
// business number and is unrelated to this admin-side use).
export function customerWhatsappLink(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("0") ? `2${digits}` : digits.startsWith("20") ? digits : `20${digits}`;
  return `https://wa.me/${intl}`;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export type AdminCategory = {
  id: string;
  name: string;
  name_ar?: string | null;
  slug: string;
  description?: string | null;
  image: string | null;
  hidden: boolean;
  featured: boolean;
  sort_order: number;
  show_in_header?: boolean;
  show_in_collections?: boolean;
  parent_id?: string | null;
};

export type AdminPoster = {
  id: string;
  title: string;
  slug: string;
  description?: string | null;
  image_url: string;
  category_id: string | null;
  badge: string | null;
  hidden: boolean;
  featured: boolean;
  trending: boolean;
  is_best_seller: boolean;
  tags?: string[];
  seo_title?: string | null;
  seo_description?: string | null;
  alt_text?: string | null;
  review_status: string;
};

export type AdminHeroBanner = {
  id: string;
  image_url: string;
  title: string | null;
  subtitle: string | null;
  button_text: string | null;
  button_link: string | null;
  enabled: boolean;
  sort_order: number;
  webp_srcset?: string | null;
  avif_srcset?: string | null;
};

export type AdminSliderImage = {
  id: string;
  image_url: string;
  title: string | null;
  link_url: string | null;
  sort_order: number;
  enabled: boolean;
  webp_srcset?: string | null;
  avif_srcset?: string | null;
};

export type AdminHighlight = {
  id: string;
  key: string;
  title: string;
  image_url: string | null;
  link: string;
  sort_order: number;
  enabled: boolean;
};

export type AdminSet = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  frames_count: number;
  price: number;
  old_price: number | null;
  enabled: boolean;
  featured: boolean;
  sort_order: number;
};

export type AdminCustomOffer = {
  id: string;
  title: string;
  subtitle: string | null;
  size: string;
  count: number;
  price: number;
  image_url: string | null;
  badge: string | null;
  sort_order: number;
  enabled: boolean;
};

export type AdminBeforeAfter = {
  id: string;
  title: string | null;
  description: string | null;
  before_url: string;
  after_url: string;
  location: string;
  sort_order: number;
  active: boolean;
};

export type AdminLandingPage = {
  id: string;
  audience_key: string;
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
  manual_poster_ids: string[];
  seo_title: string | null;
  meta_description: string | null;
};
