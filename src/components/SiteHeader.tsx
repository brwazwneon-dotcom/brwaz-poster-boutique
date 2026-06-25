import { Link } from "@tanstack/react-router";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useCategories } from "@/lib/use-categories";

export function SiteHeader() {
  const { count } = useCart();
  const { data: categories = [] } = useCategories();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-6">
        <Link to="/" className="text-display text-2xl tracking-[0.2em]">
          BRWAZWNEON
        </Link>
        <nav className="hidden items-center gap-6 text-sm uppercase tracking-widest text-muted-foreground md:flex">
          {categories.slice(0, 5).map((c) => (
            <Link
              key={c.slug}
              to="/category/$slug"
              params={{ slug: c.slug }}
              className="transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              {c.name}
            </Link>
          ))}
          <Link
            to="/offers"
            className="transition-colors hover:text-foreground"
            activeProps={{ className: "text-foreground" }}
          >
            Offers
          </Link>
          <Link
            to="/photo-printing"
            className="transition-colors hover:text-foreground"
            activeProps={{ className: "text-foreground" }}
          >
            Photo Printing
          </Link>
        </nav>
        <Link
          to="/cart"
          className="relative inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
        >
          <ShoppingBag className="h-4 w-4" />
          Cart
          {count > 0 && (
            <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {count}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}