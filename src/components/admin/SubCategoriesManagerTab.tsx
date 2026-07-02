import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCategories, type Category } from "@/lib/use-categories";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Eye, EyeOff, Pencil, Trash2, Star, Search, GripVertical,
  Merge, ArrowUp, ArrowDown, Check, X, CheckCircle2, Loader2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

type Filter = "all" | "visible" | "hidden" | "draft" | "empty" | "most";

export function SubCategoriesManagerTab() {
  const qc = useQueryClient();
  const { data: categories = [] } = useCategories();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [merging, setMerging] = useState<Category | null>(null);
  const [bulkMerge, setBulkMerge] = useState(false);

  const roots = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);
  const subs = useMemo(() => categories.filter((c) => !!c.parent_id), [categories]);

  const { data: counts = {} } = useQuery({
    queryKey: ["subcat-poster-counts"],
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

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["categories"] });
    qc.invalidateQueries({ queryKey: ["subcat-poster-counts"] });
    qc.invalidateQueries({ queryKey: ["category-poster-counts"] });
  };

  const parentName = (id: string | null | undefined) =>
    id ? categories.find((c) => c.id === id)?.name ?? "—" : "—";

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = subs.slice();
    if (term) list = list.filter((c) => c.name.toLowerCase().includes(term) || c.slug.toLowerCase().includes(term));
    if (filter === "visible") list = list.filter((c) => !c.hidden && c.status !== "draft");
    else if (filter === "hidden") list = list.filter((c) => !!c.hidden);
    else if (filter === "draft") list = list.filter((c) => c.status === "draft");
    else if (filter === "empty") list = list.filter((c) => (counts[c.id] ?? 0) === 0);
    else if (filter === "most")
      list = list.slice().sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0));

    if (filter !== "most") {
      list = list.slice().sort((a, b) => {
        const pa = a.parent_id ?? "";
        const pb = b.parent_id ?? "";
        if (pa !== pb) return parentName(a.parent_id).localeCompare(parentName(b.parent_id));
        const sa = a.sort_order ?? 0;
        const sb = b.sort_order ?? 0;
        if (sa !== sb) return sa - sb;
        return a.name.localeCompare(b.name);
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subs, counts, q, filter, categories]);

  const draftCount = subs.filter((c) => c.status === "draft").length;

  const toggleSel = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const setHidden = async (ids: string[], hidden: boolean) => {
    if (!ids.length) return;
    const { error } = await supabase.from("categories").update({ hidden }).in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(hidden ? `Hidden ${ids.length}` : `Visible ${ids.length}`);
    invalidate();
  };

  const setFeatured = async (c: Category) => {
    const { error } = await supabase.from("categories").update({ featured: !c.featured }).eq("id", c.id);
    if (error) return toast.error(error.message);
    invalidate();
  };

  const approve = async (ids: string[]) => {
    if (!ids.length) return;
    const { error } = await supabase.from("categories").update({ status: "published" }).in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`Approved ${ids.length}`);
    invalidate();
  };

  const reject = async (ids: string[]) => {
    if (!ids.length) return;
    if (!confirm(`Reject ${ids.length} draft subcategor${ids.length === 1 ? "y" : "ies"}? Posters keep their assignment but the category becomes hidden.`)) return;
    const { error } = await supabase.from("categories").update({ hidden: true, status: "published" }).in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`Rejected ${ids.length}`);
    invalidate();
  };

  const move = async (c: Category, dir: -1 | 1) => {
    const siblings = categories
      .filter((x) => (x.parent_id ?? null) === (c.parent_id ?? null))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const idx = siblings.findIndex((x) => x.id === c.id);
    const swap = siblings[idx + dir];
    if (!swap) return;
    await Promise.all([
      supabase.from("categories").update({ sort_order: swap.sort_order }).eq("id", c.id),
      supabase.from("categories").update({ sort_order: c.sort_order }).eq("id", swap.id),
    ]);
    invalidate();
  };

  const onDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId) return setDragId(null);
    const drag = subs.find((c) => c.id === dragId);
    const target = subs.find((c) => c.id === targetId);
    setDragId(null);
    if (!drag || !target) return;
    if ((drag.parent_id ?? null) !== (target.parent_id ?? null)) {
      toast.error("Drag & drop only reorders within the same parent");
      return;
    }
    const siblings = subs
      .filter((x) => (x.parent_id ?? null) === (drag.parent_id ?? null))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const reordered = siblings.filter((s) => s.id !== drag.id);
    const targetIdx = reordered.findIndex((s) => s.id === target.id);
    reordered.splice(targetIdx, 0, drag);
    await Promise.all(
      reordered.map((s, i) =>
        supabase.from("categories").update({ sort_order: i + 1 }).eq("id", s.id),
      ),
    );
    toast.success("Reordered");
    invalidate();
  };

  const bulkDelete = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} subcategor${ids.length === 1 ? "y" : "ies"}? Posters will be moved to their parent category.`)) return;
    for (const id of ids) {
      const c = subs.find((x) => x.id === id);
      if (!c) continue;
      await supabase.from("posters").update({ category_id: c.parent_id }).eq("category_id", id);
      await supabase.from("categories").delete().eq("id", id);
    }
    toast.success(`Deleted ${ids.length}`);
    setSelected(new Set());
    invalidate();
  };

  return (
    <div>
      <div className="mb-3">
        <h2 className="text-display text-2xl">Sub Categories Manager</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage every sub category under each main category. Hide, show, edit, merge, reorder, or delete with safe poster reassignment.
        </p>
      </div>

      {draftCount > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <div>
            <b>{draftCount}</b> AI-suggested draft{draftCount === 1 ? "" : "s"} waiting for approval.
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => approve(subs.filter((c) => c.status === "draft").map((c) => c.id))}
              className="inline-flex items-center gap-1 rounded-sm bg-primary px-3 py-1.5 text-xs uppercase tracking-widest text-primary-foreground"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Approve all
            </button>
            <button
              onClick={() => setFilter("draft")}
              className="rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-widest"
            >
              Review
            </button>
          </div>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search subcategories…"
            className="w-64 rounded-sm border border-border bg-background pl-8 pr-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {(["all", "visible", "hidden", "draft", "empty", "most"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-sm border px-3 py-1.5 text-[10px] uppercase tracking-widest transition",
                filter === f
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {f === "most" ? "Most posters" : f}
            </button>
          ))}
        </div>
        <div className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {subs.length}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-sm border border-border bg-card p-3 text-sm">
          <span className="text-muted-foreground">{selected.size} selected</span>
          <button
            onClick={() => setHidden(Array.from(selected), true)}
            className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-accent"
          >
            <EyeOff className="h-3.5 w-3.5" /> Hide
          </button>
          <button
            onClick={() => setHidden(Array.from(selected), false)}
            className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-accent"
          >
            <Eye className="h-3.5 w-3.5" /> Show
          </button>
          <button
            onClick={() => approve(Array.from(selected))}
            className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-accent"
          >
            <Check className="h-3.5 w-3.5" /> Publish
          </button>
          <button
            onClick={() => setBulkMerge(true)}
            className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-accent"
          >
            <Merge className="h-3.5 w-3.5" /> Merge…
          </button>
          <button
            onClick={bulkDelete}
            className="inline-flex items-center gap-1 rounded-sm border border-destructive px-3 py-1.5 text-xs uppercase tracking-widest text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-sm border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="w-10 px-2 py-2">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((c) => selected.has(c.id))}
                  onChange={(e) => {
                    const n = new Set(selected);
                    if (e.target.checked) filtered.forEach((c) => n.add(c.id));
                    else filtered.forEach((c) => n.delete(c.id));
                    setSelected(n);
                  }}
                />
              </th>
              <th className="w-8" />
              <th className="px-2 py-2 text-left">Name</th>
              <th className="px-2 py-2 text-left">Parent</th>
              <th className="px-2 py-2 text-left">Posters</th>
              <th className="px-2 py-2 text-left">Visible</th>
              <th className="px-2 py-2 text-left">Featured</th>
              <th className="px-2 py-2 text-left">Order</th>
              <th className="px-2 py-2 text-left">Created</th>
              <th className="px-2 py-2 text-right pr-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="p-8 text-center text-muted-foreground">
                  No subcategories match.
                </td>
              </tr>
            )}
            {filtered.map((c) => {
              const cnt = counts[c.id] ?? 0;
              const isDraft = c.status === "draft";
              return (
                <tr
                  key={c.id}
                  draggable
                  onDragStart={() => setDragId(c.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(c.id)}
                  className={cn(
                    "border-b border-border last:border-b-0 transition",
                    c.hidden && "opacity-60",
                    isDraft && "bg-amber-500/5",
                    dragId === c.id && "opacity-40",
                  )}
                >
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggleSel(c.id)}
                    />
                  </td>
                  <td className="px-1 py-2 text-muted-foreground">
                    <GripVertical className="h-4 w-4 cursor-grab" />
                  </td>
                  <td className="px-2 py-2">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      /{c.slug}
                      {isDraft && (
                        <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
                          draft
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">{parentName(c.parent_id)}</td>
                  <td className="px-2 py-2">{cnt}</td>
                  <td className="px-2 py-2">
                    <button
                      onClick={() => setHidden([c.id], !c.hidden)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[10px] uppercase tracking-widest transition",
                        c.hidden
                          ? "border-border text-muted-foreground hover:bg-accent"
                          : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                      )}
                      title={c.hidden ? "Show" : "Hide"}
                    >
                      {c.hidden ? <><EyeOff className="h-3 w-3" /> Hidden</> : <><Eye className="h-3 w-3" /> Visible</>}
                    </button>
                  </td>
                  <td className="px-2 py-2">
                    <button
                      onClick={() => setFeatured(c)}
                      className={cn(
                        "rounded-sm p-1.5 transition",
                        c.featured ? "text-amber-500" : "text-muted-foreground hover:text-foreground",
                      )}
                      title={c.featured ? "Unfeature" : "Feature"}
                    >
                      <Star className={cn("h-4 w-4", c.featured && "fill-current")} />
                    </button>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => move(c, -1)}
                        className="rounded-sm p-1 text-muted-foreground hover:bg-accent"
                        title="Move up"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <span className="tabular-nums">{c.sort_order ?? 0}</span>
                      <button
                        onClick={() => move(c, 1)}
                        className="rounded-sm p-1 text-muted-foreground hover:bg-accent"
                        title="Move down"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">—</td>
                  <td className="px-2 py-2 text-right pr-3">
                    <div className="inline-flex items-center gap-1">
                      {isDraft && (
                        <>
                          <button
                            onClick={() => approve([c.id])}
                            className="rounded-sm border border-emerald-500/40 px-2 py-1 text-[10px] uppercase tracking-widest text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => reject([c.id])}
                            className="rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground hover:bg-accent"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => setMerging(c)}
                        className="rounded-sm p-1.5 text-muted-foreground hover:bg-accent"
                        title="Merge into another"
                      >
                        <Merge className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setEditing(c)}
                        className="rounded-sm p-1.5 text-muted-foreground hover:bg-accent"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleting(c)}
                        className="rounded-sm p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditDialog
          c={editing}
          roots={roots}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            invalidate();
          }}
        />
      )}

      {deleting && (
        <DeleteDialog
          c={deleting}
          roots={roots}
          subs={subs}
          count={counts[deleting.id] ?? 0}
          onClose={() => setDeleting(null)}
          onDone={() => {
            setDeleting(null);
            invalidate();
          }}
        />
      )}

      {merging && (
        <MergeDialog
          sources={[merging]}
          subs={subs}
          roots={roots}
          onClose={() => setMerging(null)}
          onDone={() => {
            setMerging(null);
            invalidate();
          }}
        />
      )}

      {bulkMerge && (
        <MergeDialog
          sources={subs.filter((c) => selected.has(c.id))}
          subs={subs}
          roots={roots}
          onClose={() => setBulkMerge(false)}
          onDone={() => {
            setBulkMerge(false);
            setSelected(new Set());
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function EditDialog({
  c, roots, onClose, onSaved,
}: { c: Category; roots: Category[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(c.name);
  const [slug, setSlug] = useState(c.slug);
  const [parentId, setParentId] = useState<string>(c.parent_id ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || !slug.trim() || !parentId) return toast.error("Name, slug and parent are required");
    setSaving(true);
    const { error } = await supabase
      .from("categories")
      .update({ name: name.trim(), slug: slug.trim(), parent_id: parentId })
      .eq("id", c.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit subcategory</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="block text-xs uppercase tracking-widest text-muted-foreground">Name
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm" />
          </label>
          <label className="block text-xs uppercase tracking-widest text-muted-foreground">Slug
            <input value={slug} onChange={(e) => setSlug(e.target.value)} className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm" />
          </label>
          <label className="block text-xs uppercase tracking-widest text-muted-foreground">Parent category
            <select value={parentId} onChange={(e) => setParentId(e.target.value)} className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm">
              <option value="">— Select —</option>
              {roots.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
        </div>
        <DialogFooter>
          <button onClick={onClose} className="rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest">Cancel</button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  c, roots, subs, count, onClose, onDone,
}: {
  c: Category; roots: Category[]; subs: Category[]; count: number;
  onClose: () => void; onDone: () => void;
}) {
  const parent = roots.find((r) => r.id === c.parent_id);
  type Choice = "parent" | "other" | "uncategorized";
  const [choice, setChoice] = useState<Choice>("parent");
  const [otherId, setOtherId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      let target: string | null = null;
      if (choice === "parent") target = c.parent_id ?? null;
      else if (choice === "other") {
        if (!otherId) { setBusy(false); return toast.error("Pick a target subcategory"); }
        target = otherId;
      } else target = null;
      if (count > 0) {
        const { error } = await supabase.from("posters").update({ category_id: target }).eq("category_id", c.id);
        if (error) { setBusy(false); return toast.error(error.message); }
      }
      const { error } = await supabase.from("categories").delete().eq("id", c.id);
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success(`Deleted "${c.name}"${count > 0 ? ` and moved ${count} poster${count === 1 ? "" : "s"}` : ""}`);
      onDone();
    } catch (e: any) {
      setBusy(false);
      toast.error(e?.message ?? "Failed");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Delete "{c.name}"?</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p>What do you want to do with the {count} poster{count === 1 ? "" : "s"} assigned to this subcategory?</p>
          <label className="flex items-start gap-2">
            <input type="radio" checked={choice === "parent"} onChange={() => setChoice("parent")} className="mt-0.5" />
            <span>Move to <b>{parent?.name ?? "parent"}</b></span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" checked={choice === "other"} onChange={() => setChoice("other")} className="mt-0.5" />
            <span className="flex-1">
              Move to another sub category
              <select
                value={otherId}
                onChange={(e) => setOtherId(e.target.value)}
                disabled={choice !== "other"}
                className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">— Select —</option>
                {subs.filter((s) => s.id !== c.id).map((s) => (
                  <option key={s.id} value={s.id}>{s.name} · {roots.find((r) => r.id === s.parent_id)?.name ?? ""}</option>
                ))}
              </select>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" checked={choice === "uncategorized"} onChange={() => setChoice("uncategorized")} className="mt-0.5" />
            <span>Leave uncategorized</span>
          </label>
          <p className="text-xs text-muted-foreground">Posters and images are never deleted.</p>
        </div>
        <DialogFooter>
          <button onClick={onClose} className="rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest">Cancel</button>
          <button onClick={run} disabled={busy} className="inline-flex items-center gap-2 rounded-sm bg-destructive px-4 py-2 text-xs uppercase tracking-widest text-destructive-foreground">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MergeDialog({
  sources, subs, roots, onClose, onDone,
}: {
  sources: Category[]; subs: Category[]; roots: Category[];
  onClose: () => void; onDone: () => void;
}) {
  const [targetId, setTargetId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const sourceIds = sources.map((s) => s.id);

  const run = async () => {
    if (!targetId) return toast.error("Pick a target");
    if (sourceIds.includes(targetId)) return toast.error("Target must be different from sources");
    setBusy(true);
    const { error: mErr } = await supabase.from("posters").update({ category_id: targetId }).in("category_id", sourceIds);
    if (mErr) { setBusy(false); return toast.error(mErr.message); }
    const { error: dErr } = await supabase.from("categories").delete().in("id", sourceIds);
    setBusy(false);
    if (dErr) return toast.error(dErr.message);
    toast.success(`Merged ${sources.length} subcategor${sources.length === 1 ? "y" : "ies"}`);
    onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Merge {sources.length === 1 ? `"${sources[0].name}"` : `${sources.length} subcategories`} into…</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">All posters from the source subcategor{sources.length === 1 ? "y" : "ies"} will be moved to the target, then the source{sources.length === 1 ? "" : "s"} will be deleted. Posters keep their images.</p>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">— Select target subcategory —</option>
            {subs.filter((s) => !sourceIds.includes(s.id)).map((s) => (
              <option key={s.id} value={s.id}>{s.name} · {roots.find((r) => r.id === s.parent_id)?.name ?? ""}</option>
            ))}
          </select>
        </div>
        <DialogFooter>
          <button onClick={onClose} className="rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest">Cancel</button>
          <button onClick={run} disabled={busy || !targetId} className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Merge className="h-3.5 w-3.5" />} Merge
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}