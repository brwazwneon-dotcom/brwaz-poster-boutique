import { Link, useRouterState } from "@tanstack/react-router";
import { Heart, Home, LayoutGrid, Search, ShoppingBag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { useCart } from "@/lib/cart";
import { setStickyBarHeight } from "@/lib/floating-tools";

const HIDDEN_PREFIXES = ["/admin", "/auth", "/cart", "/category", "/poster"];

/** Phone-only primary navigation (hidden >=768px, hidden in admin/checkout). */
export function MobileBottomNav() {
  const { t, i18n } = useTranslation();
  const ar = i18n.language?.startsWith("ar");
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { count } = useCart();
  const hidden = HIDDEN_PREFIXES.some((p) => path.startsWith(p));
  useEffect(() => {
    if (hidden || !window.matchMedia("(max-width: 767px)").matches) return;
    setStickyBarHeight(56); // floating widgets sit above the nav
    return () => setStickyBarHeight(null);
  }, [hidden]);
  if (hidden) return null;
  const L = (en: string, a: string) => (ar ? a : en);
  const items = [
    { to: "/", icon: Home, label: L("Home", "الرئيسية"), match: path === "/" },
    {
      to: "/trending",
      icon: LayoutGrid,
      label: L("Shop", "تسوق"),
      match: path.startsWith("/trending") || path.startsWith("/category"),
    },
    { to: "/search", icon: Search, label: L("Search", "بحث"), match: path.startsWith("/search") },
    {
      to: "/wishlist",
      icon: Heart,
      label: L("Saved", "المفضلة"),
      match: path.startsWith("/wishlist"),
    },
    { to: "/cart", icon: ShoppingBag, label: L("Cart", "السلة"), match: path.startsWith("/cart") },
  ] as const;
  void t;
  return (
    <nav className="v2-bottom-nav" aria-label={L("Primary", "التنقل الرئيسي")}>
      {items.map(({ to, icon: Icon, label, match }) => (
        <Link key={to} to={to} aria-current={match ? "page" : undefined} className="relative">
          <span className="relative">
            <Icon className="h-5 w-5" aria-hidden />
            {to === "/cart" && count > 0 && (
              <span className="absolute -right-2 -top-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[9px] font-bold leading-4 text-primary-foreground">
                {count}
              </span>
            )}
          </span>
          {label}
        </Link>
      ))}
    </nav>
  );
}
