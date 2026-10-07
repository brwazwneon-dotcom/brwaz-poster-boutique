import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Minus, Plus, ShieldCheck, Truck, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FramePreview } from "@/components/FramePreview";
import { RelatedPosters } from "@/components/RelatedPosters";
import { SizeGuide } from "@/components/SizeGuide";
import { useCart } from "@/lib/cart";
import {
  CUSTOMER_FRAME_COLORS,
  FRAME_TYPES,
  SIZES,
  sizesForFrame,
  type FrameColorId,
  type FrameTypeId,
  type SizeId,
} from "@/lib/poster-options";
import { priceForFrame, usePricing } from "@/lib/use-settings";
import { Reveal } from "@/components/v2/Reveal";
import { setStickyBarHeight } from "@/lib/floating-tools";
import { cn } from "@/lib/utils";

type PosterRow = {
  id: string;
  title: string;
  description: string | null;
  image_url: string;
  category_id: string | null;
  categories: { name: string | null; slug: string | null } | null;
};

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export const Route = createFileRoute("/poster/$id")({
  component: PosterPage,
});

function PosterPage() {
  const { id } = Route.useParams();
  const { add } = useCart();
  const pricing = usePricing();
  const [frameType, setFrameType] = useState<FrameTypeId>("pvc");
  const [size, setSize] = useState<SizeId>("30x40");
  const [color, setColor] = useState<FrameColorId>("black");
  const [qty, setQty] = useState(1);
  const [pop, setPop] = useState(false);

  // Lift floating widgets (WhatsApp, offers) above the mobile purchase bar.
  useEffect(() => {
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    setStickyBarHeight(76);
    return () => setStickyBarHeight(null);
  }, []);

  const { data: poster, isLoading } = useQuery({
    queryKey: ["poster-page", id],
    enabled: isUuid(id),
    staleTime: 60_000,
    queryFn: async (): Promise<PosterRow | null> => {
      const { data, error } = await supabase
        .from("posters")
        .select("id,title,description,image_url,category_id,categories(name,slug)")
        .eq("id", id)
        .eq("hidden", false)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as PosterRow | null) ?? null;
    },
  });

  const sizes = useMemo(() => sizesForFrame(frameType), [frameType]);
  const activeSize = sizes.includes(size) ? size : (sizes[0] as SizeId);
  const unit = priceForFrame(pricing, frameType, activeSize); // display only; order totals are computed at checkout
  const total = unit * qty;

  if (isLoading)
    return <div className="container-page py-16 text-sm text-muted-foreground">Loading…</div>;
  if (!poster)
    return (
      <div className="container-page py-24 text-center">
        <p className="text-muted-foreground">Poster not found.</p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-sm border border-border px-6 py-3 text-xs uppercase tracking-widest"
        >
          Back to shop
        </Link>
      </div>
    );

  const addToCart = () => {
    for (let n = 0; n < qty; n++) {
      add({
        posterId: poster.id,
        title: poster.title,
        image: poster.image_url,
        categoryId: poster.category_id,
        categoryName: poster.categories?.name ?? "",
        frameType,
        size: activeSize,
        color,
        price: unit,
      });
    }
    toast.success(`Added ${qty} × ${poster.title}`);
    setPop(true);
    window.setTimeout(() => setPop(false), 340);
  };

  const PurchaseButton = ({ className }: { className?: string }) => (
    <button
      type="button"
      onClick={addToCart}
      disabled={unit <= 0}
      className={cn(
        "rounded-sm bg-primary px-6 py-4 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition hover:opacity-90 disabled:opacity-50",
        pop && "v2-pop",
        className,
      )}
    >
      Add to cart · {total} EGP
    </button>
  );

  return (
    <article className="container-page pb-28 pt-8 md:pb-16 md:pt-12">
      <div className="grid gap-8 md:grid-cols-[1.1fr_0.9fr] md:gap-14">
        <div className="mx-auto w-full max-w-md md:sticky md:top-24 md:max-w-[30rem] md:self-start md:justify-self-center">
          <FramePreview
            posterUrl={poster.image_url}
            title={poster.title}
            frameType={frameType}
            color={color}
            loading="eager"
            fetchPriority="high"
            aspectClassName="aspect-[2/3]"
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-6">
          <header>
            {poster.categories?.slug ? (
              <Link
                to="/category/$slug"
                params={{ slug: poster.categories.slug }}
                className="v2-eyebrow hover:text-foreground"
              >
                {poster.categories.name}
              </Link>
            ) : null}
            <h1 className="text-display mt-2 text-4xl sm:text-5xl">{poster.title}</h1>
            <p className="mt-3 text-2xl font-semibold">{unit > 0 ? `${unit} EGP` : "—"}</p>
          </header>

          <fieldset>
            <legend className="v2-eyebrow mb-2">Frame</legend>
            <div className="flex flex-wrap gap-2">
              {FRAME_TYPES.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={frameType === f.id}
                  onClick={() => setFrameType(f.id)}
                  className={cn(
                    "min-h-11 rounded-sm border px-4 text-xs uppercase tracking-widest",
                    frameType === f.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:border-primary",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="v2-eyebrow mb-2">Color</legend>
            <div className="flex gap-3">
              {CUSTOMER_FRAME_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-label={c.label}
                  aria-pressed={color === c.id}
                  onClick={() => setColor(c.id)}
                  className={cn(
                    "h-11 w-11 rounded-full border-2",
                    color === c.id ? "border-primary ring-2 ring-primary/40" : "border-border",
                  )}
                  style={{ background: c.swatch }}
                />
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="v2-eyebrow mb-2">Size</legend>
            <div className="flex flex-wrap gap-2">
              {sizes.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={activeSize === s}
                  onClick={() => setSize(s)}
                  className={cn(
                    "min-h-11 rounded-sm border px-3 text-xs",
                    activeSize === s
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:border-primary",
                  )}
                >
                  {SIZES.find((x) => x.id === s)?.label ?? s}
                </button>
              ))}
            </div>
            <div className="mt-2">
              <SizeGuide />
            </div>
          </fieldset>

          <div className="flex items-center gap-4">
            <div className="flex items-center rounded-sm border border-border">
              <button
                type="button"
                aria-label="Decrease quantity"
                className="h-11 w-11 grid place-items-center"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center text-sm" aria-live="polite">
                {qty}
              </span>
              <button
                type="button"
                aria-label="Increase quantity"
                className="h-11 w-11 grid place-items-center"
                onClick={() => setQty((q) => Math.min(20, q + 1))}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <PurchaseButton className="hidden flex-1 md:block" />
          </div>

          <ul className="grid gap-2 border-t border-border pt-5 text-xs text-muted-foreground">
            <li className="flex items-center gap-2">
              <Truck className="h-4 w-4" /> Delivery across Egypt · free over{" "}
              {pricing.freeShippingThreshold} EGP
            </li>
            <li className="flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Cash on delivery or Instapay
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Print quality guaranteed
            </li>
          </ul>
          {poster.description ? (
            <p className="text-sm leading-relaxed text-muted-foreground">{poster.description}</p>
          ) : null}
        </div>
      </div>

      <Reveal className="mt-16">
        <RelatedPosters
          poster={{ id: poster.id, title: poster.title, category_id: poster.category_id }}
          categorySlug={poster.categories?.slug ?? undefined}
          categoryName={poster.categories?.name ?? undefined}
        />
      </Reveal>

      {/* Mobile sticky purchase bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 p-3 md:hidden"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <PurchaseButton className="w-full" />
      </div>
    </article>
  );
}
