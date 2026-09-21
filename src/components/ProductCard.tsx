import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
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
  /** Position in the selection — only shown in "multi" mode (bundle builder). */
  selectionIndex: number;
  onToggle: (id: string) => void;
  gridMode: "black" | "white" | "wood";
  /**
   * "single": exactly one card is the active poster (category page) — shown
   * with a check mark. "multi": several cards can be picked and are numbered
   * (offers bundle builder).
   */
  selectionMode?: "single" | "multi";
};

export const ProductCard = memo(function ProductCard({
  product,
  gridIndex,
  selected,
  selectionIndex,
  onToggle,
  gridMode,
  selectionMode = "multi",
}: Props) {
  const { t } = useTranslation();
  const fallbackUrl = product.fallbackArtworkUrl || IMAGE_FALLBACK;
  const safeUrl = product.cardArtworkUrl || fallbackUrl || IMAGE_FALLBACK;
  const single = selectionMode === "single";

  return (
    <div
      className={cn(
        "group relative aspect-[2/3] overflow-hidden rounded-sm border-2 bg-muted/20 transition-[border-color,box-shadow,transform] duration-200",
        selected
          ? "border-primary shadow-lg ring-2 ring-primary/30 sm:-translate-y-0.5"
          : "border-transparent hover:border-border",
      )}
    >
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
      {/* A real button covering the card (a nested button inside a
          button-role div is invalid, and the wishlist heart is one). */}
      <button
        type="button"
        onClick={() => onToggle(product.id)}
        aria-pressed={selected}
        aria-label={
          selected
            ? single
              ? t("product.activeAriaLabel", { title: product.title })
              : t("product.selectedAriaLabel", { title: product.title, index: selectionIndex + 1 })
            : t("product.selectAriaLabel", { title: product.title })
        }
        className="absolute inset-0 z-10 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      />
      <PosterBadge badge={product.badge} className="z-[11]" />
      <WishlistHeart posterId={product.id} className="z-20" />
      {selected && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-2 left-2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow"
        >
          {single ? <Check className="h-4 w-4" /> : selectionIndex + 1}
        </span>
      )}
      {(product.salesCount ?? 0) > 0 && (
        <span className="pointer-events-none absolute bottom-2 right-2 z-20 rounded-sm bg-background/85 px-1.5 py-0.5 text-[9px] uppercase tracking-widest opacity-0 transition group-hover:opacity-100">
          ✔ {formatCount(product.salesCount)} {t("product.sold")}
        </span>
      )}
    </div>
  );
});
