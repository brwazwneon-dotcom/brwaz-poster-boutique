import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/use-categories";
import { useCategories } from "@/lib/use-categories";
import { SafeImage } from "@/components/SafeImage";
import { FramePreview } from "@/components/FramePreview";
import type { FrameColorId, FrameTypeId } from "@/lib/poster-options";
import { uploadAndSign } from "@/lib/storage-url";
import { loadImage, renderEditToBlob } from "@/lib/poster-edit";
import { BulkSeoRunner } from "@/components/admin/BulkSeoRunner";
import { toggleTrending } from "@/components/admin/TrendingNowManager";
import { PosterImageEditor } from "@/components/admin/PosterImageEditor";
import type { EditSettings } from "@/lib/poster-edit";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Eye, EyeOff, Trash2, Sparkles, X, Loader2, Search, Download,
  CheckCircle2, AlertTriangle, ImageOff, Upload, RefreshCw, Filter, Flame, Crop,
  FolderInput, Save,
} from "lucide-react";

type Poster = {
  id: string;
  title: string | null;
  image_url: string;
  original_url: string | null;
  category_id: string | null;
  price: number | null;
  hidden: boolean;
  featured: boolean;
  seo_title: string | null;
  seo_description: string | null;
  alt_text: string | null;
  tags: string[] | null;
  slug: string | null;
  review_status: string;
  created_at: string;
  sales_count: number;
  views_count: number;
  trending?: boolean | null;
  edit_settings?: unknown;
};

type ReviewStatus =
  | "ready"
  | "needs_edit"
  | "needs_replace"
  | "needs_seo"
  | "low_quality"
  | "draft";

const REVIEW_LABELS: Record<ReviewStatus, string> = {
  ready: "Ready",
  needs_edit: "Needs Edit",
  needs_replace: "Needs Replace",
  needs_seo: "Needs SEO",
  low_quality: "Low Quality",
  draft: "Draft",
};

const REVIEW_COLORS: Record<ReviewStatus, string> = {
  ready: "bg-emerald-500/15 text-emerald-600 border-emerald-500/40 dark:text-emerald-400",
  needs_edit: "bg-amber-500/15 text-amber-700 border-amber-500/40 dark:text-amber-400",
  needs_replace: "bg-orange-500/15 text-orange-700 border-orange-500/40 dark:text-orange-400",
  needs_seo: "bg-blue-500/15 text-blue-700 border-blue-500/40 dark:text-blue-400",
  low_quality: "bg-red-500/15 text-red-700 border-red-500/40 dark:text-red-400",
  draft: "bg-muted text-muted-foreground border-border",
};

const PAGE_SIZE = 24;

type Filters = {
  q: string;
  visibility: "all" | "visible" | "hidden";
  review: "all" | ReviewStatus;
  seo: "all" | "with_seo" | "missing_seo";
  sort: "newest" | "oldest" | "most_viewed" | "best_selling" | "needs_edit";
};

const DEFAULT_FILTERS: Filters = {
  q: "",
  visibility: "all",
  review: "all",
  seo: "all",
  sort: "newest",
};

function seoMissing(p: Poster) {
  return !p.seo_title?.trim() || !p.seo_description?.trim() || !p.alt_text?.trim();
}

export function SubCategoryReviewManager({
  subCategory,
  parent,
  onClose,
}: {
  subCategory: Category;
  parent: Category | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Poster | null>(null);
  const [bulkSeoOpen, setBulkSeoOpen] = useState(false);
  const [artEditing, setArtEditing] = useState<Poster | null>(null);
  const [artSaving, setArtSaving] = useState(false);
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const { data: allCategories = [] } = useCategories();

  const { data: posters = [], isLoading, refetch } = useQuery({
    queryKey: ["subcat-review-posters", subCategory.id],
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posters")
        .select("id,title,image_url,original_url,category_id,price,hidden,featured,seo_title,seo_description,alt_text,tags,slug,review_status,created_at,sales_count,views_count,trending,edit_settings")
        .eq("category_id", subCategory.id)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Poster[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["subcat-review-posters", subCategory.id] });
    qc.invalidateQueries({ queryKey: ["subcat-poster-counts"] });
  };

  const counts = useMemo(() => {
    const c = {
      total: posters.length,
      visible: 0,
      hidden: 0,
      needsEdit: 0,
      lowQuality: 0,
      missingSeo: 0,
    };
    for (const p of posters) {
      if (p.hidden) c.hidden++; else c.visible++;
      if (p.review_status === "needs_edit" || p.review_status === "needs_replace") c.needsEdit++;
      if (p.review_status === "low_quality") c.lowQuality++;
      if (seoMissing(p)) c.missingSeo++;
    }
    return c;
  }, [posters]);

  const filtered = useMemo(() => {
    let list = posters.slice();
    const term = filters.q.trim().toLowerCase();
    if (term) list = list.filter((p) => (p.title ?? "").toLowerCase().includes(term));
    if (filters.visibility === "visible") list = list.filter((p) => !p.hidden);
    else if (filters.visibility === "hidden") list = list.filter((p) => p.hidden);
    if (filters.review !== "all") list = list.filter((p) => p.review_status === filters.review);
    if (filters.seo === "with_seo") list = list.filter((p) => !seoMissing(p));
    else if (filters.seo === "missing_seo") list = list.filter((p) => seoMissing(p));

    if (filters.sort === "newest") list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    else if (filters.sort === "oldest") list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    else if (filters.sort === "most_viewed") list.sort((a, b) => (b.views_count ?? 0) - (a.views_count ?? 0));
    else if (filters.sort === "best_selling") list.sort((a, b) => (b.sales_count ?? 0) - (a.sales_count ?? 0));
    else if (filters.sort === "needs_edit") {
      const priority = (s: string) => (s === "needs_edit" || s === "needs_replace" ? 0 : s === "low_quality" ? 1 : s === "needs_seo" ? 2 : 3);
      list.sort((a, b) => priority(a.review_status) - priority(b.review_status));
    }
    return list;
  }, [posters, filters]);

  const visible = filtered.slice(0, page * PAGE_SIZE);
  const canLoadMore = visible.length < filtered.length;

  const toggleSel = (id: string) => setSelected((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const clearSel = () => setSelected(new Set());
  const selectAllVisible = () => setSelected(new Set(visible.map((p) => p.id)));

  const patchPoster = async (ids: string[], patch: Partial<Poster>) => {
    if (!ids.length) return;
    const { error } = await supabase.from("posters").update(patch as never).in("id", ids);
    if (error) return toast.error(error.message);
    invalidate();
  };

  const setHidden = (ids: string[], hidden: boolean) => {
    patchPoster(ids, { hidden }).then(() => toast.success(hidden ? `Hidden ${ids.length}` : `Shown ${ids.length}`));
  };
  const moveToCategory = async (ids: string[], newCategoryId: string | null) => {
    if (!ids.length) return;
    const { error } = await supabase
      .from("posters")
      .update({ category_id: newCategoryId } as never)
      .in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`Moved ${ids.length} poster${ids.length === 1 ? "" : "s"}`);
    setMoveIds(null);
    clearSel();
    invalidate();
    qc.invalidateQueries({ queryKey: ["admin-posters"] });
    qc.invalidateQueries({ queryKey: ["posters"] });
    qc.invalidateQueries({ queryKey: ["subcat-poster-counts"] });
  };
  const savePosterFields = async (id: string, patch: Partial<Poster>) => {
    await patchPoster([id], patch);
    toast.success("Saved");
  };
  const setReview = (ids: string[], review_status: ReviewStatus) => {
    patchPoster(ids, { review_status }).then(() => toast.success(`Marked ${ids.length} as ${REVIEW_LABELS[review_status]}`));
  };
  const softDelete = (ids: string[]) => {
    if (!confirm(`Move ${ids.length} poster${ids.length === 1 ? "" : "s"} to hidden? They stay in the database and won't be shown on the storefront. Old orders keep working.`)) return;
    patchPoster(ids, { hidden: true, review_status: "draft" }).then(() => {
      toast.success(`Moved ${ids.length} to hidden`);
      clearSel();
    });
  };

  const runAiSeoSingle = async (p: Poster) => {
    toast.info("Generating SEO…");
    try {
      const { data, error } = await supabase.functions.invoke("seo-generator", {
        body: { title: p.title || undefined, subject: p.title || undefined, tags: p.tags || [], include_hashtags: true, include_alt_text: true },
      });
      if (error) throw error;
      const gen = (data ?? {}) as Partial<Poster>;
      const patch: Partial<Poster> = {};
      if (gen.seo_title && !p.seo_title) patch.seo_title = gen.seo_title;
      if (gen.seo_description && !p.seo_description) patch.seo_description = gen.seo_description;
      if (gen.alt_text && !p.alt_text) patch.alt_text = gen.alt_text;
      if (gen.tags && (!p.tags || p.tags.length === 0)) patch.tags = gen.tags;
      if (Object.keys(patch).length === 0) return toast.info("Nothing to update — fields already filled");
      await patchPoster([p.id], patch);
      toast.success("SEO updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "SEO failed");
    }
  };

  const replaceImage = async (p: Poster, file: File) => {
    try {
      toast.info("Uploading replacement…");
      const path = `posters/${p.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
      const url = await uploadAndSign("posters", path, file);
      await patchPoster([p.id], { image_url: url, original_url: url });
      toast.success("Image replaced — original preserved as version");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Replace failed");
    }
  };

  const saveArtEdit = async (target: Poster, s: EditSettings) => {
    setArtSaving(true);
    try {
      const img = await loadImage(target.original_url || target.image_url);
      const outH = 2400;
      const outW = Math.round(outH * s.ratio);
      const blob = await renderEditToBlob(img, s, outW, outH, 0.92);
      const file = new File([blob], `${target.id}-edited.jpg`, { type: "image/jpeg" });
      const path = `edits/${target.id}/${Date.now()}.jpg`;
      const newUrl = await uploadAndSign("posters", path, file);
      const { error } = await supabase
        .from("posters")
        .update({ image_url: newUrl, edit_settings: s as never })
        .eq("id", target.id);
      if (error) throw error;
      toast.success("Artwork updated");
      setArtEditing(null);
      invalidate();
      qc.invalidateQueries({ queryKey: ["admin-posters"] });
      qc.invalidateQueries({ queryKey: ["posters"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save artwork");
    } finally {
      setArtSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[95vh] max-w-[95vw] overflow-hidden p-0 flex flex-col">
        <DialogHeader className="border-b border-border p-4">
          <DialogTitle className="text-xl">
            {subCategory.name}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {parent ? `· ${parent.name}` : ""}
            </span>
          </DialogTitle>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <StatChip label="Total" value={counts.total} />
            <StatChip label="Visible" value={counts.visible} tone="emerald" />
            <StatChip label="Hidden" value={counts.hidden} tone="muted" />
            <StatChip label="Needs Edit" value={counts.needsEdit} tone="amber" />
            <StatChip label="Low Quality" value={counts.lowQuality} tone="red" />
            <StatChip label="Missing SEO" value={counts.missingSeo} tone="blue" />
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                onClick={() => refetch()}
                className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-1.5 text-[10px] uppercase tracking-widest hover:bg-accent"
              >
                <RefreshCw className="h-3 w-3" /> Refresh
              </button>
              <button
                onClick={() => setBulkSeoOpen(true)}
                className="inline-flex items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-3 py-1.5 text-[10px] uppercase tracking-widest text-primary hover:bg-primary/20"
              >
                <Sparkles className="h-3 w-3" /> AI SEO for all
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="border-b border-border bg-muted/20 p-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={filters.q}
              onChange={(e) => { setFilters((f) => ({ ...f, q: e.target.value })); setPage(1); }}
              placeholder="Search by name…"
              className="w-56 rounded-sm border border-border bg-background pl-8 pr-3 py-2 text-sm"
            />
          </div>
          <Filter className="h-4 w-4 text-muted-foreground" />
          <SelectFilter
            value={filters.visibility}
            onChange={(v) => { setFilters((f) => ({ ...f, visibility: v as Filters["visibility"] })); setPage(1); }}
            options={[["all", "All visibility"], ["visible", "Visible"], ["hidden", "Hidden"]]}
          />
          <SelectFilter
            value={filters.review}
            onChange={(v) => { setFilters((f) => ({ ...f, review: v as Filters["review"] })); setPage(1); }}
            options={[
              ["all", "All statuses"],
              ...Object.entries(REVIEW_LABELS) as [string, string][],
            ]}
          />
          <SelectFilter
            value={filters.seo}
            onChange={(v) => { setFilters((f) => ({ ...f, seo: v as Filters["seo"] })); setPage(1); }}
            options={[["all", "All SEO"], ["with_seo", "SEO complete"], ["missing_seo", "Missing SEO"]]}
          />
          <SelectFilter
            value={filters.sort}
            onChange={(v) => { setFilters((f) => ({ ...f, sort: v as Filters["sort"] })); setPage(1); }}
            options={[
              ["newest", "Newest first"],
              ["oldest", "Oldest first"],
              ["most_viewed", "Most viewed"],
              ["best_selling", "Best selling"],
              ["needs_edit", "Needs edit first"],
            ]}
          />
          <div className="ml-auto text-xs text-muted-foreground">
            {visible.length} of {filtered.length}
          </div>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-primary/5 p-3 text-sm">
            <span className="text-muted-foreground">{selected.size} selected</span>
            <button onClick={() => setHidden([...selected], true)} className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-accent"><EyeOff className="h-3 w-3" /> Hide</button>
            <button onClick={() => setHidden([...selected], false)} className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-accent"><Eye className="h-3 w-3" /> Show</button>
            <button onClick={() => setReview([...selected], "ready")} className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-accent"><CheckCircle2 className="h-3 w-3" /> Mark Ready</button>
            <button onClick={() => setReview([...selected], "needs_edit")} className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-accent"><AlertTriangle className="h-3 w-3" /> Needs Edit</button>
            <button onClick={() => softDelete([...selected])} className="inline-flex items-center gap-1 rounded-sm border border-destructive px-2 py-1 text-[10px] uppercase tracking-widest text-destructive hover:bg-destructive/10"><Trash2 className="h-3 w-3" /> Delete</button>
            <button onClick={clearSel} className="ml-auto text-xs text-muted-foreground hover:text-foreground">Clear</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading posters…
            </div>
          ) : visible.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center text-muted-foreground">
              <ImageOff className="mb-2 h-8 w-8" />
              No posters match your filters.
            </div>
          ) : (
            <>
              <div className="mb-3 flex justify-end">
                <button onClick={selectAllVisible} className="text-xs text-muted-foreground hover:text-foreground">
                  Select all visible
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {visible.map((p) => (
                  <PosterCard
                    key={p.id}
                    poster={p}
                    selected={selected.has(p.id)}
                    onToggle={() => toggleSel(p.id)}
                    onOpen={() => setDetail(p)}
                    onHide={() => setHidden([p.id], !p.hidden)}
                    onDelete={() => softDelete([p.id])}
                    onAiSeo={() => runAiSeoSingle(p)}
                    onReview={(s) => setReview([p.id], s)}
                    onReplace={(f) => replaceImage(p, f)}
                    onEditArt={() => setArtEditing(p)}
                    onToggleTrending={async () => {
                      await toggleTrending(p.id, p.trending === true);
                      invalidate();
                    }}
                  />
                ))}
              </div>
              {canLoadMore && (
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-sm border border-border px-6 py-2 text-xs uppercase tracking-widest hover:bg-accent"
                  >
                    Load more ({filtered.length - visible.length} left)
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {detail && (
          <PosterDetailModal
            poster={detail}
            onClose={() => setDetail(null)}
            onReview={(s) => { setReview([detail.id], s); setDetail({ ...detail, review_status: s }); }}
            onHide={() => { setHidden([detail.id], !detail.hidden); setDetail({ ...detail, hidden: !detail.hidden }); }}
            onDelete={() => { softDelete([detail.id]); setDetail(null); }}
            onAiSeo={() => runAiSeoSingle(detail)}
            onReplace={(f) => replaceImage(detail, f)}
          />
        )}

        {bulkSeoOpen && (
          <BulkSeoRunner
            open
            subcategoryId={subCategory.id}
            subcategoryName={subCategory.name}
            onClose={() => { setBulkSeoOpen(false); invalidate(); }}
          />
        )}

        {artEditing && (
          <PosterImageEditor
            source={artEditing.original_url || artEditing.image_url}
            initial={artEditing.edit_settings}
            saving={artSaving}
            onCancel={() => setArtEditing(null)}
            onSave={(s) => saveArtEdit(artEditing, s)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatChip({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "emerald" | "muted" | "amber" | "red" | "blue" }) {
  const toneClass = {
    default: "bg-card border-border",
    emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
    muted: "bg-muted border-border text-muted-foreground",
    amber: "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400",
    red: "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400",
    blue: "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400",
  }[tone];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[10px] uppercase tracking-widest", toneClass)}>
      {label}: <b className="tabular-nums">{value}</b>
    </span>
  );
}

function SelectFilter({
  value, onChange, options,
}: { value: string; onChange: (v: string) => void; options: Array<[string, string]> }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-sm border border-border bg-background px-2 py-1.5 text-xs"
    >
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

function PosterCard({
  poster: p, selected, onToggle, onOpen, onHide, onDelete, onAiSeo, onReview, onReplace, onEditArt, onToggleTrending,
}: {
  poster: Poster;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onHide: () => void;
  onDelete: () => void;
  onAiSeo: () => void;
  onReview: (s: ReviewStatus) => void;
  onReplace: (file: File) => void;
  onEditArt: () => void;
  onToggleTrending: () => void;
}) {
  const status = (p.review_status as ReviewStatus) ?? "ready";
  const missingSeo = seoMissing(p);
  const isTrending = p.trending === true;
  return (
    <div className={cn(
      "group rounded-sm border bg-card p-2 transition",
      selected ? "border-primary ring-1 ring-primary" : "border-border",
      p.hidden && "opacity-60",
    )}>
      <div className="relative aspect-[2/3] overflow-hidden rounded-sm bg-muted">
        <label className="absolute left-1.5 top-1.5 z-10 rounded-sm bg-background/80 p-1 backdrop-blur">
          <input type="checkbox" checked={selected} onChange={onToggle} className="block" />
        </label>
        {isTrending && (
          <span className="absolute right-1.5 top-1.5 z-10 inline-flex items-center gap-1 rounded-sm bg-primary/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-primary-foreground">
            <Flame className="h-2.5 w-2.5" /> Trending
          </span>
        )}
        {p.hidden && !isTrending && (
          <span className="absolute right-1.5 top-1.5 z-10 rounded-sm bg-black/70 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-white">
            Hidden
          </span>
        )}
        <button onClick={onOpen} className="block h-full w-full">
          <FramePreview
            posterUrl={p.image_url}
            title={p.title ?? ""}
            frameType="pvc"
            color="black"
            aspectClassName="aspect-[2/3]"
            bare
          />
        </button>
      </div>
      <div className="mt-2 space-y-1.5">
        <div className="truncate text-xs font-medium" title={p.title ?? ""}>{p.title || "Untitled"}</div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{p.price != null ? `${p.price} EGP` : "—"}</span>
          <span>{new Date(p.created_at).toLocaleDateString()}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          <span className={cn("rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-widest", REVIEW_COLORS[status])}>
            {REVIEW_LABELS[status]}
          </span>
          {missingSeo && (
            <span className="rounded border border-blue-500/40 bg-blue-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-blue-700 dark:text-blue-400">
              No SEO
            </span>
          )}
        </div>
        <select
          value={status}
          onChange={(e) => onReview(e.target.value as ReviewStatus)}
          className="w-full rounded-sm border border-border bg-background px-1 py-1 text-[10px]"
        >
          {Object.entries(REVIEW_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="flex flex-wrap gap-1">
          <button onClick={onOpen} title="View" className="rounded-sm border border-border p-1 hover:bg-accent"><Eye className="h-3 w-3" /></button>
          <button onClick={onEditArt} title="Edit artwork inside frame" className="rounded-sm border border-primary/40 bg-primary/5 p-1 text-primary hover:bg-primary/10"><Crop className="h-3 w-3" /></button>
          <label title="Replace image" className="cursor-pointer rounded-sm border border-border p-1 hover:bg-accent">
            <Upload className="h-3 w-3" />
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onReplace(f); e.currentTarget.value = ""; }} />
          </label>
          <button onClick={onHide} title={p.hidden ? "Show" : "Hide"} className="rounded-sm border border-border p-1 hover:bg-accent">
            {p.hidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </button>
          <button onClick={onAiSeo} title="AI SEO" className="rounded-sm border border-primary/40 bg-primary/5 p-1 text-primary hover:bg-primary/10"><Sparkles className="h-3 w-3" /></button>
          <button
            onClick={onToggleTrending}
            title={isTrending ? "Remove from Trending" : "Add to Trending"}
            className={cn(
              "rounded-sm border p-1",
              isTrending ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent",
            )}
          >
            <Flame className="h-3 w-3" />
          </button>
          <button onClick={onDelete} title="Delete" className="ml-auto rounded-sm border border-border p-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>
    </div>
  );
}

function PosterDetailModal({
  poster: p, onClose, onReview, onHide, onDelete, onAiSeo, onReplace,
}: {
  poster: Poster;
  onClose: () => void;
  onReview: (s: ReviewStatus) => void;
  onHide: () => void;
  onDelete: () => void;
  onAiSeo: () => void;
  onReplace: (f: File) => void;
}) {
  const status = (p.review_status as ReviewStatus) ?? "ready";
  const originalUrl = p.original_url ?? p.image_url;
  const [previewMode, setPreviewMode] = useState<"mockup" | "raw">("mockup");
  const [frameType, setFrameType] = useState<FrameTypeId>("pvc");
  const [frameColor, setFrameColor] = useState<FrameColorId>("black");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[95vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {p.title || "Untitled"}
            <span className={cn("rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-widest", REVIEW_COLORS[status])}>
              {REVIEW_LABELS[status]}
            </span>
            {p.hidden && <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-white">Hidden</span>}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1 text-[10px] uppercase tracking-widest">
              <button
                onClick={() => setPreviewMode("mockup")}
                className={cn("rounded-sm border px-2 py-1", previewMode === "mockup" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent")}
              >Mockup</button>
              <button
                onClick={() => setPreviewMode("raw")}
                className={cn("rounded-sm border px-2 py-1", previewMode === "raw" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent")}
              >Raw image</button>
              {previewMode === "mockup" && (
                <div className="ml-auto flex items-center gap-1">
                  <select
                    value={frameType}
                    onChange={(e) => setFrameType(e.target.value as FrameTypeId)}
                    className="rounded-sm border border-border bg-background px-1.5 py-1 text-[10px] uppercase tracking-widest"
                  >
                    <option value="pvc">PVC</option>
                    <option value="wood">Wood</option>
                  </select>
                  <select
                    value={frameColor}
                    onChange={(e) => setFrameColor(e.target.value as FrameColorId)}
                    className="rounded-sm border border-border bg-background px-1.5 py-1 text-[10px] uppercase tracking-widest"
                  >
                    <option value="black">Black</option>
                    <option value="white">White</option>
                    <option value="wood">Wood</option>
                  </select>
                </div>
              )}
            </div>
            <div className="rounded-sm border border-border bg-black/5 p-2 dark:bg-white/5">
              {previewMode === "mockup" ? (
                <FramePreview
                  posterUrl={p.image_url}
                  title={p.title ?? ""}
                  frameType={frameType}
                  color={frameColor}
                  loading="eager"
                />
              ) : (
                <SafeImage src={p.image_url} alt={p.alt_text ?? p.title ?? ""} className="h-auto w-full object-contain" />
              )}
            </div>
          </div>
          <div className="space-y-3 text-sm">
            <FieldRow label="Price">{p.price != null ? `${p.price} EGP` : "—"}</FieldRow>
            <FieldRow label="Slug">{p.slug || "—"}</FieldRow>
            <FieldRow label="Views">{p.views_count}</FieldRow>
            <FieldRow label="Sales">{p.sales_count}</FieldRow>
            <FieldRow label="Created">{new Date(p.created_at).toLocaleString()}</FieldRow>
            <FieldRow label="SEO title">{p.seo_title || <em className="text-muted-foreground">missing</em>}</FieldRow>
            <FieldRow label="SEO description">{p.seo_description || <em className="text-muted-foreground">missing</em>}</FieldRow>
            <FieldRow label="Alt text">{p.alt_text || <em className="text-muted-foreground">missing</em>}</FieldRow>
            <FieldRow label="Tags">
              {p.tags && p.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1">{p.tags.map((t) => <span key={t} className="rounded-sm border border-border px-1.5 py-0.5 text-[10px]">{t}</span>)}</div>
              ) : "—"}
            </FieldRow>

            <div className="pt-2">
              <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">Review status</div>
              <select
                value={status}
                onChange={(e) => onReview(e.target.value as ReviewStatus)}
                className="w-full rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
              >
                {Object.entries(REVIEW_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <a href={originalUrl} target="_blank" rel="noopener" download className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-accent">
                <Download className="h-3.5 w-3.5" /> Download original
              </a>
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-accent">
                <Upload className="h-3.5 w-3.5" /> Replace image
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onReplace(f); e.currentTarget.value = ""; }} />
              </label>
              <button onClick={onAiSeo} className="inline-flex items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs uppercase tracking-widest text-primary hover:bg-primary/20">
                <Sparkles className="h-3.5 w-3.5" /> AI SEO
              </button>
              <button onClick={onHide} className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-accent">
                {p.hidden ? <><Eye className="h-3.5 w-3.5" /> Show</> : <><EyeOff className="h-3.5 w-3.5" /> Hide</>}
              </button>
              <button onClick={onDelete} className="inline-flex items-center gap-1 rounded-sm border border-destructive px-3 py-1.5 text-xs uppercase tracking-widest text-destructive hover:bg-destructive/10">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
              <button onClick={onClose} className="ml-auto inline-flex items-center gap-1 rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-accent">
                <X className="h-3.5 w-3.5" /> Close
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
