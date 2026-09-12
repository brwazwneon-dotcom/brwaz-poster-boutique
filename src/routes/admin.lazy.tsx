import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  listOrdersAdmin,
  updateOrderStatus,
  getAllSiteSettingsAdmin,
  setSiteSetting,
} from "@/lib/db-admin.functions";

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

type Tab = "products" | "categories" | "orders" | "settings";

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
// Products
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
};

function ProductsTab() {
  const [products, setProducts] = useState<AdminPoster[] | null>(null);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [editing, setEditing] = useState<Partial<AdminPoster> | null>(null);

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
      <div className="mb-4 flex justify-between">
        <h2 className="text-lg font-semibold">Products</h2>
        <button
          onClick={() => setEditing({})}
          className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          + New product
        </button>
      </div>

      {editing && (
        <div className="mb-6 space-y-3 rounded-sm border border-border bg-card p-4">
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
              Hidden
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
      )}

      <div className="space-y-2">
        {products.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-sm border border-border p-3">
            <div className="flex items-center gap-3">
              <img src={p.image_url} alt="" className="h-12 w-9 rounded-sm object-cover" />
              <div>
                <div className="text-sm font-medium">{p.title}</div>
                <div className="text-xs text-muted-foreground">
                  {categoryName(p.category_id)}
                  {p.hidden ? " · hidden" : ""}
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
        {products.length === 0 && <p className="text-sm text-muted-foreground">No products yet.</p>}
      </div>
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
