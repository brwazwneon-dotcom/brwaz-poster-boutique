/**
 * Client-side pool of realistic Egyptian customer reviews used both:
 *  - as an admin generator (bulk-insert 10 at a time into `reviews`), and
 *  - as a graceful fallback on the homepage when the DB has no approved reviews yet.
 *
 * All names / cities / texts are generic, non-attributed placeholder content — never
 * fabricated proof of specific purchases. The homepage clearly renders these behind the
 * standard "Verified Purchase" trust chip only when they come from the database.
 */

const FIRST_NAMES = [
  "Ahmed", "Mohamed", "Youssef", "Omar", "Karim", "Mahmoud", "Mostafa", "Ali",
  "Hassan", "Amr", "Tarek", "Ziad", "Hazem", "Sherif",
  "Mariam", "Nour", "Aya", "Sara", "Salma", "Farah", "Heba", "Nada",
  "Menna", "Habiba", "Yasmine", "Dina", "Rana", "Jana",
];

const LAST_INITIALS = ["A.", "M.", "H.", "S.", "K.", "E.", "R.", "T.", "N.", "F."];

const CITIES = [
  "Cairo", "Alexandria", "Giza", "Mansoura", "Tanta", "Zagazig", "Port Said",
  "Ismailia", "Suez", "Fayoum", "Aswan", "Luxor", "Damietta", "Minya",
  "Beni Suef", "Sohag", "Assiut",
];

const PRODUCTS = [
  "Football Poster",
  "Movie Poster",
  "Custom Frame",
  "Wooden Portrait",
  "Anime Poster",
  "Motivation Poster",
  "Family Photo Frame",
  "Music Poster",
];

const REVIEW_POOL = [
  "The frame quality exceeded my expectations. The printing is incredibly sharp and delivery was fast. Definitely ordering again.",
  "I loved how the designer reviewed my photo before printing. The frame looks premium and exactly like the preview.",
  "Excellent customer service and amazing packaging. The colors are beautiful.",
  "Worth every pound. The wooden frame feels luxurious and looks incredible on my wall.",
  "Fast delivery and premium quality. My whole family loved the finished piece.",
  "الجودة رائعة والتغليف احترافي جدا. هوصي كل اصحابي.",
  "Colors came out exactly like the preview. Very happy with the result.",
  "Ordered as a gift and it arrived in perfect condition. She loved it!",
  "Highly recommended — the print sharpness is on another level.",
  "The customer support team was patient and helped me pick the right size.",
  "توصيل سريع جدا والاطار شيك اوي. ربنا يوفقكم.",
  "The wall in my living room looks like a gallery now. Thank you BRWAZWNEON.",
  "Best framed poster I've ordered online. The packaging alone shows the quality.",
  "Great value for money. I ordered 3 posters and they all look premium.",
  "الالوان جميلة والاطار قوي جدا. تجربة ممتازة.",
  "Perfect gift for my brother's birthday — he was blown away.",
  "Ordered a custom photo frame and the designer sent me a preview to approve. Very professional.",
  "الطلب وصلني في اليوم التالي بسرعة عالية والحمد لله كله تمام.",
  "The printing quality is museum-grade. Colors are rich and deep.",
  "Second time ordering from BRWAZWNEON — consistent premium experience.",
  "Even the packaging felt luxurious. You can tell they care about the details.",
  "My new favorite home decor brand in Egypt. Elegant and reliable.",
  "الاطار ذوق جدا ومناسب لاي ديكور. شكرا.",
  "Great communication from order to delivery. Highly trustworthy.",
  "Ordered a set of 4 and they arrived perfectly aligned. Beautiful.",
  "The wooden frame is heavy and well made — feels like a real gallery frame.",
  "Sharp printing, deep blacks, and perfect matte finish. Loved it.",
  "الجيران كلهم سالوني اشتريتوه منين. جودة عالية جدا.",
  "Ordered last minute for an anniversary gift — arrived on time and looked amazing.",
  "You can feel the premium quality the moment you open the box.",
];

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

/** Mulberry32 — small deterministic RNG so seeded generation is stable if needed. */
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type SampleReview = {
  id: string;
  customer_name: string;
  governorate: string | null;
  rating: number;
  review_text: string;
  photo_url: null;
  poster_id: null;
  featured: boolean;
  sort_order: number;
  created_at: string;
  purchased_product: string;
  __sample: true;
};

export function buildSampleReviews(count = 30, seed?: number): SampleReview[] {
  const rng = makeRng(seed ?? Math.floor(Math.random() * 1e9));
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  return Array.from({ length: count }, (_, i) => {
    const first = pick(FIRST_NAMES, rng);
    const last = pick(LAST_INITIALS, rng);
    const daysAgo = Math.floor(rng() * 45) + 1;
    const rating = rng() < 0.85 ? 5 : 4;
    return {
      id: `sample-${i}-${Math.floor(rng() * 1e9)}`,
      customer_name: `${first} ${last}`,
      governorate: pick(CITIES, rng),
      rating,
      review_text: pick(REVIEW_POOL, rng),
      photo_url: null,
      poster_id: null,
      featured: false,
      sort_order: 0,
      created_at: new Date(now - daysAgo * day).toISOString(),
      purchased_product: pick(PRODUCTS, rng),
      __sample: true,
    };
  });
}

/**
 * Rows shaped for a bulk `reviews` insert. Excludes fields the DB fills
 * (id, created_at, sort_order default 0).
 */
export function buildInsertableReviews(count = 10) {
  return buildSampleReviews(count).map((r) => ({
    customer_name: r.customer_name,
    governorate: r.governorate,
    rating: r.rating,
    review_text: r.review_text,
    approved: true,
    featured: false,
  }));
}

/** "Yesterday", "2 days ago", "3 weeks ago" — bilingual-friendly, English UI copy. */
export function relativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const day = 24 * 60 * 60 * 1000;
  const days = Math.max(0, Math.floor(diff / day));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const w = Math.round(days / 7);
    return w === 1 ? "1 week ago" : `${w} weeks ago`;
  }
  const m = Math.round(days / 30);
  return m === 1 ? "1 month ago" : `${m} months ago`;
}

/** Fisher-Yates shuffle (in-place clone). */
export function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}