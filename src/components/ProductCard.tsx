import { memo } from "react";
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
  const { t } = useTranslation();
  const fallbackUrl = product.fallbackArtworkUrl || IMAGE_FALLBACK;
  const safeUrl = product.cardArtworkUrl || fallbackUrl || IMAGE_FALLBACK;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onToggle(product.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle(product.id);
        }
      }}
      aria-pressed={selected}
      className={cn(
        "group relative aspect-[2/3] cursor-pointer overflow-hidden rounded-sm border-2 bg-muted/20 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        selected
          ? "border-primary ring-4 ring-primary/30"
          : "border-transparent hover:border-border",
      )}
    >
      <WishlistHeart posterId={product.id} />
      <PosterBadge badge={product.badge} />
      <FramePreview
        posterUrl={safeUrl}
        posterFallbackUrl={fallbackUrl}
        avifSrcSet={product.avifSrcSet ?? undefined}
        webpSrcSet={product.webpSrcSet ?? undefined}
        sizes="(max-width: 640px) 45vw, (max-width: 1024px) 25vw, 16vw"
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
          ✔ {formatCount(product.salesCount)} {t("product.sold")}
        </span>
      )}
    </div>
  );
});
