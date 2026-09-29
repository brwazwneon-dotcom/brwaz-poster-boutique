import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Search, ImageOff, MoreHorizontal } from "lucide-react";
import {
  listCategoriesAdmin,
  upsertCategory,
  deleteCategory,
  getCategoryImageCountsAdmin,
  type CategoryStats,
} from "@/lib/db-admin.functions";
import { uploadPosterImage } from "@/lib/image-upload.functions";
import { optimizeImage } from "@/lib/image-optimize";
import { fileToDataUrl, type AdminCategory } from "./shared";
import { useConfirm } from "@/components/admin/layout/ConfirmDialogProvider";
import { LoadingRows } from "@/components/admin/layout/LoadingState";
import { CategoryPosterManager } from "@/components/admin/CategoryPosterManager";

const EMPTY_STATS: CategoryStats = {
  total: 0,
  visible: 0,
  hidden: 0,
  trending: 0,
  best_seller: 0,
};

export function CategoriesTab({
  onManageImages,
}: {
  // Set by Dashboard — optional escape hatch from inside the Category
  // Poster Manager below to the full Products tab (bulk edit, Bulk
  // Upload Studio, etc.), pre-filtered to this category's posters.
  onManageImages?: (categoryId: string) => void;
} = {}) {
  const confirm = useConfirm();
  const [categories, setCategories] = useState<AdminCategory[] | null>(null);
  const [editing, setEditing] = useState<Partial<AdminCategory> | null>(null);
  const [uploading, setUploading] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Per-category stats (total/visible/hidden/trending/best_seller), own
  // primary + Additional-Category placements combined — a parent
  // category's displayed stats add in its subcategories' stats too (see
  // treeStats below), since that's how an admin actually thinks of
  // "Football"'s posters. Two aggregated group-by queries total, not one
  // per category — loaded once per tab visit, and again on returning from
  // the Poster Manager (see onBack below) so a Hide/Trending/etc. change
  // made there doesn't leave stale numbers behind.
  const [stats, setStats] = useState<Record<string, CategoryStats>>({});
  // The category (or subcategory) whose Poster Manager view is currently
  // open — null shows the normal Categories list. treeIds is [itself] for
  // a subcategory, or [itself, ...its subcategory ids] for a parent, so
  // the manager's search/filter/grid all cover images placed on the
  // subcategories too, not just the parent's own primary category_id.
  const [posterManagerFor, setPosterManagerFor] = useState<{
    id: string;
    label: string;
    parentLabel?: string;
    treeIds: string[];
    totalCount: number;
  } | null>(null);

  const load = async () => {
    const [cats, s] = await Promise.all([
      listCategoriesAdmin() as Promise<AdminCategory[]>,
      getCategoryImageCountsAdmin() as Promise<Record<string, CategoryStats>>,
    ]);
    setCategories(cats);
    setStats(s);
  };
  useEffect(() => {
    load();
  }, []);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const optimized = await optimizeImage(file, { maxDim: 1600, quality: 0.85 });
      const dataUrl = await fileToDataUrl(optimized);
      const { url } = await uploadPosterImage({ data: { dataUrl, filename: file.name } });
      setEditing((prev) => ({ ...(prev ?? {}), image: url }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!editing?.name) return toast.error("Name is required");
    try {
      await upsertCategory({ data: editing });
      toast.success("Saved");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  // Quick-add: type a name under a main category and press Enter — for
  // fast one-at-a-time entry (e.g. "Messi", "Ronaldo" under Football)
  // without opening the full edit form each time.
  const [newSubName, setNewSubName] = useState<Record<string, string>>({});
  const addSubcategory = async (parentId: string) => {
    const name = (newSubName[parentId] ?? "").trim();
    if (!name) return;
    try {
      await upsertCategory({ data: { name, parent_id: parentId } });
      setNewSubName((prev) => ({ ...prev, [parentId]: "" }));
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const remove = async (id: string) => {
    if (!(await confirm("Delete this category?"))) return;
    await deleteCategory({ data: id });
    load();
  };

  if (categories === null) return <LoadingRows />;

  if (posterManagerFor) {
    return (
      <CategoryPosterManager
        categoryId={posterManagerFor.id}
        label={posterManagerFor.label}
        parentLabel={posterManagerFor.parentLabel}
        treeIds={posterManagerFor.treeIds}
        totalCount={posterManagerFor.totalCount}
        categories={categories}
        // Refresh stats on the way back — a Hide/Trending/Best Seller/
        // category change made inside the Poster Manager shouldn't leave
        // this screen's numbers stale. A plain reload, not a bespoke
        // sync mechanism.
        onBack={() => {
          setPosterManagerFor(null);
          load();
        }}
        onOpenInProducts={onManageImages ? () => onManageImages(posterManagerFor.id) : undefined}
      />
    );
  }

  const q = categorySearch.trim().toLowerCase();
  const mainCategories = categories.filter((c) => !c.parent_id);
  const visibleMains = q
    ? mainCategories.filter((main) => {
        const subs = categories.filter((c) => c.parent_id === main.id);
        return (
          main.name.toLowerCase().includes(q) ||
          main.slug.toLowerCase().includes(q) ||
          subs.some((s) => s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q))
        );
      })
    : mainCategories;

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Categories</h2>
          <p className="text-xs text-muted-foreground">
            Manage your categories, subcategories and poster placement.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={categorySearch}
              onChange={(e) => setCategorySearch(e.target.value)}
              placeholder="Search categories..."
              className="w-48 rounded-sm border border-border bg-background py-1.5 pl-8 pr-3 text-xs outline-none focus:border-primary"
            />
          </div>
          <button
            onClick={() => setEditing({})}
            className="shrink-0 rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            + New Category
          </button>
        </div>
      </div>

      {editing && (
        <div className="mb-6 mt-4 grid gap-4 rounded-sm border border-border bg-card p-4 sm:grid-cols-[140px_1fr]">
          <div>
            {editing.image ? (
              <img
                src={editing.image}
                alt=""
                className="aspect-square w-full rounded-sm object-cover"
              />
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-sm border border-dashed border-border text-xs text-muted-foreground">
                No image
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="mt-2 w-full rounded-sm border border-border px-2 py-1.5 text-xs disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                if (e.target.files?.[0]) handleFile(e.target.files[0]);
                e.target.value = "";
              }}
            />
          </div>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                placeholder="Name (English)"
                value={editing.name ?? ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                placeholder="الاسم بالعربي"
                dir="rtl"
                value={editing.name_ar ?? ""}
                onChange={(e) => setEditing({ ...editing, name_ar: e.target.value })}
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <textarea
              placeholder="Description (optional)"
              value={editing.description ?? ""}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              rows={2}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <div>
              <label className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">
                Parent category (leave empty for a main category)
              </label>
              <select
                value={editing.parent_id ?? ""}
                onChange={(e) => setEditing({ ...editing, parent_id: e.target.value || null })}
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">— None (main category) —</option>
                {categories
                  .filter((c) => !c.parent_id && c.id !== editing.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Subcategories show as filter chips on their parent's category page (e.g. "Messi"
                under "Football") — they don't appear in the header nav or homepage grid.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(editing.hidden)}
                  onChange={(e) => setEditing({ ...editing, hidden: e.target.checked })}
                />
                Hidden
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(editing.featured)}
                  onChange={(e) => setEditing({ ...editing, featured: e.target.checked })}
                />
                Featured
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.show_in_header !== false}
                  onChange={(e) => setEditing({ ...editing, show_in_header: e.target.checked })}
                />
                Show in header nav
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.show_in_collections !== false}
                  onChange={(e) =>
                    setEditing({ ...editing, show_in_collections: e.target.checked })
                  }
                />
                Show in collections grid
              </label>
              <label className="flex items-center gap-2 text-sm">
                Sort order
                <input
                  type="number"
                  value={editing.sort_order ?? 0}
                  onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
                  className="w-20 rounded-sm border border-border bg-background px-2 py-1 text-sm"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <button
                onClick={save}
                className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(null)}
                className="rounded-sm border border-border px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {visibleMains.map((main) => {
          const subs = categories.filter((c) => c.parent_id === main.id);
          const treeIds = [main.id, ...subs.map((s) => s.id)];
          const ownStats = stats[main.id] ?? EMPTY_STATS;
          const treeStats = subs.reduce(
            (acc, s) => sumStats(acc, stats[s.id] ?? EMPTY_STATS),
            ownStats,
          );
          return (
            <div key={main.id} className="rounded-sm border border-border bg-card p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <CategoryThumb image={main.image} />
                  <div>
                    <div className="text-sm font-semibold">{main.name}</div>
                    <div className="text-xs text-muted-foreground">
                      /{main.slug}
                      {main.hidden ? " · hidden" : ""}
                      {subs.length > 0 ? ` · ${subs.length} subcategories` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() =>
                      setPosterManagerFor({
                        id: main.id,
                        label: main.name,
                        treeIds,
                        totalCount: treeStats.total,
                      })
                    }
                    className="rounded-sm bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground"
                  >
                    Manage Posters
                  </button>
                  <button
                    onClick={() => setEditing(main)}
                    className="rounded-sm border border-border px-2.5 py-1.5 text-xs hover:bg-accent"
                  >
                    Edit
                  </button>
                  <MoreMenu onDelete={() => remove(main.id)} />
                </div>
              </div>
              <StatChips stats={treeStats} />

              <div className="ml-4 mt-3 space-y-1.5 border-l border-border pl-4">
                {subs.map((s) => {
                  const subStats = stats[s.id] ?? EMPTY_STATS;
                  return (
                    <div
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border p-2"
                    >
                      <div>
                        <button
                          onClick={() =>
                            setPosterManagerFor({
                              id: s.id,
                              label: s.name,
                              parentLabel: main.name,
                              treeIds: [s.id],
                              totalCount: subStats.total,
                            })
                          }
                          className="text-left text-xs font-medium hover:underline"
                        >
                          {s.name}
                          {s.hidden ? " · hidden" : ""} — {subStats.total} Poster
                          {subStats.total === 1 ? "" : "s"}
                        </button>
                        <StatChips stats={subStats} compact />
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          onClick={() =>
                            setPosterManagerFor({
                              id: s.id,
                              label: s.name,
                              parentLabel: main.name,
                              treeIds: [s.id],
                              totalCount: subStats.total,
                            })
                          }
                          className="rounded-sm border border-border px-2 py-1 text-xs font-medium hover:bg-accent"
                        >
                          Manage Posters
                        </button>
                        <button
                          onClick={() => setEditing(s)}
                          className="rounded-sm border border-border px-2 py-1 text-xs hover:bg-accent"
                        >
                          Edit
                        </button>
                        <MoreMenu onDelete={() => remove(s.id)} />
                      </div>
                    </div>
                  );
                })}
                <div className="flex gap-2 pt-1">
                  <input
                    value={newSubName[main.id] ?? ""}
                    onChange={(e) =>
                      setNewSubName((prev) => ({ ...prev, [main.id]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addSubcategory(main.id);
                    }}
                    placeholder={`+ Add subcategory under ${main.name} (e.g. Messi)`}
                    className="w-full rounded-sm border border-dashed border-border bg-background px-2 py-1.5 text-xs"
                  />
                  <button
                    onClick={() => addSubcategory(main.id)}
                    disabled={!newSubName[main.id]?.trim()}
                    className="shrink-0 rounded-sm border border-border px-3 py-1.5 text-xs disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {visibleMains.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {q ? "No categories match your search." : "No categories yet."}
          </p>
        )}
      </div>
    </div>
  );
}

function sumStats(a: CategoryStats, b: CategoryStats): CategoryStats {
  return {
    total: a.total + b.total,
    visible: a.visible + b.visible,
    hidden: a.hidden + b.hidden,
    trending: a.trending + b.trending,
    best_seller: a.best_seller + b.best_seller,
  };
}

function CategoryThumb({ image }: { image: string | null }) {
  return image ? (
    <img src={image} alt="" className="h-10 w-10 shrink-0 rounded-sm object-cover" />
  ) : (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-dashed border-border">
      <ImageOff className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

// Only shows a badge for a stat that's actually non-zero (besides the
// always-shown total/visible) — keeps a category with no Trending/Best
// Seller/Hidden posters from displaying a row of empty "0" badges.
function StatChips({ stats, compact }: { stats: CategoryStats; compact?: boolean }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 ${
        compact ? "mt-0.5 text-[10px]" : "mt-2 text-[11px]"
      } text-muted-foreground`}
    >
      {!compact && (
        <span className="font-medium text-foreground">
          {stats.total} Poster{stats.total === 1 ? "" : "s"}
        </span>
      )}
      <span className="text-success">✓ {stats.visible} Visible</span>
      {stats.hidden > 0 && <span>○ {stats.hidden} Hidden</span>}
      {stats.trending > 0 && <span className="text-success">🔥 {stats.trending} Trending</span>}
      {stats.best_seller > 0 && (
        <span className="text-warning">★ {stats.best_seller} Best Seller</span>
      )}
    </div>
  );
}

function MoreMenu({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="More"
        className="rounded-sm border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-28 rounded-sm border border-border bg-card p-1 shadow-lg">
          <button
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="w-full rounded-sm px-2 py-1.5 text-left text-xs text-red-500 hover:bg-accent"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
