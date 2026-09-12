import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getApprovedReviewsPublic } from "@/lib/db-public.functions";
import { SafeImage } from "@/components/SafeImage";
import { Star, BadgeCheck, Quote } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildSampleReviews, relativeDate, shuffle } from "@/lib/sample-reviews";

type Review = {
  id: string;
  customer_name: string;
  governorate: string | null;
  rating: number;
  review_text: string | null;
  photo_url: string | null;
  poster_id: string | null;
  featured: boolean;
  sort_order: number;
  created_at: string;
  /** Optional per-review purchased product label (falls back to a rotating default). */
  purchased_product?: string;
  /** Internal flag for pool fallbacks — hides the DB-only "verified" chip. */
  __sample?: boolean;
};

export function CustomerReviews({
  posterId,
  title,
  subtitle,
  limit = 12,
}: {
  posterId?: string;
  title?: string;
  subtitle?: string;
  limit?: number;
}) {
  const { t } = useTranslation();
  const displayTitle = title ?? t("reviews.defaultTitle");
  const displaySubtitle = subtitle ?? t("reviews.defaultSubtitle");
  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["reviews", "approved", posterId ?? "all", limit],
    queryFn: async () => {
      return getApprovedReviewsPublic({
        data: { posterId: posterId ?? null, limit },
      }) as Promise<Review[]>;
    },
  });

  // Smart display: featured first, then shuffle the rest. Shuffle result is
  // stable across a single mount but re-randomises on every page load so the
  // same visitor doesn't see the same first three cards every time.
  const displayed = useMemo<Review[]>(() => {
    if (isLoading) return [];
    if (reviews.length > 0) {
      const featured = reviews.filter((r) => r.featured);
      const rest = shuffle(reviews.filter((r) => !r.featured));
      return [...featured, ...rest].slice(0, limit);
    }
    // Fallback pool — never persisted, no "Verified" chip.
    return buildSampleReviews(Math.max(limit, 12)) as unknown as Review[];
  }, [reviews, isLoading, limit]);

  // Aggregate stats read from ALL approved DB rows (or the pool as a floor)
  // to power the trust ribbon under the heading.
  const stats = useMemo(() => {
    const source = reviews.length > 0 ? reviews : displayed;
    if (source.length === 0) return { avg: 5, count: 0 };
    const sum = source.reduce((s, r) => s + (r.rating || 0), 0);
    return { avg: sum / source.length, count: source.length };
  }, [reviews, displayed]);

  // Small entrance stagger, but never gate visibility on IntersectionObserver —
  // some environments (embedded iframes, background tabs) never fire it and the
  // whole section would stay invisible. Show reviews immediately.
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setInView(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (displayed.length === 0) return null;

  return (
    <section className="relative border-t border-border bg-background">
      {/* Ambient gold glow — matches the site's black + gold luxury palette */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-[0.08]"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 0%, hsl(var(--primary) / 0.6), transparent 70%)",
        }}
      />
      <div ref={sectionRef} className="container-page relative py-16 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <div
            className={cn(
              "inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.5em] text-muted-foreground transition-all duration-500",
              inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
            )}
          >
            <span className="h-px w-6 bg-primary/60" />
            {t("reviews.kicker")}
            <span className="h-px w-6 bg-primary/60" />
          </div>
          <h2
            className={cn(
              "text-display mt-4 text-4xl leading-tight sm:text-5xl md:text-6xl transition-all duration-500 delay-75",
              inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
            )}
          >
            {displayTitle}
          </h2>
          <div className="mt-4 flex items-center justify-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={cn(
                  "h-5 w-5",
                  i < Math.round(stats.avg)
                    ? "fill-primary text-primary"
                    : "text-muted-foreground/40",
                )}
              />
            ))}
          </div>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">{displaySubtitle}</p>
        </div>

        {/* Desktop / tablet grid */}
        <div className="mt-12 hidden gap-6 sm:grid sm:grid-cols-2 lg:grid-cols-3">
          {displayed.map((r, i) => (
            <ReviewCard key={r.id} review={r} index={i} parentInView={inView} />
          ))}
        </div>

        {/* Mobile horizontal swipe carousel */}
        <MobileCarousel reviews={displayed} />
      </div>
    </section>
  );
}

function MobileCarousel({ reviews }: { reviews: Review[] }) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement | null>(null);
  return (
    <div className="mt-10 sm:hidden">
      <div
        ref={trackRef}
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {reviews.map((r, i) => (
          <div key={r.id} className="w-[85%] shrink-0 snap-center first:pl-0 last:pr-2">
            <ReviewCard review={r} index={i} parentInView compact />
          </div>
        ))}
      </div>
      <div className="mt-2 text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        {t("reviews.swipeHint")}
      </div>
    </div>
  );
}

// Rotating placeholder products for cards that don't carry an explicit label.
// Values are i18n key suffixes under "reviews.*", translated at render time.
const PRODUCT_ROTATION_KEYS = [
  "productFootball",
  "productMovie",
  "productCustomFrame",
  "productWoodenPortrait",
  "productFamilyPhotoFrame",
] as const;

function ReviewCard({
  review,
  index,
  parentInView,
  compact,
}: {
  review: Review;
  index: number;
  parentInView: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const verified = !review.__sample;
  const product =
    review.purchased_product ??
    t(`reviews.${PRODUCT_ROTATION_KEYS[index % PRODUCT_ROTATION_KEYS.length]}`);
  const delayMs = Math.min(index, 5) * 80;

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col gap-4 overflow-hidden rounded-lg border border-border/70 bg-card/60 p-6 backdrop-blur-sm transition-all duration-500 ease-out",
        "hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_20px_50px_-25px_hsl(var(--primary)/0.55)]",
        parentInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
        compact && "h-full",
      )}
      style={{
        transitionDelay: parentInView ? `${delayMs}ms` : "0ms",
        willChange: "transform, opacity",
      }}
    >
      {/* Glossy top edge — subtle gold sheen */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent, hsl(var(--primary) / 0.6), transparent)",
        }}
      />

      {review.featured && (
        <div className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-widest text-primary ring-1 ring-primary/40">
          ★ {t("common.featured")}
        </div>
      )}

      <Quote
        aria-hidden="true"
        className="absolute -right-2 -top-2 h-24 w-24 text-primary/[0.06]"
      />

      <div className="flex items-center gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={cn(
              "h-4 w-4 drop-shadow-[0_0_6px_hsl(var(--primary)/0.35)]",
              i < review.rating ? "fill-primary text-primary" : "text-muted-foreground/30",
            )}
          />
        ))}
      </div>

      {review.photo_url && (
        <div className="aspect-[4/3] overflow-hidden rounded-md bg-muted ring-1 ring-border">
          <SafeImage
            src={review.photo_url}
            alt={t("reviews.customerPhotoAlt", { name: review.customer_name })}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        </div>
      )}

      {review.review_text && (
        <p className="relative text-[15px] leading-relaxed text-foreground/90">
          <span className="text-primary/70">“</span>
          {review.review_text}
          <span className="text-primary/70">”</span>
        </p>
      )}

      <div className="mt-auto space-y-3 pt-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Avatar name={review.customer_name} />
              <span>{review.customer_name}</span>
            </div>
            {review.governorate && (
              <div className="mt-1 pl-10 text-[11px] uppercase tracking-widest text-muted-foreground">
                {review.governorate}
              </div>
            )}
          </div>
          <div className="text-right text-[10px] uppercase tracking-widest text-muted-foreground">
            {relativeDate(review.created_at)}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          {verified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary ring-1 ring-primary/30">
              <BadgeCheck className="h-3 w-3" /> {t("reviews.verifiedPurchase")}
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("reviews.purchasedProduct", { product })}
          </span>
        </div>
      </div>
    </article>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  // Deterministic hue per name so the same customer always gets the same avatar tint.
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-foreground ring-1 ring-primary/30"
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 40% 22%), hsl(${(hue + 40) % 360} 30% 12%))`,
      }}
    >
      {initials || "★"}
    </span>
  );
}
