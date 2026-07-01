import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ensureBrandAdminRole } from "@/lib/admin-auth.functions";
import { useCategories, type Category } from "@/lib/use-categories";
import { POSTER_BADGES } from "@/lib/poster-badges";
import { cn } from "@/lib/utils";
import { Trash2, Upload, LogOut, Pencil, Plus, X, Save, Download, Search, Eye, ArrowUp, ArrowDown, Heart, Star, Sparkles, Loader2 } from "lucide-react";
import { generatePosterMeta } from "@/lib/poster-ai.functions";
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
import { DEFAULT_COLLECTIONS, type CollectionCard } from "@/components/ShopByCollection";
import {
  loadImage,
  normalizeEditSettings,
  renderEditToBlob,
  type EditSettings,
} from "@/lib/poster-edit";
import { MOCKUP_KEYS, type FrameMockup, type FrameMockups } from "@/lib/use-settings";
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
  type HomeSectionKey,
  type BestSellersConfig,
} from "@/lib/homepage-sections";
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
  component: AdminPage,
});

type Tab = "analytics" | "posters" | "ai-upload" | "categories" | "orders" | "custom" | "slider" | "hero-banners" | "highlights" | "best-sellers" | "sections" | "sets" | "collections" | "quickbar" | "footer-menu" | "mockups" | "wishlists" | "reviews" | "before-after" | "marketing" | "announcement" | "size-guide" | "exports" | "settings";

function AdminPage() {
  const navigate = useNavigate();
  const ensureAdmin = useServerFn(ensureBrandAdminRole);
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("analytics");

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
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Dashboard</div>
          <h1 className="text-display text-5xl">Admin</h1>
        </div>
        <button
          onClick={signOut}
          className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>

      <div className="mt-8 flex flex-wrap gap-2 border-b border-border">
        {(["analytics", "posters", "ai-upload", "categories", "orders", "custom", "slider", "hero-banners", "highlights", "best-sellers", "sections", "sets", "collections", "quickbar", "footer-menu", "mockups", "wishlists", "reviews", "before-after", "marketing", "announcement", "size-guide", "exports", "settings"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "border-b-2 px-4 py-3 text-xs font-semibold uppercase tracking-widest transition",
              tab === t
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {tab === "analytics" && <AnalyticsTab onNavigate={setTab} />}
        {tab === "posters" && <PostersTab />}
        {tab === "ai-upload" && <AiPosterUpload />}
        {tab === "categories" && <CategoriesTab />}
        {tab === "orders" && <OrdersTab />}
        {tab === "custom" && <CustomDesignOrdersTab />}
        {tab === "slider" && <SliderTab />}
        {tab === "hero-banners" && <HeroBannersTab />}
        {tab === "highlights" && <HighlightsTab />}
        {tab === "best-sellers" && <BestSellersTab />}
        {tab === "sections" && <HomeSectionsTab />}
        {tab === "sets" && <SetsTab />}
        {tab === "collections" && <CollectionsTab />}
        {tab === "quickbar" && <QuickBarTab />}
        {tab === "footer-menu" && <FooterMenuTab />}
        {tab === "mockups" && <MockupsTab />}
        {tab === "wishlists" && <WishlistsTab />}
        {tab === "reviews" && <ReviewsTab />}
        {tab === "before-after" && <BeforeAfterTab />}
        {tab === "marketing" && <MarketingTab />}
        {tab === "announcement" && <AnnouncementTab />}
        {tab === "size-guide" && <SizeGuideTab />}
        {tab === "exports" && <ExportsTab />}
        {tab === "settings" && <SettingsTab />}
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
      const meta = await generatePosterMeta({
        data: {
          imageUrl: currentImageUrl,
          filename: poster.title,
          categories: categories.map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            parent_id: c.parent_id ?? null,
          })),
        },
      });
      setTitle(meta.title);
      setDescription(meta.description);
      setSeoTitle(meta.seo_title);
      setSeoDescription(meta.seo_description);
      if (meta.tags.length) {
        const existing = tags.split(",").map((t) => t.trim()).filter(Boolean);
        setTags(Array.from(new Set([...existing, ...meta.tags])).join(", "));
      }
      if (meta.subcategory_id) setCategoryId(meta.subcategory_id);
      else if (meta.category_id && !categoryId) setCategoryId(meta.category_id);
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
  const [editing, setEditing] = useState<Category | "new" | null>(null);

  const remove = async (c: Category) => {
    if (!confirm(`Delete category "${c.name}"? Posters in it will become unassigned.`)) return;
    const { error } = await supabase.from("categories").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["categories"] });
  };

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> New category
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => (
          <div key={c.id} className="overflow-hidden rounded-sm border border-border bg-card">
            <div className="aspect-[16/9] overflow-hidden bg-muted">
              {c.image ? (
                <SafeImage src={c.image} alt={c.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-xs uppercase tracking-widest text-muted-foreground">
                  No cover
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 p-4">
              <div>
                <div className="font-semibold">{indentCat(c, categories)}</div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  /{c.slug}
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setEditing(c)}
                  className="rounded-sm p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => remove(c)}
                  className="rounded-sm p-2 text-muted-foreground hover:bg-accent hover:text-destructive"
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <EditCategoryModal
          category={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["categories"] });
          }}
        />
      )}
    </div>
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
  category, onClose, onSaved,
}: { category: Category | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !category;
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [imageUrl, setImageUrl] = useState(category?.image ?? "");
  const [sortOrder, setSortOrder] = useState<number>(category?.sort_order ?? 0);
  const [parentId, setParentId] = useState<string>(category?.parent_id ?? "");
  const [file, setFile] = useState<File | null>(null);
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
      const payload = {
        name: name.trim(),
        slug: (slug || slugify(name)).trim(),
        image: finalImage || null,
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
};

const STATUSES = ["new", "processing", "printed", "shipped", "delivered", "cancelled"];

function OrdersTab() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [govFilter, setGovFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<Order | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["admin-orders", statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select("id,order_number,customer_name,phone,governorate,address,frame_type,frame_color,size,quantity,poster_title,poster_image,total_price,shipping_cost,packaging_fee,status,created_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Order[];
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
    processing: orders.filter((o) => o.status === "processing").length,
    delivered: orders.filter((o) => o.status === "delivered").length,
  };

  const setStatus = async (o: Order, status: string) => {
    const { error } = await supabase.from("orders").update({ status }).eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    qc.invalidateQueries({ queryKey: ["admin-orders"] });
  };

  const remove = async (o: Order) => {
    if (!confirm("Delete this order?")) return;
    const { error } = await supabase.from("orders").delete().eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["admin-orders"] });
  };

  const exportExcel = () => {
    const rows = filtered.map((o) => ({
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
      "Status": o.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Orders");
    XLSX.writeFile(wb, `brwazwneon-orders-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total orders" value={stats.total} />
        <StatCard label="Revenue" value={`${Math.round(stats.revenue)} EGP`} />
        <StatCard label="New" value={stats.newCount} />
        <StatCard label="Processing" value={stats.processing} />
        <StatCard label="Delivered" value={stats.delivered} />
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
        <FilterPill active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
          All
        </FilterPill>
        {STATUSES.map((s) => (
          <FilterPill key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
            {s}
          </FilterPill>
        ))}
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-sm border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          No orders match.
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
                  <th className="px-3 py-3 text-left">Poster</th>
                  <th className="px-3 py-3 text-left">Spec</th>
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
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        {o.poster_image && (
                          <SafeImage src={o.poster_image} alt="" className="h-12 w-9 rounded-sm object-cover" />
                        )}
                        <span className="text-xs">{o.poster_title ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <div>{o.frame_type}</div>
                      <div className="text-muted-foreground">{o.size} · {o.frame_color} · ×{o.quantity}</div>
                    </td>
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
        <Modal title={`Order ${viewing.order_number ?? viewing.id.slice(0, 8)}`} onClose={() => setViewing(null)}>
          <div className="space-y-2 text-sm">
            <Row k="Date" v={new Date(viewing.created_at).toLocaleString()} />
            <Row k="Customer" v={viewing.customer_name} />
            <Row k="Phone" v={viewing.phone} />
            <Row k="Governorate" v={viewing.governorate} />
            <Row k="Address" v={viewing.address} />
            <Row k="Poster" v={viewing.poster_title ?? "—"} />
            <Row k="Frame" v={`${viewing.frame_type} · ${viewing.size} · ${viewing.frame_color}`} />
            <Row k="Quantity" v={String(viewing.quantity)} />
            <Row k="Shipping" v={`${viewing.shipping_cost ?? 0} EGP`} />
            <Row k="Packaging Fee" v={`${viewing.packaging_fee ?? 0} EGP`} />
            <Row k="Total" v={`${viewing.total_price} EGP`} />
            <Row k="Status" v={viewing.status} />
          </div>
        </Modal>
      )}
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
        return {
          image: typeof v.image === "string" ? v.image : fb.image,
          top: Number(v.top ?? fb.top),
          left: Number(v.left ?? fb.left),
          width: Number(v.width ?? fb.width),
          height: Number(v.height ?? fb.height),
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

  const set = (k: keyof FrameMockup, v: string) => {
    if (k === "image") return setM({ ...m, image: v });
    const n = Number(v);
    setM({ ...m, [k]: Number.isFinite(n) ? n : 0 });
  };

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

  return (
    <div className="rounded-sm border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h4 className="text-display text-xl">{label}</h4>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{variant}</span>
      </div>

      <div className="mt-4 mx-auto w-full max-w-[220px]">
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

      <div className="mt-4 grid grid-cols-2 gap-3">
        <NumField label="Top %"    value={m.top}    onChange={(v) => set("top", v)} />
        <NumField label="Left %"   value={m.left}   onChange={(v) => set("left", v)} />
        <NumField label="Width %"  value={m.width}  onChange={(v) => set("width", v)} />
        <NumField label="Height %" value={m.height} onChange={(v) => set("height", v)} />
        <NumField label="Rotate °" value={m.rotate ?? 0} onChange={(v) => set("rotate", v)} />
        <NumField label="Skew X °" value={m.skewX ?? 0}  onChange={(v) => set("skewX", v)} />
        <NumField label="Skew Y °" value={m.skewY ?? 0}  onChange={(v) => set("skewY", v)} />
        <NumField label="Radius %" value={m.borderRadius ?? 0} onChange={(v) => set("borderRadius", v)} />
        <NumField label="Scale"    value={m.scale ?? 1}  onChange={(v) => set("scale", v)} />
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
      >
        <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        value={String(value)}
        inputMode="decimal"
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-sm border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
      />
    </label>
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
        }}
      >
        <img
          src={SAMPLE_POSTER}
          alt=""
          className="h-full w-full object-cover select-none"
          draggable={false}
          style={{
            transform: `rotate(${mockup.rotate ?? 0}deg) skew(${mockup.skewX ?? 0}deg, ${mockup.skewY ?? 0}deg) scale(${mockup.scale ?? 1})`,
            transformOrigin: "center center",
            willChange: "transform",
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
      return { max, autoplay: v.autoplay === true, loop: v.loop !== false };
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

  return (
    <div>
      {/* Display settings */}
      <div className="rounded-sm border border-border bg-card p-4">
        <p className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
          Display settings
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs uppercase tracking-widest">
            Max products
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
        </div>
      </div>

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
        const key = (item as { key?: string }).key as HomeSectionKey | undefined;
        if (!key || !(key in HOME_SECTION_LABELS)) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        const def = DEFAULT_HOME_SECTIONS.find((d) => d.key === key);
        out.push({
          key,
          enabled: (item as { enabled?: unknown }).enabled !== false,
          title: (item as { title?: string }).title ?? def?.title,
          subtitle: (item as { subtitle?: string }).subtitle ?? def?.subtitle,
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

  const resetDefaults = () => {
    if (!confirm("Reset section order to defaults?")) return;
    save(DEFAULT_HOME_SECTIONS);
  };

  return (
    <div>
      <div className="flex items-center justify-between rounded-sm border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">
          Reorder, show/hide, and rename homepage sections. Changes apply instantly.
        </p>
        <button
          onClick={resetDefaults}
          className="rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
        >
          Reset defaults
        </button>
      </div>

      <div className="mt-6 space-y-3">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          sections.map((s, i) => (
            <div
              key={s.key}
              className="flex flex-wrap items-center gap-3 rounded-sm border border-border bg-card p-3"
            >
              <div className="min-w-[140px]">
                <div className="text-sm font-semibold">{HOME_SECTION_LABELS[s.key]}</div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {s.key}
                </div>
              </div>
              <input
                defaultValue={s.title ?? ""}
                placeholder="Custom title (optional)"
                onBlur={(e) => e.target.value !== (s.title ?? "") && updateAt(i, { title: e.target.value || undefined })}
                className="w-56 rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
              />
              <input
                defaultValue={s.subtitle ?? ""}
                placeholder="Subtitle (optional)"
                onBlur={(e) => e.target.value !== (s.subtitle ?? "") && updateAt(i, { subtitle: e.target.value || undefined })}
                className="flex-1 min-w-[200px] rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
              />
              <label className="inline-flex items-center gap-2 text-xs uppercase tracking-widest">
                <input
                  type="checkbox"
                  checked={s.enabled}
                  onChange={(e) => updateAt(i, { enabled: e.target.checked })}
                />
                Show
              </label>
              <div className="ml-auto flex gap-1">
                <button
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="rounded-sm border border-border p-1.5 disabled:opacity-30"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === sections.length - 1}
                  className="rounded-sm border border-border p-1.5 disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
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
