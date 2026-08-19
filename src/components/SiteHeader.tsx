import { Link, useLocation } from "@tanstack/react-router";
import {
  ChevronDown,
  Globe,
  Heart,
  Home,
  Menu,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Tag,
  User,
  X,
} from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { useTranslation } from "react-i18next";
import { useCart } from "@/lib/cart";
import { SearchBox } from "@/components/SearchBox";
import { useWishlist } from "@/lib/wishlist";
import { useLogoSize } from "@/lib/branding";
import { useCategories, isCategoryVisible } from "@/lib/use-categories";
import { usePerformanceFlags } from "@/lib/performance-flags";
import { useLanguage } from "@/hooks/useLanguage";
import { cn } from "@/lib/utils";
const LOGO_PNG_FALLBACK = "/assets/brwazwneon-logo.png";
const LOGO_WEBP = "/assets/brwazwneon-logo.webp";

const FALLBACK_MENU: { label: string; href: string }[] = [
  { label: "Football", href: "/category/football" },
  { label: "Movies", href: "/category/movies" },
  { label: "TV Series", href: "/category/tv-series" },
  { label: "Marvel & DC", href: "/category/marvel-dc" },
  { label: "Anime", href: "/category/anime" },
  { label: "Cars", href: "/category/cars" },
];

const REQUIRED_COLLECTIONS = [
  { slug: "football", key: "football", en: "Football", ar: "كرة القدم" },
  { slug: "movies", key: "movies", en: "Movies", ar: "أفلام" },
  { slug: "tv-series", key: "tvSeries", en: "TV Series", ar: "مسلسلات" },
  { slug: "anime", key: "anime", en: "Anime", ar: "أنمي" },
  { slug: "marvel-dc", key: "marvelDc", en: "Marvel & DC", ar: "مارفل ودي سي" },
  { slug: "cars", key: "cars", en: "Cars", ar: "سيارات" },
  { slug: "countries", key: "countries", en: "Countries", ar: "بلدان" },
  { slug: "islamic", key: "islamic", en: "Islamic", ar: "إسلامي" },
  { slug: "random", key: "random", en: "Random", ar: "منوعات" },
  { slug: "for-her", key: "forHer", en: "For Her", ar: "لها" },
] as const;

type DrawerLink = {
  label: string;
  href: string;
  badge?: number;
  icon?: ComponentType<{ className?: string }>;
};

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return href.startsWith("/") && pathname.startsWith(href);
}

export function SiteHeader() {
  const { t, i18n } = useTranslation();
  const { count } = useCart();
  const { count: wishCount } = useWishlist();
  const location = useLocation();
  const logo = useLogoSize("header");
  const perf = usePerformanceFlags();
  const { currentLanguage, setLanguage } = useLanguage();
  const { data: categories = [] } = useCategories(!perf.emergency_fast_mode);
  const isAr = i18n.language?.startsWith("ar");
  const drawerSide = isAr ? "right" : "left";
  const mobileT = useCallback(
    (key: string, en: string, ar: string) => t(key, { defaultValue: isAr ? ar : en }),
    [isAr, t],
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useRef<HTMLDivElement>(null);
  const headerCats = perf.emergency_fast_mode
    ? []
    : categories
        .filter(
          (c) => !c.parent_id && isCategoryVisible(c) && (c.show_in_header ?? c.featured ?? false),
        )
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((c) => ({
          label: isAr && c.name_ar ? c.name_ar : c.name,
          href: `/category/${c.slug}`,
        }));
  const menu =
    headerCats.length > 0
      ? headerCats
      : FALLBACK_MENU.map((m) => ({
          label: m.label,
          href: m.href,
        }));
  const primaryMenu = menu.slice(0, 6);
  const overflowMenu = menu.slice(6);
  const [moreOpen, setMoreOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [logoSrc, setLogoSrc] = useState(logo.src || LOGO_WEBP);
  const [logoFailed, setLogoFailed] = useState(false);
  const catalogLabel = mobileT("mobileMenu.catalog", "Catalog Menu", "قائمة التصفح");
  const mobileSearchPlaceholder = mobileT(
    "mobileMenu.searchPlaceholder",
    "Search posters, movies, players and more",
    "ابحث عن بوسترات، أفلام، لاعبين والمزيد",
  );

  const collectionLinks = useMemo(() => {
    const rootCats = categories
      .filter((c) => !c.parent_id && isCategoryVisible(c))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((c) => ({
        label: isAr && c.name_ar ? c.name_ar : c.name,
        href: `/category/${c.slug}`,
        slug: c.slug,
      }));
    const seen = new Set(rootCats.map((c) => c.slug));
    const required = REQUIRED_COLLECTIONS.filter((c) => !seen.has(c.slug)).map((c) => ({
      label: mobileT(`mobileMenu.collections.${c.key}`, c.en, c.ar),
      href: `/category/${c.slug}`,
      slug: c.slug,
    }));
    return [...rootCats, ...required, { label: t("nav.frameSets"), href: "/sets", slug: "sets" }];
  }, [categories, isAr, mobileT, t]);

  const drawerGroups: { key: string; label: string; links: DrawerLink[] }[] = [
    {
      key: "shopping",
      label: mobileT("mobileMenu.groups.shopping", "Shopping", "التسوق"),
      links: [
        { label: t("nav.home"), href: "/", icon: Home },
        {
          label: mobileT("mobileMenu.shopAll", "Shop All", "تسوق الكل"),
          href: "/category/football",
          icon: ShoppingBag,
        },
        { label: t("nav.trendingNow"), href: "/trending", icon: Sparkles },
        { label: t("nav.bestSellers"), href: "/best-sellers", icon: Star },
        { label: t("nav.specialOffers"), href: "/offers", icon: Tag },
      ],
    },
    {
      key: "collections",
      label: mobileT("mobileMenu.groups.collections", "Collections", "المجموعات"),
      links: collectionLinks,
    },
    {
      key: "customServices",
      label: mobileT("mobileMenu.groups.customServices", "Custom Services", "خدمات مخصصة"),
      links: [
        { label: t("nav.customDesign"), href: "/custom-design" },
        { label: t("nav.photoPrinting"), href: "/photo-printing" },
        {
          label: mobileT("mobileMenu.uploadYourPhoto", "Upload Your Photo", "ارفع صورتك"),
          href: "/photo-printing",
        },
        { label: t("nav.sizeGuide"), href: "/#home-faq" },
      ],
    },
    {
      key: "customer",
      label: mobileT("mobileMenu.groups.customer", "Customer Service", "خدمة العملاء"),
      links: [
        { label: t("nav.search"), href: "/search?q=" },
        { label: t("nav.wishlist"), href: "/wishlist", badge: wishCount },
        { label: t("nav.cart"), href: "/cart", badge: count },
        { label: t("nav.myAccount"), href: "/auth", icon: User },
        { label: t("nav.trackOrder"), href: "/cart" },
        { label: mobileT("mobileMenu.reviews", "Reviews", "آراء العملاء"), href: "/#home-reviews" },
        { label: t("nav.admin"), href: "/admin" },
      ],
    },
    {
      key: "information",
      label: mobileT("mobileMenu.groups.information", "Information", "معلومات"),
      links: [
        { label: t("nav.aboutUs"), href: "/#home-trusted-quality" },
        { label: t("nav.contactUs"), href: "https://wa.me/201009101391" },
        { label: t("nav.shippingInfo"), href: "/#home-faq" },
        {
          label: mobileT("mobileMenu.returnsRefunds", "Returns and Refunds", "الإرجاع والاسترداد"),
          href: "/#home-faq",
        },
        { label: t("nav.faq"), href: "/#home-faq" },
        {
          label: mobileT("mobileMenu.privacyPolicy", "Privacy Policy", "سياسة الخصوصية"),
          href: "/#home-faq",
        },
        {
          label: mobileT("mobileMenu.termsConditions", "Terms and Conditions", "الشروط والأحكام"),
          href: "/#home-faq",
        },
      ],
    },
  ];

  useEffect(() => {
    setLogoSrc(logo.src || LOGO_WEBP);
    setLogoFailed(false);
  }, [logo.src]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const menuButton = mobileMenuButtonRef.current;
    document.body.style.overflow = "hidden";
    document.documentElement.dataset.mobileNavOpen = "true";
    window.dispatchEvent(new CustomEvent("brw:mobile-nav-open", { detail: true }));

    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = Array.from(
        mobileDrawerRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
      ).filter((node) => !node.hasAttribute("disabled"));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.setTimeout(
      () => mobileDrawerRef.current?.querySelector<HTMLElement>("button, a, input")?.focus(),
      0,
    );
    return () => {
      document.body.style.overflow = previousOverflow;
      delete document.documentElement.dataset.mobileNavOpen;
      window.dispatchEvent(new CustomEvent("brw:mobile-nav-open", { detail: false }));
      window.removeEventListener("keydown", onKeyDown);
      menuButton?.focus();
    };
  }, [mobileMenuOpen]);

  const handleLogoError = () => {
    if (!logoFailed) {
      setLogoFailed(true);
      setLogoSrc(LOGO_PNG_FALLBACK);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="container-page grid h-16 grid-cols-[48px_1fr_48px] items-center gap-2 lg:hidden">
        <div className={cn("flex", isAr ? "justify-start" : "justify-start")}>
          {isAr ? (
            <MobileCartLink count={count} label={t("nav.cart")} />
          ) : (
            <MobileMenuButton
              ref={mobileMenuButtonRef}
              label={t("header.openMenu")}
              onClick={() => setMobileMenuOpen(true)}
            />
          )}
        </div>
        <Link
          to="/"
          aria-label="BRWAZWNEON home"
          className="mx-auto flex items-center justify-center"
        >
          {logoFailed && !logo.src ? (
            <span className="text-display text-base font-bold uppercase tracking-widest text-foreground">
              BRWAZWNEON
            </span>
          ) : (
            <img
              src={logoSrc}
              alt="BRWAZWNEON"
              data-mobile-header-logo="true"
              className="object-contain"
              width={170}
              height={48}
              style={{ width: "72px", height: "auto", maxWidth: "72px" }}
              loading="eager"
              decoding="async"
              fetchPriority="high"
              onError={handleLogoError}
            />
          )}
        </Link>
        <div className="flex justify-end">
          {isAr ? (
            <MobileMenuButton
              ref={mobileMenuButtonRef}
              label={t("header.openMenu")}
              onClick={() => setMobileMenuOpen(true)}
            />
          ) : (
            <MobileCartLink count={count} label={t("nav.cart")} />
          )}
        </div>
      </div>

      <div
        className={cn(
          "fixed inset-0 z-[90]",
          mobileMenuOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!mobileMenuOpen}
      >
        <button
          type="button"
          aria-label={t("header.closeMenu")}
          onClick={() => setMobileMenuOpen(false)}
          className={cn(
            "absolute inset-0 bg-black/55 transition-opacity duration-300",
            mobileMenuOpen ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          ref={mobileDrawerRef}
          role="dialog"
          aria-modal="true"
          aria-label={catalogLabel}
          dir={isAr ? "rtl" : "ltr"}
          className={cn(
            "absolute top-0 flex h-[100dvh] w-[88vw] max-w-[380px] flex-col overflow-hidden bg-white text-[#111] shadow-2xl transition-transform duration-300 ease-out will-change-transform",
            drawerSide === "right" ? "right-0" : "left-0",
            mobileMenuOpen
              ? "translate-x-0"
              : drawerSide === "right"
                ? "translate-x-full"
                : "-translate-x-full",
          )}
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-black/45">
                {catalogLabel}
              </p>
              <p className="mt-1 text-base font-semibold">{t("common.brand")}</p>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              aria-label={t("header.closeMenu")}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-black/10 text-black transition hover:bg-black/5"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="border-b border-black/10 px-4 py-4">
            <SearchBox
              variant="header"
              placeholder={mobileSearchPlaceholder}
              onNavigate={() => setMobileMenuOpen(false)}
            />
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label={catalogLabel}>
            {drawerGroups.map((group, index) => (
              <details
                key={group.key}
                className="group border-b border-black/10 py-1"
                open={index < 2}
              >
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between rounded-lg px-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                  <span>{group.label}</span>
                  <ChevronDown className="h-4 w-4 text-black/45 transition group-open:rotate-180" />
                </summary>
                <div className="pb-2">
                  {group.links.map((item) => {
                    const Icon = item.icon;
                    const active = isActivePath(location.pathname, item.href);
                    const external =
                      /^https?:\/\//.test(item.href) || item.href.startsWith("mailto:");
                    const content = (
                      <span
                        className={cn(
                          "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition",
                          active
                            ? "bg-black text-white"
                            : "text-black/75 hover:bg-black/5 hover:text-black",
                        )}
                      >
                        {Icon && <Icon className="h-4 w-4 shrink-0" />}
                        <span className="min-w-0 flex-1 truncate text-start">{item.label}</span>
                        {item.badge ? (
                          <span
                            className={cn(
                              "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold",
                              active ? "bg-white text-black" : "bg-black text-white",
                            )}
                          >
                            {item.badge}
                          </span>
                        ) : null}
                      </span>
                    );
                    return external ? (
                      <a
                        key={`${group.key}-${item.href}-${item.label}`}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className="block"
                      >
                        {content}
                      </a>
                    ) : (
                      <a
                        key={`${group.key}-${item.href}-${item.label}`}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className="block"
                      >
                        {content}
                      </a>
                    );
                  })}
                </div>
              </details>
            ))}
          </nav>

          <div
            className="border-t border-black/10 px-4 pb-4 pt-3"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
          >
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-black/45">
              {t("nav.language")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLanguage("ar")}
                className={cn(
                  "min-h-11 rounded-lg border px-3 text-sm font-semibold",
                  currentLanguage === "ar"
                    ? "border-black bg-black text-white"
                    : "border-black/15 text-black",
                )}
              >
                العربية
              </button>
              <button
                type="button"
                onClick={() => setLanguage("en")}
                className={cn(
                  "min-h-11 rounded-lg border px-3 text-sm font-semibold",
                  currentLanguage === "en"
                    ? "border-black bg-black text-white"
                    : "border-black/15 text-black",
                )}
              >
                English
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container-page hidden h-24 items-center justify-between gap-4 lg:flex">
        <div className="flex items-center gap-2 shrink-0">
          <button
            ref={mobileMenuButtonRef}
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label={t("header.openMenu")}
            className="hidden lg:inline-flex h-10 w-10 items-center justify-center rounded-sm border border-border bg-background text-foreground hover:bg-accent"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/" aria-label="BRWAZWNEON home" className="flex items-center">
            {logoFailed && !logo.src ? (
              <span className="text-display text-xl font-bold uppercase tracking-widest text-foreground">
                BRWAZWNEON
              </span>
            ) : (
              <img
                src={logoSrc}
                alt="BRWAZWNEON"
                style={{
                  height: logo.style.height || "88px",
                  width: "auto",
                  maxHeight: 96,
                  objectFit: "contain",
                }}
                width={220}
                height={88}
                loading="eager"
                decoding="async"
                fetchPriority="high"
                onError={handleLogoError}
              />
            )}
          </Link>
        </div>
        <div className="relative hidden flex-1 max-w-xl md:block">
          <SearchBox variant="header" />
        </div>
        <nav className="hidden items-center gap-5 text-xs uppercase tracking-widest text-muted-foreground lg:flex">
          {primaryMenu.map((m) => (
            <a
              key={m.href}
              href={m.href}
              className="whitespace-nowrap transition-colors hover:text-foreground"
            >
              {m.label}
            </a>
          ))}
          {overflowMenu.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                onBlur={() => setTimeout(() => setMoreOpen(false), 120)}
                className="flex items-center gap-1 whitespace-nowrap transition-colors hover:text-foreground"
                aria-haspopup="true"
                aria-expanded={moreOpen}
              >
                {t("nav.more")} <ChevronDown className="h-3 w-3" />
              </button>
              {moreOpen && (
                <div className="absolute left-0 rtl:left-auto rtl:right-0 top-full z-50 mt-2 min-w-[180px] rounded-sm border border-border bg-background py-2 shadow-lg">
                  {overflowMenu.map((m) => (
                    <a
                      key={m.href}
                      href={m.href}
                      className="block px-3 py-1.5 text-xs uppercase tracking-widest text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      {m.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setLangOpen((v) => !v)}
              onBlur={() => setTimeout(() => setLangOpen(false), 120)}
              className="flex items-center gap-1 whitespace-nowrap transition-colors hover:text-foreground"
              aria-haspopup="true"
              aria-expanded={langOpen}
            >
              <Globe className="h-3.5 w-3.5" />
              {currentLanguage === "ar" ? "العربية" : "EN"}
            </button>
            {langOpen && (
              <div className="absolute left-0 rtl:left-auto rtl:right-0 top-full z-50 mt-2 min-w-[130px] rounded-sm border border-border bg-background py-2 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setLanguage("ar");
                    setLangOpen(false);
                  }}
                  className={`block w-full px-3 py-1.5 text-xs uppercase tracking-widest text-left rtl:text-right hover:bg-accent hover:text-foreground ${currentLanguage === "ar" ? "text-foreground font-semibold" : "text-muted-foreground"}`}
                >
                  العربية
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLanguage("en");
                    setLangOpen(false);
                  }}
                  className={`block w-full px-3 py-1.5 text-xs uppercase tracking-widest text-left rtl:text-right hover:bg-accent hover:text-foreground ${currentLanguage === "en" ? "text-foreground font-semibold" : "text-muted-foreground"}`}
                >
                  English
                </button>
              </div>
            )}
          </div>
        </nav>
        <Link
          to="/search"
          search={{ q: "" }}
          aria-label={t("header.search")}
          className="hidden items-center justify-center rounded-sm border border-border p-2 md:hidden"
        >
          <Search className="h-4 w-4" />
        </Link>
        <Link
          to="/wishlist"
          aria-label={t("header.wishlist")}
          className="relative inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
        >
          <Heart className="h-4 w-4" />
          <span className="hidden sm:inline">{t("nav.wishlist")}</span>
          {wishCount > 0 && (
            <span className="ltr:ml-1 rtl:mr-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {wishCount}
            </span>
          )}
        </Link>
        <Link
          to="/cart"
          className="relative inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
        >
          <ShoppingBag className="h-4 w-4" />
          {t("nav.cart")}
          {count > 0 && (
            <span className="ltr:ml-1 rtl:mr-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {count}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}

const MobileMenuButton = forwardRef<HTMLButtonElement, { label: string; onClick: () => void }>(
  ({ label, onClick }, ref) => (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-sm border border-border bg-background text-foreground"
    >
      <Menu className="h-5 w-5" />
    </button>
  ),
);
MobileMenuButton.displayName = "MobileMenuButton";

function MobileCartLink({ count, label }: { count: number; label: string }) {
  return (
    <Link
      to="/cart"
      aria-label={label}
      className="relative flex h-11 w-11 items-center justify-center rounded-sm border border-border bg-background text-foreground"
    >
      <ShoppingBag className="h-5 w-5" />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground rtl:-left-1 rtl:right-auto">
          {count}
        </span>
      )}
    </Link>
  );
}
