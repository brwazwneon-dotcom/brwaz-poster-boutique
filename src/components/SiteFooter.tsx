import { Link } from "@tanstack/react-router";
import { useCategories } from "@/lib/use-categories";
import { LOGO_URL, BRANCH, SOCIAL } from "@/lib/site";
import { Instagram, Facebook, MessageCircle, MapPin } from "lucide-react";

export function SiteFooter() {
  const { data: categories = [] } = useCategories();
  return (
    <footer className="mt-24 border-t border-border bg-background">
      <div className="container-page grid gap-10 py-14 md:grid-cols-4">
        <div>
          <Link to="/" aria-label="BRWAZWNEON home" className="inline-flex">
            <img src={LOGO_URL} alt="BRWAZWNEON" className="h-9 w-auto md:h-[45px]" loading="lazy" />
          </Link>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            Premium framed posters. Cinema, sport, anime, motors — printed and
            framed to gallery standard.
          </p>
          <p className="mt-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" /> {BRANCH}
          </p>
          <div className="mt-5 flex items-center gap-2">
            <a
              href={`https://wa.me/${SOCIAL.whatsappIntl}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp"
              className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-border hover:bg-accent"
            >
              <MessageCircle className="h-4 w-4" />
            </a>
            <a
              href={SOCIAL.instagram}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-border hover:bg-accent"
            >
              <Instagram className="h-4 w-4" />
            </a>
            <a
              href={SOCIAL.facebook}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook"
              className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-border hover:bg-accent"
            >
              <Facebook className="h-4 w-4" />
            </a>
          </div>
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