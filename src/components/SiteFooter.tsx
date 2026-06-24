import { Link } from "@tanstack/react-router";
import { useCategories } from "@/lib/use-categories";

export function SiteFooter() {
  const { data: categories = [] } = useCategories();
  return (
    <footer className="mt-24 border-t border-border bg-background">
      <div className="container-page grid gap-10 py-14 md:grid-cols-4">
        <div>
          <div className="text-display text-2xl tracking-[0.2em]">BRWAZWNEON</div>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            Premium framed posters. Cinema, sport, anime, motors — printed and
            framed to gallery standard.
          </p>
        </div>
        <div>
          <h4 className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">Shop</h4>
          <ul className="space-y-2 text-sm">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link to="/category/$slug" params={{ slug: c.slug }} className="hover:underline">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">Help</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/offers" className="hover:underline">Special offers</Link></li>
            <li><Link to="/cart" className="hover:underline">Cart</Link></li>
            <li><Link to="/auth" className="hover:underline">Admin</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">Payment</h4>
          <p className="text-sm text-muted-foreground">Cash on delivery across Egypt.</p>
        </div>
      </div>
      <div className="border-t border-border py-5 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} BRWAZWNEON. All rights reserved.
      </div>
    </footer>
  );
}