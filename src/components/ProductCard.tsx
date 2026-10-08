import { memo } from "react";
import { Link } from "@tanstack/react-router";
import { Maximize2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { IMAGE_FALLBACK } from "@/lib/storage-url";
import { WishlistHeart } from "@/components/WishlistHeart";
import { PosterBadge } from "@/components/PosterBadge";
import { formatCount } from "@/lib/poster-badges";
import { FramePreview } from "@/components/FramePreview";
import type { NormalizedProduct } from "@/hooks/useInfiniteProducts";

type Props = {
  product: NormalizedProduct;
  gridIndex: number;
  selected: boolean;
  selectionIndex: number;
  onToggle: (id: string) => void;
  gridMode: "black" | "white" | "wood";
};

export const ProductCard = memo(function ProductCard({
  product,
  gridIndex,
  selected,
  selectionIndex,
  onToggle,
  gridMode,
}: Props) {
  const { i18n } = useTranslation();
  const viewLabel = i18n.language?.startsWith("ar") ? "عرض البوستر" : "View poster";
  const fallbackUrl = product.fallbackArtworkUrl || IMAGE_FALLBACK;
  const safeUrl = product.cardArtworkUrl || fallbackUrl || IMAGE_FALLBACK;

  return (
    <div
      className={cn(
        "v2-card group relative aspect-[2/3] overflow-hidden rounded-sm border-2 bg-muted/20 transition",
        selected
          ? "border-primary ring-4 ring-primary/30"
          : "border-transparent hover:border-border",
      )}
    >
      {/* Selection control is a real <button> overlay; the heart and "view" link are siblings, not
          children, so there are no nested interactive elements. */}
      <button
        type="button"
        onClick={() => onToggle(product.id)}
        aria-pressed={selected}
        aria-label={product.title}
        className="absolute inset-0 z-[5] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      />
      <WishlistHeart posterId={product.id} />
      <Link
        to="/poster/$id"
        params={{ id: product.id }}
        aria-label={viewLabel}
        title={viewLabel}
        className="absolute bottom-2 left-2 z-20 flex h-8 w-8 items-center justify-center rounded-sm bg-background/90 text-foreground opacity-90 transition hover:opacity-100 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
      >
        <Maximize2 className="h-4 w-4" aria-hidden />
      </Link>
      <PosterBadge badge={product.badge} />
      <FramePreview
        posterUrl={safeUrl}
        posterFallbackUrl={fallbackUrl}
        title={product.title}
        color={gridMode}
        loading={gridIndex < 4 ? "eager" : "lazy"}
        fetchPriority={gridIndex < 4 ? "high" : undefined}
        aspectClassName="aspect-[2/3]"
        className="h-full w-full"
      />
      {selected && (
        <span className="absolute left-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {selectionIndex + 1}
        </span>
      )}
      {(product.salesCount ?? 0) > 0 && (
        <span className="pointer-events-none absolute bottom-7 right-2 z-20 rounded-sm bg-background/85 px-1.5 py-0.5 text-[9px] uppercase tracking-widest opacity-0 transition group-hover:opacity-100">
          ✔ {formatCount(product.salesCount)} sold
        </span>
      )}
    </div>
  );
});
