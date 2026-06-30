import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SafeImage } from "@/components/SafeImage";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

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
};

export function CustomerReviews({
  posterId,
  title = "What Our Customers Say",
  limit = 12,
}: {
  posterId?: string;
  title?: string;
  limit?: number;
}) {
  const { data: reviews = [] } = useQuery({
    queryKey: ["reviews", "approved", posterId ?? "all", limit],
    queryFn: async () => {
      let q = supabase
        .from("reviews")
        .select("id,customer_name,governorate,rating,review_text,photo_url,poster_id,featured,sort_order,created_at")
        .eq("approved", true)
        .order("featured", { ascending: false })
        .order("sort_order", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (posterId) q = q.eq("poster_id", posterId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Review[];
    },
  });

  if (reviews.length === 0) return null;

  return (
    <section className="border-t border-border bg-background">
      <div className="container-page py-16">
        <div className="mb-10 flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">Reviews</p>
            <h2 className="text-display mt-3 text-4xl sm:text-5xl">{title}</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ReviewCard({ review }: { review: Review }) {
  return (
    <article className="relative flex flex-col gap-4 border border-border bg-card p-6">
      {review.featured && (
        <div className="absolute -top-3 left-4 inline-flex items-center gap-1 bg-primary px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary-foreground">
          ⭐ Featured Review
        </div>
      )}
      <div className="flex items-center gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={cn(
              "h-4 w-4",
              i < review.rating ? "fill-primary text-primary" : "text-muted-foreground/40",
            )}
          />
        ))}
      </div>
      {review.photo_url && (
        <div className="aspect-[4/3] overflow-hidden bg-muted">
          <SafeImage
            src={review.photo_url}
            alt={`${review.customer_name} photo`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      )}
      {review.review_text && (
        <p className="text-sm leading-relaxed text-foreground/90">"{review.review_text}"</p>
      )}
      <div className="mt-auto">
        <div className="text-sm font-semibold">{review.customer_name}</div>
        {review.governorate && (
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            {review.governorate}
          </div>
        )}
      </div>
    </article>
  );
}