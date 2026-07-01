import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Heart, Trash2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWishlist } from "@/lib/wishlist";
import { useCart } from "@/lib/cart";
import { useCategories } from "@/lib/use-categories";
import { FramePreview } from "@/components/FramePreview";
import { usePricing, priceForFrame } from "@/lib/use-settings";
import { DEFAULT_EDIT_SETTINGS, normalizeEditSettings } from "@/lib/poster-edit";

export const Route = createFileRoute("/wishlist")({
  head: () => ({
    meta: [
      { title: "Your Wishlist — BRWAZWNEON" },
      { name: "description", content: "Posters you've saved for later." },
    ],
  }),
  component: WishlistPage,
});

type WPoster = {
  id: string;
  title: string;
  image_url: string;
  category_id: string | null;
  edit_settings?: unknown;
};

function WishlistPage() {
  const { ids, remove, clear, count } = useWishlist();
  const idList = [...ids];
  const { data: categories = [] } = useCategories();
  const pricing = usePricing();
  const { add } = useCart();

  const previewPrice = priceForFrame(pricing, "pvc", "30x40");

  const { data: posters = [], isLoading } = useQuery({
    queryKey: ["wishlist-posters", idList.sort().join(",")],
    enabled: idList.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posters")
        .select("id,title,image_url,category_id,edit_settings")
        .in("id", idList);
      if (error) throw error;
      return (data ?? []) as WPoster[];
    },
  });

  if (count === 0) {
    return (
      <div className="container-page py-24 text-center">
        <Heart className="mx-auto h-12 w-12 text-muted-foreground" />
        <h1 className="text-display mt-6 text-4xl">Your Wishlist is Empty</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          Start exploring our collection and save your favorite posters.
        </p>
        <Link
          to="/"
          className="mt-8 inline-flex rounded-sm bg-primary px-6 py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90"
        >
          Browse Posters
        </Link>
      </div>
    );
  }

  const handleAdd = (p: WPoster) => {
    const cat = categories.find((c) => c.id === p.category_id);
    add({
      posterId: p.id,
      title: p.title,
      image: p.image_url,
      categoryId: p.category_id,
      categoryName: cat?.name ?? "Poster",
      frameType: "pvc",
      size: "30x40",
      color: "black",
      price: previewPrice,
      editSettings: normalizeEditSettings(p.edit_settings) ?? DEFAULT_EDIT_SETTINGS,
    });
    toast.success(`${p.title} added to cart`);
  };

  return (
    <div className="container-page py-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Saved for later
          </div>
          <h1 className="text-display text-4xl sm:text-5xl">Your Wishlist</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {count} saved poster{count === 1 ? "" : "s"}
          </p>
        </div>
        {count > 0 && (
          <button
            onClick={() => clear()}
            className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            Clear all
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {posters.map((p) => {
            const cat = categories.find((c) => c.id === p.category_id);
            return (
              <div
                key={p.id}
                className="overflow-hidden rounded-sm border border-border bg-card"
              >
                <div className="aspect-[3/4] overflow-hidden">
                  <FramePreview
                    posterUrl={p.image_url}
                    title={p.title}
                    editSettings={p.edit_settings}
                    aspectClassName="aspect-[3/4]"
                    bare
                    loading="lazy"
                    className="h-full w-full"
                  />
                </div>
                <div className="p-3">
                  <div className="truncate text-[10px] uppercase tracking-widest text-muted-foreground">
                    {cat?.name ?? "Poster"}
                  </div>
                  <div className="mt-2 text-sm">
                    {previewPrice} <span className="text-xs text-muted-foreground">EGP</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleAdd(p)}
                      className="inline-flex items-center justify-center gap-1 rounded-sm bg-primary px-2 py-2 text-[10px] font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90"
                    >
                      <ShoppingBag className="h-3 w-3" /> Add
                    </button>
                    <button
                      onClick={() => remove(p.id)}
                      className="inline-flex items-center justify-center gap-1 rounded-sm border border-border px-2 py-2 text-[10px] font-semibold uppercase tracking-widest hover:bg-accent"
                    >
                      <Trash2 className="h-3 w-3" /> Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}