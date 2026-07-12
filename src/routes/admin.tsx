import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PreviewAsClient } from "@/components/admin/PreviewAsClient";
import { TestModeControls } from "@/components/admin/TestModeControls";
import { OrderDetailsExtras } from "@/components/admin/OrderDetailsExtras";
import { CustomersTab } from "@/components/admin/CustomersTab";
import { AbandonedOrdersTab } from "@/components/admin/AbandonedOrdersTab";
import { ReportsTab } from "@/components/admin/ReportsTab";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ensureBrandAdminRole } from "@/lib/admin-auth.functions";
import { useCategories, type Category } from "@/lib/use-categories";
import { POSTER_BADGES } from "@/lib/poster-badges";
import { cn } from "@/lib/utils";
import { Trash2, Upload, LogOut, Pencil, Plus, X, Save, Download, Search, Eye, ArrowUp, ArrowDown, Heart, Star, Sparkles, Loader2, FlipHorizontal, FlipVertical, RotateCcw, RotateCw, ZoomIn, ZoomOut, Crosshair, ShoppingBag, Copy, MessageCircle, Calendar, Package, MapPin, Phone as PhoneIcon, User as UserIcon, StickyNote, AlertCircle, RefreshCw } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import * as XLSX from "xlsx";
import {
  IMAGE_FALLBACK,
  uploadAndSign,
  extractStoragePath,
  signStoragePath,
} from "@/lib/storage-url";
import { SafeImage } from "@/components/SafeImage";
import { FramePreview } from "@/components/FramePreview";
import { BulkPosterUploader } from "@/components/admin/BulkPosterUploader";
import { AiPosterUpload } from "@/components/admin/AiPosterUpload";
import { PosterImageEditor } from "@/components/admin/PosterImageEditor";
import { PosterImagesManager } from "@/components/admin/PosterImagesManager";
import { BeforeAfterTab } from "@/components/admin/BeforeAfterTab";
import { AnalyticsTab } from "@/components/admin/AnalyticsTab";
import { RealtimeAnalyticsTab } from "@/components/admin/RealtimeAnalyticsTab";
import { NotificationsTab } from "@/components/admin/NotificationsTab";
import { NotificationBell } from "@/components/admin/NotificationBell";
import { NotificationsCenterTab } from "@/components/admin/NotificationsCenterTab";
import { ErrorLogsTab } from "@/components/admin/ErrorLogsTab";
import { PerformanceMonitorTab } from "@/components/admin/PerformanceMonitorTab";
import { BackupsTab } from "@/components/admin/BackupsTab";
import { Photo4x6Tab } from "@/components/admin/Photo4x6Tab";
import { SystemHealthTab } from "@/components/admin/SystemHealthTab";
import { MaintenanceTab } from "@/components/admin/MaintenanceTab";
import { EnvCheckTab } from "@/components/admin/EnvCheckTab";
import { SubCategoriesManagerTab } from "@/components/admin/SubCategoriesManagerTab";
import { TrendingNowManager } from "@/components/admin/TrendingNowManager";
import { BrandingTab } from "@/components/admin/BrandingTab";
import { AiSettingsTab } from "@/components/admin/AiSettingsTab";
import { SocialProofTab } from "@/components/admin/SocialProofTab";
import { BehaviorTab } from "@/components/admin/BehaviorTab";
import { AssistantRequestsTab } from "@/components/admin/AssistantRequestsTab";
import { AssistantTab } from "@/components/admin/AssistantTab";
import { OffersTab } from "@/components/admin/OffersTab";
import { AdminAssistantButton } from "@/components/admin/AdminAssistantButton";
import { AdminI18nProvider, useAdminI18n, tabLabel } from "@/lib/admin-i18n";
import { LanguageSwitcher, HelpButton, AdminTip } from "@/components/admin/AdminShell";
import { DEFAULT_COLLECTIONS, type CollectionCard } from "@/components/ShopByCollection";
import {
  loadImage,
  normalizeEditSettings,
  renderEditToBlob,
  type EditSettings,
} from "@/lib/poster-edit";
import { MOCKUP_KEYS, type FrameMockup, type FrameMockups } from "@/lib/use-settings";
import { GRID_DISPLAY_MODE_KEY, GRID_DISPLAY_MODE_DEFAULT, type GridDisplayMode } from "@/lib/use-settings";
import { PRICING_DEFAULTS, PRICING_KEYS, type Pricing } from "@/lib/use-settings";
import {
  ANNOUNCEMENT_KEY,
  ANNOUNCEMENT_DEFAULTS,
  type AnnouncementConfig,
} from "@/components/AnnouncementBar";
import {
  QUICKBAR_KEY,
  DEFAULT_QUICKBAR,
  type QuickBarConfig,
  type QuickBarChip,
} from "@/lib/quickbar";
import {
  FOOTER_MENU_KEY,
  DEFAULT_FOOTER_MENU,
  type FooterMenuConfig,
  type FooterLink,
} from "@/lib/footer-menu";
import {
  DEFAULT_HOME_SECTIONS,
  HOME_SECTION_LABELS,
  HOME_SECTIONS_KEY,
  BEST_SELLERS_CONFIG_KEY,
  DEFAULT_BS_CONFIG,
  type HomeSectionConfig,
  type BestSellersConfig,
} from "@/lib/homepage-sections";
import {
  FEATURED_SLUGS,
  HOME_CATEGORY_PICKS_KEY,
  type HomeCategoryPicks,
} from "@/lib/home-category-picks";
import {
  SIZE_GUIDE_KEY,
  DEFAULT_SIZE_GUIDE,
  type SizeGuideConfig,
  type SizeGuideItem,
} from "@/lib/size-guide";
import {
  HERO_BANNER_CONFIG_KEY,
  DEFAULT_HERO_BANNER_CONFIG,
  type HeroBanner,
  type HeroBannerConfig,
} from "@/lib/hero-banners";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — BRWAZWNEON" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPageWithI18n,
});

function AdminPageWithI18n() {
  return (
    <AdminI18nProvider>
      <AdminPage />
      <HelpButton />
    </AdminI18nProvider>
  );
}

type Tab = "analytics" | "reports" | "realtime" | "behavior" | "posters" | "ai-upload" | "ai-settings" | "assistant" | "assistant-requests" | "categories" | "subcategories" | "orders" | "customers" | "abandoned" | "custom" | "offers" | "photo-4x6" | "slider" | "hero-banners" | "highlights" | "best-sellers" | "sections" | "home-categories" | "sets" | "collections" | "quickbar" | "footer-menu" | "mockups" | "wishlists" | "reviews" | "before-after" | "marketing" | "social-proof" | "announcement" | "size-guide" | "alerts" | "notifications" | "error-logs" | "performance" | "backups" | "system-health" | "env-check" | "maintenance" | "exports" | "branding" | "settings";

function AdminPage() {
  const navigate = useNavigate();
  const ensureAdmin = useServerFn(ensureBrandAdminRole);
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("analytics");
  const { t } = useAdminI18n();

  useEffect(() => {
    const applyHash = () => {
      const h = typeof window !== "undefined" ? window.location.hash : "";
      const m = h.match(/tab=([\w-]+)/);
      if (m) setTab(m[1] as Tab);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate({ to: "/auth" });
        return;
      }
      setUserId(data.session.user.id);
      const ensured = await ensureAdmin();
      if (ensured.isAdmin) {
        setIsAdmin(true);
        setReady(true);
        return;
      }
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.session.user.id)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!roleData);
      setReady(true);
    })();
  }, [ensureAdmin, navigate]);

  useEffect(() => {
    if (isAdmin) {
      try { window.localStorage.setItem("brw-admin-seen", "1"); } catch { /* ignore */ }
    }
  }, [isAdmin]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  if (!ready) {
    return <div className="container-page py-20 text-center text-muted-foreground">Loading…</div>;
  }

  if (!isAdmin) {
    return (
      <div className="container-page py-20">
        <div className="mx-auto max-w-xl rounded-sm border border-border bg-card p-8 text-center">
          <h1 className="text-display text-3xl">No admin access</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Your account ({userId?.slice(0, 8)}…) is not authorized for the admin dashboard.
            Sign in with the BRWAZWNEON owner email to continue.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button onClick={signOut} className="rounded-sm border border-border px-4 py-2 text-xs uppercase tracking-widest hover:bg-accent">
              Sign out
            </button>
            <Link to="/" className="rounded-sm bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground">
              Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{t("shell.dashboard")}</div>
          <h1 className="text-display text-5xl">{t("shell.admin")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <AdminTip label={t("shell.preview")}>
            <div><PreviewAsClient /></div>
          </AdminTip>
          <NotificationBell onOpenCenter={() => setTab("alerts")} />
          <LanguageSwitcher />
          <AdminTip label={t("shell.sign_out")}>
            <button
              onClick={signOut}
              className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
            >
              <LogOut className="h-4 w-4" /> {t("shell.sign_out")}
            </button>
          </AdminTip>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-2 border-b border-border">
        {(["analytics", "reports", "assistant", "realtime", "behavior", "posters", "ai-upload", "ai-settings", "assistant-requests", "categories", "subcategories", "orders", "customers", "abandoned", "custom", "offers", "photo-4x6", "slider", "hero-banners", "highlights", "best-sellers", "sections", "home-categories", "sets", "collections", "quickbar", "footer-menu", "mockups", "wishlists", "reviews", "before-after", "marketing", "social-proof", "announcement", "size-guide", "alerts", "notifications", "error-logs", "performance", "backups", "system-health", "env-check", "maintenance", "exports", "branding", "settings"] as Tab[]).map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={cn(
              "border-b-2 px-4 py-3 text-xs font-semibold uppercase tracking-widest transition",
              tab === tabKey
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tabLabel(t, tabKey)}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {tab === "analytics" && <AnalyticsTab onNavigate={setTab} />}
        {tab === "realtime" && <RealtimeAnalyticsTab />}
        {tab === "behavior" && <BehaviorTab />}
        {tab === "posters" && <PostersTab />}
        {tab === "ai-upload" && <AiPosterUpload />}
        {tab === "categories" && <CategoriesTab />}
        {tab === "subcategories" && <SubCategoriesManagerTab />}
        {tab === "orders" && <OrdersTab />}
        {tab === "customers" && <CustomersTab />}
        {tab === "abandoned" && <AbandonedOrdersTab />}
        {tab === "reports" && <ReportsTab onNavigate={(t) => setTab(t as Tab)} />}
        {tab === "custom" && <CustomDesignOrdersTab />}
        {tab === "offers" && <OffersTab />}
        {tab === "photo-4x6" && <Photo4x6Tab />}
        {tab === "slider" && <SliderTab />}
        {tab === "hero-banners" && <HeroBannersTab />}
        {tab === "highlights" && <HighlightsTab />}
        {tab === "best-sellers" && <BestSellersTab />}
        {tab === "sections" && <HomeSectionsTab />}
        {tab === "home-categories" && <HomeCategoryPicksTab />}
        {tab === "sets" && <SetsTab />}
        {tab === "collections" && <CollectionsTab />}
        {tab === "quickbar" && <QuickBarTab />}
        {tab === "footer-menu" && <FooterMenuTab />}
        {tab === "mockups" && <MockupsTab />}
        {tab === "wishlists" && <WishlistsTab />}
        {tab === "reviews" && <ReviewsTab />}
        {tab === "before-after" && <BeforeAfterTab />}
        {tab === "marketing" && <MarketingTab />}
        {tab === "social-proof" && <SocialProofTab />}
        {tab === "announcement" && <AnnouncementTab />}
        {tab === "size-guide" && <SizeGuideTab />}
        {tab === "alerts" && <NotificationsCenterTab />}
        {tab === "notifications" && <NotificationsTab />}
        {tab === "error-logs" && <ErrorLogsTab />}
        {tab === "performance" && <PerformanceMonitorTab />}
        {tab === "backups" && <BackupsTab />}
        {tab === "system-health" && <SystemHealthTab />}
        {tab === "env-check" && <EnvCheckTab />}
        {tab === "maintenance" && <MaintenanceTab />}
        {tab === "exports" && <ExportsTab />}
        {tab === "branding" && <BrandingTab />}
        {tab === "ai-settings" && <AiSettingsTab />}
        {tab === "assistant-requests" && <AssistantRequestsTab />}
        {tab === "settings" && <SettingsTab />}
        {tab === "assistant" && <AssistantTab />}
      </div>
      <AdminAssistantButton />
    </div>
  );
}

/* ---------- HOME CATEGORY PICKS (posters shown in each home category section) ---------- */

type PickPoster = { id: string; title: string; image_url: string | null };

function HomeCategoryPicksTab() {
  const qc = useQueryClient();
  const [picks, setPicks] = useState<HomeCategoryPicks | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeSlug, setActiveSlug] = useState<string>(FEATURED_SLUGS[0]);
  const [search, setSearch] = useState("");

  const { data: initial, isLoading } = useQuery({
    queryKey: ["admin-home-category-picks"],
    queryFn: async (): Promise<HomeCategoryPicks> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", HOME_CATEGORY_PICKS_KEY)
        .maybeSingle();
      if (error) throw error;
      const raw = data?.value as Record<string, unknown> | null;
      const out: HomeCategoryPicks = {};
      if (raw && typeof raw === "object") {
        for (const [k, v] of Object.entries(raw)) {
          if (Array.isArray(v)) {
            out[k] = v.filter((x): x is string => typeof x === "string" && !!x);
          }
        }
      }
      return out;
    },
  });

  useEffect(() => {
    if (initial && picks === null) setPicks(initial);
  }, [initial, picks]);

  const { data: cats = [] } = useQuery({
    queryKey: ["admin-home-cats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id,slug,name,parent_id");
      if (error) throw error;
      return data ?? [];
    },
  });

  const categoryIds = useMemo(() => {
    const root = cats.find((c) => c.slug === activeSlug);
    if (!root) return [] as string[];
    const children = cats.filter((c) => c.parent_id === root.id).map((c) => c.id);
    return [root.id, ...children];
  }, [cats, activeSlug]);

  const { data: posters = [] } = useQuery({
    queryKey: ["admin-home-cat-posters", activeSlug, categoryIds.join(",")],
    enabled: categoryIds.length > 0,
    queryFn: async (): Promise<PickPoster[]> => {
      const { data, error } = await supabase
        .from("posters")
        .select("id,title,image_url")
        .in("category_id", categoryIds)
        .eq("hidden", false)
        .not("image_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as PickPoster[];
    },
  });

  const selected = picks?.[activeSlug] ?? [];
  const filtered = useMemo<PickPoster[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) return posters;
    return posters.filter((p: PickPoster) => (p.title ?? "").toLowerCase().includes(q));
  }, [posters, search]);

  const toggle = (id: string) => {
    setPicks((prev) => {
      const base = prev ?? {};
      const cur = base[activeSlug] ?? [];
      const next = cur.includes(id)
        ? cur.filter((x) => x !== id)
        : cur.length >= 6
          ? (toast.error("Maximum 6 posters per collection"), cur)
          : [...cur, id];
      return { ...base, [activeSlug]: next };
    });
  };

  const move = (id: string, dir: -1 | 1) => {
    setPicks((prev) => {
      const base = prev ?? {};
      const cur = [...(base[activeSlug] ?? [])];
      const i = cur.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return prev;
      [cur[i], cur[j]] = [cur[j], cur[i]];
      return { ...base, [activeSlug]: cur };
    });
  };

  const clearActive = () => {
    setPicks((prev) => ({ ...(prev ?? {}), [activeSlug]: [] }));
  };

  const save = async () => {
    if (!picks) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("site_settings")
        .upsert({ key: HOME_CATEGORY_PICKS_KEY, value: picks as unknown as never });
      if (error) throw error;
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["admin-home-category-picks"] });
      qc.invalidateQueries({ queryKey: ["home-category-picks"] });
      qc.invalidateQueries({ queryKey: ["home-posters"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || picks === null) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>;
  }

  const selectedPosters = selected
    .map((id) => posters.find((p) => p.id === id))
    .filter((p): p is PickPoster => !!p);

  return (
    <div>
      <div className="rounded-sm border border-border bg-card p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-sm">
            Pick up to <b>6</b> posters per collection. When empty, the homepage rotates random posters from that category.
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="ml-auto inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save changes"}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {FEATURED_SLUGS.map((s) => {
            const count = (picks[s] ?? []).length;
            return (
              <button
                key={s}
                onClick={() => setActiveSlug(s)}
                className={cn(
                  "rounded-sm border px-3 py-2 text-xs uppercase tracking-widest transition",
                  activeSlug === s
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-accent",
                )}
              >
                {s} {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-sm border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search posters…"
              className="w-64 rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <div className="text-xs text-muted-foreground">
              {filtered.length} posters in this collection
            </div>
          </div>
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No posters found for this category yet.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {filtered.map((p) => {
                const isSel = selected.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    className={cn(
                      "group relative aspect-[3/4] overflow-hidden rounded-sm border-2 bg-muted transition",
                      isSel ? "border-primary" : "border-transparent hover:border-border",
                    )}
                    title={p.title}
                  >
                    {p.image_url && (
                      <img
                        src={p.image_url}
                        alt={p.title}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                    {isSel && (
                      <div className="absolute inset-x-0 top-0 bg-primary px-1 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-primary-foreground">
                        Picked #{selected.indexOf(p.id) + 1}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-sm border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold uppercase tracking-widest">Selected ({selectedPosters.length}/6)</div>
            {selectedPosters.length > 0 && (
              <button
                onClick={clearActive}
                className="ml-auto text-xs text-muted-foreground hover:text-destructive"
              >
                Clear
              </button>
            )}
          </div>
          {selectedPosters.length === 0 ? (
            <div className="mt-4 rounded-sm border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              Nothing picked — homepage will show random posters from this category.
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {selectedPosters.map((p, i) => (
                <div key={p.id} className="flex items-center gap-2 rounded-sm border border-border p-2">
                  <div className="h-12 w-9 shrink-0 overflow-hidden rounded-sm bg-muted">
                    {p.image_url && <img src={p.image_url} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1 truncate text-xs">{p.title}</div>
                  <div className="flex gap-1">
                    <button onClick={() => move(p.id, -1)} disabled={i === 0} className="rounded-sm border border-border p-1 disabled:opacity-30" aria-label="Move up">
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button onClick={() => move(p.id, 1)} disabled={i === selectedPosters.length - 1} className="rounded-sm border border-border p-1 disabled:opacity-30" aria-label="Move down">
                      <ArrowDown className="h-3 w-3" />
                    </button>
                    <button onClick={() => toggle(p.id)} className="rounded-sm border border-border p-1 text-muted-foreground hover:text-destructive" aria-label="Remove">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QuickBarTab() {
  const qc = useQueryClient();
  const [cfg, setCfg] = useState<QuickBarConfig>(DEFAULT_QUICKBAR);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-quickbar"],
    queryFn: async (): Promise<QuickBarConfig> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", QUICKBAR_KEY)
        .maybeSingle();
      if (error) throw error;
      const v = (data?.value ?? {}) as Partial<QuickBarConfig>;
      return {
        enabled: v.enabled !== false,
        chips: Array.isArray(v.chips) && v.chips.length ? (v.chips as QuickBarChip[]) : DEFAULT_QUICKBAR.chips,
      };
    },
  });

  useEffect(() => { if (data) setCfg(data); }, [data]);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("site_settings").upsert({
        key: QUICKBAR_KEY,
        value: cfg as never,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success("Quick bar saved");
      qc.invalidateQueries({ queryKey: ["collections-quickbar"] });
      qc.invalidateQueries({ queryKey: ["admin-quickbar"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const updateChip = (i: number, patch: Partial<QuickBarChip>) =>
    setCfg((c) => ({ ...c, chips: c.chips.map((ch, idx) => (idx === i ? { ...ch, ...patch } : ch)) }));
  const removeChip = (i: number) =>
    setCfg((c) => ({ ...c, chips: c.chips.filter((_, idx) => idx !== i) }));
  const moveChip = (i: number, dir: -1 | 1) => {
    setCfg((c) => {
      const j = i + dir;
      if (j < 0 || j >= c.chips.length) return c;
      const next = c.chips.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return { ...c, chips: next };
    });
  };
  const addChip = () =>
    setCfg((c) => ({
      ...c,
      chips: [...c.chips, { id: `chip-${Date.now()}`, label: "New", href: "/", enabled: true }],
    }));

  if (isLoading) return <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="max-w-4xl space-y-5">
      <div className="rounded-sm border border-border bg-card/50 p-4 text-xs uppercase tracking-widest text-muted-foreground">
        Horizontal collections chip bar shown above the hero on the homepage.
      </div>

      <div className="rounded-sm border border-border bg-card p-6 space-y-5">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={(e) => setCfg((c) => ({ ...c, enabled: e.target.checked }))}
            className="h-4 w-4"
          />
          <span className="text-xs uppercase tracking-widest">Enable quick bar</span>
        </label>

        <div className="space-y-2">
          {cfg.chips.map((ch, i) => (
            <div key={ch.id} className="flex flex-wrap items-center gap-2 rounded-sm border border-border bg-background p-3">
              <input
                type="checkbox"
                checked={ch.enabled}
                onChange={(e) => updateChip(i, { enabled: e.target.checked })}
                className="h-4 w-4"
                title="Show / hide"
              />
              <input
                value={ch.label}
                onChange={(e) => updateChip(i, { label: e.target.value })}
                placeholder="Label"
                className="w-40 rounded-sm border border-border bg-background px-2 py-1.5 text-sm outline-none"
              />
              <input
                value={ch.href}
                onChange={(e) => updateChip(i, { href: e.target.value })}
                placeholder="/category/football"
                className="min-w-0 flex-1 rounded-sm border border-border bg-background px-2 py-1.5 text-sm outline-none"
              />
              <button onClick={() => moveChip(i, -1)} className="rounded-sm border border-border p-1.5 hover:bg-accent" title="Move up">
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => moveChip(i, 1)} className="rounded-sm border border-border p-1.5 hover:bg-accent" title="Move down">
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => removeChip(i)} className="rounded-sm border border-border p-1.5 text-destructive hover:bg-accent" title="Remove">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={addChip}
            className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2 text-xs uppercase tracking-widest hover:bg-accent"
          >
            <Plus className="h-4 w-4" /> Add chip
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-3 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save quick bar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- POSTERS ---------- */

function FooterMenuTab() {
  const qc = useQueryClient();
  const [cfg, setCfg] = useState<FooterMenuConfig>(DEFAULT_FOOTER_MENU);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-footer-menu"],
    queryFn: async (): Promise<FooterMenuConfig> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", FOOTER_MENU_KEY)
        .maybeSingle();
      if (error) throw error;
      const v = (data?.value ?? {}) as Partial<FooterMenuConfig>;
      return {
        links: Array.isArray(v.links) && v.links.length ? (v.links as FooterLink[]) : DEFAULT_FOOTER_MENU.links,
      };
    },
  });

  useEffect(() => { if (data) setCfg(data); }, [data]);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("site_settings").upsert({
        key: FOOTER_MENU_KEY,
        value: cfg as never,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success("Footer menu saved");
      qc.invalidateQueries({ queryKey: ["footer-menu"] });
      qc.invalidateQueries({ queryKey: ["admin-footer-menu"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const updateLink = (i: number, patch: Partial<FooterLink>) =>
    setCfg((c) => ({ ...c, links: c.links.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));
  const removeLink = (i: number) =>
    setCfg((c) => ({ ...c, links: c.links.filter((_, idx) => idx !== i) }));
  const moveLink = (i: number, dir: -1 | 1) => {
    setCfg((c) => {
      const j = i + dir;
      if (j < 0 || j >= c.links.length) return c;
      const next = c.links.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return { ...c, links: next };
    });
  };
  const addLink = () =>
    setCfg((c) => ({
      ...c,
      links: [...c.links, { id: `link-${Date.now()}`, label: "New", href: "/", enabled: true }],
    }));

  if (isLoading) return <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="max-w-4xl space-y-5">
      <div className="rounded-sm border border-border bg-card/50 p-4 text-xs uppercase tracking-widest text-muted-foreground">
        Links shown in the footer "Shop" column. Curated only — never auto-populated from categories.
      </div>

      <div className="rounded-sm border border-border bg-card p-6 space-y-5">
        <div className="space-y-2">
          {cfg.links.map((l, i) => (
            <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-sm border border-border bg-background p-3">
              <input
                type="checkbox"
                checked={l.enabled}
                onChange={(e) => updateLink(i, { enabled: e.target.checked })}
                className="h-4 w-4"
                title="Show / hide"
              />
              <input
                value={l.label}
                onChange={(e) => updateLink(i, { label: e.target.value })}
                placeholder="Label"
                className="w-40 rounded-sm border border-border bg-background px-2 py-1.5 text-sm outline-none"
              />
              <input
                value={l.href}
                onChange={(e) => updateLink(i, { href: e.target.value })}
                placeholder="/category/football"
                className="min-w-0 flex-1 rounded-sm border border-border bg-background px-2 py-1.5 text-sm outline-none"
              />
              <button onClick={() => moveLink(i, -1)} className="rounded-sm border border-border p-1.5 hover:bg-accent" title="Move up">
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => moveLink(i, 1)} className="rounded-sm border border-border p-1.5 hover:bg-accent" title="Move down">
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => removeLink(i)} className="rounded-sm border border-border p-1.5 text-destructive hover:bg-accent" title="Remove">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={addLink}
            className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2 text-xs uppercase tracking-widest hover:bg-accent"
          >
            <Plus className="h-4 w-4" /> Add link
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-3 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save footer menu"}
          </button>
        </div>
      </div>
    </div>
  );
}

type Poster = {
  id: string;
  title: string;
  image_url: string;
  original_url?: string | null;
  category_id: string | null;
  tags?: string[] | null;
  featured?: boolean | null;
  hidden?: boolean | null;
  description?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  edit_settings?: unknown;
  badge?: string | null;
  sales_count?: number | null;
  views_count?: number | null;
};

const PAGE_SIZE = 60;

function PostersTab() {
  const qc = useQueryClient();
  const { data: categories = [] } = useCategories();
  const [filter, setFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Poster | null>(null);

  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [tagsInput, setTagsInput] = useState<string>("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [upProgress, setUpProgress] = useState<{ done: number; total: number; failed: number }>({
    done: 0, total: 0, failed: 0,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-posters", filter, page],
    queryFn: async () => {
      let q = supabase
        .from("posters")
        .select("id,title,image_url,original_url,category_id,tags,featured,hidden,edit_settings,badge,sales_count,views_count", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (filter !== "all") q = q.eq("category_id", filter);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as Poster[], count: count ?? 0 };
    },
  });

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!files || files.length === 0) return toast.error("Choose at least one image");
    if (!categoryId) return toast.error("Pick a category");
    setUploading(true);
    const list = Array.from(files);
    setUpProgress({ done: 0, total: list.length, failed: 0 });
    let success = 0;
    let failed = 0;
    try {
      const cat = categories.find((c) => c.id === categoryId);
      const CONCURRENCY = 6;
      let cursor = 0;
      const worker = async () => {
        while (cursor < list.length) {
          const i = cursor++;
          const file = list[i];
          try {
            const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
            const path = `${cat?.slug ?? "misc"}/${crypto.randomUUID()}.${ext}`;
            const signedUrl = await uploadAndSign("posters", path, file);
            const baseName = file.name.replace(/\.[^.]+$/, "");
            const finalTitle = title ? `${title} ${baseName}` : baseName;
            const tags = tagsInput
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean);
            const { error: insErr } = await supabase.from("posters").insert({
              title: finalTitle,
              category_id: categoryId,
              image_url: signedUrl,
              tags,
            });
            if (insErr) throw insErr;
            success++;
          } catch (err) {
            failed++;
            console.error("Upload failed for", file.name, err);
          } finally {
            setUpProgress({ done: success + failed, total: list.length, failed });
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker),
      );
      if (failed > 0) toast.error(`${failed} upload${failed === 1 ? "" : "s"} failed`);
      if (success > 0) toast.success(`Uploaded ${success} poster${success === 1 ? "" : "s"}`);
      setTitle("");
      setFiles(null);
      const input = document.getElementById("poster-files") as HTMLInputElement | null;
      if (input) input.value = "";
      qc.invalidateQueries({ queryKey: ["admin-posters"] });
      qc.invalidateQueries({ queryKey: ["posters"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (p: Poster) => {
    if (!confirm(`Delete "${p.title}"?`)) return;
    const { error } = await supabase.from("posters").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["admin-posters"] });
    qc.invalidateQueries({ queryKey: ["posters"] });
  };

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const selectAllOnPage = () => {
    const ids = data?.rows.map((r) => r.id) ?? [];
    setSelected(new Set(ids));
  };

  const clearSelected = () => setSelected(new Set());

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} posters?`)) return;
    const { error } = await supabase.from("posters").delete().in("id", Array.from(selected));
    if (error) return toast.error(error.message);
    toast.success(`Deleted ${selected.size} posters`);
    clearSelected();
    qc.invalidateQueries({ queryKey: ["admin-posters"] });
    qc.invalidateQueries({ queryKey: ["posters"] });
  };

  const bulkMove = async () => {
    if (selected.size === 0 || !bulkCategory) return;
    const { error } = await supabase
      .from("posters")
      .update({ category_id: bulkCategory })
      .in("id", Array.from(selected));
    if (error) return toast.error(error.message);
    toast.success(`Moved ${selected.size} posters`);
    clearSelected();
    qc.invalidateQueries({ queryKey: ["admin-posters"] });
    qc.invalidateQueries({ queryKey: ["posters"] });
  };

  const bulkToggle = async (patch: Partial<Poster>) => {
    if (selected.size === 0) return;
    const { error } = await supabase
      .from("posters")
      .update(patch as never)
      .in("id", Array.from(selected));
    if (error) return toast.error(error.message);
    toast.success(`Updated ${selected.size}`);
    qc.invalidateQueries({ queryKey: ["admin-posters"] });
    qc.invalidateQueries({ queryKey: ["posters"] });
  };

  const totalPages = Math.max(1, Math.ceil((data?.count ?? 0) / PAGE_SIZE));

  const [repairing, setRepairing] = useState(false);
  const repairImageUrls = async () => {
    if (repairing) return;
    setRepairing(true);
    let fixed = 0;
    let failed = 0;
    try {
      // Fetch in chunks to handle 5000+ posters.
      const CHUNK = 1000;
      let from = 0;
      while (true) {
        const { data: rows, error } = await supabase
          .from("posters")
          .select("id,image_url")
          .range(from, from + CHUNK - 1);
        if (error) throw error;
        if (!rows || rows.length === 0) break;
        for (const r of rows) {
          const path = extractStoragePath(r.image_url ?? "", "posters");
          if (!path) continue;
          try {
            const signed = await signStoragePath("posters", path);
            if (signed !== r.image_url) {
              const { error: upErr } = await supabase
                .from("posters")
                .update({ image_url: signed })
                .eq("id", r.id);
              if (upErr) throw upErr;
              fixed++;
            }
          } catch (e) {
            failed++;
            console.error("repair failed for", r.id, e);
          }
        }
        if (rows.length < CHUNK) break;
        from += CHUNK;
      }
      toast.success(`Repaired ${fixed} poster${fixed === 1 ? "" : "s"}${failed ? ` (${failed} failed)` : ""}`);
      qc.invalidateQueries({ queryKey: ["admin-posters"] });
      qc.invalidateQueries({ queryKey: ["posters"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Repair failed");
    } finally {
      setRepairing(false);
    }
  };

  return (
    <div>
      <BulkPosterUploader
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["admin-posters"] });
          qc.invalidateQueries({ queryKey: ["posters"] });
        }}
      />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <FilterPill active={filter === "all"} onClick={() => { setFilter("all"); setPage(0); }}>
            All ({data?.count ?? 0})
          </FilterPill>
          {categories.map((c) => (
            <FilterPill key={c.id} active={filter === c.id} onClick={() => { setFilter(c.id); setPage(0); }}>
              {indentCat(c, categories)}
            </FilterPill>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={repairImageUrls}
            disabled={repairing}
            className="rounded-sm border border-border px-3 py-1.5 text-[10px] uppercase tracking-widest hover:bg-accent disabled:opacity-50"
            title="Regenerate signed URLs for posters whose images don't load"
          >
            {repairing ? "Repairing…" : "Repair image URLs"}
          </button>
          <div className="text-xs text-muted-foreground">
            Page {page + 1} / {totalPages}
          </div>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-sm border border-primary bg-accent/40 p-3">
          <span className="text-xs uppercase tracking-widest">
            {selected.size} selected
          </span>
          <button onClick={selectAllOnPage} className="rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-background">
            Select page
          </button>
          <button onClick={clearSelected} className="rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-background">
            Clear
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
              className="rounded-sm border border-border bg-background px-2 py-1.5 text-xs"
            >
              <option value="">Move to category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{indentCat(c, categories)}</option>
              ))}
            </select>
            <button onClick={bulkMove} disabled={!bulkCategory} className="rounded-sm border border-border px-3 py-1.5 text-[10px] uppercase tracking-widest hover:bg-background disabled:opacity-40">
              Move
            </button>
            <button onClick={() => bulkToggle({ featured: true })} className="rounded-sm border border-border px-3 py-1.5 text-[10px] uppercase tracking-widest hover:bg-background">
              Feature
            </button>
            <button onClick={() => bulkToggle({ hidden: true })} className="rounded-sm border border-border px-3 py-1.5 text-[10px] uppercase tracking-widest hover:bg-background">
              Hide
            </button>
            <button onClick={() => bulkToggle({ hidden: false })} className="rounded-sm border border-border px-3 py-1.5 text-[10px] uppercase tracking-widest hover:bg-background">
              Show
            </button>
            <button onClick={bulkDelete} className="rounded-sm bg-destructive px-3 py-1.5 text-[10px] uppercase tracking-widest text-destructive-foreground hover:opacity-90">
              Delete
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {isLoading ? (
          <div className="col-span-full py-16 text-center text-sm text-muted-foreground">Loading…</div>
        ) : data?.rows.length === 0 ? (
          <div className="col-span-full py-16 text-center text-sm text-muted-foreground">No posters.</div>
        ) : (
          data?.rows.map((p) => (
            <div key={p.id} className={cn("group relative overflow-hidden rounded-sm border bg-card", selected.has(p.id) ? "border-primary ring-2 ring-primary/40" : "border-border")}>
              <label className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-sm bg-background/90 px-2 py-1 text-[10px] uppercase tracking-widest">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggleSelected(p.id)}
                />
                Select
              </label>
              <div className={cn("absolute right-2 top-2 z-10 flex flex-col items-end gap-1")}>
                {p.featured && <span className="rounded-sm bg-primary px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-primary-foreground">Featured</span>}
                {p.hidden && <span className="rounded-sm bg-destructive px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-destructive-foreground">Hidden</span>}
                {p.badge && <span className="rounded-sm bg-foreground px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-background">{p.badge}</span>}
              </div>
              <div className="aspect-[2/3] overflow-hidden">
                <FramePreview
                  posterUrl={p.image_url}
                  title={p.title}
                  editSettings={p.edit_settings}
                  aspectClassName="aspect-[2/3]"
                  bare
                  loading="lazy"
                  className="h-full w-full"
                />
              </div>
              <div className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm">{p.title}</div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {categories.find((c) => c.id === p.category_id)?.name ?? "—"}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                    ✔ {p.sales_count ?? 0} · 👁 {p.views_count ?? 0}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => setEditing(p)}
                    className="rounded-sm p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => remove(p)}
                    className="rounded-sm p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-8 flex items-center justify-center gap-2">
        <button
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          className="rounded-sm border border-border px-4 py-2 text-xs uppercase tracking-widest disabled:opacity-40"
        >
          ← Prev
        </button>
        <button
          disabled={page >= totalPages - 1}
          onClick={() => setPage((p) => p + 1)}
          className="rounded-sm border border-border px-4 py-2 text-xs uppercase tracking-widest disabled:opacity-40"
        >
          Next →
        </button>
      </div>

      {editing && (
        <EditPosterModal
          poster={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["admin-posters"] });
            qc.invalidateQueries({ queryKey: ["posters"] });
          }}
        />
      )}
    </div>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-sm border px-3 py-1.5 text-xs uppercase tracking-widest transition",
        active ? "border-primary bg-accent text-foreground" : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function EditPosterModal({
  poster, categories, onClose, onSaved,
}: {
  poster: Poster; categories: Category[]; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(poster.title);
  const [categoryId, setCategoryId] = useState(poster.category_id ?? "");
  const [tags, setTags] = useState((poster.tags ?? []).join(", "));
  const [description, setDescription] = useState(poster.description ?? "");
  const [seoTitle, setSeoTitle] = useState(poster.seo_title ?? "");
  const [seoDescription, setSeoDescription] = useState(poster.seo_description ?? "");
  const [aiBusy, setAiBusy] = useState(false);
  const [featured, setFeatured] = useState(!!poster.featured);
  const [hidden, setHidden] = useState(!!poster.hidden);
  const [badge, setBadge] = useState<string>(poster.badge ?? "");
  const [purchaseCount, setPurchaseCount] = useState<string>(String(poster.sales_count ?? 0));
  const [viewCount, setViewCount] = useState<string>(String(poster.views_count ?? 0));
  const [saving, setSaving] = useState(false);
  const [editArt, setEditArt] = useState(false);
  const [artSaving, setArtSaving] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState(poster.image_url);
  const [currentEdit, setCurrentEdit] = useState<EditSettings>(() => normalizeEditSettings(poster.edit_settings));
  // Prefer the untouched original for re-editing; fall back to current image.
  const editorSource = poster.original_url || currentImageUrl;

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("posters")
      .update({
        title,
        category_id: categoryId || null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        description: description || null,
        seo_title: seoTitle || null,
        seo_description: seoDescription || null,
        featured,
        hidden,
        badge: badge || null,
        sales_count: Math.max(0, Number(purchaseCount) || 0),
        views_count: Math.max(0, Number(viewCount) || 0),
      })
      .eq("id", poster.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    onSaved();
  };

  const runAi = async () => {
    setAiBusy(true);
    try {
      const currentCat = categories.find((c) => c.id === categoryId);
      const parentCat = currentCat?.parent_id
        ? categories.find((c) => c.id === currentCat.parent_id)
        : null;
      const categoryLabel = [parentCat?.name, currentCat?.name].filter(Boolean).join(" › ");
      const existingTags = tags.split(",").map((t) => t.trim()).filter(Boolean);
      const { data, error } = await supabase.functions.invoke("seo-generator", {
        body: {
          title: title || poster.title,
          subject: title || poster.title,
          category: categoryLabel || undefined,
          tags: existingTags,
        },
      });
      if (error) throw error;
      const meta = data as {
        title?: string;
        description?: string;
        seo_title?: string;
        seo_description?: string;
        tags?: string[];
        error?: string;
      };
      if (meta?.error) throw new Error(meta.error);
      if (meta.title) setTitle(meta.title);
      if (meta.description) setDescription(meta.description);
      if (meta.seo_title) setSeoTitle(meta.seo_title);
      if (meta.seo_description) setSeoDescription(meta.seo_description);
      if (Array.isArray(meta.tags) && meta.tags.length) {
        setTags(Array.from(new Set([...existingTags, ...meta.tags])).join(", "));
      }
      toast.success("AI generated — review and Save");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI failed");
    } finally {
      setAiBusy(false);
    }
  };

  const saveArtwork = async (s: EditSettings) => {
    setArtSaving(true);
    try {
      const img = await loadImage(editorSource);
      const outH = 2400;
      const outW = Math.round(outH * s.ratio);
      const blob = await renderEditToBlob(img, s, outW, outH, 0.92);
      const file = new File([blob], `${poster.id}-edited.jpg`, { type: "image/jpeg" });
      const path = `edits/${poster.id}/${Date.now()}.jpg`;
      const newUrl = await uploadAndSign("posters", path, file);
      const { error } = await supabase
        .from("posters")
        .update({ image_url: newUrl, edit_settings: s as never })
        .eq("id", poster.id);
      if (error) throw error;
      setCurrentImageUrl(newUrl);
      setCurrentEdit(s);
      setEditArt(false);
      toast.success("Artwork updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save artwork");
    } finally {
      setArtSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Edit poster">
      <div className="flex gap-4">
        <div className="flex flex-col items-center gap-2">
          <SafeImage src={currentImageUrl} alt={poster.title} className="h-48 w-32 rounded-sm object-cover" />
          <button
            type="button"
            onClick={() => setEditArt(true)}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border px-2 py-1.5 text-[10px] uppercase tracking-widest hover:bg-accent"
          >
            <Pencil className="h-3 w-3" /> Edit artwork
          </button>
        </div>
        <div className="flex-1 space-y-3">
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Category</span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">— Unassigned —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{indentCat(c, categories)}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Tags (comma separated)</span>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Messi, Barcelona, GOAT"
              className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Description / SEO</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">SEO Title</span>
              <input
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
                maxLength={70}
                className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">SEO Description</span>
              <input
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
                maxLength={200}
                className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
          </div>
          <div>
            <button
              type="button"
              onClick={runAi}
              disabled={aiBusy}
              className="inline-flex items-center gap-2 rounded-sm border border-primary/60 bg-primary/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-primary hover:bg-primary/20 disabled:opacity-50"
            >
              {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {aiBusy ? "Generating…" : (description || seoTitle ? "Regenerate with AI" : "Generate with AI")}
            </button>
          </div>
          <div className="flex gap-4 text-xs uppercase tracking-widest">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
              Featured
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
              Hidden
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Badge</span>
              <select
                value={badge}
                onChange={(e) => setBadge(e.target.value)}
                className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="">— None —</option>
                {POSTER_BADGES.map((b) => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Purchase count</span>
              <input
                type="number"
                min={0}
                value={purchaseCount}
                onChange={(e) => setPurchaseCount(e.target.value)}
                className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">View count</span>
              <div className="mt-1 flex gap-1">
                <input
                  type="number"
                  min={0}
                  value={viewCount}
                  onChange={(e) => setViewCount(e.target.value)}
                  className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => setViewCount("0")}
                  className="rounded-sm border border-border px-2 text-[10px] uppercase tracking-widest hover:bg-accent"
                  title="Reset views"
                >
                  Reset
                </button>
              </div>
            </label>
          </div>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-sm border border-border px-4 py-2 text-xs uppercase tracking-widest">
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {editArt && (
        <PosterImageEditor
          source={editorSource}
          initial={currentEdit}
          onCancel={() => setEditArt(false)}
          onSave={saveArtwork}
          saving={artSaving}
        />
      )}
      <div className="mt-6">
        <PosterImagesManager posterId={poster.id} />
      </div>
    </Modal>
  );
}

/* ---------- CATEGORIES ---------- */

function CategoriesTab() {
  const qc = useQueryClient();
  const { data: categories = [] } = useCategories();
  const [editing, setEditing] = useState<Category | "new-root" | { newUnder: string } | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cleanOpen, setCleanOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Poster counts per category_id (top ~1000 categories should be plenty)
  const { data: counts = {} } = useQuery({
    queryKey: ["category-poster-counts"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posters")
        .select("category_id")
        .not("category_id", "is", null)
        .limit(50000);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of (data ?? []) as Array<{ category_id: string | null }>) {
        if (!row.category_id) continue;
        map[row.category_id] = (map[row.category_id] ?? 0) + 1;
      }
      return map;
    },
  });

  const roots = categories.filter((c) => !c.parent_id);
  const childrenOf = (id: string) => categories.filter((c) => c.parent_id === id);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["categories"] });
    qc.invalidateQueries({ queryKey: ["category-poster-counts"] });
  };

  const toggleExpand = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const toggleHidden = async (c: Category) => {
    const { error } = await supabase
      .from("categories")
      .update({ hidden: !c.hidden })
      .eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success(!c.hidden ? "Hidden" : "Visible");
    invalidate();
  };

  const move = async (c: Category, dir: -1 | 1) => {
    const siblings = categories
      .filter((x) => (x.parent_id ?? null) === (c.parent_id ?? null))
      .sort((a, b) => a.sort_order - b.sort_order);
    const idx = siblings.findIndex((x) => x.id === c.id);
    const swap = siblings[idx + dir];
    if (!swap) return;
    await Promise.all([
      supabase.from("categories").update({ sort_order: swap.sort_order }).eq("id", c.id),
      supabase.from("categories").update({ sort_order: c.sort_order }).eq("id", swap.id),
    ]);
    invalidate();
  };

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const bulkDeleteEmpty = async () => {
    const ids = Array.from(selected).filter((id) => (counts[id] ?? 0) === 0 && childrenOf(id).length === 0);
    if (!ids.length) return toast.error("Selection is empty or contains non-empty subcategories");
    if (!confirm(`Delete ${ids.length} empty subcategor${ids.length === 1 ? "y" : "ies"}?`)) return;
    const { error } = await supabase.from("categories").delete().in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`Deleted ${ids.length}`);
    setSelected(new Set());
    invalidate();
  };

  const renderRow = (c: Category, depth: number) => {
    const kids = childrenOf(c.id);
    const count = counts[c.id] ?? 0;
    const isOpen = expanded.has(c.id);
    return (
      <div key={c.id}>
        <div
          className={cn(
            "flex items-center gap-2 border-b border-border px-2 py-2 text-sm",
            c.hidden && "opacity-60",
          )}
          style={{ paddingLeft: 8 + depth * 20 }}
        >
          {depth > 0 && (
            <input
              type="checkbox"
              checked={selected.has(c.id)}
              onChange={() => toggleSelect(c.id)}
              className="h-4 w-4"
            />
          )}
          {kids.length > 0 ? (
            <button
              onClick={() => toggleExpand(c.id)}
              className="w-5 text-muted-foreground"
              aria-label={isOpen ? "Collapse" : "Expand"}
            >
              {isOpen ? "▾" : "▸"}
            </button>
          ) : (
            <span className="w-5" />
          )}
          {c.icon ? (
            <SafeImage src={c.icon} alt="" className="h-6 w-6 rounded-sm object-cover" />
          ) : c.image ? (
            <SafeImage src={c.image} alt="" className="h-6 w-6 rounded-sm object-cover" />
          ) : (
            <span className="h-6 w-6 rounded-sm bg-muted" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">
              {c.name}
              {c.hidden && (
                <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                  hidden
                </span>
              )}
            </div>
            <div className="truncate text-[10px] uppercase tracking-widest text-muted-foreground">
              /{c.slug} · {count} poster{count === 1 ? "" : "s"}
              {kids.length > 0 && ` · ${kids.length} sub`}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => move(c, -1)}
              className="rounded-sm p-1.5 text-muted-foreground hover:bg-accent"
              title="Move up"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => move(c, 1)}
              className="rounded-sm p-1.5 text-muted-foreground hover:bg-accent"
              title="Move down"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setEditing({ newUnder: c.id })}
              className="rounded-sm p-1.5 text-muted-foreground hover:bg-accent"
              title="Add subcategory"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => toggleHidden(c)}
              className="rounded-sm p-1.5 text-muted-foreground hover:bg-accent"
              title={c.hidden ? "Show" : "Hide"}
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setEditing(c)}
              className="rounded-sm p-1.5 text-muted-foreground hover:bg-accent"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setDeleting(c)}
              className="rounded-sm p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {isOpen && kids.map((k) => renderRow(k, depth + 1))}
      </div>
    );
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          {roots.length} main · {categories.length - roots.length} sub
        </div>
        <div className="flex flex-wrap gap-2">
          {selected.size > 0 && (
            <button
              onClick={bulkDeleteEmpty}
              className="inline-flex items-center gap-2 rounded-sm border border-destructive px-3 py-2 text-xs uppercase tracking-widest text-destructive"
            >
              <Trash2 className="h-4 w-4" /> Delete empty ({selected.size})
            </button>
          )}
          <button
            onClick={() => setCleanOpen(true)}
            className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest"
          >
            <Sparkles className="h-4 w-4" /> Clean categories
          </button>
          <button
            onClick={() => setEditing("new-root")}
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> New main category
          </button>
        </div>
      </div>

      <div className="rounded-sm border border-border bg-card">
        {roots.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">No categories yet.</div>
        ) : (
          roots.map((r) => (
            <div key={r.id} className="border-b border-border last:border-b-0">
              {renderRow(r, 0)}
              {!expanded.has(r.id) && childrenOf(r.id).length > 0 && (
                <div className="pl-14 py-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                  {childrenOf(r.id).length} subcategories — click ▸ to expand
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Orphans (parent_id points to a missing category) */}
      {(() => {
        const ids = new Set(categories.map((c) => c.id));
        const orphans = categories.filter((c) => c.parent_id && !ids.has(c.parent_id));
        if (!orphans.length) return null;
        return (
          <div className="mt-6 rounded-sm border border-amber-500/50 bg-amber-500/10 p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400">
              Orphaned subcategories ({orphans.length})
            </div>
            <ul className="space-y-1 text-sm">
              {orphans.map((o) => (
                <li key={o.id} className="flex items-center justify-between">
                  <span>{o.name} <span className="text-muted-foreground">/{o.slug}</span></span>
                  <button
                    onClick={() => setEditing(o)}
                    className="rounded-sm border border-border px-2 py-1 text-xs uppercase tracking-widest"
                  >
                    Fix parent
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      {editing && (
        <EditCategoryModal
          category={
            editing === "new-root" || typeof editing === "object" && "newUnder" in editing
              ? null
              : editing
          }
          defaultParentId={
            typeof editing === "object" && editing && "newUnder" in editing ? editing.newUnder : ""
          }
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            invalidate();
          }}
        />
      )}

      {deleting && (
        <DeleteCategoryModal
          category={deleting}
          posterCount={counts[deleting.id] ?? 0}
          categories={categories}
          onClose={() => setDeleting(null)}
          onDone={() => {
            setDeleting(null);
            invalidate();
          }}
        />
      )}

      {cleanOpen && (
        <CleanCategoriesModal
          categories={categories}
          counts={counts}
          onClose={() => setCleanOpen(false)}
          onChanged={invalidate}
        />
      )}
    </div>
  );
}

function DeleteCategoryModal({
  category, posterCount, categories, onClose, onDone,
}: {
  category: Category;
  posterCount: number;
  categories: Category[];
  onClose: () => void;
  onDone: () => void;
}) {
  const hasKids = categories.some((c) => c.parent_id === category.id);
  const [action, setAction] = useState<"move" | "unassign" | "">("");
  const [moveTo, setMoveTo] = useState("");
  const [busy, setBusy] = useState(false);

  const options = categories.filter((c) => c.id !== category.id && !c.parent_id ? true : c.parent_id !== null && c.id !== category.id);

  const commit = async () => {
    setBusy(true);
    try {
      if (hasKids) {
        toast.error("Move or delete its subcategories first");
        return;
      }
      if (posterCount > 0) {
        if (action === "move") {
          if (!moveTo) return toast.error("Pick a target subcategory");
          const { error } = await supabase
            .from("posters")
            .update({ category_id: moveTo })
            .eq("category_id", category.id);
          if (error) throw error;
        } else if (action === "unassign") {
          const { error } = await supabase
            .from("posters")
            .update({ category_id: null })
            .eq("category_id", category.id);
          if (error) throw error;
        } else {
          return toast.error("Choose what to do with the posters");
        }
      }
      const { error } = await supabase.from("categories").delete().eq("id", category.id);
      if (error) throw error;
      toast.success("Deleted");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title={`Delete "${category.name}"`}>
      {hasKids ? (
        <p className="text-sm text-destructive">
          This category has subcategories. Move or delete them first.
        </p>
      ) : posterCount === 0 ? (
        <p className="text-sm text-muted-foreground">This subcategory is empty. Delete it?</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">
            This subcategory contains <strong>{posterCount}</strong> poster{posterCount === 1 ? "" : "s"}.
            What do you want to do?
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="del" checked={action === "move"} onChange={() => setAction("move")} />
            <div className="flex-1">
              <div>Move posters to another subcategory</div>
              {action === "move" && (
                <select
                  value={moveTo}
                  onChange={(e) => setMoveTo(e.target.value)}
                  className="mt-2 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">— Choose target —</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>{indentCat(o, categories)}</option>
                  ))}
                </select>
              )}
            </div>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="del" checked={action === "unassign"} onChange={() => setAction("unassign")} />
            Remove the subcategory from posters (leave them uncategorized)
          </label>
        </div>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-sm border border-border px-4 py-2 text-xs uppercase tracking-widest">
          Cancel
        </button>
        <button
          onClick={commit}
          disabled={busy || hasKids}
          className="rounded-sm bg-destructive px-4 py-2 text-xs uppercase tracking-widest text-destructive-foreground disabled:opacity-50"
        >
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </Modal>
  );
}

function CleanCategoriesModal({
  categories, counts, onClose, onChanged,
}: {
  categories: Category[];
  counts: Record<string, number>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const ids = new Set(categories.map((c) => c.id));
  const orphans = categories.filter((c) => c.parent_id && !ids.has(c.parent_id));
  const empties = categories.filter(
    (c) => c.parent_id && (counts[c.id] ?? 0) === 0 && !categories.some((k) => k.parent_id === c.id),
  );
  const bySlug = new Map<string, Category[]>();
  for (const c of categories) {
    const key = `${c.parent_id ?? "root"}::${c.slug.toLowerCase()}`;
    if (!bySlug.has(key)) bySlug.set(key, []);
    bySlug.get(key)!.push(c);
  }
  const dups = Array.from(bySlug.values()).filter((g) => g.length > 1);

  const deleteMany = async (list: Category[]) => {
    if (!list.length) return;
    if (!confirm(`Delete ${list.length} categor${list.length === 1 ? "y" : "ies"}?`)) return;
    const { error } = await supabase.from("categories").delete().in("id", list.map((c) => c.id));
    if (error) return toast.error(error.message);
    toast.success("Cleaned");
    onChanged();
  };

  return (
    <Modal onClose={onClose} title="Clean categories">
      <div className="space-y-4 text-sm">
        <section>
          <div className="mb-1 font-semibold">Empty subcategories ({empties.length})</div>
          {empties.length ? (
            <>
              <ul className="mb-2 max-h-40 overflow-auto rounded-sm border border-border p-2">
                {empties.map((e) => (
                  <li key={e.id} className="truncate">{indentCat(e, categories)}</li>
                ))}
              </ul>
              <button
                onClick={() => deleteMany(empties)}
                className="rounded-sm border border-destructive px-3 py-1.5 text-xs uppercase tracking-widest text-destructive"
              >
                Delete all empty
              </button>
            </>
          ) : (
            <p className="text-muted-foreground">None.</p>
          )}
        </section>

        <section>
          <div className="mb-1 font-semibold">Orphaned subcategories ({orphans.length})</div>
          {orphans.length ? (
            <ul className="max-h-40 overflow-auto rounded-sm border border-border p-2">
              {orphans.map((o) => (
                <li key={o.id} className="truncate">{o.name} /{o.slug}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">None.</p>
          )}
        </section>

        <section>
          <div className="mb-1 font-semibold">Duplicate slugs ({dups.length})</div>
          {dups.length ? (
            <ul className="max-h-40 overflow-auto rounded-sm border border-border p-2">
              {dups.map((g) => (
                <li key={g[0].slug} className="truncate">
                  /{g[0].slug} × {g.length}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">None.</p>
          )}
        </section>
      </div>
      <div className="mt-6 flex justify-end">
        <button onClick={onClose} className="rounded-sm border border-border px-4 py-2 text-xs uppercase tracking-widest">
          Close
        </button>
      </div>
    </Modal>
  );
}

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function indentCat(c: Category, all: Category[]): string {
  let depth = 0;
  let cur: Category | undefined = c;
  while (cur?.parent_id) {
    cur = all.find((x) => x.id === cur!.parent_id);
    depth++;
    if (depth > 8) break;
  }
  return `${"— ".repeat(depth)}${c.name}`;
}

function EditCategoryModal({
  category, defaultParentId, onClose, onSaved,
}: { category: Category | null; defaultParentId?: string; onClose: () => void; onSaved: () => void }) {
  const isNew = !category;
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [imageUrl, setImageUrl] = useState(category?.image ?? "");
  const [iconUrl, setIconUrl] = useState(category?.icon ?? "");
  const [sortOrder, setSortOrder] = useState<number>(category?.sort_order ?? 0);
  const [parentId, setParentId] = useState<string>(category?.parent_id ?? defaultParentId ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const { data: allCats = [] } = useCategories();

  const save = async () => {
    if (!name.trim()) return toast.error("Name required");
    setSaving(true);
    try {
      let finalImage = imageUrl;
      if (file) {
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `_categories/${crypto.randomUUID()}.${ext}`;
        finalImage = await uploadAndSign("posters", path, file);
      }
      let finalIcon = iconUrl;
      if (iconFile) {
        const ext = iconFile.name.split(".").pop() ?? "png";
        const path = `_categories/icons/${crypto.randomUUID()}.${ext}`;
        finalIcon = await uploadAndSign("posters", path, iconFile);
      }
      const payload = {
        name: name.trim(),
        slug: (slug || slugify(name)).trim(),
        image: finalImage || null,
        icon: finalIcon || null,
        sort_order: sortOrder,
        parent_id: parentId || null,
      };
      const { error } = isNew
        ? await supabase.from("categories").insert(payload)
        : await supabase.from("categories").update(payload).eq("id", category!.id);
      if (error) throw error;
      toast.success(isNew ? "Category created" : "Saved");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title={isNew ? "New category" : "Edit category"}>
      <div className="space-y-3">
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Name</span>
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); if (isNew && !slug) setSlug(slugify(e.target.value)); }}
            className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Slug (URL)</span>
          <input
            value={slug}
            onChange={(e) => setSlug(slugify(e.target.value))}
            className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Parent category (for subcategories)</span>
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">— None (top-level) —</option>
            {allCats.filter((c) => c.id !== category?.id).map((c) => (
              <option key={c.id} value={c.id}>{indentCat(c, allCats)}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Sort order</span>
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Cover image</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 w-full text-sm text-muted-foreground"
          />
          {imageUrl && !file && (
            <SafeImage src={imageUrl} alt="" className="mt-2 h-24 w-40 rounded-sm object-cover" />
          )}
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Icon (small square)</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setIconFile(e.target.files?.[0] ?? null)}
            className="mt-1 w-full text-sm text-muted-foreground"
          />
          {iconUrl && !iconFile && (
            <SafeImage src={iconUrl} alt="" className="mt-2 h-12 w-12 rounded-sm object-cover" />
          )}
        </label>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-sm border border-border px-4 py-2 text-xs uppercase tracking-widest">
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

/* ---------- ORDERS ---------- */

type Order = {
  id: string;
  order_number: string | null;
  customer_name: string;
  phone: string;
  governorate: string;
  address: string;
  frame_type: string;
  frame_color: string;
  size: string;
  quantity: number;
  poster_title: string | null;
  poster_image: string | null;
  total_price: number;
  shipping_cost: number | null;
  packaging_fee: number | null;
  status: string;
  created_at: string;
  payment_method: string | null;
  payment_status: string | null;
  payment_screenshot: string | null;
  payment_notes: string | null;
  payment_verified_at: string | null;
  is_test?: boolean | null;
};

const STATUSES = ["new", "processing", "printed", "shipped", "delivered", "cancelled"];
const PAYMENT_STATUSES = ["not_required", "pending", "received", "verified", "rejected"] as const;
const PAYMENT_STATUS_LABEL: Record<string, string> = {
  not_required: "COD (no payment)",
  pending: "Pending Payment",
  received: "Payment Received",
  verified: "Payment Verified",
  rejected: "Rejected",
};
const PAYMENT_STATUS_TONE: Record<string, string> = {
  not_required: "bg-muted text-muted-foreground",
  pending: "bg-amber-500/15 text-amber-500",
  received: "bg-blue-500/15 text-blue-400",
  verified: "bg-emerald-500/15 text-emerald-400",
  rejected: "bg-red-500/15 text-red-400",
};

/**
 * Canonical order lifecycle exposed in the admin. Legacy DB values
 * ("processing" / "printed") are still accepted from historical rows but the
 * dashboard writes the new canonical values going forward.
 */
const ORDER_STATUSES = [
  "new",
  "confirmed",
  "printing",
  "shipped",
  "delivered",
  "cancelled",
] as const;

const STATUS_LABEL: Record<string, string> = {
  new: "New Order",
  confirmed: "Confirmed",
  processing: "Confirmed", // legacy → shown as Confirmed
  printing: "Printing",
  printed: "Printing", // legacy → shown as Printing
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<string, string> = {
  new: "bg-blue-500/15 text-blue-400 border-blue-500/40",
  confirmed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  processing: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  printing: "bg-orange-500/15 text-orange-400 border-orange-500/40",
  printed: "bg-orange-500/15 text-orange-400 border-orange-500/40",
  shipped: "bg-purple-500/15 text-purple-400 border-purple-500/40",
  delivered: "bg-emerald-700/25 text-emerald-300 border-emerald-700/50",
  cancelled: "bg-red-500/15 text-red-400 border-red-500/40",
};

function StatusBadge({ status }: { status: string }) {
  const key = status || "new";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-1 text-[10px] font-semibold uppercase tracking-widest",
        STATUS_TONE[key] ?? "bg-muted text-muted-foreground border-border",
      )}
    >
      {STATUS_LABEL[key] ?? key}
    </span>
  );
}

/** Group order-rows into logical customer orders. Each cart-checkout inserts
 * multiple rows (one per item) that share phone + guest_session_id and land in
 * the same second; we bucket by (session/phone, 2-minute window). */
type OrderGroup = {
  groupId: string;
  primaryNumber: string;
  orderNumbers: string[];
  customer_name: string;
  phone: string;
  governorate: string;
  address: string;
  created_at: string;
  status: string;
  payment_method: string | null;
  payment_status: string | null;
  is_test: boolean;
  items: Order[];
  itemsCount: number; // sum of quantities
  linesCount: number; // number of DB rows
  subtotal: number;
  shipping: number;
  packaging: number;
  total: number;
};

type OrderRowRaw = Order & {
  notes?: string | null;
  guest_session_id?: string | null;
  user_id?: string | null;
  subtotal?: number | null;
};

function groupOrders(rows: OrderRowRaw[]): OrderGroup[] {
  const byKey = new Map<string, OrderRowRaw[]>();
  for (const r of rows) {
    const ident = r.guest_session_id || r.user_id || r.phone || r.id;
    const bucket = Math.floor(new Date(r.created_at).getTime() / 120_000); // 2 min
    const key = `${ident}::${bucket}`;
    const arr = byKey.get(key) ?? [];
    arr.push(r);
    byKey.set(key, arr);
  }
  const groups: OrderGroup[] = [];
  for (const [key, arr] of byKey) {
    const sorted = [...arr].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const first = sorted[0];
    const numbers = sorted.map((r) => r.order_number).filter(Boolean) as string[];
    // Majority status across items
    const counts = new Map<string, number>();
    sorted.forEach((r) => counts.set(r.status, (counts.get(r.status) ?? 0) + 1));
    let status = first.status;
    let best = 0;
    counts.forEach((c, s) => { if (c > best) { best = c; status = s; } });
    groups.push({
      groupId: key,
      primaryNumber: numbers[0] ?? first.id.slice(0, 8),
      orderNumbers: numbers.length ? numbers : [first.id.slice(0, 8)],
      customer_name: first.customer_name,
      phone: first.phone,
      governorate: first.governorate,
      address: first.address,
      created_at: first.created_at,
      status,
      payment_method: first.payment_method,
      payment_status: first.payment_status,
      is_test: !!first.is_test,
      items: sorted,
      linesCount: sorted.length,
      itemsCount: sorted.reduce((s, r) => s + (Number(r.quantity) || 0), 0),
      subtotal: sorted.reduce((s, r) => s + Number((r as OrderRowRaw).subtotal ?? 0), 0),
      shipping: sorted.reduce((s, r) => s + Number(r.shipping_cost ?? 0), 0),
      packaging: sorted.reduce((s, r) => s + Number(r.packaging_fee ?? 0), 0),
      total: sorted.reduce((s, r) => s + Number(r.total_price ?? 0), 0),
    });
  }
  groups.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return groups;
}

/** Build the customer WhatsApp confirmation message (Arabic). */
function buildWhatsAppMessage(g: OrderGroup): string {
  const lines = g.items
    .map((i, idx) => {
      const title = i.poster_title || "منتج";
      return `${idx + 1}) ${title} — ${i.size} · ${i.frame_type} · ${i.frame_color} · الكمية: ${i.quantity}`;
    })
    .join("\n");
  return (
    `أهلًا بحضرتك يا ${g.customer_name} 👋\n` +
    `معاك فريق Brwaz W Neon ❤️\n\n` +
    `حابين نأكد مع حضرتك تفاصيل الأوردر رقم #${g.primaryNumber}:\n\n` +
    `المنتجات المطلوبة:\n${lines}\n\n` +
    `العنوان:\n${g.governorate} — ${g.address}\n\n` +
    `إجمالي الطلب:\n${Math.round(g.total)} جنيه\n\n` +
    `من فضلك أكد لنا إن كل البيانات تمام، وإن الصور والمقاسات صحيحة، عشان نبدأ تجهيز الأوردر للطباعة ✅\n\n` +
    `شكرًا لثقتك في Brwaz W Neon ❤️`
  );
}

function waLinkFor(phone: string, message: string) {
  const digits = phone.replace(/\D/g, "");
  // Egypt local format 01xxxxxxxxx → +20 1xxxxxxxxx
  const intl = digits.startsWith("20") ? digits : digits.startsWith("0") ? `2${digits}` : digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}

function OrdersTab() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [govFilter, setGovFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [viewing, setViewing] = useState<OrderGroup | null>(null);
  const [showTests, setShowTests] = useState(false);

  const { data: orders = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-orders", statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select("id,order_number,customer_name,phone,governorate,address,frame_type,frame_color,size,quantity,poster_title,poster_image,total_price,subtotal,shipping_cost,packaging_fee,status,created_at,payment_method,payment_status,payment_screenshot,payment_notes,payment_verified_at,is_test,notes,guest_session_id,user_id")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as OrderRowRaw[];
    },
  });

  const groups = useMemo(() => groupOrders(orders), [orders]);
  const governorates = Array.from(new Set(orders.map((o) => o.governorate).filter(Boolean))).sort();
  const testCount = groups.filter((g) => g.is_test).length;

  const filtered = groups.filter((g) => {
    if (showTests !== g.is_test) return false;
    if (govFilter !== "all" && g.governorate !== govFilter) return false;
    if (dateFrom && new Date(g.created_at) < new Date(dateFrom)) return false;
    if (dateTo && new Date(g.created_at) > new Date(`${dateTo}T23:59:59`)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const hit =
        g.orderNumbers.some((n) => n.toLowerCase().includes(q)) ||
        g.customer_name.toLowerCase().includes(q) ||
        g.phone.toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });

  // Keep the currently-viewed group in sync with fresh fetches (status/payment
  // changes trigger a refetch; re-select the same group by id).
  useEffect(() => {
    if (!viewing) return;
    const fresh = groups.find((g) => g.groupId === viewing.groupId);
    if (fresh && fresh !== viewing) setViewing(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  const stats = {
    total: groups.length,
    revenue: groups.reduce((s, g) => s + g.total, 0),
    newCount: groups.filter((g) => g.status === "new").length,
    processing: groups.filter((g) => g.status === "confirmed" || g.status === "processing").length,
    delivered: groups.filter((g) => g.status === "delivered").length,
  };

  const setGroupStatus = async (g: OrderGroup, status: string) => {
    const ids = g.items.map((i) => i.id);
    const { error } = await supabase.from("orders").update({ status }).in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`Order marked ${STATUS_LABEL[status] ?? status}`);
    qc.invalidateQueries({ queryKey: ["admin-orders"] });
  };

  const setPaymentStatus = async (o: Order, payment_status: string) => {
    const patch = payment_status === "verified"
      ? { payment_status, payment_verified_at: new Date().toISOString() }
      : { payment_status };
    const { error } = await supabase.from("orders").update(patch).eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success("Payment status updated");
    qc.invalidateQueries({ queryKey: ["admin-orders"] });
  };

  const removeGroup = async (g: OrderGroup) => {
    if (!confirm(`Delete order ${g.primaryNumber}? This removes all ${g.linesCount} item row(s).`)) return;
    const ids = g.items.map((i) => i.id);
    const { error } = await supabase.from("orders").delete().in("id", ids);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    setViewing(null);
    qc.invalidateQueries({ queryKey: ["admin-orders"] });
  };

  const convertToReal = async (g: OrderGroup) => {
    if (!confirm("Convert this test order into a real one? It will start counting in analytics and sales.")) return;
    const ids = g.items.map((i) => i.id);
    const { error } = await supabase.from("orders").update({ is_test: false } as never).in("id", ids);
    if (error) return toast.error(error.message);
    toast.success("Converted to real order");
    qc.invalidateQueries({ queryKey: ["admin-orders"] });
  };

  const exportExcel = () => {
    const rows: Record<string, string | number>[] = [];
    for (const g of filtered) {
      for (const o of g.items) {
        rows.push({
          "Order Number": o.order_number ?? o.id.slice(0, 8),
          "Date": new Date(o.created_at).toLocaleString(),
          "Customer": o.customer_name,
          "Phone": o.phone,
          "Governorate": o.governorate,
          "Address": o.address,
          "Poster": o.poster_title ?? "",
          "Frame Type": o.frame_type,
          "Frame Color": o.frame_color,
          "Size": o.size,
          "Quantity": o.quantity,
          "Shipping": Number(o.shipping_cost ?? 0),
          "Packaging": Number(o.packaging_fee ?? 0),
          "Total": Number(o.total_price ?? 0),
          "Status": STATUS_LABEL[o.status] ?? o.status,
        });
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Orders");
    XLSX.writeFile(wb, `brwazwneon-orders-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border bg-card/50 p-3">
        <TestModeControls />
        <button
          type="button"
          onClick={() => setShowTests((v) => !v)}
          className={cn(
            "inline-flex items-center gap-2 rounded-sm border px-3 py-2 text-[11px] font-semibold uppercase tracking-widest transition",
            showTests
              ? "border-primary bg-primary/15 text-primary"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {showTests ? "Viewing test orders" : `Show test orders (${testCount})`}
        </button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total orders" value={stats.total} />
        <StatCard label="Revenue" value={`${Math.round(stats.revenue)} EGP`} />
        <StatCard label="New" value={stats.newCount} />
        <StatCard label="Confirmed" value={stats.processing} />
        <StatCard label="Delivered" value={stats.delivered} />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, name, phone…"
            className="w-64 rounded-sm border border-border bg-background py-2 pl-8 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <select
          value={govFilter}
          onChange={(e) => setGovFilter(e.target.value)}
          className="rounded-sm border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All governorates</option>
          {governorates.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <label className="flex flex-col text-[10px] uppercase tracking-widest text-muted-foreground">
          From
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="mt-1 rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col text-[10px] uppercase tracking-widest text-muted-foreground">
          To
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="mt-1 rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        {(dateFrom || dateTo || search || govFilter !== "all") && (
          <button
            onClick={() => { setDateFrom(""); setDateTo(""); setSearch(""); setGovFilter("all"); }}
            className="rounded-sm border border-border px-3 py-2 text-[11px] uppercase tracking-widest hover:bg-accent"
          >
            Clear
          </button>
        )}
        <button
          onClick={exportExcel}
          className="ml-auto inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
        >
          <Download className="h-4 w-4" /> Export Excel
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <FilterPill active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
          All
        </FilterPill>
        {ORDER_STATUSES.map((s) => (
          <FilterPill key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
            {STATUS_LABEL[s] ?? s}
          </FilterPill>
        ))}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center gap-3 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          Loading orders…
        </div>
      ) : isError ? (
        <div className="rounded-sm border border-red-500/40 bg-red-500/10 p-6 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-red-400" />
          <div className="mt-3 text-sm text-red-300">
            Couldn't load orders: {(error as Error)?.message ?? "unknown error"}
          </div>
          <button
            onClick={() => refetch()}
            className="mt-4 inline-flex items-center gap-2 rounded-sm border border-red-500/40 bg-red-500/10 px-4 py-2 text-[11px] uppercase tracking-widest text-red-200 hover:bg-red-500/20"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-sm border border-dashed border-border p-12 text-center">
          <Package className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <div className="mt-3 text-sm text-muted-foreground">
            {orders.length === 0
              ? "No orders yet. New customer orders will appear here automatically."
              : "No orders match your filters."}
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((g) => (
            <OrderCard
              key={g.groupId}
              g={g}
              onView={() => setViewing(g)}
              onDelete={() => removeGroup(g)}
              onConvert={() => convertToReal(g)}
              onStatus={(s) => setGroupStatus(g, s)}
            />
          ))}
        </div>
      )}

      {viewing && (
        <OrderDetailsModal
          g={viewing}
          onClose={() => setViewing(null)}
          onStatus={(s) => setGroupStatus(viewing, s)}
          onPaymentStatus={setPaymentStatus}
          onDelete={() => removeGroup(viewing)}
        />
      )}
    </div>
  );
}

/* ---------- Order card (list row) ---------- */

function OrderCard({
  g,
  onView,
  onDelete,
  onConvert,
  onStatus,
}: {
  g: OrderGroup;
  onView: () => void;
  onDelete: () => void;
  onConvert: () => void;
  onStatus: (s: string) => void;
}) {
  const waHref = waLinkFor(g.phone, buildWhatsAppMessage(g));
  return (
    <div className="rounded-sm border border-border bg-card p-4 transition hover:border-primary/60">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onView}
              className="text-display text-xl font-semibold underline-offset-4 hover:underline"
            >
              #{g.primaryNumber}
            </button>
            <StatusBadge status={g.status} />
            {g.is_test && (
              <span className="inline-flex items-center rounded-sm border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-primary">
                TEST
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(g.created_at).toLocaleString()}</span>
            <span className="inline-flex items-center gap-1"><Package className="h-3 w-3" />{g.linesCount} item{g.linesCount === 1 ? "" : "s"} · {g.itemsCount} pc</span>
            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{g.governorate}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-display text-2xl">{Math.round(g.total)} EGP</div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {g.payment_method === "instapay" ? "Instapay / Vodafone" : "Cash on delivery"}
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="min-w-0 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
            {g.customer_name}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted-foreground">
            <PhoneIcon className="h-3 w-3" />
            <span dir="ltr">{g.phone}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={g.status}
            onChange={(e) => onStatus(e.target.value)}
            className="rounded-sm border border-border bg-background px-2 py-1.5 text-xs"
            aria-label="Change status"
          >
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          <button
            onClick={onView}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border px-3 py-1.5 text-[11px] uppercase tracking-widest hover:bg-accent"
          >
            <Eye className="h-3.5 w-3.5" /> View Details
          </button>
          <a
            href={waHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[11px] uppercase tracking-widest text-emerald-300 hover:bg-emerald-500/20"
          >
            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
          </a>
          {g.is_test && (
            <button
              onClick={onConvert}
              className="rounded-sm p-1.5 text-muted-foreground hover:text-primary"
              title="Convert to real order"
              aria-label="Convert to real order"
            >
              <ShoppingBag className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onDelete}
            className="rounded-sm p-1.5 text-muted-foreground hover:text-destructive"
            aria-label="Delete order"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Order details modal (large) ---------- */

function OrderDetailsModal({
  g,
  onClose,
  onStatus,
  onPaymentStatus,
  onDelete,
}: {
  g: OrderGroup;
  onClose: () => void;
  onStatus: (s: string) => void;
  onPaymentStatus: (o: Order, s: string) => void;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const message = useMemo(() => buildWhatsAppMessage(g), [g]);
  const waHref = waLinkFor(g.phone, message);
  const customerNotes = (g.items[0] as OrderRowRaw).notes;

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Message copied successfully");
    } catch {
      toast.error("Could not copy — please copy manually");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="my-8 w-full max-w-4xl rounded-sm border border-border bg-card"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/95 p-5 backdrop-blur">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-display text-2xl">Order #{g.primaryNumber}</h3>
              <StatusBadge status={g.status} />
              {g.is_test && (
                <span className="rounded-sm border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-primary">
                  TEST
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              <Calendar className="mr-1 inline h-3 w-3" />
              {new Date(g.created_at).toLocaleString()}
              {g.orderNumbers.length > 1 && (
                <span className="ml-2">· Line refs: {g.orderNumbers.join(", ")}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-5">
          {/* Customer + status column */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-sm border border-border bg-background p-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Customer</div>
              <div className="mt-2 space-y-1.5 text-sm">
                <div className="flex items-center gap-2"><UserIcon className="h-3.5 w-3.5 text-muted-foreground" />{g.customer_name}</div>
                <div className="flex items-center gap-2"><PhoneIcon className="h-3.5 w-3.5 text-muted-foreground" /><span dir="ltr">{g.phone}</span></div>
                <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" /><div><div>{g.governorate}</div><div className="text-muted-foreground">{g.address}</div></div></div>
                {customerNotes && (
                  <div className="flex items-start gap-2 pt-1"><StickyNote className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" /><div className="text-muted-foreground">{customerNotes}</div></div>
                )}
              </div>
            </div>

            <div className="rounded-sm border border-border bg-background p-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Order status</div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ORDER_STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => onStatus(s)}
                    className={cn(
                      "rounded-sm border px-2 py-2 text-[11px] font-semibold uppercase tracking-widest transition",
                      g.status === s
                        ? STATUS_TONE[s]
                        : "border-border text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-sm border border-border p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">Payment</div>
                  <div className="mt-1">{g.payment_method === "instapay" ? "Instapay / Vodafone" : "Cash on delivery"}</div>
                </div>
                <div className="rounded-sm border border-border p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">Payment status</div>
                  <div className="mt-1">{PAYMENT_STATUS_LABEL[g.payment_status ?? "not_required"]}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-display text-lg">Items ({g.linesCount})</h4>
              <div className="text-xs text-muted-foreground">Total pieces: {g.itemsCount}</div>
            </div>
            <div className="grid gap-3">
              {g.items.map((it, idx) => <ItemCard key={it.id} item={it as OrderRowRaw} index={idx + 1} />)}
            </div>
          </div>

          {/* Totals */}
          <div className="rounded-sm border border-border bg-background p-4">
            <div className="grid gap-1 text-sm sm:grid-cols-4">
              <TotalCell label="Subtotal" value={`${Math.round(g.subtotal || g.total - g.shipping - g.packaging)} EGP`} />
              <TotalCell label="Shipping" value={`${Math.round(g.shipping)} EGP`} />
              <TotalCell label="Packaging" value={`${Math.round(g.packaging)} EGP`} />
              <TotalCell label="Total" value={`${Math.round(g.total)} EGP`} emphasize />
            </div>
          </div>

          {/* Payment screenshot (only for instapay orders) */}
          {g.items[0].payment_method === "instapay" && (
            <PaymentScreenshotBlock
              order={g.items[0]}
              onUpdate={() => qc.invalidateQueries({ queryKey: ["admin-orders"] })}
            />
          )}
          {g.payment_method === "instapay" && g.items.length > 1 && (
            <div className="mt-2 space-y-2 text-xs text-muted-foreground">
              Additional payment lines:
              <div className="grid gap-2 sm:grid-cols-2">
                {g.items.slice(1).map((it) => (
                  <div key={it.id} className="rounded-sm border border-border p-2">
                    <div>Ref: {it.order_number ?? it.id.slice(0, 8)}</div>
                    <select
                      value={it.payment_status ?? "not_required"}
                      onChange={(e) => onPaymentStatus(it, e.target.value)}
                      className={`mt-1 w-full rounded-sm border border-border bg-background px-2 py-1 text-[11px] ${PAYMENT_STATUS_TONE[it.payment_status ?? "not_required"] ?? ""}`}
                    >
                      {PAYMENT_STATUSES.map((s) => (
                        <option key={s} value={s}>{PAYMENT_STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* WhatsApp confirmation */}
          <div className="rounded-sm border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-display text-lg">WhatsApp confirmation template</div>
                <div className="text-[11px] text-muted-foreground">Ready-to-send Arabic confirmation for the customer.</div>
              </div>
              <MessageCircle className="h-5 w-5 text-emerald-400" />
            </div>
            <textarea
              readOnly
              value={message}
              dir="rtl"
              rows={12}
              className="w-full rounded-sm border border-border bg-background p-3 text-sm outline-none focus:border-primary"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={copyMessage}
                className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-background px-3 py-2 text-[11px] uppercase tracking-widest hover:bg-accent"
              >
                <Copy className="h-3.5 w-3.5" /> Copy WhatsApp Message
              </button>
              <a
                href={waHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[11px] uppercase tracking-widest text-emerald-300 hover:bg-emerald-500/20"
              >
                <MessageCircle className="h-3.5 w-3.5" /> Open WhatsApp
              </a>
              <button
                onClick={onDelete}
                className="ml-auto inline-flex items-center gap-1.5 rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] uppercase tracking-widest text-red-300 hover:bg-red-500/20"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete order
              </button>
            </div>
          </div>

          <OrderDetailsExtras g={g} />
        </div>
      </div>
    </div>
  );
}

function TotalCell({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={cn("mt-1", emphasize ? "text-display text-xl" : "text-sm")}>{value}</div>
    </div>
  );
}

function ItemCard({ item, index }: { item: OrderRowRaw; index: number }) {
  const [zoom, setZoom] = useState(false);
  const download = async () => {
    if (!item.poster_image) return;
    try {
      const res = await fetch(item.poster_image);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${item.order_number ?? item.id.slice(0, 8)}-${(item.poster_title ?? "poster").replace(/\W+/g, "-")}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(item.poster_image, "_blank");
    }
  };

  return (
    <div className="grid gap-4 rounded-sm border border-border bg-background p-3 sm:grid-cols-[140px_1fr]">
      <div className="relative">
        {item.poster_image ? (
          <button
            type="button"
            onClick={() => setZoom(true)}
            className="block w-full overflow-hidden rounded-sm bg-muted"
          >
            <SafeImage
              src={item.poster_image}
              alt={item.poster_title ?? "Item"}
              className="aspect-[2/3] w-full object-cover"
            />
          </button>
        ) : (
          <div className="flex aspect-[2/3] w-full items-center justify-center rounded-sm bg-muted text-[10px] uppercase text-muted-foreground">
            No image
          </div>
        )}
        <div className="mt-2 flex gap-1">
          <button
            onClick={() => setZoom(true)}
            className="flex-1 rounded-sm border border-border py-1.5 text-[10px] uppercase tracking-widest hover:bg-accent"
          >
            <Eye className="mx-auto h-3 w-3" />
          </button>
          <button
            onClick={download}
            className="flex-1 rounded-sm border border-border py-1.5 text-[10px] uppercase tracking-widest hover:bg-accent"
          >
            <Download className="mx-auto h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Item {index}</div>
            <div className="mt-0.5 text-display text-lg">{item.poster_title ?? "—"}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Line total</div>
            <div className="text-lg font-semibold">{Math.round(Number(item.total_price ?? 0))} EGP</div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
          <Spec label="Frame type" value={item.frame_type} />
          <Spec label="Frame color" value={item.frame_color} />
          <Spec label="Size" value={item.size} />
          <Spec label="Quantity" value={`× ${item.quantity}`} />
          {item.subtotal ? <Spec label="Unit / subtotal" value={`${Math.round(Number(item.subtotal))} EGP`} /> : null}
          <Spec label="Ref" value={item.order_number ?? item.id.slice(0, 8)} />
        </div>
        {item.notes && (
          <div className="mt-3 rounded-sm border border-border bg-muted/40 p-2 text-xs">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Item note</div>
            <div className="mt-0.5">{item.notes}</div>
          </div>
        )}
      </div>

      {zoom && item.poster_image && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setZoom(false)}
        >
          <img
            src={item.poster_image}
            alt={item.poster_title ?? ""}
            className="max-h-full max-w-full object-contain"
          />
          <button
            onClick={() => setZoom(false)}
            className="absolute right-4 top-4 rounded-sm border border-border bg-card/90 p-2 text-foreground hover:bg-card"
            aria-label="Close preview"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-border bg-background/50 p-2">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-xs">{value}</div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-sm border border-border bg-card p-4">
      <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{label}</div>
      <div className="text-display mt-2 text-2xl">{value}</div>
    </div>
  );
}

function PaymentScreenshotBlock({ order, onUpdate }: { order: Order; onUpdate: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState(order.payment_notes ?? "");

  useEffect(() => {
    let cancelled = false;
    if (!order.payment_screenshot) { setUrl(null); return; }
    setLoading(true);
    supabase.storage
      .from("payment-screenshots")
      .createSignedUrl(order.payment_screenshot, 60 * 60)
      .then(({ data }) => { if (!cancelled) setUrl(data?.signedUrl ?? null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [order.payment_screenshot]);

  const saveNotes = async () => {
    const { error } = await supabase.from("orders").update({ payment_notes: notes }).eq("id", order.id);
    if (error) return toast.error(error.message);
    toast.success("Notes saved");
    onUpdate();
  };

  const setPS = async (payment_status: string) => {
    const patch = payment_status === "verified"
      ? { payment_status, payment_verified_at: new Date().toISOString() }
      : { payment_status };
    const { error } = await supabase.from("orders").update(patch).eq("id", order.id);
    if (error) return toast.error(error.message);
    toast.success("Payment status updated");
    onUpdate();
  };

  const waLink = `https://wa.me/${order.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
    `Hi ${order.customer_name}, this is BRWAZWNEON regarding order ${order.order_number ?? ""}. `,
  )}`;

  if (order.payment_method !== "instapay") return null;

  return (
    <div className="mt-3 space-y-3 rounded-sm border border-border bg-muted/30 p-3">
      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Payment screenshot
      </div>
      {order.payment_screenshot ? (
        loading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : url ? (
          <div className="space-y-2">
            {/\.pdf$/i.test(order.payment_screenshot) ? (
              <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm underline">
                Open PDF receipt
              </a>
            ) : (
              <a href={url} target="_blank" rel="noreferrer">
                <img src={url} alt="Payment screenshot" className="max-h-72 w-full rounded-sm border border-border object-contain bg-black/40" />
              </a>
            )}
            <div className="flex flex-wrap gap-2">
              <a href={url} download className="rounded-sm border border-border px-3 py-1.5 text-[11px] uppercase tracking-widest hover:bg-accent">
                Download
              </a>
              <a href={url} target="_blank" rel="noreferrer" className="rounded-sm border border-border px-3 py-1.5 text-[11px] uppercase tracking-widest hover:bg-accent">
                Open in new tab
              </a>
            </div>
          </div>
        ) : (
          <div className="text-xs text-destructive">Could not load screenshot.</div>
        )
      ) : (
        <div className="text-xs text-muted-foreground">No screenshot uploaded.</div>
      )}

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setPS("received")} className="rounded-sm border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-[11px] uppercase tracking-widest text-blue-300 hover:bg-blue-500/20">
          Mark Received
        </button>
        <button onClick={() => setPS("verified")} className="rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[11px] uppercase tracking-widest text-emerald-300 hover:bg-emerald-500/20">
          ✓ Verify Payment
        </button>
        <button onClick={() => setPS("rejected")} className="rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[11px] uppercase tracking-widest text-red-300 hover:bg-red-500/20">
          ✕ Reject
        </button>
        <a href={waLink} target="_blank" rel="noreferrer" className="rounded-sm border border-border px-3 py-1.5 text-[11px] uppercase tracking-widest hover:bg-accent">
          Contact on WhatsApp
        </a>
      </div>

      <label className="block">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Payment notes (internal)</span>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          className="mt-1 w-full rounded-sm border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
          placeholder="e.g. transfer reference #, missing amount…"
        />
      </label>
    </div>
  );
}

/* ---------- CUSTOM DESIGN ORDERS ---------- */

type CustomOrder = {
  id: string;
  order_number: string | null;
  customer_name: string;
  phone: string;
  governorate: string;
  address: string;
  frame_type: string;
  frame_color: string;
  size: string;
  quantity: number;
  image_paths: string[];
  unit_price: number;
  subtotal: number;
  shipping_cost: number;
  total_price: number;
  notes: string | null;
  status: string;
  created_at: string;
};

function CustomDesignOrdersTab() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [govFilter, setGovFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<CustomOrder | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["admin-custom-orders", statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("custom_design_orders")
        .select("id,order_number,customer_name,phone,governorate,address,frame_type,frame_color,size,quantity,image_paths,unit_price,subtotal,shipping_cost,total_price,notes,status,created_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CustomOrder[];
    },
  });

  const governorates = Array.from(new Set(orders.map((o) => o.governorate).filter(Boolean))).sort();
  const filtered = orders.filter((o) => {
    if (govFilter !== "all" && o.governorate !== govFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (o.order_number ?? "").toLowerCase().includes(q) ||
      o.customer_name.toLowerCase().includes(q) ||
      o.phone.toLowerCase().includes(q)
    );
  });

  const stats = {
    total: orders.length,
    revenue: orders.reduce((s, o) => s + Number(o.total_price || 0), 0),
    newCount: orders.filter((o) => o.status === "new").length,
    images: orders.reduce((s, o) => s + (o.image_paths?.length ?? 0), 0),
  };

  const setStatus = async (o: CustomOrder, status: string) => {
    const { error } = await supabase.from("custom_design_orders").update({ status }).eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    qc.invalidateQueries({ queryKey: ["admin-custom-orders"] });
  };

  const remove = async (o: CustomOrder) => {
    if (!confirm("Delete this custom design order?")) return;
    const { error } = await supabase.from("custom_design_orders").delete().eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["admin-custom-orders"] });
  };

  const exportExcel = () => {
    const rows = filtered.map((o) => ({
      "Order Number": o.order_number ?? o.id.slice(0, 8),
      "Date": new Date(o.created_at).toLocaleString(),
      "Customer": o.customer_name,
      "Phone": o.phone,
      "Governorate": o.governorate,
      "Address": o.address,
      "Frame Type": o.frame_type,
      "Frame Color": o.frame_color,
      "Size": o.size,
      "Images": o.image_paths?.length ?? 0,
      "Unit Price": Number(o.unit_price ?? 0),
      "Subtotal": Number(o.subtotal ?? 0),
      "Shipping": Number(o.shipping_cost ?? 0),
      "Total": Number(o.total_price ?? 0),
      "Status": o.status,
      "Notes": o.notes ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "CustomDesign");
    XLSX.writeFile(wb, `brwazwneon-custom-design-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total orders" value={stats.total} />
        <StatCard label="Revenue" value={`${Math.round(stats.revenue)} EGP`} />
        <StatCard label="New" value={stats.newCount} />
        <StatCard label="Images uploaded" value={stats.images} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, name, phone…"
            className="w-64 rounded-sm border border-border bg-background py-2 pl-8 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <select
          value={govFilter}
          onChange={(e) => setGovFilter(e.target.value)}
          className="rounded-sm border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All governorates</option>
          {governorates.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <button
          onClick={exportExcel}
          className="ml-auto inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
        >
          <Download className="h-4 w-4" /> Export Excel
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <FilterPill active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>All</FilterPill>
        {STATUSES.map((s) => (
          <FilterPill key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>{s}</FilterPill>
        ))}
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-sm border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          No custom design orders yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-sm border border-border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 text-left">Order #</th>
                  <th className="px-3 py-3 text-left">When</th>
                  <th className="px-3 py-3 text-left">Customer</th>
                  <th className="px-3 py-3 text-left">Address</th>
                  <th className="px-3 py-3 text-left">Spec</th>
                  <th className="px-3 py-3 text-left">Images</th>
                  <th className="px-3 py-3 text-right">Total</th>
                  <th className="px-3 py-3 text-left">Status</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id} className="border-t border-border align-top">
                    <td className="px-3 py-3 font-mono text-xs">{o.order_number ?? "—"}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{o.customer_name}</div>
                      <div className="text-xs text-muted-foreground">{o.phone}</div>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <div>{o.governorate}</div>
                      <div className="text-muted-foreground">{o.address}</div>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <div>{o.frame_type}</div>
                      <div className="text-muted-foreground">{o.size} · {o.frame_color}</div>
                    </td>
                    <td className="px-3 py-3 text-xs">{o.image_paths?.length ?? 0}</td>
                    <td className="px-3 py-3 text-right font-semibold">{o.total_price} EGP</td>
                    <td className="px-3 py-3">
                      <select
                        value={o.status}
                        onChange={(e) => setStatus(o, e.target.value)}
                        className="rounded-sm border border-border bg-background px-2 py-1 text-xs"
                      >
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => setViewing(o)} className="rounded-sm p-1.5 text-muted-foreground hover:text-foreground" aria-label="View">
                          <Eye className="h-4 w-4" />
                        </button>
                        <button onClick={() => remove(o)} className="rounded-sm p-1.5 text-muted-foreground hover:text-destructive" aria-label="Delete">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewing && (
        <CustomOrderModal order={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}

function CustomOrderModal({ order, onClose }: { order: CustomOrder; onClose: () => void }) {
  const [urls, setUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const paths = order.image_paths ?? [];
      if (paths.length === 0) {
        if (!cancelled) { setUrls([]); setLoading(false); }
        return;
      }
      const out: string[] = [];
      // sign in batches of 50
      for (let i = 0; i < paths.length; i += 50) {
        const batch = paths.slice(i, i + 50);
        const { data, error } = await supabase.storage
          .from("custom-designs")
          .createSignedUrls(batch, 60 * 60 * 24);
        if (error) { toast.error(error.message); break; }
        for (const d of data ?? []) out.push(d.signedUrl ?? "");
      }
      if (!cancelled) { setUrls(out); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [order.id, order.image_paths]);

  const downloadOne = async (path: string) => {
    const { data, error } = await supabase.storage.from("custom-designs").download(path);
    if (error || !data) return toast.error(error?.message ?? "Download failed");
    const blobUrl = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = path.split("/").pop() ?? "image";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  };

  const downloadAll = async () => {
    for (const p of order.image_paths ?? []) {
      // eslint-disable-next-line no-await-in-loop
      await downloadOne(p);
    }
  };

  return (
    <Modal title={`Custom order ${order.order_number ?? order.id.slice(0, 8)}`} onClose={onClose}>
      <div className="space-y-2 text-sm">
        <Row k="Date" v={new Date(order.created_at).toLocaleString()} />
        <Row k="Customer" v={order.customer_name} />
        <Row k="Phone" v={order.phone} />
        <Row k="Governorate" v={order.governorate} />
        <Row k="Address" v={order.address} />
        <Row k="Frame" v={`${order.frame_type} · ${order.size} · ${order.frame_color}`} />
        <Row k="Images" v={String(order.image_paths?.length ?? 0)} />
        <Row k="Unit price" v={`${order.unit_price} EGP`} />
        <Row k="Subtotal" v={`${order.subtotal} EGP`} />
        <Row k="Shipping" v={`${order.shipping_cost ?? 0} EGP`} />
        <Row k="Total" v={`${order.total_price} EGP`} />
        <Row k="Status" v={order.status} />
        {order.notes && <Row k="Notes" v={order.notes} />}
      </div>

      <div className="mt-5 flex items-center justify-between">
        <h4 className="text-xs uppercase tracking-widest text-muted-foreground">Uploaded photos</h4>
        <button
          onClick={downloadAll}
          disabled={loading || urls.length === 0}
          className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-accent disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" /> Download all
        </button>
      </div>

      {loading ? (
        <div className="mt-4 py-8 text-center text-sm text-muted-foreground">Loading images…</div>
      ) : urls.length === 0 ? (
        <div className="mt-4 py-8 text-center text-sm text-muted-foreground">No images.</div>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {urls.map((url, i) => (
            <div key={i} className="group relative aspect-square overflow-hidden rounded-sm border border-border bg-muted">
              <a href={url} target="_blank" rel="noreferrer">
                <SafeImage src={url} alt="" className="h-full w-full object-cover" />
              </a>
              <button
                onClick={() => downloadOne(order.image_paths[i])}
                className="absolute right-1 top-1 rounded-full bg-background/90 p-1 opacity-0 transition group-hover:opacity-100"
                aria-label="Download"
                title="Download original"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              <div className="absolute left-1 top-1 rounded-full bg-background/80 px-1.5 py-0.5 text-[10px]">#{i + 1}</div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-1.5">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}

/* ---------- SLIDER ---------- */

type Slide = {
  id: string;
  image_url: string;
  title: string | null;
  link_url: string | null;
  sort_order: number;
  enabled: boolean;
};

function SliderTab() {
  const qc = useQueryClient();
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: slides = [], isLoading } = useQuery({
    queryKey: ["admin-slider"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slider_images")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Slide[];
    },
  });

  const upload = async () => {
    if (!files || files.length === 0) return toast.error("Choose images");
    setUploading(true);
    try {
      let order = (slides[slides.length - 1]?.sort_order ?? 0) + 1;
      for (const file of Array.from(files)) {
        const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
        const path = `${crypto.randomUUID()}.${ext}`;
        const signedUrl = await uploadAndSign("slider", path, file);
        const { error } = await supabase.from("slider_images").insert({
          image_url: signedUrl,
          sort_order: order++,
          enabled: true,
        });
        if (error) throw error;
      }
      toast.success("Uploaded");
      setFiles(null);
      const input = document.getElementById("slider-files") as HTMLInputElement | null;
      if (input) input.value = "";
      qc.invalidateQueries({ queryKey: ["admin-slider"] });
      qc.invalidateQueries({ queryKey: ["slider"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const update = async (id: string, patch: Partial<Slide>) => {
    const { error } = await supabase.from("slider_images").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-slider"] });
    qc.invalidateQueries({ queryKey: ["slider"] });
  };

  const remove = async (s: Slide) => {
    if (!confirm("Delete this slide?")) return;
    const { error } = await supabase.from("slider_images").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["admin-slider"] });
    qc.invalidateQueries({ queryKey: ["slider"] });
  };

  const move = async (s: Slide, dir: -1 | 1) => {
    const idx = slides.findIndex((x) => x.id === s.id);
    const other = slides[idx + dir];
    if (!other) return;
    await update(s.id, { sort_order: other.sort_order });
    await update(other.id, { sort_order: s.sort_order });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 rounded-sm border border-border bg-card p-6">
        <input
          id="slider-files"
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setFiles(e.target.files)}
          className="text-sm text-muted-foreground"
        />
        <button
          onClick={upload}
          disabled={uploading}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground disabled:opacity-50"
        >
          <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload slides"}
        </button>
        <p className="ml-auto text-xs text-muted-foreground">
          Auto-slide every 4s · arrows + dots · enable/disable + reorder below
        </p>
      </div>

      <div className="mt-6 space-y-3">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : slides.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            No slides yet. Upload your first banner.
          </div>
        ) : (
          slides.map((s, i) => (
            <div key={s.id} className="flex flex-wrap items-center gap-4 rounded-sm border border-border bg-card p-3">
              <SafeImage src={s.image_url} alt="" className="h-20 w-32 rounded-sm object-cover" />
              <input
                defaultValue={s.title ?? ""}
                placeholder="Title (optional)"
                onBlur={(e) => e.target.value !== (s.title ?? "") && update(s.id, { title: e.target.value || null })}
                className="w-48 rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
              />
              <input
                defaultValue={s.link_url ?? ""}
                placeholder="Link URL (optional)"
                onBlur={(e) => e.target.value !== (s.link_url ?? "") && update(s.id, { link_url: e.target.value || null })}
                className="w-56 rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
              />
              <label className="inline-flex items-center gap-2 text-xs uppercase tracking-widest">
                <input
                  type="checkbox"
                  checked={s.enabled}
                  onChange={(e) => update(s.id, { enabled: e.target.checked })}
                />
                Enabled
              </label>
              <div className="ml-auto flex gap-1">
                <button onClick={() => move(s, -1)} disabled={i === 0} className="rounded-sm border border-border p-1.5 disabled:opacity-30" aria-label="Move up">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => move(s, 1)} disabled={i === slides.length - 1} className="rounded-sm border border-border p-1.5 disabled:opacity-30" aria-label="Move down">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => remove(s)} className="rounded-sm border border-border p-1.5 text-muted-foreground hover:text-destructive" aria-label="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ---------- SETTINGS ---------- */

function SettingsTab() {
  const qc = useQueryClient();
  const keys = Object.keys(PRICING_KEYS) as (keyof typeof PRICING_KEYS)[];
  const [vals, setVals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-pricing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("key,value")
        .in("key", keys as string[]);
      if (error) throw error;
      const map = new Map((data ?? []).map((r) => [r.key, r.value as unknown]));
      const defaultFor = (k: keyof typeof PRICING_KEYS): number => {
        const path = PRICING_KEYS[k];
        let cur: unknown = PRICING_DEFAULTS;
        for (const seg of path as readonly string[]) cur = (cur as Record<string, unknown>)[seg];
        return Number(cur);
      };
      const out: Record<string, string> = {};
      for (const k of keys) {
        const v = map.get(k);
        const n = typeof v === "number" ? v : Number(v);
        out[k] = String(Number.isFinite(n) ? n : defaultFor(k));
      }
      return out;
    },
  });

  useEffect(() => {
    if (data) setVals(data);
  }, [data]);

  const setVal = (k: string, v: string) => setVals((m) => ({ ...m, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const rows = keys.map((k) => {
        const n = Number(vals[k]);
        if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid value for ${k}`);
        return { key: k as string, value: n, updated_at: new Date().toISOString() };
      });
      const { error } = await supabase.from("site_settings").upsert(rows);
      if (error) throw error;
      toast.success("Pricing saved");
      qc.invalidateQueries({ queryKey: ["admin-pricing"] });
      qc.invalidateQueries({ queryKey: ["pricing"] });
      qc.invalidateQueries({ queryKey: ["site-settings"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>;

  const PriceField = ({ k, label }: { k: keyof typeof PRICING_KEYS; label: string }) => (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="mt-1 flex items-center rounded-sm border border-border bg-background">
        <input
          value={vals[k] ?? ""}
          onChange={(e) => setVal(k, e.target.value)}
          inputMode="numeric"
          className="w-full bg-transparent px-3 py-2 text-sm outline-none"
        />
        <span className="pr-3 text-[10px] uppercase tracking-widest text-muted-foreground">EGP</span>
      </div>
    </label>
  );

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="rounded-sm border border-border bg-card p-6">
      <h3 className="text-display text-xl">{title}</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">{children}</div>
    </div>
  );

  return (
    <div className="max-w-4xl space-y-5">
      <div className="rounded-sm border border-border bg-card/50 p-4 text-xs uppercase tracking-widest text-muted-foreground">
        Every price below drives the live website. Changes apply instantly across product pages, cart, checkout, offers and photo printing.
      </div>

      <Section title="PVC Frame Prices">
        <PriceField k="frame_pvc_20x30" label="20 × 30" />
        <PriceField k="frame_pvc_30x40" label="30 × 40" />
        <PriceField k="frame_pvc_40x50" label="40 × 50" />
      </Section>

      <Section title="Wooden Portrait Prices">
        <PriceField k="frame_wood_20x30" label="20 × 30" />
        <PriceField k="frame_wood_30x40" label="30 × 40" />
        <PriceField k="frame_wood_40x50" label="40 × 50" />
        <PriceField k="frame_wood_40x60" label="40 × 60" />
        <PriceField k="frame_wood_50x60" label="50 × 60" />
        <PriceField k="frame_wood_50x70" label="50 × 70" />
        <PriceField k="frame_wood_60x90" label="60 × 90" />
        <PriceField k="frame_wood_100x60" label="100 × 60" />
      </Section>

      <Section title="Custom Design">
        <PriceField k="custom_design_fee" label="Extra fee" />
      </Section>

      <Section title="Photo Printing">
        <PriceField k="photo_10x15" label="10 × 15 / photo" />
        <PriceField k="photo_13x18" label="13 × 18 / photo" />
        <PriceField k="photo_15x20" label="15 × 20 / photo" />
      </Section>

      <Section title="Special Offers">
        <PriceField k="offer_6_20x30" label="6 Frames 20 × 30" />
        <PriceField k="offer_4_30x40" label="4 Frames 30 × 40" />
        <PriceField k="packaging_fee" label="Packaging fee (per bundle)" />
      </Section>

      <Section title="Shipping">
        <PriceField k="shipping_fee" label="Shipping fee" />
        <PriceField k="free_shipping_threshold" label="Free shipping above" />
      </Section>

      <Section title="Double Face Tape (Upsell)">
        <PriceField k="double_face_tape_price" label="Price per frame" />
        <PriceField k="double_face_tape_enabled" label="Enabled (1 = on, 0 = off)" />
      </Section>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-3 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save all pricing"}
        </button>
      </div>
    </div>
  );
}

/* ---------- FRAME MOCKUPS ---------- */

function MockupsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-frame-mockups"],
    queryFn: async (): Promise<FrameMockups> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("key,value")
        .in("key", Object.values(MOCKUP_KEYS));
      if (error) throw error;
      const map = new Map((data ?? []).map((r) => [r.key, r.value as unknown]));
      const parse = (raw: unknown, fb: FrameMockup): FrameMockup => {
        if (!raw || typeof raw !== "object") return fb;
        const v = raw as Partial<FrameMockup>;
        const num = (x: unknown, d: number) => {
          const n = Number(x);
          return Number.isFinite(n) ? n : d;
        };
        return {
          image: typeof v.image === "string" ? v.image : fb.image,
          top: num(v.top, fb.top),
          left: num(v.left, fb.left),
          width: num(v.width, fb.width),
          height: num(v.height, fb.height),
          rotate: num(v.rotate, 0),
          skewX: num(v.skewX, 0),
          skewY: num(v.skewY, 0),
          borderRadius: num(v.borderRadius, 0),
          scale: num(v.scale, 1),
          perspective: num(v.perspective, 1000),
          rotateX: num(v.rotateX, 0),
          rotateY: num(v.rotateY, 0),
          flipX: typeof v.flipX === "boolean" ? v.flipX : false,
          flipY: typeof v.flipY === "boolean" ? v.flipY : false,
          enabled: typeof v.enabled === "boolean" ? v.enabled : true,
        };
      };
      return {
        black: parse(map.get(MOCKUP_KEYS.black), { image: "", top: 8, left: 8, width: 84, height: 84 }),
        white: parse(map.get(MOCKUP_KEYS.white), { image: "", top: 8, left: 8, width: 84, height: 84 }),
        wood:  parse(map.get(MOCKUP_KEYS.wood),  { image: "", top: 10, left: 10, width: 80, height: 80 }),
      };
    },
  });

  if (isLoading || !data)
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>;

  const onSaved = () => {
    qc.invalidateQueries({ queryKey: ["admin-frame-mockups"] });
    qc.invalidateQueries({ queryKey: ["frame-mockups"] });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-sm border border-border bg-card p-6">
        <h3 className="text-display text-2xl">Frame Mockups</h3>
        <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
          Upload each mockup once. The website auto-composites every poster inside it.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Use a transparent-center PNG. Set the printable area as % of the mockup canvas
          (top, left, width, height) so the poster sits exactly inside the frame opening.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <MockupEditor label="Black Frame" variant="black" mockup={data.black} onSaved={onSaved} />
        <MockupEditor label="White Frame" variant="white" mockup={data.white} onSaved={onSaved} />
        <MockupEditor label="Wooden Portrait" variant="wood" mockup={data.wood} onSaved={onSaved} />
      </div>
      <GridDisplayModeCard />
    </div>
  );
}

function GridDisplayModeCard() {
  const qc = useQueryClient();
  const { data: mode = GRID_DISPLAY_MODE_DEFAULT } = useQuery({
    queryKey: ["admin-grid-display-mode"],
    queryFn: async (): Promise<GridDisplayMode> => {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", GRID_DISPLAY_MODE_KEY)
        .maybeSingle();
      const v = data?.value as unknown;
      const s = typeof v === "string" ? v : "";
      return (["artwork", "black", "white", "wood"] as GridDisplayMode[]).includes(
        s as GridDisplayMode,
      )
        ? (s as GridDisplayMode)
        : GRID_DISPLAY_MODE_DEFAULT;
    },
  });
  const [saving, setSaving] = useState(false);
  const options: { id: GridDisplayMode; label: string; hint: string }[] = [
    { id: "black", label: "Black Frame Preview", hint: "Show poster inside black frame mockup (default)" },
    { id: "white", label: "White Frame Preview", hint: "Show poster inside white frame mockup" },
    { id: "wood", label: "Wooden Portrait Preview", hint: "Show poster inside wooden frame mockup" },
  ];
  const save = async (next: GridDisplayMode) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("site_settings")
        .upsert({ key: GRID_DISPLAY_MODE_KEY, value: next as unknown as never });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["admin-grid-display-mode"] });
      qc.invalidateQueries({ queryKey: ["grid-display-mode"] });
      toast.success("Grid display mode updated");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="rounded-sm border border-border bg-card p-6">
      <h3 className="text-display text-2xl">Grid Display Mode</h3>
      <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
        Controls how poster thumbnails appear on the category grid.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={saving}
            onClick={() => save(o.id)}
            className={cn(
              "rounded-sm border p-4 text-left transition disabled:opacity-60",
              mode === o.id
                ? "border-primary bg-accent"
                : "border-border hover:bg-accent/50",
            )}
          >
            <div className="text-sm font-semibold">{o.label}</div>
            <div className="mt-1 text-xs text-muted-foreground">{o.hint}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

const SAMPLE_POSTER =
  "https://images.unsplash.com/photo-1517816743773-6e0fd518b4a6?auto=format&fit=crop&w=600&q=70";

function MockupEditor({
  label,
  variant,
  mockup,
  onSaved,
}: {
  label: string;
  variant: keyof FrameMockups;
  mockup: FrameMockup;
  onSaved: () => void;
}) {
  const [m, setM] = useState<FrameMockup>(mockup);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const patch = (p: Partial<FrameMockup>) => setM((prev) => ({ ...prev, ...p }));
  const setNum = (k: keyof FrameMockup, v: number) => patch({ [k]: v } as Partial<FrameMockup>);

  const onUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `frames/${variant}-${Date.now()}.${ext}`;
      const url = await uploadAndSign("categories", path, file);
      setM((prev) => ({ ...prev, image: url }));
      toast.success("Mockup uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("site_settings").upsert({
        key: MOCKUP_KEYS[variant],
        value: { ...m } as never,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success(`${label} saved`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const centerArtwork = () => {
    const w = m.width || 80;
    const h = m.height || 80;
    patch({ left: (100 - w) / 2, top: (100 - h) / 2 });
  };
  const resetAll = () => {
    const defaults: FrameMockup =
      variant === "wood"
        ? { image: m.image, top: 10, left: 10, width: 80, height: 80, rotate: 0, skewX: 0, skewY: 0, borderRadius: 0, scale: 1, perspective: 1000, rotateX: 0, rotateY: 0, flipX: false, flipY: false }
        : { image: m.image, top: 8, left: 8, width: 84, height: 84, rotate: 0, skewX: 0, skewY: 0, borderRadius: 0, scale: 1, perspective: 1000, rotateX: 0, rotateY: 0, flipX: false, flipY: false };
    setM(defaults);
  };

  return (
    <div className="rounded-sm border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-display text-xl">{label}</h4>
          {m.enabled === false && (
            <span className="rounded-sm border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-destructive">
              Hidden
            </span>
          )}
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>{m.enabled === false ? "Off" : "On"}</span>
          <input
            type="checkbox"
            className="peer sr-only"
            checked={m.enabled !== false}
            onChange={(e) => patch({ enabled: e.target.checked })}
          />
          <span className="relative h-4 w-8 rounded-full bg-muted transition peer-checked:bg-primary">
            <span
              className={cn(
                "absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-background transition-transform",
                m.enabled !== false && "translate-x-4",
              )}
            />
          </span>
        </label>
      </div>

      <div className="mt-4 mx-auto w-full max-w-[260px]">
        <FramePreviewPreviewWithOverride mockup={m} variant={variant} />
      </div>

      <label className="mt-4 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-sm border border-dashed border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent">
        <Upload className="h-4 w-4" />
        {uploading ? "Uploading…" : "Upload mockup PNG"}
        <input
          type="file"
          accept="image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
      </label>

      {/* Quick action buttons */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <ToolBtn onClick={() => setNum("rotate", Math.max(-10, (m.rotate ?? 0) - 1))} icon={<RotateCcw className="h-3.5 w-3.5" />} label="Rot −" />
        <ToolBtn onClick={() => setNum("rotate", Math.min(10, (m.rotate ?? 0) + 1))} icon={<RotateCw className="h-3.5 w-3.5" />} label="Rot +" />
        <ToolBtn onClick={centerArtwork} icon={<Crosshair className="h-3.5 w-3.5" />} label="Center" />
        <ToolBtn onClick={() => setNum("scale", Math.min(3, +((m.scale ?? 1) + 0.05).toFixed(2)))} icon={<ZoomIn className="h-3.5 w-3.5" />} label="Zoom +" />
        <ToolBtn onClick={() => setNum("scale", Math.max(0.3, +((m.scale ?? 1) - 0.05).toFixed(2)))} icon={<ZoomOut className="h-3.5 w-3.5" />} label="Zoom −" />
        <ToolBtn onClick={resetAll} icon={<RotateCcw className="h-3.5 w-3.5" />} label="Reset" />
        <ToolBtn active={!!m.flipX} onClick={() => patch({ flipX: !m.flipX })} icon={<FlipHorizontal className="h-3.5 w-3.5" />} label="Flip H" />
        <ToolBtn active={!!m.flipY} onClick={() => patch({ flipY: !m.flipY })} icon={<FlipVertical className="h-3.5 w-3.5" />} label="Flip V" />
      </div>

      <div className="mt-5 space-y-3">
        <SliderRow label="X Position" value={m.left} min={-20} max={100} step={0.1} suffix="%" onChange={(v) => setNum("left", v)} />
        <SliderRow label="Y Position" value={m.top} min={-20} max={100} step={0.1} suffix="%" onChange={(v) => setNum("top", v)} />
        <SliderRow label="Width" value={m.width} min={5} max={120} step={0.1} suffix="%" onChange={(v) => setNum("width", v)} />
        <SliderRow label="Height" value={m.height} min={5} max={120} step={0.1} suffix="%" onChange={(v) => setNum("height", v)} />
        <SliderRow label="Scale" value={m.scale ?? 1} min={0.3} max={3} step={0.01} onChange={(v) => setNum("scale", v)} />
        <SliderRow label="Rotation" value={m.rotate ?? 0} min={-10} max={10} step={0.1} suffix="°" onChange={(v) => setNum("rotate", v)} />
        <SliderRow label="Perspective X" value={m.rotateY ?? 0} min={-30} max={30} step={0.1} suffix="°" onChange={(v) => setNum("rotateY", v)} />
        <SliderRow label="Perspective Y" value={m.rotateX ?? 0} min={-30} max={30} step={0.1} suffix="°" onChange={(v) => setNum("rotateX", v)} />
        <SliderRow label="Skew Horizontal" value={m.skewX ?? 0} min={-20} max={20} step={0.1} suffix="°" onChange={(v) => setNum("skewX", v)} />
        <SliderRow label="Skew Vertical" value={m.skewY ?? 0} min={-20} max={20} step={0.1} suffix="°" onChange={(v) => setNum("skewY", v)} />
        <SliderRow label="Perspective Depth" value={m.perspective ?? 1000} min={200} max={3000} step={10} suffix="px" onChange={(v) => setNum("perspective", v)} />
        <SliderRow label="Border Radius" value={m.borderRadius ?? 0} min={0} max={50} step={0.1} suffix="%" onChange={(v) => setNum("borderRadius", v)} />
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
      >
        <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
      </button>
      <p className="mt-2 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
        Saved values apply to every {label.toLowerCase()} across the site.
      </p>
    </div>
  );
}

function ToolBtn({
  onClick,
  icon,
  label,
  active,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-1 rounded-sm border px-2 py-1.5 text-[10px] uppercase tracking-widest transition",
        active
          ? "border-primary bg-accent text-foreground"
          : "border-border text-muted-foreground hover:text-foreground hover:bg-accent/60",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  const v = Number.isFinite(value) ? value : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums text-foreground">
          {Number.isInteger(step) ? v.toFixed(0) : v.toFixed(2)}
          {suffix ?? ""}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Slider
          value={[v]}
          min={min}
          max={max}
          step={step}
          onValueChange={(a) => onChange(a[0])}
          className="flex-1"
        />
        <input
          type="number"
          value={v}
          step={step}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          className="w-16 rounded-sm border border-border bg-background px-1.5 py-1 text-xs outline-none focus:border-primary"
        />
      </div>
    </div>
  );
}

/** Local preview that uses the in-progress mockup config (not the saved one). */
function FramePreviewPreviewWithOverride({
  mockup,
  variant,
}: {
  mockup: FrameMockup;
  variant: keyof FrameMockups;
}) {
  const matte =
    variant === "white" ? "#f3f3f0" : variant === "wood" ? "#3a2515" : "#0a0a0a";
  return (
    <div
      className="relative isolate aspect-[2/3] w-full overflow-hidden drop-shadow-[0_18px_25px_rgba(0,0,0,0.5)]"
      style={{ backgroundColor: matte }}
    >
      <div
        className="absolute"
        style={{
          top: `${mockup.top}%`,
          left: `${mockup.left}%`,
          width: `${mockup.width}%`,
          height: `${mockup.height}%`,
          overflow: "hidden",
          borderRadius: `${mockup.borderRadius ?? 0}%`,
          perspective: `${Math.max(200, mockup.perspective ?? 1000)}px`,
          transformStyle: "preserve-3d",
        }}
      >
        <img
          src={SAMPLE_POSTER}
          alt=""
          className="h-full w-full object-cover select-none"
          draggable={false}
          style={{
            transform: `translate3d(0,0,0) rotateX(${mockup.rotateX ?? 0}deg) rotateY(${mockup.rotateY ?? 0}deg) rotate(${mockup.rotate ?? 0}deg) skew(${mockup.skewX ?? 0}deg, ${mockup.skewY ?? 0}deg) scale(${(mockup.scale ?? 1) * (mockup.flipX ? -1 : 1)}, ${(mockup.scale ?? 1) * (mockup.flipY ? -1 : 1)})`,
            transformOrigin: "center center",
            willChange: "transform",
            backfaceVisibility: "hidden",
          }}
        />
      </div>
      {mockup.image && (
        <img
          src={mockup.image}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        />
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(115deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 22%, rgba(255,255,255,0) 45%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.07) 100%)",
          mixBlendMode: "screen",
        }}
      />
    </div>
  );
}

/* ---------- MODAL ---------- */

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-sm border border-border bg-card p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-display text-2xl">{title}</h3>
          <button onClick={onClose} className="rounded-sm p-1 text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
/* ---------- WISHLISTS ---------- */

type WishStat = {
  poster_id: string;
  count: number;
  title: string;
  image_url: string;
  category_id: string | null;
};

function WishlistsTab() {
  const { data: categories = [] } = useCategories();
  const { data: stats = [], isLoading } = useQuery({
    queryKey: ["wishlist-stats"],
    queryFn: async (): Promise<WishStat[]> => {
      const { data: rows, error } = await supabase
        .from("wishlists")
        .select("poster_id");
      if (error) throw error;
      const counts = new Map<string, number>();
      for (const r of rows ?? []) {
        const id = (r as { poster_id: string }).poster_id;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      const top = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);
      if (top.length === 0) return [];
      const ids = top.map(([id]) => id);
      const { data: posters, error: pErr } = await supabase
        .from("posters")
        .select("id,title,image_url,category_id")
        .in("id", ids);
      if (pErr) throw pErr;
      const byId = new Map((posters ?? []).map((p) => [p.id as string, p]));
      return top
        .map(([poster_id, count]) => {
          const p = byId.get(poster_id);
          if (!p) return null;
          return {
            poster_id,
            count,
            title: p.title as string,
            image_url: p.image_url as string,
            category_id: (p.category_id as string | null) ?? null,
          };
        })
        .filter(Boolean) as WishStat[];
    },
  });

  return (
    <div>
      <div className="mb-6">
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Dashboard</div>
        <h2 className="text-display text-3xl flex items-center gap-2">
          <Heart className="h-6 w-6 text-red-500" /> Most Wishlisted Posters
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Top 20 posters customers have saved to their wishlists.
        </p>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : stats.length === 0 ? (
        <div className="rounded-sm border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          No wishlist activity yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-3 py-3 text-left">#</th>
                <th className="px-3 py-3 text-left">Poster</th>
                <th className="px-3 py-3 text-left">Category</th>
                <th className="px-3 py-3 text-right">Wishlist count</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s, i) => {
                const cat = categories.find((c) => c.id === s.category_id);
                return (
                  <tr key={s.poster_id} className="border-t border-border">
                    <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        <SafeImage
                          src={s.image_url}
                          alt={s.title}
                          loading="lazy"
                          className="h-12 w-9 rounded-sm object-cover"
                        />
                        <span className="truncate">{s.title}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{cat?.name ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-500">
                        <Heart className="h-3 w-3 fill-red-500" /> {s.count}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------- REVIEWS ---------- */

type ReviewRow = {
  id: string;
  customer_name: string;
  governorate: string | null;
  rating: number;
  review_text: string | null;
  photo_url: string | null;
  poster_id: string | null;
  approved: boolean;
  featured: boolean;
  sort_order: number;
  created_at: string;
};

type StatusFilter = "all" | "approved" | "hidden" | "highlighted";

function ReviewsTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [ratingFilter, setRatingFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ReviewRow | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["admin-reviews"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("*")
        .order("featured", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ReviewRow[];
    },
  });

  const { data: posters = [] } = useQuery({
    queryKey: ["admin-reviews-posters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posters")
        .select("id,title")
        .order("title")
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = reviews.filter((r) => {
    if (search && !r.customer_name.toLowerCase().includes(search.toLowerCase())) return false;
    if (ratingFilter !== "all" && r.rating !== ratingFilter) return false;
    if (statusFilter === "approved" && !r.approved) return false;
    if (statusFilter === "hidden" && r.approved) return false;
    if (statusFilter === "highlighted" && !r.featured) return false;
    return true;
  });

  async function update(id: string, patch: Partial<ReviewRow>) {
    const { error } = await supabase.from("reviews").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-reviews"] });
    qc.invalidateQueries({ queryKey: ["reviews"] });
  }

  async function remove(ids: string[]) {
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} review(s)?`)) return;
    const { error } = await supabase.from("reviews").delete().in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`Deleted ${ids.length} review(s)`);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["admin-reviews"] });
    qc.invalidateQueries({ queryKey: ["reviews"] });
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-display text-2xl">Customer Reviews</h2>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {filtered.length} of {reviews.length} review(s)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add Review
          </button>
          <button
            onClick={async () => {
              const { buildInsertableReviews } = await import("@/lib/sample-reviews");
              const rows = buildInsertableReviews(10);
              const { error } = await supabase.from("reviews").insert(rows);
              if (error) return toast.error(error.message);
              toast.success("Generated 10 sample reviews");
              qc.invalidateQueries({ queryKey: ["admin-reviews"] });
              qc.invalidateQueries({ queryKey: ["reviews"] });
            }}
            className="inline-flex items-center gap-2 rounded-sm border border-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary hover:bg-primary/10"
          >
            <Sparkles className="h-4 w-4" /> Generate 10
          </button>
          <button
            onClick={() => {
              const payload = JSON.stringify(reviews, null, 2);
              const blob = new Blob([payload], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `reviews-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2 text-xs font-semibold uppercase tracking-widest hover:bg-accent"
          >
            <Download className="h-4 w-4" /> Export
          </button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-sm border border-border px-4 py-2 text-xs font-semibold uppercase tracking-widest hover:bg-accent">
            <Upload className="h-4 w-4" /> Import
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  const text = await file.text();
                  const parsed = JSON.parse(text);
                  if (!Array.isArray(parsed)) throw new Error("File must be a JSON array");
                  const rows = parsed
                    .filter((r) => r && typeof r === "object" && typeof r.customer_name === "string")
                    .map((r) => ({
                      customer_name: String(r.customer_name).slice(0, 100),
                      governorate: r.governorate ? String(r.governorate).slice(0, 60) : null,
                      rating: Math.max(1, Math.min(5, Number(r.rating) || 5)),
                      review_text: r.review_text ? String(r.review_text).slice(0, 1000) : null,
                      photo_url: r.photo_url ? String(r.photo_url) : null,
                      approved: r.approved !== false,
                      featured: !!r.featured,
                    }));
                  if (rows.length === 0) return toast.error("No valid reviews found in file");
                  const { error } = await supabase.from("reviews").insert(rows);
                  if (error) throw error;
                  toast.success(`Imported ${rows.length} review(s)`);
                  qc.invalidateQueries({ queryKey: ["admin-reviews"] });
                  qc.invalidateQueries({ queryKey: ["reviews"] });
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Import failed");
                }
              }}
            />
          </label>
          {selected.size > 0 && (
            <button
              onClick={() => remove(Array.from(selected))}
              className="inline-flex items-center gap-2 rounded-sm border border-destructive px-4 py-2 text-xs font-semibold uppercase tracking-widest text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" /> Delete {selected.size}
            </button>
          )}
        </div>
      </div>

      {/* FILTERS */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer name"
            className="w-64 rounded-sm border border-border bg-background px-3 py-2 pl-9 text-sm"
          />
        </div>
        <select
          value={ratingFilter}
          onChange={(e) => setRatingFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
          className="rounded-sm border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All ratings</option>
          {[5, 4, 3, 2, 1].map((r) => (
            <option key={r} value={r}>{r} ★</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-sm border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="approved">Approved</option>
          <option value="hidden">Hidden</option>
          <option value="highlighted">Highlighted</option>
        </select>
      </div>

      {/* TABLE */}
      <div className="overflow-x-auto rounded-sm border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="p-3 w-8">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((r) => selected.has(r.id))}
                  onChange={(e) => {
                    if (e.target.checked) setSelected(new Set(filtered.map((r) => r.id)));
                    else setSelected(new Set());
                  }}
                />
              </th>
              <th className="p-3">Photo</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Rating</th>
              <th className="p-3">Review</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No reviews match these filters.</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-border align-top">
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggleSelect(r.id)}
                  />
                </td>
                <td className="p-3">
                  {r.photo_url ? (
                    <SafeImage src={r.photo_url} alt="" className="h-14 w-14 object-cover" />
                  ) : (
                    <div className="h-14 w-14 bg-muted" />
                  )}
                </td>
                <td className="p-3">
                  <div className="font-semibold">{r.customer_name}</div>
                  <div className="text-xs text-muted-foreground">{r.governorate ?? "—"}</div>
                </td>
                <td className="p-3 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    {r.rating} <Star className="h-3 w-3 fill-primary text-primary" />
                  </span>
                </td>
                <td className="p-3 max-w-md">
                  <div className="line-clamp-2 text-xs text-foreground/80">{r.review_text}</div>
                </td>
                <td className="p-3 space-y-1 text-[10px] uppercase tracking-widest">
                  <div className={r.approved ? "text-green-500" : "text-muted-foreground"}>
                    {r.approved ? "Approved" : "Hidden"}
                  </div>
                  {r.featured && <div className="text-primary">⭐ Featured</div>}
                </td>
                <td className="p-3 text-right">
                  <div className="inline-flex flex-wrap justify-end gap-1">
                    <button
                      onClick={() => update(r.id, { approved: !r.approved })}
                      className="rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-accent"
                      title={r.approved ? "Hide" : "Approve"}
                    >
                      {r.approved ? "Hide" : "Approve"}
                    </button>
                    <button
                      onClick={() => update(r.id, { featured: !r.featured })}
                      className={cn(
                        "rounded-sm border px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-accent",
                        r.featured ? "border-primary text-primary" : "border-border",
                      )}
                      title="Toggle highlight"
                    >
                      {r.featured ? "Unhighlight" : "Highlight"}
                    </button>
                    <button
                      onClick={() => { setEditing(r); setShowForm(true); }}
                      className="rounded-sm border border-border p-1 hover:bg-accent"
                      title="Edit"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => remove([r.id])}
                      className="rounded-sm border border-destructive p-1 text-destructive hover:bg-destructive/10"
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <ReviewForm
          initial={editing}
          posters={posters as { id: string; title: string }[]}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["admin-reviews"] });
            qc.invalidateQueries({ queryKey: ["reviews"] });
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ReviewForm({
  initial,
  posters,
  onClose,
  onSaved,
}: {
  initial: ReviewRow | null;
  posters: { id: string; title: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [customerName, setCustomerName] = useState(initial?.customer_name ?? "");
  const [governorate, setGovernorate] = useState(initial?.governorate ?? "");
  const [rating, setRating] = useState(initial?.rating ?? 5);
  const [reviewText, setReviewText] = useState(initial?.review_text ?? "");
  const [posterId, setPosterId] = useState(initial?.poster_id ?? "");
  const [approved, setApproved] = useState(initial?.approved ?? true);
  const [featured, setFeatured] = useState(initial?.featured ?? false);
  const [photoUrl, setPhotoUrl] = useState(initial?.photo_url ?? "");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!customerName.trim()) return toast.error("Customer name required");
    setSaving(true);
    try {
      let finalPhoto = photoUrl;
      if (photoFile) {
        const ext = photoFile.name.split(".").pop() || "jpg";
        const path = `${crypto.randomUUID()}.${ext}`;
        finalPhoto = await uploadAndSign("reviews", path, photoFile);
      }
      const payload = {
        customer_name: customerName.trim(),
        governorate: governorate.trim() || null,
        rating: Math.max(1, Math.min(5, rating)),
        review_text: reviewText.trim() || null,
        poster_id: posterId || null,
        approved,
        featured,
        photo_url: finalPhoto || null,
      };
      if (initial) {
        const { error } = await supabase.from("reviews").update(payload).eq("id", initial.id);
        if (error) throw error;
        toast.success("Review updated");
      } else {
        const { error } = await supabase.from("reviews").insert(payload);
        if (error) throw error;
        toast.success("Review added");
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl space-y-4 rounded-sm border border-border bg-background p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-display text-2xl">{initial ? "Edit" : "Add"} Review</h3>
          <button onClick={onClose} className="rounded-sm border border-border p-2 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs uppercase tracking-widest space-y-1">
            <span>Customer name *</span>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm normal-case"
            />
          </label>
          <label className="text-xs uppercase tracking-widest space-y-1">
            <span>Governorate</span>
            <input
              value={governorate}
              onChange={(e) => setGovernorate(e.target.value)}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm normal-case"
            />
          </label>
          <label className="text-xs uppercase tracking-widest space-y-1">
            <span>Rating</span>
            <select
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            >
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}
            </select>
          </label>
          <label className="text-xs uppercase tracking-widest space-y-1">
            <span>Related poster</span>
            <select
              value={posterId}
              onChange={(e) => setPosterId(e.target.value)}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm normal-case"
            >
              <option value="">— None —</option>
              {posters.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-xs uppercase tracking-widest space-y-1">
          <span>Review text</span>
          <textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            rows={4}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm normal-case"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs uppercase tracking-widest space-y-1">
            <span>Customer photo</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
              className="w-full text-xs"
            />
            {(photoFile || photoUrl) && (
              <div className="mt-2 flex items-center gap-2">
                <SafeImage
                  src={photoFile ? URL.createObjectURL(photoFile) : photoUrl}
                  alt=""
                  className="h-16 w-16 object-cover"
                />
                {photoUrl && !photoFile && (
                  <button
                    type="button"
                    onClick={() => setPhotoUrl("")}
                    className="text-[10px] uppercase tracking-widest text-destructive"
                  >
                    Remove photo
                  </button>
                )}
              </div>
            )}
          </label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs uppercase tracking-widest">
              <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} />
              Approved (visible on site)
            </label>
            <label className="flex items-center gap-2 text-xs uppercase tracking-widest">
              <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
              ⭐ Highlight as Featured
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded-sm border border-border px-4 py-2 text-xs uppercase tracking-widest hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- COLLECTIONS (Shop By Collection homepage section) ---------- */

function CollectionsTab() {
  const qc = useQueryClient();
  const [cards, setCards] = useState<CollectionCard[] | null>(null);
  const [visible, setVisible] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-home-collections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("key,value")
        .in("key", ["home_collections", "home_collections_visible"]);
      if (error) throw error;
      const map = new Map((data ?? []).map((r) => [r.key, r.value as unknown]));
      const raw = map.get("home_collections");
      const v = map.get("home_collections_visible");
      const list: CollectionCard[] = Array.isArray(raw) && raw.length > 0
        ? (raw as CollectionCard[]).map((c, i) => ({
            id: c.id ?? String(i),
            title: c.title ?? "",
            subtitle: c.subtitle ?? "",
            image: c.image ?? "",
            link: c.link ?? "/",
            enabled: c.enabled !== false,
          }))
        : DEFAULT_COLLECTIONS;
      return { cards: list, visible: v === undefined ? true : !!v };
    },
  });

  useEffect(() => {
    if (data && cards === null) {
      setCards(data.cards);
      setVisible(data.visible);
    }
  }, [data, cards]);

  const list = cards ?? [];
  const update = (idx: number, patch: Partial<CollectionCard>) => {
    setCards((prev) => (prev ?? []).map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };
  const move = (idx: number, dir: -1 | 1) => {
    setCards((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };
  const remove = (idx: number) => {
    if (!confirm("Remove this card?")) return;
    setCards((prev) => (prev ?? []).filter((_, i) => i !== idx));
  };
  const add = () => {
    setCards((prev) => [
      ...(prev ?? []),
      { id: crypto.randomUUID(), title: "New Collection", subtitle: "", image: "", link: "/", enabled: true },
    ]);
  };
  const uploadImage = async (idx: number, file: File) => {
    const card = list[idx];
    if (!card) return;
    setUploadingId(card.id);
    try {
      const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
      const path = `collections/${crypto.randomUUID()}.${ext}`;
      const signedUrl = await uploadAndSign("slider", path, file);
      update(idx, { image: signedUrl });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingId(null);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("site_settings").upsert([
        { key: "home_collections", value: list as never },
        { key: "home_collections_visible", value: visible as never },
      ]);
      if (error) throw error;
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["home-collections"] });
      qc.invalidateQueries({ queryKey: ["admin-home-collections"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || cards === null) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 rounded-sm border border-border bg-card p-6">
        <label className="flex items-center gap-2 text-xs uppercase tracking-widest">
          <input
            type="checkbox"
            checked={visible}
            onChange={(e) => setVisible(e.target.checked)}
          />
          Show section on homepage
        </label>
        <button
          onClick={add}
          className="ml-auto inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
        >
          <Plus className="h-4 w-4" /> Add card
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      <div className="mt-6 space-y-3">
        {list.map((c, i) => (
          <div key={c.id} className="flex flex-wrap items-start gap-4 rounded-sm border border-border bg-card p-3">
            <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
              {c.image ? (
                <SafeImage src={c.image} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-widest text-muted-foreground">No image</div>
              )}
            </div>
            <div className="flex min-w-[240px] flex-1 flex-col gap-2">
              <input
                value={c.title}
                onChange={(e) => update(i, { title: e.target.value })}
                placeholder="Title"
                className="rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
              />
              <input
                value={c.subtitle}
                onChange={(e) => update(i, { subtitle: e.target.value })}
                placeholder="Subtitle"
                className="rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
              />
              <input
                value={c.link}
                onChange={(e) => update(i, { link: e.target.value })}
                placeholder="Link (e.g. /category/football)"
                className="rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
              />
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-accent">
                  <Upload className="h-3 w-3" />
                  {uploadingId === c.id ? "Uploading…" : c.image ? "Replace image" : "Upload image"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadImage(i, f);
                      e.target.value = "";
                    }}
                  />
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={c.enabled !== false}
                    onChange={(e) => update(i, { enabled: e.target.checked })}
                  />
                  Enabled
                </label>
              </div>
              <CoverSettingsEditor card={c} onChange={(patch) => update(i, patch)} />
            </div>
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="rounded-sm border border-border p-1 hover:bg-accent disabled:opacity-30"
                title="Move up"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                onClick={() => move(i, 1)}
                disabled={i === list.length - 1}
                className="rounded-sm border border-border p-1 hover:bg-accent disabled:opacity-30"
                title="Move down"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
              <button
                onClick={() => remove(i)}
                className="rounded-sm border border-border p-1 text-destructive hover:bg-accent"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        {list.length === 0 && (
          <div className="rounded-sm border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            No collection cards. Click “Add card” to create one.
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Tip: link to category pages like <code>/category/football</code>, or to <code>/custom-design</code> and <code>/photo-printing</code>.
      </p>
    </div>
  );
}

/* ---------- Cover settings for a single collection card ---------- */

function CoverSettingsEditor({
  card,
  onChange,
}: {
  card: CollectionCard;
  onChange: (patch: Partial<CollectionCard>) => void;
}) {
  const [open, setOpen] = useState(false);
  const mode = card.coverMode ?? "auto";
  const bw = card.bw !== false;
  const speed = card.transitionMs ?? 6000;
  const overlay = card.overlayOpacity ?? 0.55;
  const slug = (card.link.match(/^\/category\/([^/?#]+)/) ?? [])[1] ?? null;
  const selectedIds = card.coverPosterIds ?? [];

  const postersQ = useQuery({
    queryKey: ["admin-cover-posters", slug],
    enabled: !!slug && open,
    queryFn: async () => {
      const { data: cat } = await supabase
        .from("categories").select("id").eq("slug", slug!).maybeSingle();
      if (!cat) return [];
      const { data: kids } = await supabase
        .from("categories").select("id").eq("parent_id", cat.id);
      const ids = [cat.id, ...(kids ?? []).map((k) => k.id)];
      const { data, error } = await supabase
        .from("posters")
        .select("id,title,image_url")
        .in("category_id", ids)
        .eq("hidden", false)
        .order("sales_count", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });

  const previewQ = useQuery({
    queryKey: ["admin-cover-preview", card.id, mode, slug, selectedIds.join(","), card.image],
    enabled: open,
    queryFn: async (): Promise<string[]> => {
      if (mode === "manual") return card.image ? [card.image] : [];
      if (mode === "selected") {
        const ids = selectedIds.filter(Boolean);
        if (ids.length === 0) return card.image ? [card.image] : [];
        const { data, error } = await supabase
          .from("posters")
          .select("id,image_url")
          .in("id", ids);
        if (error) throw error;
        return (data ?? []).map((p) => p.image_url as string).filter(Boolean);
      }
      if (!slug) return card.image ? [card.image] : [];
      const { data: cat } = await supabase
        .from("categories").select("id").eq("slug", slug).maybeSingle();
      if (!cat) return [];
      const { data: kids } = await supabase
        .from("categories").select("id").eq("parent_id", cat.id);
      const ids = [cat.id, ...(kids ?? []).map((k) => k.id)];
      const { data, error } = await supabase
        .from("posters")
        .select("image_url")
        .in("category_id", ids)
        .eq("hidden", false)
        .not("image_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []).map((p) => p.image_url as string).filter(Boolean);
    },
  });

  const [previewIdx, setPreviewIdx] = useState(0);
  useEffect(() => {
    const imgs = previewQ.data ?? [];
    if (imgs.length < 2) return;
    const id = setInterval(
      () => setPreviewIdx((i) => (i + 1) % imgs.length),
      Math.max(2000, speed),
    );
    return () => clearInterval(id);
  }, [previewQ.data, speed]);

  const toggleId = (id: string) => {
    const has = selectedIds.includes(id);
    onChange({
      coverPosterIds: has ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
    });
  };

  return (
    <div className="mt-2 rounded-sm border border-border bg-background/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground"
      >
        <span>Cover settings · {mode}</span>
        <span>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-border p-3">
          <div className="flex flex-wrap gap-2">
            {(["auto", "manual", "selected"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onChange({ coverMode: m })}
                className={cn(
                  "rounded-sm border px-3 py-1.5 text-[10px] uppercase tracking-widest",
                  mode === m
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:bg-accent",
                )}
              >
                {m === "auto" ? "Auto random" : m === "manual" ? "Manual upload" : "Pick products"}
              </button>
            ))}
          </div>

          {mode === "auto" && !slug && (
            <p className="text-xs text-amber-500">
              Auto mode needs a link like <code>/category/&lt;slug&gt;</code>.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={bw}
                onChange={(e) => onChange({ bw: e.target.checked })}
              />
              Black &amp; white
            </label>
            <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
              Transition speed · {(speed / 1000).toFixed(1)}s
              <input
                type="range"
                min={2000}
                max={12000}
                step={500}
                value={speed}
                onChange={(e) => onChange({ transitionMs: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
              Overlay darkness · {Math.round(overlay * 100)}%
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={overlay}
                onChange={(e) => onChange({ overlayOpacity: Number(e.target.value) })}
              />
            </label>
          </div>

          {mode === "selected" && (
            <div>
              <p className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                Pick products from {slug ?? "—"} ({selectedIds.length} selected)
              </p>
              {!slug ? (
                <p className="text-xs text-muted-foreground">Set a category link first.</p>
              ) : postersQ.isLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : (
                <div className="grid max-h-56 grid-cols-4 gap-2 overflow-auto rounded-sm border border-border p-2 sm:grid-cols-6">
                  {(postersQ.data ?? []).map((p) => {
                    const active = selectedIds.includes(p.id);
                    return (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => toggleId(p.id)}
                        className={cn(
                          "relative aspect-[3/4] overflow-hidden rounded-sm border",
                          active ? "border-primary ring-2 ring-primary" : "border-border",
                        )}
                        title={p.title}
                      >
                        <SafeImage
                          src={p.image_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                        {active && (
                          <span className="absolute right-1 top-1 rounded-full bg-primary px-1.5 text-[9px] font-bold text-primary-foreground">
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {(postersQ.data ?? []).length === 0 && (
                    <p className="col-span-full text-xs text-muted-foreground">No products.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Preview */}
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              Preview
            </p>
            <div className="relative aspect-[4/5] w-40 overflow-hidden rounded-sm border border-border bg-muted">
              <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-800 to-black" />
              {(previewQ.data ?? []).map((url, k) => (
                <img
                  key={url + k}
                  src={url}
                  alt=""
                  className={cn(
                    "absolute inset-0 h-full w-full object-cover transition-opacity duration-[1200ms]",
                    bw && "grayscale",
                    k === previewIdx % Math.max(1, (previewQ.data ?? []).length)
                      ? "opacity-100"
                      : "opacity-0",
                  )}
                />
              ))}
              <div
                className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent"
                style={{ opacity: 0.35 + overlay * 0.65 }}
              />
              <div className="absolute inset-x-0 bottom-0 p-2">
                <p className="text-[8px] uppercase tracking-widest text-white/60">
                  {card.subtitle}
                </p>
                <h4 className="text-sm font-semibold text-white">{card.title}</h4>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================ Marketing tab ============================ */

function MarketingTab() {
  const qc = useQueryClient();
  const settingsQ = useQuery({
    queryKey: ["admin-marketing-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("key,value")
        .in("key", [
          "meta_pixel_id",
          "meta_pixel_enabled",
          "meta_capi_enabled",
          "meta_advanced_matching_enabled",
          "ga4_measurement_id",
          "ga4_enabled",
        ]);
      if (error) throw error;
      const map = new Map((data ?? []).map((r) => [r.key, r.value as unknown]));
      const bool = (k: string) => map.get(k) === true || map.get(k) === "true";
      return {
        pixelId: String(map.get("meta_pixel_id") ?? "").trim(),
        pixelEnabled: bool("meta_pixel_enabled"),
        capiEnabled: bool("meta_capi_enabled"),
        advancedMatching: bool("meta_advanced_matching_enabled"),
        ga4Id: String(map.get("ga4_measurement_id") ?? "").trim(),
        ga4Enabled: bool("ga4_enabled"),
      };
    },
  });
  const secretQ = useQuery({
    queryKey: ["admin-marketing-secret"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_secrets")
        .select("meta_capi_access_token")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return data?.meta_capi_access_token ?? "";
    },
  });

  const [pixelId, setPixelId] = useState("");
  const [pixelEnabled, setPixelEnabled] = useState(false);
  const [capiEnabled, setCapiEnabled] = useState(false);
  const [advancedMatching, setAdvancedMatching] = useState(false);
  const [token, setToken] = useState("");
  const [ga4Id, setGa4Id] = useState("");
  const [ga4Enabled, setGa4Enabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settingsQ.data) {
      setPixelId(settingsQ.data.pixelId);
      setPixelEnabled(settingsQ.data.pixelEnabled);
      setCapiEnabled(settingsQ.data.capiEnabled);
      setAdvancedMatching(settingsQ.data.advancedMatching);
      setGa4Id(settingsQ.data.ga4Id);
      setGa4Enabled(settingsQ.data.ga4Enabled);
    }
  }, [settingsQ.data]);
  useEffect(() => { if (secretQ.data !== undefined) setToken(secretQ.data); }, [secretQ.data]);

  const pixelIdValid = pixelId === "" || /^\d{6,20}$/.test(pixelId);
  const tokenValid = token === "" || /^[A-Za-z0-9_\-|]{20,}$/.test(token);
  const ga4IdValid = ga4Id === "" || /^G-[A-Z0-9]{6,}$/.test(ga4Id);

  const onSave = async () => {
    if (pixelEnabled && !pixelIdValid) return toast.error("Pixel ID must be 6–20 digits");
    if (capiEnabled && !pixelId) return toast.error("Set a Pixel ID before enabling Conversion API");
    if (capiEnabled && !token) return toast.error("Conversion API requires an access token");
    if (!tokenValid) return toast.error("Access token format looks invalid");
    if (ga4Enabled && !ga4IdValid) return toast.error("GA4 Measurement ID must look like G-XXXXXXXX");

    setSaving(true);
    try {
      const upserts = [
        { key: "meta_pixel_id", value: pixelId as never },
        { key: "meta_pixel_enabled", value: pixelEnabled as never },
        { key: "meta_capi_enabled", value: capiEnabled as never },
        { key: "meta_advanced_matching_enabled", value: advancedMatching as never },
        { key: "ga4_measurement_id", value: ga4Id as never },
        { key: "ga4_enabled", value: ga4Enabled as never },
      ];
      const { error: e1 } = await supabase
        .from("site_settings")
        .upsert(upserts, { onConflict: "key" });
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("marketing_secrets")
        .upsert({ id: 1, meta_capi_access_token: token || null, updated_at: new Date().toISOString() });
      if (e2) throw e2;
      toast.success("Marketing settings saved");
      qc.invalidateQueries({ queryKey: ["admin-marketing-settings"] });
      qc.invalidateQueries({ queryKey: ["admin-marketing-secret"] });
      qc.invalidateQueries({ queryKey: ["marketing-config"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-display text-3xl">Marketing & Tracking</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure Meta Pixel + Conversion API. Events automatically deduplicate via shared event IDs.
        </p>
      </div>

      <div className="rounded-sm border border-border bg-card p-6">
        <h3 className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Meta Pixel</h3>
        <label className="mt-4 block">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Pixel ID</span>
          <input
            value={pixelId}
            onChange={(e) => setPixelId(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="e.g. 123456789012345"
            className={cn(
              "mt-1 w-full rounded-sm border bg-background px-3 py-2 text-sm outline-none",
              pixelIdValid ? "border-border focus:border-primary" : "border-destructive",
            )}
          />
          {!pixelIdValid && (
            <span className="mt-1 block text-xs text-destructive">Must be 6–20 digits.</span>
          )}
        </label>
        <ToggleRow label="Enable Pixel (browser tracking)" value={pixelEnabled} onChange={setPixelEnabled} />
      </div>

      <div className="rounded-sm border border-border bg-card p-6">
        <h3 className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Google Analytics 4</h3>
        <label className="mt-4 block">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Measurement ID</span>
          <input
            value={ga4Id}
            onChange={(e) => setGa4Id(e.target.value.toUpperCase().trim())}
            placeholder="G-XXXXXXXXXX"
            className={cn(
              "mt-1 w-full rounded-sm border bg-background px-3 py-2 font-mono text-sm outline-none",
              ga4IdValid ? "border-border focus:border-primary" : "border-destructive",
            )}
          />
          {!ga4IdValid && (
            <span className="mt-1 block text-xs text-destructive">Must look like G-XXXXXXXX.</span>
          )}
        </label>
        <ToggleRow label="Enable Google Analytics 4" value={ga4Enabled} onChange={setGa4Enabled} />
        <p className="mt-3 text-xs text-muted-foreground">
          Tracks page_view, search, view_item, add_to_cart, add_to_wishlist, begin_checkout, purchase, photo_printing, and custom_design.
        </p>
      </div>

      <div className="rounded-sm border border-border bg-card p-6">
        <h3 className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Conversion API (server-side)</h3>
        <label className="mt-4 block">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Access Token</span>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value.trim())}
            placeholder="EAAB…"
            className={cn(
              "mt-1 w-full rounded-sm border bg-background px-3 py-2 font-mono text-xs outline-none",
              tokenValid ? "border-border focus:border-primary" : "border-destructive",
            )}
          />
          {!tokenValid && (
            <span className="mt-1 block text-xs text-destructive">Token format looks invalid.</span>
          )}
        </label>
        <ToggleRow label="Enable Conversion API" value={capiEnabled} onChange={setCapiEnabled} />
        <ToggleRow
          label="Enable Advanced Matching (hashed email/phone/city/country)"
          value={advancedMatching}
          onChange={setAdvancedMatching}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-sm bg-primary px-6 py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
        <span className="text-xs text-muted-foreground">
          Token is admin-only — never exposed to the website.
        </span>
      </div>
    </div>
  );
}

function ToggleRow({
  label, value, onChange,
}: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mt-4 flex cursor-pointer items-center justify-between gap-4 rounded-sm border border-border bg-background px-3 py-2">
      <span className="text-sm">{label}</span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
    </label>
  );
}

/* ---------- EXPORTS ---------- */

function ExportsTab() {
  const [busy, setBusy] = useState<string | null>(null);

  function toCSV(rows: Record<string, unknown>[]): string {
    if (!rows.length) return "";
    const headers = Object.keys(rows[0]);
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
  }

  function downloadBlob(filename: string, mime: string, content: BlobPart) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function fetchAll<T>(table: string, columns = "*"): Promise<T[]> {
    const out: T[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from(table as never)
        .select(columns)
        .range(from, from + pageSize - 1) as { data: T[] | null; error: unknown };
      if (error) throw error;
      const chunk = data ?? [];
      out.push(...chunk);
      if (chunk.length < pageSize) break;
    }
    return out;
  }

  function exportAs(rows: Record<string, unknown>[], base: string, kind: "xlsx" | "csv", sheet = "Sheet1") {
    const stamp = new Date().toISOString().slice(0, 10);
    if (kind === "csv") {
      downloadBlob(`${base}-${stamp}.csv`, "text/csv;charset=utf-8", "\uFEFF" + toCSV(rows));
      return;
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheet);
    XLSX.writeFile(wb, `${base}-${stamp}.xlsx`);
  }

  type RawOrder = {
    id: string; order_number?: string | null; created_at: string;
    customer_name: string; phone: string; governorate: string; address: string;
    poster_title?: string | null; frame_type: string; frame_color: string;
    size: string; quantity: number; shipping_cost?: number | null;
    packaging_fee?: number | null; total_price?: number | null; status: string;
  };
  type RawVisit = {
    visitor_id: string; session_id: string; path: string;
    referrer: string | null; source: string | null; device: string | null;
    user_agent: string | null; created_at: string;
  };

  async function loadOrderRows() {
    const orders = await fetchAll<RawOrder>("orders");
    return orders.map((o) => ({
      "Order Number": o.order_number ?? o.id.slice(0, 8),
      "Date": new Date(o.created_at).toISOString(),
      "Customer": o.customer_name,
      "Phone": o.phone,
      "Governorate": o.governorate,
      "Address": o.address,
      "Poster": o.poster_title ?? "",
      "Frame Type": o.frame_type,
      "Frame Color": o.frame_color,
      "Size": o.size,
      "Quantity": o.quantity,
      "Shipping": Number(o.shipping_cost ?? 0),
      "Packaging": Number(o.packaging_fee ?? 0),
      "Total": Number(o.total_price ?? 0),
      "Status": o.status,
    }));
  }

  async function loadCustomerRows() {
    const orders = await fetchAll<RawOrder>("orders");
    const map = new Map<string, {
      name: string; phone: string; governorate: string; address: string;
      orders: number; revenue: number; first: string; last: string;
    }>();
    for (const o of orders) {
      const key = (o.phone || o.customer_name).trim().toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.orders += 1;
        existing.revenue += Number(o.total_price ?? 0);
        if (o.created_at < existing.first) existing.first = o.created_at;
        if (o.created_at > existing.last) existing.last = o.created_at;
      } else {
        map.set(key, {
          name: o.customer_name, phone: o.phone, governorate: o.governorate, address: o.address,
          orders: 1, revenue: Number(o.total_price ?? 0),
          first: o.created_at, last: o.created_at,
        });
      }
    }
    return Array.from(map.values()).map((c) => ({
      "Customer": c.name,
      "Phone": c.phone,
      "Governorate": c.governorate,
      "Address": c.address,
      "Orders": c.orders,
      "Total Revenue (EGP)": Math.round(c.revenue),
      "First Order": new Date(c.first).toISOString(),
      "Last Order": new Date(c.last).toISOString(),
    }));
  }

  async function loadVisitorRows() {
    const visits = await fetchAll<RawVisit>("analytics_visits");
    return visits.map((v) => ({
      "Visitor": v.visitor_id,
      "Session": v.session_id,
      "Path": v.path,
      "Source": v.source ?? "",
      "Device": v.device ?? "",
      "Referrer": v.referrer ?? "",
      "User Agent": v.user_agent ?? "",
      "Date": new Date(v.created_at).toISOString(),
    }));
  }

  async function loadAnalyticsRows() {
    const visits = await fetchAll<RawVisit>("analytics_visits");
    const byDay = new Map<string, { visits: number; visitors: Set<string>; sources: Map<string, number> }>();
    for (const v of visits) {
      const day = v.created_at.slice(0, 10);
      const slot = byDay.get(day) ?? { visits: 0, visitors: new Set(), sources: new Map() };
      slot.visits += 1;
      slot.visitors.add(v.visitor_id);
      const src = v.source ?? "direct";
      slot.sources.set(src, (slot.sources.get(src) ?? 0) + 1);
      byDay.set(day, slot);
    }
    return Array.from(byDay.entries())
      .sort((a, b) => a[0] < b[0] ? 1 : -1)
      .map(([day, s]) => ({
        "Date": day,
        "Visits": s.visits,
        "Unique Visitors": s.visitors.size,
        "Top Source": Array.from(s.sources.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "",
      }));
  }

  async function loadRevenueRows() {
    const orders = await fetchAll<RawOrder>("orders");
    const byDay = new Map<string, { orders: number; revenue: number; shipping: number; packaging: number }>();
    for (const o of orders) {
      const day = o.created_at.slice(0, 10);
      const slot = byDay.get(day) ?? { orders: 0, revenue: 0, shipping: 0, packaging: 0 };
      slot.orders += 1;
      slot.revenue += Number(o.total_price ?? 0);
      slot.shipping += Number(o.shipping_cost ?? 0);
      slot.packaging += Number(o.packaging_fee ?? 0);
      byDay.set(day, slot);
    }
    return Array.from(byDay.entries())
      .sort((a, b) => a[0] < b[0] ? 1 : -1)
      .map(([day, s]) => ({
        "Date": day,
        "Orders": s.orders,
        "Revenue (EGP)": Math.round(s.revenue),
        "Shipping (EGP)": Math.round(s.shipping),
        "Packaging (EGP)": Math.round(s.packaging),
        "AOV (EGP)": s.orders ? Math.round(s.revenue / s.orders) : 0,
      }));
  }

  async function run(key: string, loader: () => Promise<Record<string, unknown>[]>, base: string, kind: "xlsx" | "csv", sheet: string) {
    if (busy) return;
    setBusy(`${key}-${kind}`);
    try {
      const rows = await loader();
      if (!rows.length) { toast.error("Nothing to export yet."); return; }
      exportAs(rows, base, kind, sheet);
      toast.success(`Exported ${rows.length} ${sheet.toLowerCase()} rows.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  const groups: Array<{ key: string; title: string; desc: string; base: string; sheet: string; loader: () => Promise<Record<string, unknown>[]> }> = [
    { key: "orders", title: "Orders", desc: "All orders with customer, frame, totals and status.", base: "brwazwneon-orders", sheet: "Orders", loader: loadOrderRows },
    { key: "customers", title: "Customers", desc: "Unique customers aggregated from orders (orders, revenue, dates).", base: "brwazwneon-customers", sheet: "Customers", loader: loadCustomerRows },
    { key: "visitors", title: "Visitors", desc: "Raw visitor sessions from on-site analytics.", base: "brwazwneon-visitors", sheet: "Visitors", loader: loadVisitorRows },
    { key: "analytics", title: "Analytics", desc: "Daily visits, unique visitors and top traffic source.", base: "brwazwneon-analytics", sheet: "Analytics", loader: loadAnalyticsRows },
    { key: "revenue", title: "Revenue", desc: "Daily revenue, shipping, packaging and AOV.", base: "brwazwneon-revenue", sheet: "Revenue", loader: loadRevenueRows },
  ];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-display text-2xl">Exports</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Download orders, customers, visitors, analytics and revenue as Excel or CSV.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map((g) => (
          <div key={g.key} className="rounded-sm border border-border bg-card p-5">
            <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{g.title}</div>
            <p className="mt-2 text-sm text-foreground/80">{g.desc}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                disabled={!!busy}
                onClick={() => run(g.key, g.loader, g.base, "xlsx", g.sheet)}
                className="inline-flex items-center gap-2 rounded-sm bg-primary px-3 py-2 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
              >
                {busy === `${g.key}-xlsx` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Excel
              </button>
              <button
                disabled={!!busy}
                onClick={() => run(g.key, g.loader, g.base, "csv", g.sheet)}
                className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent disabled:opacity-50"
              >
                {busy === `${g.key}-csv` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                CSV
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- HIGHLIGHTS ---------- */

type HighlightRow = {
  id: string;
  key: string;
  title: string;
  image_url: string | null;
  link: string;
  sort_order: number;
  enabled: boolean;
};

function HighlightsTab() {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-highlights"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("highlights")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as HighlightRow[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-highlights"] });
    qc.invalidateQueries({ queryKey: ["highlights"] });
  };

  const update = async (id: string, patch: Partial<HighlightRow>) => {
    const { error } = await supabase.from("highlights").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    invalidate();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this highlight?")) return;
    const { error } = await supabase.from("highlights").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    invalidate();
  };

  const move = async (r: HighlightRow, dir: -1 | 1) => {
    const idx = rows.findIndex((x) => x.id === r.id);
    const other = rows[idx + dir];
    if (!other) return;
    await update(r.id, { sort_order: other.sort_order });
    await update(other.id, { sort_order: r.sort_order });
  };

  const uploadImage = async (r: HighlightRow, file: File) => {
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
    const path = `highlights/${r.id}-${Date.now()}.${ext}`;
    try {
      const signed = await uploadAndSign("slider", path, file);
      await update(r.id, { image_url: signed });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const addNew = async () => {
    const key = prompt("Highlight key (unique slug, e.g. new-in):");
    if (!key) return;
    const title = prompt("Title:") ?? key;
    const link = prompt("Link (e.g. /category/new):") ?? "/";
    const sort_order = (rows[rows.length - 1]?.sort_order ?? 0) + 1;
    const { error } = await supabase.from("highlights").insert({ key, title, link, sort_order, enabled: true });
    if (error) return toast.error(error.message);
    invalidate();
  };

  return (
    <div>
      <div className="flex items-center justify-between rounded-sm border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">Homepage highlight strip — reorder, toggle, or change images/links.</p>
        <button onClick={addNew} className="inline-flex items-center gap-2 rounded-sm bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground">
          <Plus className="h-4 w-4" /> New highlight
        </button>
      </div>

      <div className="mt-6 space-y-3">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            No highlights yet.
          </div>
        ) : (
          rows.map((r, i) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-sm border border-border bg-card p-3">
              <div className="h-16 w-16 overflow-hidden rounded-full border border-border bg-muted">
                {r.image_url ? <SafeImage src={r.image_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">No img</div>}
              </div>
              <label className="cursor-pointer text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">
                Upload
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(r, f); e.currentTarget.value = ""; }} />
              </label>
              <input defaultValue={r.title} placeholder="Title" onBlur={(e) => e.target.value !== r.title && update(r.id, { title: e.target.value })} className="w-40 rounded-sm border border-border bg-background px-2 py-1.5 text-sm" />
              <input defaultValue={r.link} placeholder="/category/football" onBlur={(e) => e.target.value !== r.link && update(r.id, { link: e.target.value })} className="w-56 rounded-sm border border-border bg-background px-2 py-1.5 text-sm" />
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{r.key}</span>
              <label className="inline-flex items-center gap-2 text-xs uppercase tracking-widest">
                <input type="checkbox" checked={r.enabled} onChange={(e) => update(r.id, { enabled: e.target.checked })} />
                Enabled
              </label>
              <div className="ml-auto flex gap-1">
                <button onClick={() => move(r, -1)} disabled={i === 0} className="rounded-sm border border-border p-1.5 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button onClick={() => move(r, 1)} disabled={i === rows.length - 1} className="rounded-sm border border-border p-1.5 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                <button onClick={() => remove(r.id)} className="rounded-sm border border-border p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ---------- SETS ---------- */

type SetRow = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  frames_count: number;
  price: number;
  old_price: number | null;
  enabled: boolean;
  featured: boolean;
  sort_order: number;
};

function SetsTab() {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-sets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sets")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SetRow[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-sets"] });
    qc.invalidateQueries({ queryKey: ["sets", "public"] });
  };

  const update = async (id: string, patch: Partial<SetRow>) => {
    const { error } = await supabase.from("sets").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    invalidate();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this set?")) return;
    const { error } = await supabase.from("sets").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    invalidate();
  };

  const move = async (r: SetRow, dir: -1 | 1) => {
    const idx = rows.findIndex((x) => x.id === r.id);
    const other = rows[idx + dir];
    if (!other) return;
    await update(r.id, { sort_order: other.sort_order });
    await update(other.id, { sort_order: r.sort_order });
  };

  const uploadImage = async (r: SetRow, file: File) => {
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
    const path = `sets/${r.id}-${Date.now()}.${ext}`;
    try {
      const signed = await uploadAndSign("slider", path, file);
      await update(r.id, { image_url: signed });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const addNew = async () => {
    const name = prompt("Set name (e.g. 6 Frames Set):");
    if (!name) return;
    const sort_order = (rows[rows.length - 1]?.sort_order ?? 0) + 1;
    const { error } = await supabase.from("sets").insert({ name, frames_count: 6, price: 0, sort_order, enabled: true });
    if (error) return toast.error(error.message);
    invalidate();
  };

  return (
    <div>
      <div className="flex items-center justify-between rounded-sm border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">Frame Sets — bundles shown on the /sets page. Admin controls all prices.</p>
        <button onClick={addNew} className="inline-flex items-center gap-2 rounded-sm bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground">
          <Plus className="h-4 w-4" /> New set
        </button>
      </div>

      <div className="mt-6 space-y-3">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            No sets yet. Create one to get started.
          </div>
        ) : (
          rows.map((r, i) => (
            <div key={r.id} className="rounded-sm border border-border bg-card p-4">
              <div className="flex flex-wrap items-start gap-4">
                <div className="h-24 w-32 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
                  {r.image_url ? <SafeImage src={r.image_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">No image</div>}
                </div>
                <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                  <input defaultValue={r.name} placeholder="Set name" onBlur={(e) => e.target.value !== r.name && update(r.id, { name: e.target.value })} className="rounded-sm border border-border bg-background px-2 py-1.5 text-sm" />
                  <input type="number" defaultValue={r.frames_count} placeholder="Number of frames" onBlur={(e) => Number(e.target.value) !== r.frames_count && update(r.id, { frames_count: Number(e.target.value) || 1 })} className="rounded-sm border border-border bg-background px-2 py-1.5 text-sm" />
                  <input type="number" defaultValue={r.price} placeholder="Price (EGP)" onBlur={(e) => Number(e.target.value) !== Number(r.price) && update(r.id, { price: Number(e.target.value) || 0 })} className="rounded-sm border border-border bg-background px-2 py-1.5 text-sm" />
                  <input type="number" defaultValue={r.old_price ?? ""} placeholder="Old price (optional)" onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== (r.old_price ?? null)) update(r.id, { old_price: v }); }} className="rounded-sm border border-border bg-background px-2 py-1.5 text-sm" />
                  <textarea defaultValue={r.description ?? ""} placeholder="Description" onBlur={(e) => e.target.value !== (r.description ?? "") && update(r.id, { description: e.target.value || null })} className="col-span-full min-h-[60px] rounded-sm border border-border bg-background px-2 py-1.5 text-sm" />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="cursor-pointer text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">
                  Upload image
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(r, f); e.currentTarget.value = ""; }} />
                </label>
                <label className="inline-flex items-center gap-2 text-xs uppercase tracking-widest">
                  <input type="checkbox" checked={r.enabled} onChange={(e) => update(r.id, { enabled: e.target.checked })} /> Enabled
                </label>
                <label className="inline-flex items-center gap-2 text-xs uppercase tracking-widest">
                  <input type="checkbox" checked={r.featured} onChange={(e) => update(r.id, { featured: e.target.checked })} /> Featured
                </label>
                <div className="ml-auto flex gap-1">
                  <button onClick={() => move(r, -1)} disabled={i === 0} className="rounded-sm border border-border p-1.5 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button onClick={() => move(r, 1)} disabled={i === rows.length - 1} className="rounded-sm border border-border p-1.5 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                  <button onClick={() => remove(r.id)} className="rounded-sm border border-border p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ---------- BEST SELLERS ---------- */

type BSAdminRow = {
  id: string;
  poster_id: string;
  position: number;
  pinned: boolean;
  hidden: boolean;
  featured: boolean;
  badge_disabled: boolean;
  start_date: string | null;
  end_date: string | null;
  posters: {
    id: string;
    title: string;
    image_url: string;
    categories: { name: string } | null;
  } | null;
};

function BestSellersTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<"" | "refresh" | "recalc" | "export">("");

  const { data: analytics } = useQuery({
    queryKey: ["admin-bs-analytics"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("best_sellers_analytics");
      if (error) throw error;
      return data as {
        top_viewed: Array<{ id: string; title: string; image_url: string; views_count: number }>;
        top_purchased: Array<{ id: string; title: string; image_url: string; sales_count: number }>;
        top_wishlisted: Array<{ id: string; title: string; image_url: string; wishlist_count: number }>;
        trending_today: Array<{ id: string; title: string; image_url: string; score: number }>;
        trending_week: Array<{ id: string; title: string; image_url: string; score: number }>;
        trending_month: Array<{ id: string; title: string; image_url: string; score: number }>;
      };
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-best-sellers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("best_sellers")
        .select(
          "id,poster_id,position,pinned,hidden,featured,badge_disabled,start_date,end_date,posters(id,title,image_url,categories(name))",
        )
        .order("pinned", { ascending: false })
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as BSAdminRow[];
    },
  });

  const { data: searchResults = [] } = useQuery({
    queryKey: ["admin-poster-search-bs", search],
    enabled: search.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posters")
        .select("id,title,image_url")
        .ilike("title", `%${search.trim()}%`)
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: cfg } = useQuery({
    queryKey: ["admin-bs-config"],
    queryFn: async (): Promise<BestSellersConfig> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", BEST_SELLERS_CONFIG_KEY)
        .maybeSingle();
      if (error) throw error;
      const v = (data?.value ?? {}) as Partial<BestSellersConfig>;
      const allowed = [8, 12, 16, 24] as const;
      const max = allowed.includes(v.max as (typeof allowed)[number])
        ? (v.max as BestSellersConfig["max"])
        : DEFAULT_BS_CONFIG.max;
      const hc = Number(v.homepage_count);
      return {
        ...DEFAULT_BS_CONFIG,
        max,
        autoplay: v.autoplay === true,
        loop: v.loop !== false,
        enabled: v.enabled !== false,
        title: typeof v.title === "string" && v.title.trim() ? v.title : DEFAULT_BS_CONFIG.title,
        subtitle: typeof v.subtitle === "string" ? v.subtitle : DEFAULT_BS_CONFIG.subtitle,
        homepage_count: Number.isFinite(hc) && hc > 0 && hc <= 24 ? Math.floor(hc) : DEFAULT_BS_CONFIG.homepage_count,
        auto: v.auto !== false,
        show_badges: v.show_badges !== false,
        show_price: v.show_price !== false,
        show_cart: v.show_cart !== false,
        show_wishlist: v.show_wishlist !== false,
        show_quick_view: v.show_quick_view !== false,
      };
    },
  });

  const currentCfg = cfg ?? DEFAULT_BS_CONFIG;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-best-sellers"] });
    qc.invalidateQueries({ queryKey: ["best-sellers"] });
  };

  type BSUpdate = Partial<Omit<BSAdminRow, "posters">>;
  const update = async (id: string, patch: BSUpdate) => {
    const { error } = await supabase.from("best_sellers").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    invalidate();
  };

  const move = async (r: BSAdminRow, dir: -1 | 1) => {
    const list = rows.filter((x) => x.pinned === r.pinned);
    const idx = list.findIndex((x) => x.id === r.id);
    const other = list[idx + dir];
    if (!other) return;
    await update(r.id, { position: other.position });
    await update(other.id, { position: r.position });
  };

  const remove = async (id: string) => {
    if (!confirm("Remove from Best Sellers?")) return;
    const { error } = await supabase.from("best_sellers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    invalidate();
  };

  const addPoster = async (posterId: string) => {
    const maxPos = rows.reduce((m, r) => Math.max(m, r.position), 0);
    const { error } = await supabase
      .from("best_sellers")
      .insert({ poster_id: posterId, position: maxPos + 1 });
    if (error) return toast.error(error.message);
    toast.success("Added");
    setSearch("");
    invalidate();
  };

  const saveConfig = async (patch: Partial<BestSellersConfig>) => {
    const next = { ...currentCfg, ...patch };
    const { error } = await supabase
      .from("site_settings")
      .upsert({ key: BEST_SELLERS_CONFIG_KEY, value: next as unknown as never });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-bs-config"] });
    qc.invalidateQueries({ queryKey: ["best-sellers-config"] });
    qc.invalidateQueries({ queryKey: ["best-sellers"] });
    toast.success("Saved");
  };

  const existingIds = new Set(rows.map((r) => r.poster_id));

  const recalculate = async () => {
    setBusy("recalc");
    try {
      const { data, error } = await supabase.rpc("refresh_auto_best_sellers", { _top_n: currentCfg.max });
      if (error) throw error;
      const r = data as { added: number; removed: number; kept: number };
      toast.success(`Recalculated — ${r.added} added, ${r.removed} removed, ${r.kept} kept`);
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy("");
    }
  };

  const refresh = () => {
    setBusy("refresh");
    invalidate();
    qc.invalidateQueries({ queryKey: ["admin-bs-analytics"] });
    setTimeout(() => setBusy(""), 400);
  };

  const exportCsv = () => {
    setBusy("export");
    const header = ["position", "title", "category", "pinned", "featured", "hidden"].join(",");
    const lines = rows.map((r) =>
      [
        r.position,
        JSON.stringify(r.posters?.title ?? ""),
        JSON.stringify(r.posters?.categories?.name ?? ""),
        r.pinned,
        r.featured,
        r.hidden,
      ].join(","),
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `best-sellers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setBusy("");
  };

  return (
    <div>
      {/* Display settings */}
      <div className="rounded-sm border border-border bg-card p-4">
        <p className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
          Best Sellers settings
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex items-center gap-2 text-xs uppercase tracking-widest">
            <input
              type="checkbox"
              checked={currentCfg.enabled}
              onChange={(e) => saveConfig({ enabled: e.target.checked })}
            />
            Section enabled
          </label>
          <label className="flex items-center gap-2 text-xs uppercase tracking-widest">
            <input
              type="checkbox"
              checked={currentCfg.auto}
              onChange={(e) => saveConfig({ auto: e.target.checked })}
            />
            Auto ranking
          </label>
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
            Section title
            <input
              type="text"
              defaultValue={currentCfg.title}
              onBlur={(e) => e.target.value !== currentCfg.title && saveConfig({ title: e.target.value })}
              className="rounded-sm border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
            Section subtitle
            <input
              type="text"
              defaultValue={currentCfg.subtitle}
              onBlur={(e) => e.target.value !== currentCfg.subtitle && saveConfig({ subtitle: e.target.value })}
              className="rounded-sm border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
            Products on homepage
            <input
              type="number"
              min={1}
              max={24}
              defaultValue={currentCfg.homepage_count}
              onBlur={(e) => {
                const n = Math.max(1, Math.min(24, Number(e.target.value) || 6));
                if (n !== currentCfg.homepage_count) saveConfig({ homepage_count: n });
              }}
              className="rounded-sm border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            />
          </label>
          <label className="flex items-center gap-2 text-xs uppercase tracking-widest">
            Auto rank size
            <select
              value={currentCfg.max}
              onChange={(e) =>
                saveConfig({ max: Number(e.target.value) as BestSellersConfig["max"] })
              }
              className="rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
            >
              {[8, 12, 16, 24].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs uppercase tracking-widest">
            <input
              type="checkbox"
              checked={currentCfg.autoplay}
              onChange={(e) => saveConfig({ autoplay: e.target.checked })}
            />
            Autoplay
          </label>
          <label className="flex items-center gap-2 text-xs uppercase tracking-widest">
            <input
              type="checkbox"
              checked={currentCfg.loop}
              onChange={(e) => saveConfig({ loop: e.target.checked })}
            />
            Loop
          </label>
          <label className="flex items-center gap-2 text-xs uppercase tracking-widest">
            <input type="checkbox" checked={currentCfg.show_badges} onChange={(e) => saveConfig({ show_badges: e.target.checked })} />
            Show badges
          </label>
          <label className="flex items-center gap-2 text-xs uppercase tracking-widest">
            <input type="checkbox" checked={currentCfg.show_price} onChange={(e) => saveConfig({ show_price: e.target.checked })} />
            Show price
          </label>
          <label className="flex items-center gap-2 text-xs uppercase tracking-widest">
            <input type="checkbox" checked={currentCfg.show_cart} onChange={(e) => saveConfig({ show_cart: e.target.checked })} />
            Show Add to Cart
          </label>
          <label className="flex items-center gap-2 text-xs uppercase tracking-widest">
            <input type="checkbox" checked={currentCfg.show_wishlist} onChange={(e) => saveConfig({ show_wishlist: e.target.checked })} />
            Show Wishlist
          </label>
          <label className="flex items-center gap-2 text-xs uppercase tracking-widest">
            <input type="checkbox" checked={currentCfg.show_quick_view} onChange={(e) => saveConfig({ show_quick_view: e.target.checked })} />
            Show Quick View
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          <button
            onClick={refresh}
            disabled={!!busy}
            className="rounded-sm border border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-widest hover:bg-accent disabled:opacity-40"
          >
            {busy === "refresh" ? "Refreshing…" : "Refresh Ranking"}
          </button>
          <button
            onClick={recalculate}
            disabled={!!busy}
            className="rounded-sm bg-primary px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {busy === "recalc" ? "Recalculating…" : "Recalculate Best Sellers"}
          </button>
          <button
            onClick={exportCsv}
            disabled={!!busy || rows.length === 0}
            className="rounded-sm border border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-widest hover:bg-accent disabled:opacity-40"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Analytics */}
      {analytics ? (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {([
            ["Top viewed", analytics.top_viewed.map((x) => ({ id: x.id, title: x.title, image_url: x.image_url, meta: `${x.views_count} views` }))],
            ["Top purchased", analytics.top_purchased.map((x) => ({ id: x.id, title: x.title, image_url: x.image_url, meta: `${x.sales_count} sold` }))],
            ["Top wishlisted", analytics.top_wishlisted.map((x) => ({ id: x.id, title: x.title, image_url: x.image_url, meta: `${x.wishlist_count} saves` }))],
            ["Trending today", analytics.trending_today.map((x) => ({ id: x.id, title: x.title, image_url: x.image_url, meta: `${x.score} adds` }))],
            ["Trending this week", analytics.trending_week.map((x) => ({ id: x.id, title: x.title, image_url: x.image_url, meta: `${x.score} adds` }))],
            ["Trending this month", analytics.trending_month.map((x) => ({ id: x.id, title: x.title, image_url: x.image_url, meta: `${x.score} adds` }))],
          ] as const).map(([label, items]) => (
            <div key={label} className="rounded-sm border border-border bg-card p-4">
              <p className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground">No data yet.</p>
              ) : (
                <ul className="space-y-2">
                  {items.slice(0, 5).map((it) => {
                    const already = existingIds.has(it.id);
                    return (
                      <li key={it.id} className="flex items-center gap-2">
                        <div className="h-10 w-8 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
                          <SafeImage src={it.image_url} alt="" className="h-full w-full object-cover" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs">{it.title}</div>
                          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{it.meta}</div>
                        </div>
                        <button
                          onClick={() => !already && addPoster(it.id)}
                          disabled={already}
                          className="rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-accent disabled:opacity-40"
                        >
                          {already ? "In list" : "Add"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {/* Add poster */}
      <div className="mt-6 rounded-sm border border-border bg-card p-4">
        <p className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
          Add a poster
        </p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search posters by title…"
            className="w-full rounded-sm border border-border bg-background py-2 pl-10 pr-3 text-sm"
          />
        </div>
        {search.trim().length >= 2 && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {searchResults.map((p) => {
              const already = existingIds.has(p.id);
              return (
                <button
                  key={p.id}
                  disabled={already}
                  onClick={() => addPoster(p.id)}
                  className="group relative overflow-hidden rounded-sm border border-border bg-muted text-left disabled:opacity-40"
                >
                  <div className="aspect-[3/4] w-full">
                    <SafeImage
                      src={p.image_url}
                      alt={p.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="p-2 text-[10px] uppercase tracking-widest">
                    {already ? "Already added" : p.title}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Rows */}
      <div className="mt-6 space-y-3">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            No best sellers yet. Search a poster above to add one.
          </div>
        ) : (
          rows.map((r, i) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center gap-3 rounded-sm border border-border bg-card p-3"
            >
              <div className="h-16 w-12 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
                {r.posters?.image_url ? (
                  <SafeImage
                    src={r.posters.image_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-[180px] flex-1">
                <div className="text-sm font-semibold">{r.posters?.title ?? "—"}</div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {r.posters?.categories?.name ?? "Uncategorised"}
                </div>
              </div>
              <label className="inline-flex items-center gap-2 text-xs uppercase tracking-widest">
                <input
                  type="checkbox"
                  checked={r.pinned}
                  onChange={(e) => update(r.id, { pinned: e.target.checked })}
                />
                Pin
              </label>
              <label className="inline-flex items-center gap-2 text-xs uppercase tracking-widest">
                <input
                  type="checkbox"
                  checked={r.featured}
                  onChange={(e) => update(r.id, { featured: e.target.checked })}
                />
                Featured
              </label>
              <label className="inline-flex items-center gap-2 text-xs uppercase tracking-widest">
                <input
                  type="checkbox"
                  checked={!r.hidden}
                  onChange={(e) => update(r.id, { hidden: !e.target.checked })}
                />
                Show
              </label>
              <label className="inline-flex items-center gap-2 text-xs uppercase tracking-widest">
                <input
                  type="checkbox"
                  checked={!r.badge_disabled}
                  onChange={(e) => update(r.id, { badge_disabled: !e.target.checked })}
                />
                Badge
              </label>
              <label className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                Start
                <input
                  type="date"
                  defaultValue={r.start_date ? r.start_date.slice(0, 10) : ""}
                  onBlur={(e) => {
                    const v = e.target.value ? new Date(e.target.value).toISOString() : null;
                    if (v !== r.start_date) update(r.id, { start_date: v });
                  }}
                  className="rounded-sm border border-border bg-background px-2 py-1 text-xs"
                />
              </label>
              <label className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                End
                <input
                  type="date"
                  defaultValue={r.end_date ? r.end_date.slice(0, 10) : ""}
                  onBlur={(e) => {
                    const v = e.target.value ? new Date(e.target.value).toISOString() : null;
                    if (v !== r.end_date) update(r.id, { end_date: v });
                  }}
                  className="rounded-sm border border-border bg-background px-2 py-1 text-xs"
                />
              </label>
              <div className="ml-auto flex gap-1">
                <button
                  onClick={() => move(r, -1)}
                  disabled={i === 0}
                  className="rounded-sm border border-border p-1.5 disabled:opacity-30"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => move(r, 1)}
                  disabled={i === rows.length - 1}
                  className="rounded-sm border border-border p-1.5 disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => remove(r.id)}
                  className="rounded-sm border border-border p-1.5 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ---------- HOMEPAGE SECTIONS MANAGER ---------- */

function HomeSectionsTab() {
  const qc = useQueryClient();
  const [trendingOpen, setTrendingOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState<HomeSectionConfig | null>(null);
  const { data: sections = DEFAULT_HOME_SECTIONS, isLoading } = useQuery({
    queryKey: ["admin-home-sections"],
    queryFn: async (): Promise<HomeSectionConfig[]> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", HOME_SECTIONS_KEY)
        .maybeSingle();
      if (error) throw error;
      const raw = data?.value;
      if (!Array.isArray(raw)) return DEFAULT_HOME_SECTIONS;
      const seen = new Set<string>();
      const out: HomeSectionConfig[] = [];
      for (const item of raw) {
        const it = item as Record<string, unknown>;
        const key = it.key as string | undefined;
        if (!key) continue;
        const isCustom = it.custom === true || key.startsWith("custom-");
        if (!isCustom && !(key in HOME_SECTION_LABELS)) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        const def = DEFAULT_HOME_SECTIONS.find((d) => d.key === key);
        out.push({
          key,
          enabled: it.enabled !== false,
          title: (it.title as string | undefined) ?? def?.title,
          subtitle: (it.subtitle as string | undefined) ?? def?.subtitle,
          title_en: (it.title_en as string | undefined) ?? def?.title_en,
          title_ar: (it.title_ar as string | undefined) ?? def?.title_ar,
          subtitle_en: (it.subtitle_en as string | undefined) ?? def?.subtitle_en,
          subtitle_ar: (it.subtitle_ar as string | undefined) ?? def?.subtitle_ar,
          items_count: typeof it.items_count === "number" ? it.items_count : def?.items_count,
          source_type: (it.source_type as HomeSectionConfig["source_type"]) ?? def?.source_type,
          display_type: (it.display_type as HomeSectionConfig["display_type"]) ?? def?.display_type,
          manual_ids: Array.isArray(it.manual_ids) ? (it.manual_ids as string[]) : def?.manual_ids,
          custom: isCustom || undefined,
          label: (it.label as string | undefined) ?? def?.label,
        });
      }
      for (const d of DEFAULT_HOME_SECTIONS) if (!seen.has(d.key)) out.push(d);
      return out;
    },
  });

  const save = async (next: HomeSectionConfig[]) => {
    const { error } = await supabase
      .from("site_settings")
      .upsert({ key: HOME_SECTIONS_KEY, value: next as unknown as never });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-home-sections"] });
    qc.invalidateQueries({ queryKey: ["homepage-sections"] });
    toast.success("Homepage sections updated successfully");
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };

  const updateAt = (i: number, patch: Partial<HomeSectionConfig>) => {
    const next = sections.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    save(next);
  };

  const removeAt = (i: number) => {
    if (!confirm("Remove this custom section?")) return;
    save(sections.filter((_, idx) => idx !== i));
  };

  const addCustom = () => {
    const label = prompt("New section label (shown in admin only)");
    if (!label) return;
    const key = `custom-${Date.now()}`;
    save([
      ...sections,
      {
        key,
        custom: true,
        label,
        enabled: true,
        title_en: label,
        title_ar: label,
        source_type: "manual",
        display_type: "grid",
        items_count: 8,
        manual_ids: [],
      },
    ]);
  };

  const resetDefaults = () => {
    if (!confirm("Reset section order to defaults?")) return;
    save(DEFAULT_HOME_SECTIONS);
  };

  const sectionLabel = (s: HomeSectionConfig) =>
    (HOME_SECTION_LABELS as Record<string, string>)[s.key] ?? s.label ?? s.key;

  const sourceTypes: Array<[NonNullable<HomeSectionConfig["source_type"]>, string]> = [
    ["manual", "Manual Selection"],
    ["trending", "Trending Posters"],
    ["best_sellers", "Best Sellers"],
    ["recently_viewed", "Recently Viewed"],
    ["category", "Category Based"],
    ["personalized", "Personalized"],
    ["mixed", "Mixed"],
  ];
  const displayTypes: Array<[NonNullable<HomeSectionConfig["display_type"]>, string]> = [
    ["slider", "Slider"],
    ["grid", "Grid"],
    ["carousel", "Carousel"],
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">
          Reorder, show/hide, and rename homepage sections. Every change saves and applies instantly.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTrendingOpen(true)}
            className="inline-flex items-center gap-1 rounded-sm bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90"
          >
            🔥 Trending Now Manager
          </button>
          <Link
            to="/"
            target="_blank"
            className="rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
          >
            Preview Homepage
          </Link>
          <button
            onClick={addCustom}
            className="rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
          >
            + Create New Section
          </button>
          <button
            onClick={resetDefaults}
            className="rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
          >
            Reset defaults
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          sections.map((s, i) => (
            <div
              key={s.key}
              className="rounded-sm border border-border bg-card p-3"
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-[160px]">
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    {sectionLabel(s)}
                    {s.custom ? (
                      <span className="rounded-sm border border-border px-1 py-0.5 text-[9px] uppercase tracking-widest text-muted-foreground">
                        Custom
                      </span>
                    ) : null}
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {s.key}
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 text-xs uppercase tracking-widest">
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={(e) => updateAt(i, { enabled: e.target.checked })}
                  />
                  {s.enabled ? "Visible" : "Hidden"}
                </label>
                <div className="ml-auto flex gap-1">
                  {s.key === "trending-now" ? (
                    <button
                      onClick={() => setTrendingOpen(true)}
                      className="rounded-sm border border-primary/50 bg-primary/10 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-primary hover:bg-primary/20"
                    >
                      Manage Items
                    </button>
                  ) : s.source_type === "manual" ? (
                    <button
                      onClick={() => setManualOpen(s)}
                      className="rounded-sm border border-border px-2 py-1.5 text-[10px] uppercase tracking-widest hover:bg-accent"
                    >
                      Manage Items
                    </button>
                  ) : null}
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    title="Move up"
                    className="rounded-sm border border-border p-1.5 disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === sections.length - 1}
                    title="Move down"
                    className="rounded-sm border border-border p-1.5 disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  {s.custom ? (
                    <button
                      onClick={() => removeAt(i)}
                      title="Delete section"
                      className="rounded-sm border border-border p-1.5 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input
                  defaultValue={s.title_en ?? s.title ?? ""}
                  placeholder="Title (English)"
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v !== (s.title_en ?? s.title ?? "")) updateAt(i, { title_en: v || undefined });
                  }}
                  className="rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
                />
                <input
                  defaultValue={s.title_ar ?? ""}
                  placeholder="العنوان (عربي)"
                  dir="rtl"
                  onBlur={(e) => {
                    if (e.target.value !== (s.title_ar ?? "")) updateAt(i, { title_ar: e.target.value || undefined });
                  }}
                  className="rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
                />
                <input
                  defaultValue={s.subtitle_en ?? s.subtitle ?? ""}
                  placeholder="Subtitle (English)"
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v !== (s.subtitle_en ?? s.subtitle ?? "")) updateAt(i, { subtitle_en: v || undefined });
                  }}
                  className="rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
                />
                <input
                  defaultValue={s.subtitle_ar ?? ""}
                  placeholder="العنوان الفرعي (عربي)"
                  dir="rtl"
                  onBlur={(e) => {
                    if (e.target.value !== (s.subtitle_ar ?? "")) updateAt(i, { subtitle_ar: e.target.value || undefined });
                  }}
                  className="rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
                />
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <label className="inline-flex items-center gap-1">
                  <span className="text-muted-foreground">Source</span>
                  <select
                    value={s.source_type ?? ""}
                    onChange={(e) => updateAt(i, { source_type: (e.target.value || undefined) as HomeSectionConfig["source_type"] })}
                    className="rounded-sm border border-border bg-background px-1.5 py-1 text-xs"
                  >
                    <option value="">—</option>
                    {sourceTypes.map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </label>
                <label className="inline-flex items-center gap-1">
                  <span className="text-muted-foreground">Display</span>
                  <select
                    value={s.display_type ?? ""}
                    onChange={(e) => updateAt(i, { display_type: (e.target.value || undefined) as HomeSectionConfig["display_type"] })}
                    className="rounded-sm border border-border bg-background px-1.5 py-1 text-xs"
                  >
                    <option value="">—</option>
                    {displayTypes.map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </label>
                <label className="inline-flex items-center gap-1">
                  <span className="text-muted-foreground">Items</span>
                  <input
                    type="number"
                    min={1}
                    max={48}
                    defaultValue={s.items_count ?? 12}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n) && n > 0 && n !== s.items_count) updateAt(i, { items_count: n });
                    }}
                    className="w-16 rounded-sm border border-border bg-background px-1.5 py-1 text-xs"
                  />
                </label>
              </div>
            </div>
          ))
        )}
      </div>

      {trendingOpen ? <TrendingNowManager onClose={() => setTrendingOpen(false)} /> : null}
      {manualOpen ? (
        <ManualSelectionModal
          section={manualOpen}
          onClose={() => setManualOpen(null)}
          onSave={(ids) => {
            const idx = sections.findIndex((x) => x.key === manualOpen.key);
            if (idx >= 0) updateAt(idx, { manual_ids: ids });
            setManualOpen(null);
          }}
        />
      ) : null}
    </div>
  );
}

function ManualSelectionModal({
  section,
  onClose,
  onSave,
}: {
  section: HomeSectionConfig;
  onClose: () => void;
  onSave: (ids: string[]) => void;
}) {
  const [ids, setIds] = useState<string[]>(section.manual_ids ?? []);
  const [q, setQ] = useState("");
  const { data: posters = [] } = useQuery({
    queryKey: ["admin-manual-section-posters", q],
    queryFn: async () => {
      let query = supabase
        .from("posters")
        .select("id,title,image_url,hidden")
        .eq("hidden", false)
        .not("image_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(60);
      if (q.trim()) query = query.ilike("title", `%${q.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
  const toggle = (id: string) =>
    setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-sm border border-border bg-background">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <div className="text-sm font-semibold">Manage Items — {section.title_en || section.label || section.key}</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{ids.length} selected</div>
          </div>
          <button onClick={onClose} className="rounded-sm border border-border p-1.5 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="border-b border-border p-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search posters…"
            className="w-full rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {posters.map((p: any) => {
              const on = ids.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className={cn(
                    "group relative aspect-[2/3] overflow-hidden rounded-sm border bg-muted transition",
                    on ? "border-primary ring-2 ring-primary" : "border-border hover:border-primary/40",
                  )}
                >
                  <SafeImage src={p.image_url} alt={p.title} className="h-full w-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 truncate bg-background/85 px-1 py-0.5 text-[10px]">
                    {p.title}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-3">
          <button onClick={onClose} className="rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-accent">
            Cancel
          </button>
          <button
            onClick={() => onSave(ids)}
            className="rounded-sm bg-primary px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- ANNOUNCEMENT BAR ---------- */

function AnnouncementTab() {
  const qc = useQueryClient();
  const [cfg, setCfg] = useState<AnnouncementConfig>(ANNOUNCEMENT_DEFAULTS);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-announcement"],
    queryFn: async (): Promise<AnnouncementConfig> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", ANNOUNCEMENT_KEY)
        .maybeSingle();
      if (error) throw error;
      const v = (data?.value ?? {}) as Partial<AnnouncementConfig>;
      return { ...ANNOUNCEMENT_DEFAULTS, ...v };
    },
  });

  useEffect(() => { if (data) setCfg(data); }, [data]);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("site_settings").upsert({
        key: ANNOUNCEMENT_KEY,
        value: cfg as never,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success("Announcement bar saved");
      qc.invalidateQueries({ queryKey: ["announcement-bar"] });
      qc.invalidateQueries({ queryKey: ["admin-announcement"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>;

  const set = <K extends keyof AnnouncementConfig>(k: K, v: AnnouncementConfig[K]) =>
    setCfg((c) => ({ ...c, [k]: v }));

  return (
    <div className="max-w-3xl space-y-5">
      <div className="rounded-sm border border-border bg-card/50 p-4 text-xs uppercase tracking-widest text-muted-foreground">
        Marquee announcement above the header on every page.
      </div>

      <div className="rounded-sm border border-border bg-card p-6 space-y-5">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={(e) => set("enabled", e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-xs uppercase tracking-widest">Enable announcement bar</span>
        </label>

        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Text</span>
          <input
            value={cfg.text}
            onChange={(e) => set("text", e.target.value)}
            className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none"
          />
        </label>

        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Animation duration (seconds per loop) — lower = faster
          </span>
          <input
            type="number"
            min={5}
            max={120}
            value={cfg.speed}
            onChange={(e) => set("speed", Number(e.target.value) || ANNOUNCEMENT_DEFAULTS.speed)}
            className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          {([
            ["bg", "Background"],
            ["color", "Text color"],
            ["accent", "Accent color"],
          ] as const).map(([k, label]) => (
            <label key={k} className="block">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
              <div className="mt-1 flex items-center gap-2 rounded-sm border border-border bg-background px-2 py-1.5">
                <input
                  type="color"
                  value={cfg[k]}
                  onChange={(e) => set(k, e.target.value)}
                  className="h-8 w-10 cursor-pointer border-0 bg-transparent p-0"
                />
                <input
                  value={cfg[k]}
                  onChange={(e) => set(k, e.target.value)}
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>
            </label>
          ))}
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Preview</div>
          <div className="overflow-hidden rounded-sm" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
            <div className="whitespace-nowrap py-1.5 text-xs uppercase tracking-[0.28em]">
              <span className="mx-6">{cfg.text}</span>
              <span style={{ color: cfg.accent }}>•</span>
              <span className="mx-6">{cfg.text}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-3 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save announcement"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- SIZE GUIDE ---------- */

function SizeGuideTab() {
  const qc = useQueryClient();
  const [cfg, setCfg] = useState<SizeGuideConfig>(DEFAULT_SIZE_GUIDE);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-size-guide"],
    queryFn: async (): Promise<SizeGuideConfig> => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", SIZE_GUIDE_KEY)
        .maybeSingle();
      if (error) throw error;
      const v = (data?.value ?? {}) as Partial<SizeGuideConfig>;
      return { ...DEFAULT_SIZE_GUIDE, ...v, sizes: v.sizes ?? DEFAULT_SIZE_GUIDE.sizes };
    },
  });

  useEffect(() => { if (data) setCfg(data); }, [data]);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("site_settings").upsert({
        key: SIZE_GUIDE_KEY,
        value: cfg as never,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success("Size guide saved");
      qc.invalidateQueries({ queryKey: ["size-guide-config"] });
      qc.invalidateQueries({ queryKey: ["admin-size-guide"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const uploadRoom = async (file: File) => {
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
      const path = `size-guide/room-${Date.now()}.${ext}`;
      const url = await uploadAndSign("slider", path, file);
      setCfg((c) => ({ ...c, roomImageUrl: url }));
      toast.success("Room image uploaded — click Save to publish");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const updateSize = (i: number, patch: Partial<SizeGuideItem>) =>
    setCfg((c) => ({ ...c, sizes: c.sizes.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }));
  const moveSize = (i: number, dir: -1 | 1) => setCfg((c) => {
    const j = i + dir;
    if (j < 0 || j >= c.sizes.length) return c;
    const next = c.sizes.slice();
    [next[i], next[j]] = [next[j], next[i]];
    return { ...c, sizes: next };
  });
  const removeSize = (i: number) => setCfg((c) => ({ ...c, sizes: c.sizes.filter((_, idx) => idx !== i) }));
  const addSize = () => setCfg((c) => ({
    ...c,
    sizes: [...c.sizes, { id: `custom-${Date.now()}`, label: "New size", width: 30, height: 40 }],
  }));

  if (isLoading) return <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="max-w-3xl space-y-5">
      <div className="rounded-sm border border-border bg-card/50 p-4 text-xs uppercase tracking-widest text-muted-foreground">
        Size guide and room preview shown on every product page.
      </div>

      <div className="rounded-sm border border-border bg-card p-6 space-y-4">
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={cfg.enabled}
            onChange={(e) => setCfg((c) => ({ ...c, enabled: e.target.checked }))} className="h-4 w-4" />
          <span className="text-xs uppercase tracking-widest">Enable Size Guide</span>
        </label>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={cfg.roomEnabled}
            onChange={(e) => setCfg((c) => ({ ...c, roomEnabled: e.target.checked }))} className="h-4 w-4" />
          <span className="text-xs uppercase tracking-widest">Enable Room Preview tab</span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Room image</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadRoom(f); e.target.value = ""; }}
              disabled={uploading}
              className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            {cfg.roomImageUrl && (
              <img src={cfg.roomImageUrl} alt="room" className="mt-2 h-32 w-full rounded-sm border border-border object-cover" />
            )}
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Wall width in cm (used to scale overlays)
            </span>
            <input
              type="number"
              min={60}
              max={800}
              value={cfg.wallWidthCm}
              onChange={(e) => setCfg((c) => ({ ...c, wallWidthCm: Number(e.target.value) || DEFAULT_SIZE_GUIDE.wallWidthCm }))}
              className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
        </div>
      </div>

      <div className="rounded-sm border border-border bg-card p-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs uppercase tracking-widest">Sizes</div>
          <button onClick={addSize} className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-accent">
            <Plus className="h-3.5 w-3.5" /> Add size
          </button>
        </div>
        <div className="space-y-2">
          {cfg.sizes.map((s, i) => (
            <div key={`${s.id}-${i}`} className="grid grid-cols-[1fr_1fr_80px_80px_auto] items-center gap-2 rounded-sm border border-border bg-background/50 p-2">
              <input value={s.id} onChange={(e) => updateSize(i, { id: e.target.value })} placeholder="id"
                className="rounded-sm border border-border bg-background px-2 py-1.5 text-xs" />
              <input value={s.label} onChange={(e) => updateSize(i, { label: e.target.value })} placeholder="label"
                className="rounded-sm border border-border bg-background px-2 py-1.5 text-sm" />
              <input type="number" value={s.width} onChange={(e) => updateSize(i, { width: Number(e.target.value) || 0 })}
                className="rounded-sm border border-border bg-background px-2 py-1.5 text-sm" />
              <input type="number" value={s.height} onChange={(e) => updateSize(i, { height: Number(e.target.value) || 0 })}
                className="rounded-sm border border-border bg-background px-2 py-1.5 text-sm" />
              <div className="flex items-center gap-1">
                <button onClick={() => moveSize(i, -1)} className="rounded-sm border border-border p-1 hover:bg-accent" aria-label="Up"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button onClick={() => moveSize(i, 1)} className="rounded-sm border border-border p-1 hover:bg-accent" aria-label="Down"><ArrowDown className="h-3.5 w-3.5" /></button>
                <button onClick={() => removeSize(i)} className="rounded-sm border border-border p-1 text-destructive hover:bg-accent" aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-3 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50">
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save size guide"}
        </button>
      </div>
    </div>
  );
}

/* ============================ Hero Banners tab ============================ */

function HeroBannersTab() {
  const qc = useQueryClient();
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: banners = [], isLoading } = useQuery({
    queryKey: ["admin-hero-banners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hero_banners" as never)
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as HeroBanner[];
    },
  });

  const { data: cfg } = useQuery({
    queryKey: ["admin-hero-banner-config"],
    queryFn: async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", HERO_BANNER_CONFIG_KEY)
        .maybeSingle();
      const v = (data?.value ?? {}) as Partial<HeroBannerConfig>;
      return {
        autoplay_ms: Number(v.autoplay_ms) > 0 ? Number(v.autoplay_ms) : DEFAULT_HERO_BANNER_CONFIG.autoplay_ms,
        overlay_opacity: typeof v.overlay_opacity === "number" ? v.overlay_opacity : DEFAULT_HERO_BANNER_CONFIG.overlay_opacity,
      } as HeroBannerConfig;
    },
  });

  const [autoplay, setAutoplay] = useState<number>(DEFAULT_HERO_BANNER_CONFIG.autoplay_ms);
  const [overlay, setOverlay] = useState<number>(DEFAULT_HERO_BANNER_CONFIG.overlay_opacity);
  useEffect(() => {
    if (cfg) {
      setAutoplay(cfg.autoplay_ms);
      setOverlay(cfg.overlay_opacity);
    }
  }, [cfg]);

  const saveConfig = async () => {
    const payload = { autoplay_ms: autoplay, overlay_opacity: overlay };
    const { error } = await supabase
      .from("site_settings")
      .upsert({ key: HERO_BANNER_CONFIG_KEY, value: payload }, { onConflict: "key" });
    if (error) return toast.error(error.message);
    toast.success("Settings saved");
    qc.invalidateQueries({ queryKey: ["hero-banner-config"] });
    qc.invalidateQueries({ queryKey: ["admin-hero-banner-config"] });
  };

  const upload = async () => {
    if (!files || files.length === 0) return toast.error("Choose images");
    setUploading(true);
    try {
      let order = (banners[banners.length - 1]?.sort_order ?? 0) + 1;
      for (const file of Array.from(files)) {
        const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
        const path = `hero-${crypto.randomUUID()}.${ext}`;
        const signedUrl = await uploadAndSign("slider", path, file);
        const { error } = await supabase.from("hero_banners" as never).insert({
          image_url: signedUrl,
          sort_order: order++,
          enabled: true,
        } as never);
        if (error) throw error;
      }
      toast.success("Uploaded");
      setFiles(null);
      const input = document.getElementById("hero-banner-files") as HTMLInputElement | null;
      if (input) input.value = "";
      qc.invalidateQueries({ queryKey: ["admin-hero-banners"] });
      qc.invalidateQueries({ queryKey: ["hero-banners"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const update = async (id: string, patch: Partial<HeroBanner>) => {
    const { error } = await supabase.from("hero_banners" as never).update(patch as never).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-hero-banners"] });
    qc.invalidateQueries({ queryKey: ["hero-banners"] });
  };

  const remove = async (b: HeroBanner) => {
    if (!confirm("Delete this banner?")) return;
    const { error } = await supabase.from("hero_banners" as never).delete().eq("id", b.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["admin-hero-banners"] });
    qc.invalidateQueries({ queryKey: ["hero-banners"] });
  };

  const move = async (b: HeroBanner, dir: -1 | 1) => {
    const idx = banners.findIndex((x) => x.id === b.id);
    const other = banners[idx + dir];
    if (!other) return;
    await update(b.id, { sort_order: other.sort_order });
    await update(other.id, { sort_order: b.sort_order });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold uppercase tracking-widest">Hero Advertising Banners</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Rotating banners displayed behind the homepage hero. Falls back to the default hero image when empty.
        </p>
      </div>

      <div className="grid gap-3 rounded-sm border border-border bg-card p-6 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs uppercase tracking-widest">
          Autoplay speed (ms)
          <input
            type="number"
            min={1500}
            step={500}
            value={autoplay}
            onChange={(e) => setAutoplay(Number(e.target.value) || 4000)}
            className="rounded-sm border border-border bg-background px-2 py-1.5 text-sm normal-case tracking-normal"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs uppercase tracking-widest">
          Overlay opacity ({overlay.toFixed(2)})
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={overlay}
            onChange={(e) => setOverlay(Number(e.target.value))}
            className="w-full"
          />
        </label>
        <div className="sm:col-span-2">
          <button
            onClick={saveConfig}
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground"
          >
            <Save className="h-4 w-4" /> Save settings
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-sm border border-border bg-card p-6">
        <input
          id="hero-banner-files"
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setFiles(e.target.files)}
          className="text-sm text-muted-foreground"
        />
        <button
          onClick={upload}
          disabled={uploading}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground disabled:opacity-50"
        >
          <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload banners"}
        </button>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : banners.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            No banners yet. Upload your first hero banner.
          </div>
        ) : (
          banners.map((b, i) => (
            <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-sm border border-border bg-card p-3">
              <SafeImage src={b.image_url} alt="" className="h-20 w-32 rounded-sm object-cover" />
              <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  defaultValue={b.title ?? ""}
                  placeholder="Title"
                  onBlur={(e) => e.target.value !== (b.title ?? "") && update(b.id, { title: e.target.value || null })}
                  className="rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
                />
                <input
                  defaultValue={b.subtitle ?? ""}
                  placeholder="Subtitle"
                  onBlur={(e) => e.target.value !== (b.subtitle ?? "") && update(b.id, { subtitle: e.target.value || null })}
                  className="rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
                />
                <input
                  defaultValue={b.button_text ?? ""}
                  placeholder="Button text"
                  onBlur={(e) => e.target.value !== (b.button_text ?? "") && update(b.id, { button_text: e.target.value || null })}
                  className="rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
                />
                <input
                  defaultValue={b.button_link ?? ""}
                  placeholder="Button link (https://…)"
                  onBlur={(e) => e.target.value !== (b.button_link ?? "") && update(b.id, { button_link: e.target.value || null })}
                  className="rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-xs uppercase tracking-widest">
                <input
                  type="checkbox"
                  checked={b.enabled}
                  onChange={(e) => update(b.id, { enabled: e.target.checked })}
                />
                Enabled
              </label>
              <div className="ml-auto flex gap-1">
                <button onClick={() => move(b, -1)} disabled={i === 0} className="rounded-sm border border-border p-1.5 disabled:opacity-30" aria-label="Move up">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => move(b, 1)} disabled={i === banners.length - 1} className="rounded-sm border border-border p-1.5 disabled:opacity-30" aria-label="Move down">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => remove(b)} className="rounded-sm border border-border p-1.5 text-muted-foreground hover:text-destructive" aria-label="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
