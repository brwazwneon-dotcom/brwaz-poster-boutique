import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  adminLogin,
  adminLogout,
  adminSessionCheck,
  adminSetupNeeded,
  bootstrapAdmin,
} from "@/lib/admin-auth-neon.functions";
import {
  listCategoriesAdmin,
  upsertCategory,
  deleteCategory,
  listPostersAdmin,
  upsertPoster,
  deletePoster,
  bulkUpdatePosters,
  listOrdersAdmin,
  updateOrderStatus,
  getAllSiteSettingsAdmin,
  setSiteSetting,
  listHeroBannersAdmin,
  upsertHeroBanner,
  deleteHeroBanner,
  getSystemHealthAdmin,
  listErrorLogsAdmin,
  updateErrorLogStatus,
} from "@/lib/db-admin.functions";
import { uploadPosterImage } from "@/lib/image-upload.functions";
import { generatePosterMeta } from "@/lib/poster-ai.functions";
import { optimizeImage } from "@/lib/image-optimize";
import { FramePreview } from "@/components/FramePreview";

export const Route = createLazyFileRoute("/admin")({
  component: AdminPage,
});

// =========================================================
// BRWAZWNEON 2.0 admin — Phase 3 (Neon).
//
// Deliberately NOT a port of the old 56-tab admin.lazy.tsx: that file was
// built entirely against Supabase (auth, storage, 90+ tables) and would
// need a rewrite line-by-line regardless of how much of it was kept. This
// is a fresh, minimal admin covering what actually runs the business
// today — products, categories, orders, pricing — so the storefront can
// go live fast. Analytics, campaigns, reviews, and the rest of the old
// tabs are Phase 4, added incrementally once the core loop works.
// =========================================================

type Screen = "loading" | "setup" | "login" | "dashboard";

function AdminPage() {
  const [screen, setScreen] = useState<Screen>("loading");

  useEffect(() => {
    (async () => {
      const setup = await adminSetupNeeded();
      if (setup.needed) {
        setScreen("setup");
        return;
      }
      const session = await adminSessionCheck();
      setScreen(session.isAdmin ? "dashboard" : "login");
    })();
  }, []);

  if (screen === "loading") {
    return <CenteredMessage>Loading…</CenteredMessage>;
  }
  if (screen === "setup") {
    return <SetupScreen onDone={() => setScreen("login")} />;
  }
  if (screen === "login") {
    return <LoginScreen onDone={() => setScreen("dashboard")} />;
  }
  return <Dashboard onLogout={() => setScreen("login")} />;
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-sm border border-border bg-card p-8">
        <h1 className="text-display mb-6 text-2xl">{title}</h1>
        {children}
      </div>
    </div>
  );
}

function SetupScreen({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await bootstrapAdmin({ data: { email, password } });
      toast.success("Admin account created — now log in");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Set up admin access">
      <p className="mb-6 text-sm text-muted-foreground">
        First time here. Create the one admin account for this site.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-sm bg-primary py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create admin account"}
        </button>
      </form>
    </AuthCard>
  );
}

function LoginScreen({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await adminLogin({ data: { email, password } });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Admin sign in">
      <form onSubmit={submit} className="space-y-4">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
        />
        <input
          type="password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-sm bg-primary py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthCard>
  );
}

type Tab = "products" | "categories" | "orders" | "homepage" | "health" | "settings";

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("orders");

  const logout = async () => {
    await adminLogout();
    onLogout();
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "orders", label: "Orders" },
    { id: "products", label: "Products" },
    { id: "categories", label: "Categories" },
    { id: "homepage", label: "Homepage" },
    { id: "health", label: "System Health" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <h1 className="text-display text-xl">BRWAZWNEON Admin</h1>
          <button onClick={logout} className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
            Sign out
          </button>
        </div>
        <div className="mx-auto flex max-w-6xl gap-1 px-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`border-b-2 px-4 py-2.5 text-xs uppercase tracking-widest transition ${
                tab === t.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-8">
        {tab === "orders" && <OrdersTab />}
        {tab === "products" && <ProductsTab />}
        {tab === "categories" && <CategoriesTab />}
        {tab === "homepage" && <HomepageTab />}
        {tab === "health" && <SystemHealthTab />}
        {tab === "settings" && <SettingsTab />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Orders
// ---------------------------------------------------------------
type AdminOrder = {
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
  status: string;
  payment_method: string;
  payment_status: string;
  created_at: string;
};

const ORDER_STATUSES = ["new", "confirmed", "processing", "shipped", "delivered", "cancelled", "returned"];

function OrdersTab() {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [filter, setFilter] = useState<string>("");

  const load = async () => {
    const rows = await listOrdersAdmin({ data: filter ? { status: filter } : {} });
    setOrders(rows as AdminOrder[]);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const changeStatus = async (id: string, status: string) => {
    try {
      await updateOrderStatus({ data: { id, status } });
      toast.success("Order updated");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  if (orders === null) return <p className="text-sm text-muted-foreground">Loading orders…</p>;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-sm border border-border bg-background px-3 py-1.5 text-xs"
        >
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">{orders.length} orders</span>
      </div>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No orders yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-card text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Payment</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{o.order_number}</td>
                  <td className="px-3 py-2">
                    <div>{o.customer_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {o.phone} · {o.governorate}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {o.poster_title} · {o.size} · {o.frame_type}
                  </td>
                  <td className="px-3 py-2 font-medium">{o.total_price} EGP</td>
                  <td className="px-3 py-2 text-xs">
                    {o.payment_method} / {o.payment_status}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={o.status}
                      onChange={(e) => changeStatus(o.id, e.target.value)}
                      className="rounded-sm border border-border bg-background px-2 py-1 text-xs"
                    >
                      {ORDER_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// Categories
// ---------------------------------------------------------------
type AdminCategory = {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  hidden: boolean;
  featured: boolean;
  sort_order: number;
};

function CategoriesTab() {
  const [categories, setCategories] = useState<AdminCategory[] | null>(null);
  const [editing, setEditing] = useState<Partial<AdminCategory> | null>(null);

  const load = async () => setCategories((await listCategoriesAdmin()) as AdminCategory[]);
  useEffect(() => {
    load();
  }, []);

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

  const remove = async (id: string) => {
    if (!confirm("Delete this category?")) return;
    await deleteCategory({ data: id });
    load();
  };

  if (categories === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <h2 className="text-lg font-semibold">Categories</h2>
        <button
          onClick={() => setEditing({})}
          className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          + New category
        </button>
      </div>

      {editing && (
        <div className="mb-6 space-y-3 rounded-sm border border-border bg-card p-4">
          <input
            placeholder="Name"
            value={editing.name ?? ""}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            placeholder="Image URL"
            value={editing.image ?? ""}
            onChange={(e) => setEditing({ ...editing, image: e.target.value })}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(editing.hidden)}
              onChange={(e) => setEditing({ ...editing, hidden: e.target.checked })}
            />
            Hidden
          </label>
          <div className="flex gap-2">
            <button onClick={save} className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
              Save
            </button>
            <button onClick={() => setEditing(null)} className="rounded-sm border border-border px-3 py-1.5 text-xs">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-sm border border-border p-3">
            <div>
              <div className="text-sm font-medium">{c.name}</div>
              <div className="text-xs text-muted-foreground">/{c.slug}{c.hidden ? " · hidden" : ""}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditing(c)} className="text-xs text-cyan-500 hover:underline">
                Edit
              </button>
              <button onClick={() => remove(c.id)} className="text-xs text-red-500 hover:underline">
                Delete
              </button>
            </div>
          </div>
        ))}
        {categories.length === 0 && <p className="text-sm text-muted-foreground">No categories yet.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Products — Upload Studio
// ---------------------------------------------------------------
type AdminPoster = {
  id: string;
  title: string;
  slug: string;
  image_url: string;
  category_id: string | null;
  badge: string | null;
  hidden: boolean;
  featured: boolean;
  trending: boolean;
  tags?: string[];
};

type QueueStatus = "queued" | "optimizing" | "uploading" | "analyzing" | "creating" | "ready" | "failed";
type QueueItem = {
  id: string;
  file: File;
  previewUrl: string;
  status: QueueStatus;
  error?: string;
  productId?: string;
};

function filenameToTitle(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  const words = base
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1));
  return words.join(" ") || "Untitled";
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

const QUEUE_STATUS_LABEL: Record<QueueStatus, string> = {
  queued: "Queued",
  optimizing: "Optimizing",
  uploading: "Uploading",
  analyzing: "AI analyzing",
  creating: "Creating draft",
  ready: "Ready",
  failed: "Failed",
};

function ProductsTab() {
  const [products, setProducts] = useState<AdminPoster[] | null>(null);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [editing, setEditing] = useState<Partial<AdminPoster> | null>(null);
  const [previewFrame, setPreviewFrame] = useState<"black" | "white" | "wood">("black");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkBadge, setBulkBadge] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const categoriesRef = useRef<AdminCategory[]>([]);
  categoriesRef.current = categories;

  const load = async () => {
    const [p, c] = await Promise.all([listPostersAdmin({ data: {} }), listCategoriesAdmin()]);
    setProducts(p as AdminPoster[]);
    setCategories(c as AdminCategory[]);
  };
  useEffect(() => {
    load();
  }, []);

  const categoryName = useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (map.get(id) ?? "—") : "—");
  }, [categories]);

  // ---- Upload queue: optimize -> upload -> AI-assist (best effort) ->
  // create as a hidden draft product. Concurrency-limited so 100+ files
  // don't fire 100 requests at once. ----
  const updateQueueItem = (id: string, patch: Partial<QueueItem>) =>
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));

  const processItem = async (item: QueueItem) => {
    try {
      updateQueueItem(item.id, { status: "optimizing", error: undefined });
      const optimized = await optimizeImage(item.file, { maxDim: 2000, quality: 0.85 });

      updateQueueItem(item.id, { status: "uploading" });
      const dataUrl = await fileToDataUrl(optimized);
      const { url } = await uploadPosterImage({ data: { dataUrl, filename: item.file.name } });

      updateQueueItem(item.id, { status: "analyzing" });
      let meta: Partial<{
        title: string;
        badge: string | null;
        tags: string[];
        category_id: string | null;
      }> = {};
      try {
        meta = await generatePosterMeta({
          data: {
            imageUrl: url,
            filename: item.file.name,
            categories: categoriesRef.current.map((c) => ({
              id: c.id,
              name: c.name,
              slug: c.slug,
              parent_id: null,
            })),
          },
        });
      } catch {
        // AI assist is best-effort: a failure here still leaves a usable
        // draft (filename-derived title, no category), never blocks upload.
      }

      updateQueueItem(item.id, { status: "creating" });
      const { id: productId } = await upsertPoster({
        data: {
          title: meta.title || filenameToTitle(item.file.name),
          image_url: url,
          category_id: meta.category_id ?? null,
          badge: meta.badge ?? null,
          tags: meta.tags ?? [],
          hidden: true, // lands as a draft — admin reviews before publishing
          trending: false,
        },
      });
      updateQueueItem(item.id, { status: "ready", productId });
      load();
    } catch (err) {
      updateQueueItem(item.id, {
        status: "failed",
        error: err instanceof Error ? err.message : "Upload failed",
      });
    }
  };

  const MAX_CONCURRENT = 3;
  const activeCountRef = useRef(0);
  const pendingRef = useRef<QueueItem[]>([]);
  const pump = () => {
    while (activeCountRef.current < MAX_CONCURRENT && pendingRef.current.length > 0) {
      const item = pendingRef.current.shift();
      if (!item) break;
      activeCountRef.current++;
      processItem(item).finally(() => {
        activeCountRef.current--;
        pump();
      });
    }
  };

  const addFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (incoming.length === 0) return;
    const items: QueueItem[] = incoming.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: "queued",
    }));
    setQueue((prev) => [...items, ...prev]);
    pendingRef.current.push(...items);
    pump();
  };

  const retryItem = (item: QueueItem) => {
    updateQueueItem(item.id, { status: "queued", error: undefined });
    pendingRef.current.push(item);
    pump();
  };

  const clearFinishedQueue = () =>
    setQueue((prev) => prev.filter((q) => q.status !== "ready"));

  // ---- Selection + bulk actions ----
  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearSelection = () => setSelected(new Set());

  const applyBulk = async (patch: { category_id?: string; badge?: string | null; hidden?: boolean; trending?: boolean }) => {
    if (selected.size === 0) return;
    try {
      await bulkUpdatePosters({ data: { ids: Array.from(selected), patch } });
      toast.success(`Updated ${selected.size} product(s)`);
      clearSelection();
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk update failed");
    }
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} product(s)? This can't be undone.`)) return;
    for (const id of selected) await deletePoster({ data: id });
    toast.success("Deleted");
    clearSelection();
    load();
  };

  // ---- Single-product edit ----
  const save = async () => {
    if (!editing?.title) return toast.error("Title is required");
    if (!editing?.image_url) return toast.error("Image URL is required");
    try {
      await upsertPoster({ data: editing });
      toast.success("Saved");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    await deletePoster({ data: id });
    load();
  };

  if (products === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Products</h2>
        <button
          onClick={() => setEditing({})}
          className="rounded-sm border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          + Single product (advanced)
        </button>
      </div>

      {/* ---- Drop zone ---- */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`mb-4 cursor-pointer rounded-sm border-2 border-dashed p-8 text-center transition ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-foreground/40"
        }`}
      >
        <p className="text-sm font-medium">Drag & drop poster images here, or click to browse</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Multiple files at once · auto-optimized, auto-named, AI-assisted · lands as a draft for review
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* ---- Upload queue ---- */}
      {queue.length > 0 && (
        <div className="mb-6 rounded-sm border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Upload queue ({queue.filter((q) => q.status === "ready").length}/{queue.length} ready)
            </span>
            <button onClick={clearFinishedQueue} className="text-xs text-muted-foreground hover:text-foreground">
              Clear finished
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {queue.map((q) => (
              <div key={q.id} className="flex items-center gap-3 border-b border-border px-4 py-2 last:border-0">
                <img src={q.previewUrl} alt="" className="h-10 w-8 rounded-sm object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs">{q.file.name}</div>
                  {q.error && <div className="truncate text-xs text-red-500">{q.error}</div>}
                </div>
                <span
                  className={`shrink-0 rounded-sm px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                    q.status === "ready"
                      ? "bg-emerald-500/15 text-emerald-500"
                      : q.status === "failed"
                        ? "bg-red-500/15 text-red-500"
                        : "bg-accent text-muted-foreground"
                  }`}
                >
                  {QUEUE_STATUS_LABEL[q.status]}
                </span>
                {q.status === "failed" && (
                  <button onClick={() => retryItem(q)} className="shrink-0 text-xs text-cyan-500 hover:underline">
                    Retry
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- Bulk action bar ---- */}
      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-sm border border-primary/40 bg-primary/5 p-3">
          <span className="text-xs font-medium">{selected.size} selected</span>
          <select
            value={bulkCategory}
            onChange={(e) => setBulkCategory(e.target.value)}
            className="rounded-sm border border-border bg-background px-2 py-1 text-xs"
          >
            <option value="">Set category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            disabled={!bulkCategory}
            onClick={() => applyBulk({ category_id: bulkCategory })}
            className="rounded-sm border border-border px-2 py-1 text-xs disabled:opacity-40"
          >
            Apply
          </button>
          <input
            placeholder="Set badge…"
            value={bulkBadge}
            onChange={(e) => setBulkBadge(e.target.value)}
            className="w-32 rounded-sm border border-border bg-background px-2 py-1 text-xs"
          />
          <button
            disabled={!bulkBadge}
            onClick={() => applyBulk({ badge: bulkBadge })}
            className="rounded-sm border border-border px-2 py-1 text-xs disabled:opacity-40"
          >
            Apply
          </button>
          <button onClick={() => applyBulk({ trending: true })} className="rounded-sm border border-border px-2 py-1 text-xs">
            + Trending
          </button>
          <button onClick={() => applyBulk({ hidden: false })} className="rounded-sm border border-border px-2 py-1 text-xs">
            Publish
          </button>
          <button onClick={() => applyBulk({ hidden: true })} className="rounded-sm border border-border px-2 py-1 text-xs">
            Hide
          </button>
          <button onClick={deleteSelected} className="rounded-sm border border-red-500/40 px-2 py-1 text-xs text-red-500">
            Delete
          </button>
          <button onClick={clearSelection} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
            Clear selection
          </button>
        </div>
      )}

      {/* ---- Single-product advanced edit ---- */}
      {editing && (
        <div className="mb-6 grid gap-4 rounded-sm border border-border bg-card p-4 sm:grid-cols-[200px_1fr]">
          <div>
            {editing.image_url ? (
              <>
                <FramePreview posterUrl={editing.image_url} color={previewFrame} aspectClassName="aspect-[3/4]" />
                <div className="mt-2 flex gap-1">
                  {(["black", "white", "wood"] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => setPreviewFrame(c)}
                      className={`flex-1 rounded-sm border px-1 py-1 text-[10px] capitalize ${
                        previewFrame === c ? "border-primary text-foreground" : "border-border text-muted-foreground"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex aspect-[3/4] items-center justify-center rounded-sm border border-dashed border-border text-xs text-muted-foreground">
                Mockup preview
              </div>
            )}
          </div>
          <div className="space-y-3">
            <input
              placeholder="Title"
              value={editing.title ?? ""}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              placeholder="Image URL"
              value={editing.image_url ?? ""}
              onChange={(e) => setEditing({ ...editing, image_url: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <select
              value={editing.category_id ?? ""}
              onChange={(e) => setEditing({ ...editing, category_id: e.target.value || null })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Badge (e.g. New, Sale) — optional"
              value={editing.badge ?? ""}
              onChange={(e) => setEditing({ ...editing, badge: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(editing.hidden)}
                  onChange={(e) => setEditing({ ...editing, hidden: e.target.checked })}
                />
                Hidden (draft)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(editing.trending)}
                  onChange={(e) => setEditing({ ...editing, trending: e.target.checked })}
                />
                Trending
              </label>
            </div>
            <div className="flex gap-2">
              <button onClick={save} className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
                Save
              </button>
              <button onClick={() => setEditing(null)} className="rounded-sm border border-border px-3 py-1.5 text-xs">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Product list ---- */}
      <div className="space-y-2">
        {products.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-sm border border-border p-3">
            <div className="flex items-center gap-3">
              <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelected(p.id)} />
              <img src={p.image_url} alt="" className="h-12 w-9 rounded-sm object-cover" />
              <div>
                <div className="text-sm font-medium">{p.title}</div>
                <div className="text-xs text-muted-foreground">
                  {categoryName(p.category_id)}
                  {p.hidden ? " · draft" : " · published"}
                  {p.trending ? " · trending" : ""}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditing(p)} className="text-xs text-cyan-500 hover:underline">
                Edit
              </button>
              <button onClick={() => remove(p.id)} className="text-xs text-red-500 hover:underline">
                Delete
              </button>
            </div>
          </div>
        ))}
        {products.length === 0 && <p className="text-sm text-muted-foreground">No products yet — drop some images above.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Homepage — hero banners
// ---------------------------------------------------------------
type AdminHeroBanner = {
  id: string;
  image_url: string;
  title: string | null;
  subtitle: string | null;
  button_text: string | null;
  button_link: string | null;
  enabled: boolean;
  sort_order: number;
};

function HomepageTab() {
  const [banners, setBanners] = useState<AdminHeroBanner[] | null>(null);
  const [editing, setEditing] = useState<Partial<AdminHeroBanner> | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => setBanners((await listHeroBannersAdmin()) as AdminHeroBanner[]);
  useEffect(() => {
    load();
  }, []);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const optimized = await optimizeImage(file, { maxDim: 2400, quality: 0.85 });
      const dataUrl = await fileToDataUrl(optimized);
      const { url } = await uploadPosterImage({ data: { dataUrl, filename: file.name } });
      setEditing((prev) => ({ ...(prev ?? {}), image_url: url }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!editing?.image_url) return toast.error("Banner image is required");
    try {
      await upsertHeroBanner({ data: editing });
      toast.success("Saved");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this banner?")) return;
    await deleteHeroBanner({ data: id });
    load();
  };

  const toggleEnabled = async (b: AdminHeroBanner) => {
    await upsertHeroBanner({ data: { ...b, enabled: !b.enabled } });
    load();
  };

  const move = async (b: AdminHeroBanner, dir: -1 | 1) => {
    if (!banners) return;
    const sorted = [...banners].sort((a, c) => a.sort_order - c.sort_order);
    const idx = sorted.findIndex((x) => x.id === b.id);
    const swapWith = sorted[idx + dir];
    if (!swapWith) return;
    await Promise.all([
      upsertHeroBanner({ data: { ...b, sort_order: swapWith.sort_order } }),
      upsertHeroBanner({ data: { ...swapWith, sort_order: b.sort_order } }),
    ]);
    load();
  };

  if (banners === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <h2 className="text-lg font-semibold">Homepage banners</h2>
        <button
          onClick={() => setEditing({})}
          className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          + New banner
        </button>
      </div>

      {editing && (
        <div className="mb-6 grid gap-4 rounded-sm border border-border bg-card p-4 sm:grid-cols-[200px_1fr]">
          <div>
            {editing.image_url ? (
              <img src={editing.image_url} alt="" className="aspect-[16/7] w-full rounded-sm object-cover" />
            ) : (
              <div className="flex aspect-[16/7] items-center justify-center rounded-sm border border-dashed border-border text-xs text-muted-foreground">
                No image
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="mt-2 w-full rounded-sm border border-border px-2 py-1.5 text-xs disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Upload image"}
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
            <input
              placeholder="Title (optional)"
              value={editing.title ?? ""}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              placeholder="Subtitle (optional)"
              value={editing.subtitle ?? ""}
              onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              placeholder="Button text (optional)"
              value={editing.button_text ?? ""}
              onChange={(e) => setEditing({ ...editing, button_text: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              placeholder="Button link (optional, e.g. /category/football)"
              value={editing.button_link ?? ""}
              onChange={(e) => setEditing({ ...editing, button_link: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.enabled !== false}
                onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
              />
              Enabled
            </label>
            <div className="flex gap-2">
              <button onClick={save} className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
                Save
              </button>
              <button onClick={() => setEditing(null)} className="rounded-sm border border-border px-3 py-1.5 text-xs">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {banners
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-sm border border-border p-3">
              <div className="flex items-center gap-3">
                <img src={b.image_url} alt="" className="h-12 w-20 rounded-sm object-cover" />
                <div>
                  <div className="text-sm font-medium">{b.title || "(no title)"}</div>
                  <div className="text-xs text-muted-foreground">{b.enabled ? "Enabled" : "Disabled"}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => move(b, -1)} className="text-xs text-muted-foreground hover:text-foreground">
                  ↑
                </button>
                <button onClick={() => move(b, 1)} className="text-xs text-muted-foreground hover:text-foreground">
                  ↓
                </button>
                <button onClick={() => toggleEnabled(b)} className="text-xs text-cyan-500 hover:underline">
                  {b.enabled ? "Disable" : "Enable"}
                </button>
                <button onClick={() => setEditing(b)} className="text-xs text-cyan-500 hover:underline">
                  Edit
                </button>
                <button onClick={() => remove(b.id)} className="text-xs text-red-500 hover:underline">
                  Delete
                </button>
              </div>
            </div>
          ))}
        {banners.length === 0 && <p className="text-sm text-muted-foreground">No banners yet.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// System health / error logs
// ---------------------------------------------------------------
type AdminErrorLog = {
  id: string;
  level: string;
  source: string | null;
  category: string | null;
  message: string;
  stack: string | null;
  url: string | null;
  status: string;
  created_at: string;
};

function SystemHealthTab() {
  const [stats, setStats] = useState<{
    posterCount: number;
    categoryCount: number;
    orderCount: number;
    openErrorCount: number;
  } | null>(null);
  const [logs, setLogs] = useState<AdminErrorLog[] | null>(null);
  const [filter, setFilter] = useState<"open" | "resolved" | "">("open");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    const [h, l] = await Promise.all([
      getSystemHealthAdmin(),
      listErrorLogsAdmin({ data: filter ? { status: filter } : {} }),
    ]);
    setStats(h);
    setLogs(l as AdminErrorLog[]);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const resolve = async (id: string) => {
    await updateErrorLogStatus({ data: { id, status: "resolved" } });
    load();
  };

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">System health</h2>
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Products", value: stats.posterCount },
            { label: "Categories", value: stats.categoryCount },
            { label: "Orders", value: stats.orderCount },
            { label: "Open errors", value: stats.openErrorCount },
          ].map((s) => (
            <div key={s.label} className="rounded-sm border border-border p-4">
              <div className="text-2xl font-semibold">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Error logs</h3>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as "open" | "resolved" | "")}
          className="rounded-sm border border-border bg-background px-3 py-1.5 text-xs"
        >
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="">All</option>
        </select>
      </div>

      {logs === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No errors logged.</p>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="rounded-sm border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                        log.level === "critical" || log.level === "error"
                          ? "bg-red-500/15 text-red-500"
                          : "bg-accent text-muted-foreground"
                      }`}
                    >
                      {log.level}
                    </span>
                    <span className="text-xs text-muted-foreground">{log.source ?? "unknown"}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                  <button
                    onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                    className="mt-1 text-left text-sm hover:underline"
                  >
                    {log.message}
                  </button>
                  {expanded === log.id && (
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {log.url && <div>URL: {log.url}</div>}
                      {log.stack && <pre className="overflow-x-auto whitespace-pre-wrap">{log.stack}</pre>}
                    </div>
                  )}
                </div>
                {log.status === "open" && (
                  <button onClick={() => resolve(log.id)} className="shrink-0 text-xs text-cyan-500 hover:underline">
                    Mark resolved
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// Settings (pricing / shipping)
// ---------------------------------------------------------------
const SETTING_FIELDS: { key: string; label: string }[] = [
  { key: "frame_pvc_20x30", label: "PVC 20×30 (EGP)" },
  { key: "frame_pvc_30x40", label: "PVC 30×40 (EGP)" },
  { key: "frame_pvc_40x50", label: "PVC 40×50 (EGP)" },
  { key: "frame_wood_20x30", label: "Wood 20×30 (EGP)" },
  { key: "frame_wood_30x40", label: "Wood 30×40 (EGP)" },
  { key: "shipping_fee", label: "Shipping fee (EGP)" },
  { key: "free_shipping_threshold", label: "Free shipping over (EGP)" },
];

function SettingsTab() {
  const [values, setValues] = useState<Record<string, string> | null>(null);

  const load = async () => {
    const rows = (await getAllSiteSettingsAdmin()) as Array<{ key: string; value: unknown }>;
    const map: Record<string, string> = {};
    for (const row of rows) map[row.key] = String(row.value);
    setValues(map);
  };
  useEffect(() => {
    load();
  }, []);

  const save = async (key: string) => {
    const raw = values?.[key] ?? "";
    const num = Number(raw);
    try {
      await setSiteSetting({ data: { key, value: Number.isFinite(num) ? num : raw } });
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  if (values === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="max-w-md space-y-4">
      <h2 className="text-lg font-semibold">Pricing & shipping</h2>
      {SETTING_FIELDS.map((f) => (
        <div key={f.key} className="flex items-center gap-2">
          <label className="w-56 text-sm text-muted-foreground">{f.label}</label>
          <input
            value={values[f.key] ?? ""}
            onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
            className="w-28 rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
          />
          <button onClick={() => save(f.key)} className="rounded-sm border border-border px-3 py-1.5 text-xs">
            Save
          </button>
        </div>
      ))}
    </div>
  );
}
