import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, getCategory } from "@/lib/categories";
import {
  FRAME_COLORS,
  FRAME_TYPES,
  SIZES,
  calcPrice,
  type FrameColorId,
  type FrameTypeId,
  type SizeId,
} from "@/lib/poster-options";
import { useCart } from "@/lib/cart";
import { whatsappLink } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

type Poster = {
  id: string;
  title: string;
  image_url: string;
  category: string;
};

export const Route = createFileRoute("/category/$slug")({
  beforeLoad: ({ params }) => {
    if (!getCategory(params.slug)) throw notFound();
  },
  head: ({ params }) => {
    const c = getCategory(params.slug);
    const title = c ? `${c.name} Posters — BRWAZWNEON` : "Posters";
    return {
      meta: [
        { title },
        { name: "description", content: c?.blurb ?? "Premium framed posters." },
        { property: "og:title", content: title },
      ],
    };
  },
  component: CategoryPage,
  notFoundComponent: () => (
    <div className="container-page py-24 text-center">
      <h1 className="text-display text-4xl">Category not found</h1>
      <Link to="/" className="mt-6 inline-block underline">
        Back home
      </Link>
    </div>
  ),
});

function CategoryPage() {
  const { slug } = Route.useParams();
  const category = getCategory(slug)!;
  const [selected, setSelected] = useState<Poster | null>(null);

  const { data: posters = [], isLoading } = useQuery({
    queryKey: ["posters", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posters")
        .select("id,title,image_url,category")
        .eq("category", slug)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Poster[];
    },
  });

  return (
    <div className="container-page py-12">
      <div className="mb-2 text-xs uppercase tracking-[0.4em] text-muted-foreground">
        Collection
      </div>
      <h1 className="text-display text-4xl sm:text-6xl">{category.name}</h1>
      <p className="mt-3 max-w-xl text-muted-foreground">{category.blurb}</p>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          {isLoading ? (
            <div className="py-20 text-center text-sm text-muted-foreground">
              Loading posters…
            </div>
          ) : posters.length === 0 ? (
            <div className="rounded-sm border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
              No posters in this category yet. Check back soon — or upload some
              from the <Link to="/admin" className="underline">admin panel</Link>.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {posters.map((p) => {
                const active = selected?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelected(p)}
                    className={cn(
                      "group relative aspect-[2/3] overflow-hidden rounded-sm border-2 bg-card transition",
                      active
                        ? "border-primary ring-2 ring-primary/40"
                        : "border-transparent hover:border-border",
                    )}
                  >
                    <img
                      src={p.image_url}
                      alt={p.title}
                      loading="lazy"
                      className="h-full w-full object-cover grayscale transition group-hover:grayscale-0"
                    />
                    {active && (
                      <span className="absolute left-2 top-2 rounded-sm bg-primary px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary-foreground">
                        Selected
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          {selected ? (
            <Customizer poster={selected} />
          ) : (
            <div className="rounded-sm border border-border bg-card p-8 text-center">
              <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                Step 1
              </div>
              <p className="mt-3 text-lg">Select a poster to customize.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Tap any image on the left. Choose frame type, size and color.
              </p>
            </div>
          )}
        </aside>
      </div>

      <div className="mt-16 border-t border-border pt-10">
        <h3 className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          More categories
        </h3>
        <div className="mt-4 flex flex-wrap gap-2">
          {CATEGORIES.filter((c) => c.slug !== slug).map((c) => (
            <Link
              key={c.slug}
              to="/category/$slug"
              params={{ slug: c.slug }}
              className="rounded-sm border border-border px-4 py-2 text-sm hover:bg-accent"
            >
              {c.name}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function Customizer({ poster }: { poster: Poster }) {
  const [frameType, setFrameType] = useState<FrameTypeId>("pvc");
  const [size, setSize] = useState<SizeId>("30x40");
  const [color, setColor] = useState<FrameColorId>("black");
  const { add } = useCart();
  const price = calcPrice(size, frameType);

  const handleAdd = () => {
    add({
      posterId: poster.id,
      title: poster.title,
      image: poster.image_url,
      category: poster.category,
      frameType,
      size,
      color,
      price,
    });
    toast.success("Added to cart");
  };

  const waMsg = `Hi BRWAZWNEON, I'd like to order:\n• ${poster.title}\n  Frame: ${
    FRAME_TYPES.find((f) => f.id === frameType)?.label
  }\n  Size: ${SIZES.find((s) => s.id === size)?.label}\n  Color: ${
    FRAME_COLORS.find((c) => c.id === color)?.label
  }\n  Price: ${price} EGP`;

  return (
    <div className="rounded-sm border border-border bg-card p-6">
      <div className="flex gap-4">
        <img
          src={poster.image_url}
          alt={poster.title}
          className="h-32 w-24 rounded-sm object-cover"
        />
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Selected
          </div>
          <div className="mt-1 truncate text-lg font-semibold">{poster.title}</div>
          <div className="mt-3 text-display text-3xl">{price} <span className="text-base text-muted-foreground">EGP</span></div>
        </div>
      </div>

      <OptionGroup label="Frame Type">
        {FRAME_TYPES.map((f) => (
          <OptionButton
            key={f.id}
            active={frameType === f.id}
            onClick={() => setFrameType(f.id)}
          >
            {f.label}
          </OptionButton>
        ))}
      </OptionGroup>

      <OptionGroup label="Size">
        {SIZES.map((s) => (
          <OptionButton
            key={s.id}
            active={size === s.id}
            onClick={() => setSize(s.id)}
          >
            {s.label}
          </OptionButton>
        ))}
      </OptionGroup>

      <OptionGroup label="Frame Color">
        {FRAME_COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setColor(c.id)}
            className={cn(
              "flex items-center gap-2 rounded-sm border px-3 py-2 text-sm transition",
              color === c.id
                ? "border-primary bg-accent"
                : "border-border hover:border-muted-foreground",
            )}
          >
            <span
              className="h-5 w-5 rounded-full border border-border"
              style={{ backgroundColor: c.swatch }}
            />
            {c.label}
          </button>
        ))}
      </OptionGroup>

      <div className="mt-6 grid grid-cols-2 gap-2">
        <button
          onClick={handleAdd}
          className="rounded-sm bg-primary px-4 py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90"
        >
          Add to cart
        </button>
        <a
          href={whatsappLink(waMsg)}
          target="_blank"
          rel="noreferrer"
          className="rounded-sm border border-border px-4 py-3 text-center text-xs font-semibold uppercase tracking-widest hover:bg-accent"
        >
          Order on WhatsApp
        </a>
      </div>
    </div>
  );
}

function OptionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <div className="mb-2 text-xs uppercase tracking-[0.3em] text-muted-foreground">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function OptionButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-sm border px-3 py-2 text-sm transition",
        active
          ? "border-primary bg-accent text-foreground"
          : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}