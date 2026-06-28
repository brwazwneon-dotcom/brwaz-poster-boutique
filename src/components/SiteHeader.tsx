import { Link, useNavigate } from "@tanstack/react-router";
import { ShoppingBag, Search } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/lib/cart";
import { useRootCategories } from "@/lib/use-categories";
import { LOGO_URL } from "@/lib/site";

export function SiteHeader() {
  const { count } = useCart();
  const { data: categories = [] } = useRootCategories();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ to: "/search", search: { q: q.trim() } });
  };
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link to="/" aria-label="BRWAZWNEON home" className="flex items-center">
          <img
            src={LOGO_URL}
            alt="BRWAZWNEON"
            className="h-9 w-auto md:h-[45px]"
            loading="eager"
            decoding="async"
          />
        </Link>
        <form onSubmit={submit} className="relative hidden flex-1 max-w-xl md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search posters: Messi, Marvel, BMW…"
            className="w-full rounded-sm border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
            aria-label="Search posters"
          />
        </form>
        <nav className="hidden items-center gap-5 text-xs uppercase tracking-widest text-muted-foreground lg:flex">
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
          to="/search"
          search={{ q: "" }}
          aria-label="Search"
          className="inline-flex items-center justify-center rounded-sm border border-border p-2 md:hidden"
        >
          <Search className="h-4 w-4" />
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