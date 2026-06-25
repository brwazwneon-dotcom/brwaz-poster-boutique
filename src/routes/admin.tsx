import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCategories, type Category } from "@/lib/use-categories";
import { cn } from "@/lib/utils";
import { Trash2, Upload, LogOut, Pencil, Plus, X, Save, Download, Search, Eye, ArrowUp, ArrowDown } from "lucide-react";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — BRWAZWNEON" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

type Tab = "posters" | "categories" | "orders" | "slider" | "settings";

function AdminPage() {
  const navigate = useNavigate();
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
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.session.user.id)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!roleData);
      setReady(true);
    })();
  }, [navigate]);

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
            Your account ({userId?.slice(0, 8)}…) isn't an admin yet. Ask the
            site owner to grant the <code>admin</code> role to your user in the
            <code> user_roles</code> table.
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
        {(["posters", "categories", "orders", "slider", "settings"] as Tab[]).map((t) => (
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
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [upProgress, setUpProgress] = useState<{ done: number; total: number; failed: number }>({
    done: 0, total: 0, failed: 0,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-posters", filter, page],
    queryFn: async () => {
      let q = supabase
        .from("posters")
        .select("id,title,image_url,category_id", { count: "exact" })
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
            const { error: upErr } = await supabase.storage
              .from("posters")
              .upload(path, file, { contentType: file.type });
            if (upErr) throw upErr;
            const { data: pub } = supabase.storage.from("posters").getPublicUrl(path);
            const baseName = file.name.replace(/\.[^.]+$/, "");
            const finalTitle = title ? `${title} ${baseName}` : baseName;
            const { error: insErr } = await supabase.from("posters").insert({
              title: finalTitle,
              category_id: categoryId,
              image_url: pub.publicUrl,
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

  const totalPages = Math.max(1, Math.ceil((data?.count ?? 0) / PAGE_SIZE));

  return (
    <div>
      <form
        onSubmit={upload}
        className="grid gap-3 rounded-sm border border-border bg-card p-6 md:grid-cols-[1fr_1fr_1.2fr_auto]"
      >
        <input
          type="text"
          placeholder="Title prefix (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="">Select category…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input
          id="poster-files"
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setFiles(e.target.files)}
          className="text-sm text-muted-foreground"
        />
        <button
          type="submit"
          disabled={uploading}
          className="inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          {uploading
            ? `Uploading ${upProgress.done}/${upProgress.total}`
            : `Upload${files && files.length ? ` (${files.length})` : ""}`}
        </button>
      </form>

      {uploading && upProgress.total > 0 && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${Math.round((upProgress.done / upProgress.total) * 100)}%` }}
          />
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <FilterPill active={filter === "all"} onClick={() => { setFilter("all"); setPage(0); }}>
            All ({data?.count ?? 0})
          </FilterPill>
          {categories.map((c) => (
            <FilterPill key={c.id} active={filter === c.id} onClick={() => { setFilter(c.id); setPage(0); }}>
              {c.name}
            </FilterPill>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">
          Page {page + 1} / {totalPages}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {isLoading ? (
          <div className="col-span-full py-16 text-center text-sm text-muted-foreground">Loading…</div>
        ) : data?.rows.length === 0 ? (
          <div className="col-span-full py-16 text-center text-sm text-muted-foreground">No posters.</div>
        ) : (
          data?.rows.map((p) => (
            <div key={p.id} className="group overflow-hidden rounded-sm border border-border bg-card">
              <div className="aspect-[2/3] overflow-hidden">
                <img src={p.image_url} alt={p.title} loading="lazy" className="h-full w-full object-cover" />
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
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("posters")
      .update({ title, category_id: categoryId || null })
      .eq("id", poster.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    onSaved();
  };

  return (
    <Modal onClose={onClose} title="Edit poster">
      <div className="flex gap-4">
        <img src={poster.image_url} alt={poster.title} className="h-48 w-32 rounded-sm object-cover" />
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
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
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
                <img src={c.image} alt={c.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-xs uppercase tracking-widest text-muted-foreground">
                  No cover
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 p-4">
              <div>
                <div className="font-semibold">{c.name}</div>
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

function EditCategoryModal({
  category, onClose, onSaved,
}: { category: Category | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !category;
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [imageUrl, setImageUrl] = useState(category?.image ?? "");
  const [sortOrder, setSortOrder] = useState<number>(category?.sort_order ?? 0);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return toast.error("Name required");
    setSaving(true);
    try {
      let finalImage = imageUrl;
      if (file) {
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `_categories/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("posters")
          .upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        finalImage = supabase.storage.from("posters").getPublicUrl(path).data.publicUrl;
      }
      const payload = {
        name: name.trim(),
        slug: (slug || slugify(name)).trim(),
        image: finalImage || null,
        sort_order: sortOrder,
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
            <img src={imageUrl} alt="" className="mt-2 h-24 w-40 rounded-sm object-cover" />
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
  status: string;
  created_at: string;
};

const STATUSES = ["new", "confirmed", "shipped", "delivered", "cancelled"];

function OrdersTab() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["admin-orders", statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select("id,customer_name,phone,governorate,address,frame_type,frame_color,size,quantity,poster_title,poster_image,total_price,status,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Order[];
    },
  });

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

  return (
    <div>
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
      ) : orders.length === 0 ? (
        <div className="rounded-sm border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          No orders yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-sm border border-border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
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
                {orders.map((o) => (
                  <tr key={o.id} className="border-t border-border align-top">
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
                          <img src={o.poster_image} alt="" className="h-12 w-9 rounded-sm object-cover" />
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
                      <button
                        onClick={() => remove(o)}
                        className="rounded-sm p-1.5 text-muted-foreground hover:text-destructive"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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