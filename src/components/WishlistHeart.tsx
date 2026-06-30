import { Heart } from "lucide-react";
import { useWishlist } from "@/lib/wishlist";
import { cn } from "@/lib/utils";

type Props = {
  posterId: string;
  className?: string;
  /** When true, button is always visible. Otherwise it fades in on hover (desktop) and stays visible on mobile. */
  alwaysVisible?: boolean;
};

export function WishlistHeart({ posterId, className, alwaysVisible }: Props) {
  const { has, toggle } = useWishlist();
  const active = has(posterId);
  return (
    <button
      type="button"
      aria-label={active ? "Remove from wishlist" : "Save to wishlist"}
      aria-pressed={active}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(posterId);
      }}
      className={cn(
        "absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background/80 backdrop-blur transition",
        alwaysVisible
          ? "opacity-100"
          : "opacity-100 md:opacity-0 md:group-hover:opacity-100",
        active && "opacity-100",
        className,
      )}
    >
      <Heart
        className={cn("h-4 w-4 transition", active ? "fill-red-500 text-red-500" : "text-foreground")}
      />
    </button>
  );
}