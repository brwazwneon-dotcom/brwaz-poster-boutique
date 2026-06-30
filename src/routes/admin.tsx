import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ensureBrandAdminRole } from "@/lib/admin-auth.functions";
import { useCategories, type Category } from "@/lib/use-categories";
import { cn } from "@/lib/utils";
import { Trash2, Upload, LogOut, Pencil, Plus, X, Save, Download, Search, Eye, ArrowUp, ArrowDown } from "lucide-react";
import * as XLSX from "xlsx";
import {
  IMAGE_FALLBACK,
  uploadAndSign,
  extractStoragePath,
  signStoragePath,
} from "@/lib/storage-url";
import { SafeImage } from "@/components/SafeImage";
import { BulkPosterUploader } from "@/components/admin/BulkPosterUploader";
import { FramePreview } from "@/components/FramePreview";
import { MOCKUP_KEYS, type FrameMockup, type FrameMockups } from "@/lib/use-settings";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — BRWAZWNEON" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

type Tab = "posters" | "categories" | "orders" | "slider" | "mockups" | "settings";

function AdminPage() {
  const navigate = useNavigate();
  const ensureAdmin = useServerFn(ensureBrandAdminRole);
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("posters");

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
        {(["posters", "categories", "orders", "slider", "mockups", "settings"] as Tab[]).map((t) => (
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
        {tab === "posters" && <PostersTab />}
        {tab === "categories" && <CategoriesTab />}
        {tab === "orders" && <OrdersTab />}
        {tab === "slider" && <SliderTab />}
        {tab === "mockups" && <MockupsTab />}
        {tab === "settings" && <SettingsTab />}
      </div>
    </div>
  );
}

/* ---------- POSTERS ---------- */

type Poster = {
  id: string;
  title: string;
  image_url: string;
  category_id: string | null;
  tags?: string[] | null;
  featured?: boolean | null;
  hidden?: boolean | null;
  description?: string | null;
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
        .select("id,title,image_url,category_id,tags,featured,hidden", { count: "exact" })
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
              </div>
              <div className="aspect-[2/3] overflow-hidden">
                <img
                  src={p.image_url}
                  alt={p.title}
                  loading="lazy"
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (img.dataset.fallback) return;
                    img.dataset.fallback = "1";
                    img.src = IMAGE_FALLBACK;
                  }}
                />
              </div>
              <div className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm">{p.title}</div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {categories.find((c) => c.id === p.category_id)?.name ?? "—"}
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
  const [featured, setFeatured] = useState(!!poster.featured);
  const [hidden, setHidden] = useState(!!poster.hidden);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("posters")
      .update({
        title,
        category_id: categoryId || null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        description: description || null,
        featured,
        hidden,
      })
      .eq("id", poster.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    onSaved();
  };

  return (
    <Modal onClose={onClose} title="Edit poster">
      <div className="flex gap-4">
        <SafeImage src={poster.image_url} alt={poster.title} className="h-48 w-32 rounded-sm object-cover" />
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
        .select("id,order_number,customer_name,phone,governorate,address,frame_type,frame_color,size,quantity,poster_title,poster_image,total_price,shipping_cost,status,created_at")
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
  const [fee, setFee] = useState<string>("");
  const [threshold, setThreshold] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("site_settings").select("key,value");
      if (error) throw error;
      const map = new Map((data ?? []).map((r) => [r.key, r.value as unknown]));
      return {
        fee: Number(map.get("shipping_fee") ?? 89),
        threshold: Number(map.get("free_shipping_threshold") ?? 1600),
      };
    },
  });

  useEffect(() => {
    if (data) {
      setFee(String(data.fee));
      setThreshold(String(data.threshold));
    }
  }, [data]);

  const save = async () => {
    setSaving(true);
    try {
      const f = Number(fee);
      const t = Number(threshold);
      if (!Number.isFinite(f) || f < 0) throw new Error("Invalid shipping fee");
      if (!Number.isFinite(t) || t < 0) throw new Error("Invalid threshold");
      const { error: e1 } = await supabase
        .from("site_settings")
        .upsert({ key: "shipping_fee", value: f, updated_at: new Date().toISOString() });
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("site_settings")
        .upsert({ key: "free_shipping_threshold", value: t, updated_at: new Date().toISOString() });
      if (e2) throw e2;
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
      qc.invalidateQueries({ queryKey: ["site-settings"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="max-w-xl rounded-sm border border-border bg-card p-6">
      <h3 className="text-display text-2xl">Shipping</h3>
      <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
        Applied across cart, checkout & photo printing
      </p>
      <div className="mt-5 space-y-3">
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Shipping fee (EGP)</span>
          <input
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            inputMode="numeric"
            className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Free shipping threshold (EGP)</span>
          <input
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            inputMode="numeric"
            className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
      </div>
      <div className="mt-6 flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
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
        value: m as unknown as Record<string, unknown>,
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
        }}
      >
        <img src={SAMPLE_POSTER} alt="" className="h-full w-full object-cover" />
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