import { Link } from "@tanstack/react-router";
import { ShoppingBag, Search, Heart } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/lib/cart";
import { SearchBox } from "@/components/SearchBox";
import { useWishlist } from "@/lib/wishlist";
import { useLogoSize } from "@/lib/branding";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useT } from "@/lib/i18n";
const LOGO_PNG_FALLBACK = "/assets/brwazwneon-logo.png";

const MAIN_MENU: { key: string; href: string }[] = [
  { key: "menu.football", href: "/category/football" },
  { key: "menu.movies", href: "/category/movies" },
  { key: "menu.tvSeries", href: "/category/tv-series" },
  { key: "menu.marvelDc", href: "/category/marvel-dc" },
  { key: "menu.anime", href: "/category/anime" },
  { key: "menu.cars", href: "/category/cars" },
  { key: "menu.customDesign", href: "/custom-design" },
  { key: "menu.photoPrinting", href: "/photo-printing" },
  { key: "menu.photos4x6", href: "/photo-4x6" },
  { key: "menu.sets", href: "/sets" },
  { key: "menu.bestSellers", href: "/#best-sellers" },
];

export function SiteHeader() {
  const { count } = useCart();
  const { count: wishCount } = useWishlist();
  const logo = useLogoSize("header");
  const t = useT();
  // Fallback chain: DB/branding logo (webp) -> bundled png -> text wordmark.
  // Guards against stale/broken remote URLs (Lovable preview, blob, etc.).
  const [logoStage, setLogoStage] = useState<0 | 1 | 2>(0);
  const logoSrc = logoStage === 0 ? logo.src : LOGO_PNG_FALLBACK;
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link to="/" aria-label="BRWAZWNEON home" className="flex items-center">
          {logoStage === 2 ? (
            <span className="text-display text-xl font-bold uppercase tracking-widest text-foreground">
              BRWAZWNEON
            </span>
          ) : (
            <img
              src={logoSrc}
              alt="BRWAZWNEON – Custom Posters, Frames & Photo Printing"
              style={{ ...logo.style, display: "block", objectFit: "contain", maxHeight: 50, width: "auto" }}
              width={160}
              height={48}
              loading="eager"
              decoding="async"
              fetchPriority="high"
              onError={() => setLogoStage((s) => (s === 0 ? 1 : 2))}
            />
          )}
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
              {t(m.key)}
            </a>
          ))}
        </nav>
        <LanguageSwitcher className="hidden md:inline-flex" />
        <Link
          to="/search"
          search={{ q: "" }}
          aria-label={t("common.search")}
          className="inline-flex items-center justify-center rounded-sm border border-border p-2 md:hidden"
        >
          <Search className="h-4 w-4" />
        </Link>
        <div className="md:hidden">
          <LanguageSwitcher />
        </div>
        <Link
          to="/wishlist"
          aria-label={t("header.wishlist")}
          className="relative inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
        >
          <Heart className="h-4 w-4" />
          <span className="hidden sm:inline">{t("header.wishlist")}</span>
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
          {t("header.cart")}
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
