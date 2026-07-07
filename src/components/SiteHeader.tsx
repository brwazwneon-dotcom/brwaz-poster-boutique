import { Link } from "@tanstack/react-router";
import { ShoppingBag, Search, Heart } from "lucide-react";
import { useCart } from "@/lib/cart";
import { SearchBox } from "@/components/SearchBox";
import { useWishlist } from "@/lib/wishlist";
import { useLogoSize } from "@/lib/branding";

const MAIN_MENU: { label: string; href: string }[] = [
  { label: "Football", href: "/category/football" },
  { label: "Movies", href: "/category/movies" },
  { label: "TV Series", href: "/category/tv-series" },
  { label: "Marvel & DC", href: "/category/marvel-dc" },
  { label: "Anime", href: "/category/anime" },
  { label: "Cars", href: "/category/cars" },
  { label: "Custom Design", href: "/custom-design" },
  { label: "Photo Printing", href: "/photo-printing" },
  { label: "4×6 Photos", href: "/photo-4x6" },
  { label: "Sets", href: "/sets" },
  { label: "Best Sellers", href: "/#best-sellers" },
];

export function SiteHeader() {
  const { count } = useCart();
  const { count: wishCount } = useWishlist();
  const logo = useLogoSize("header");
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link to="/" aria-label="BRWAZWNEON home" className="flex items-center">
          <img
            src={logo.src}
            alt="BRWAZWNEON – Custom Posters, Frames & Photo Printing"
            style={logo.style}
            width={160}
            height={48}
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
        </Link>
        <div className="relative hidden flex-1 max-w-xl md:block">
          <SearchBox variant="header" />
        </div>
        <nav className="hidden items-center gap-5 text-xs uppercase tracking-widest text-muted-foreground lg:flex">
          {MAIN_MENU.slice(0, 6).map((m) => (
            <a
              key={m.href}
              href={m.href}
              className="whitespace-nowrap transition-colors hover:text-foreground"
            >
              {m.label}
            </a>
          ))}
        </nav>
        <Link
          to="/search"
          search={{ q: "" }}
          aria-label="Search"
          className="inline-flex items-center justify-center rounded-sm border border-border p-2 md:hidden"
        >
          <Search className="h-4 w-4" />
        </Link>
        <Link
          to="/wishlist"
          aria-label="Wishlist"
          className="relative inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
        >
          <Heart className="h-4 w-4" />
          <span className="hidden sm:inline">Wishlist</span>
          {wishCount > 0 && (
            <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {wishCount}
            </span>
          )}
        </Link>
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