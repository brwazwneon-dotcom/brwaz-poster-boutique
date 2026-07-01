import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SafeImage } from "@/components/SafeImage";
import { useCart } from "@/lib/cart";
import { toast } from "sonner";
import { whatsappLink } from "@/lib/whatsapp";
import { useState } from "react";

export const Route = createFileRoute("/sets")({
  head: () => ({
    meta: [
      { title: "Frame Sets — BRWAZWNEON" },
      { name: "description", content: "Curated frame bundles — 3, 4, and 6 frame sets for your wall." },
      { property: "og:title", content: "Frame Sets — BRWAZWNEON" },
    ],
  }),
  component: SetsPage,
});

type FrameSet = {
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

function SetsPage() {
  const { data: sets = [], isLoading } = useQuery({
    queryKey: ["sets", "public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sets")
        .select("*")
        .eq("enabled", true)
        .order("featured", { ascending: false })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as FrameSet[];
    },
  });

  return (
    <div className="bg-background text-foreground">
      <section className="border-b border-border">
        <div className="container-page py-16">
          <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">Curated bundles</p>
          <h1 className="text-display mt-3 text-5xl sm:text-7xl">Frame Sets</h1>
          <p className="mt-4 max-w-xl text-muted-foreground">
            Ready-made gallery walls. Each set is designed to look great together — pick one, we handle the rest.
          </p>
        </div>
      </section>

      <section className="container-page py-14">
        {isLoading ? (
          <div className="text-center text-sm text-muted-foreground">Loading sets…</div>
        ) : sets.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border p-14 text-center text-sm text-muted-foreground">
            New sets dropping soon.
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {sets.map((s) => (
              <SetCard key={s.id} set={s} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SetCard({ set }: { set: FrameSet }) {
  const { add } = useCart();
  const [open, setOpen] = useState(false);

  const addToCart = () => {
    add({
      posterId: set.id,
      title: `${set.name} (Set of ${set.frames_count})`,
      image: set.image_url ?? "",
      categoryId: null,
      categoryName: "Set",
      frameType: "pvc",
      size: "30x40",
      color: "black",
      price: Number(set.price) || 0,
    });
    toast.success("Set added to cart");
  };

  const wa = whatsappLink(
    `Hello BRWAZWNEON, I want to order the "${set.name}" set (${set.frames_count} frames) — ${set.price} EGP.`,
  );

  return (
    <div className="group flex flex-col overflow-hidden rounded-sm border border-border bg-card">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {set.image_url ? (
          <SafeImage src={set.image_url} alt={set.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-widest text-muted-foreground">
            {set.frames_count} frames
          </div>
        )}
        {set.featured ? (
          <span className="absolute left-3 top-3 rounded-sm bg-primary px-2 py-1 text-[10px] uppercase tracking-widest text-primary-foreground">
            Featured
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-display text-2xl leading-tight">{set.name}</h3>
            <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
              {set.frames_count} Frame{set.frames_count > 1 ? "s" : ""}
            </p>
          </div>
          <div className="text-right">
            {set.old_price && Number(set.old_price) > Number(set.price) ? (
              <div className="text-xs text-muted-foreground line-through">{set.old_price} EGP</div>
            ) : null}
            <div className="text-display text-2xl">{set.price}<span className="ml-1 text-xs uppercase tracking-widest text-muted-foreground">EGP</span></div>
          </div>
        </div>
        {set.description ? (
          <p className={`text-sm text-muted-foreground ${open ? "" : "line-clamp-2"}`}>{set.description}</p>
        ) : null}
        {set.description && set.description.length > 90 ? (
          <button onClick={() => setOpen((v) => !v)} className="self-start text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">
            {open ? "Hide details" : "View details"}
          </button>
        ) : null}
        <div className="mt-auto flex gap-2 pt-2">
          <button
            onClick={addToCart}
            className="flex-1 rounded-sm bg-primary px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90"
          >
            Add to Cart
          </button>
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="rounded-sm border border-border px-4 py-3 text-[10px] font-semibold uppercase tracking-widest hover:bg-accent"
          >
            WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}