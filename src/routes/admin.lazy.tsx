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
  findOrCreateCategory,
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
  getGeminiKeysStatusAdmin,
  listCustomersAdmin,
  listPhotoOrdersAdmin,
  updatePhotoOrderStatus,
  listReviewsAdmin,
  upsertReview,
  deleteReview,
  listHighlightsAdmin,
  upsertHighlight,
  deleteHighlight,
  listSliderImagesAdmin,
  upsertSliderImage,
  deleteSliderImage,
  listSetsAdmin,
  upsertSet,
  deleteSet,
  listCustomOffersAdmin,
  upsertCustomOffer,
  deleteCustomOffer,
  listBeforeAfterAdmin,
  upsertBeforeAfter,
  deleteBeforeAfter,
  listPosterImagesAdmin,
  upsertPosterImage,
  deletePosterImage,
  listLandingPagesAdmin,
  upsertLandingPage,
  deleteLandingPage,
  listAllPosterImageUrlsAdmin,
} from "@/lib/db-admin.functions";
import { landingUtmUrl } from "@/lib/landing-pages";
import { uploadPosterImage, listMediaLibraryAdmin, deleteMediaAssetAdmin } from "@/lib/image-upload.functions";

// Build a wa.me link to a CUSTOMER's own number (not the business line —
// see src/lib/whatsapp.ts's whatsappLink, which always targets the
// business number and is unrelated to this admin-side use).
function customerWhatsappLink(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("0") ? `2${digits}` : digits.startsWith("20") ? digits : `20${digits}`;
  return `https://wa.me/${intl}`;
}
import { PERFORMANCE_DEFAULTS, type PerformanceFlags } from "@/lib/performance-flags";
import {
  STOREFRONT_CONTENT_KEY,
  normalizeStorefrontContent,
  type StorefrontContent,
  type TrustPoint,
  type FAQItem,
} from "@/lib/storefront-content";
import {
  MOCKUP_DEFAULTS,
  MOCKUP_KEYS,
  parseMockup,
  type FrameMockup,
  type FrameMockups,
  GRID_DISPLAY_MODE_KEY,
  GRID_DISPLAY_MODE_DEFAULT,
  type GridDisplayMode,
  PHOTO_4X6_KEY,
  PHOTO_4X6_DEFAULTS,
  parsePhoto4x6,
  type Photo4x6Config,
  type Photo4x6Package,
  POST_ORDER_MESSAGE_ENABLED_KEY,
  parsePostOrderMessageEnabled,
} from "@/lib/use-settings";
import { generatePosterMeta, type GeneratedPosterMeta } from "@/lib/poster-ai.functions";
import { optimizeImage } from "@/lib/image-optimize";
import { FramePreview } from "@/components/FramePreview";
import { PosterImageEditor } from "@/components/admin/PosterImageEditor";
import {
  DEFAULT_EDIT_SETTINGS,
  isDefaultEdit,
  loadImage,
  renderEditToBlob,
  type EditSettings,
} from "@/lib/poster-edit";
import { bucketAspect, computeMockupFit, friendlyRatio, type AspectBucket, type MockupFit } from "@/lib/mockup-fit";

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

type Tab =
  | "products"
  | "categories"
  | "orders"
  | "photo-orders"
  | "customers"
  | "reviews"
  | "offers"
  | "sets"
  | "before-after"
  | "landing-pages"
  | "media"
  | "homepage"
  | "mockups"
  | "health"
  | "settings";

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("orders");
  // Tabs mount lazily on first visit but never unmount again — switching
  // away and back (e.g. to double-check a category while reviewing the
  // upload queue) used to wipe all in-progress local state, most painfully
  // the Products upload queue, since a bare `{tab === "x" && <XTab/>}`
  // destroys and recreates the component on every switch.
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(new Set(["orders"]));
  const switchTab = (t: Tab) => {
    setTab(t);
    setVisitedTabs((prev) => (prev.has(t) ? prev : new Set(prev).add(t)));
  };

  const logout = async () => {
    await adminLogout();
    onLogout();
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "orders", label: "Orders" },
    { id: "photo-orders", label: "Photo Orders" },
    { id: "products", label: "Products" },
    { id: "categories", label: "Categories" },
    { id: "customers", label: "Customers" },
    { id: "reviews", label: "Reviews" },
    { id: "offers", label: "Offers" },
    { id: "sets", label: "Sets" },
    { id: "before-after", label: "Before / After" },
    { id: "landing-pages", label: "Landing Pages" },
    { id: "media", label: "Media Library" },
    { id: "homepage", label: "Homepage" },
    { id: "mockups", label: "Frame Mockups" },
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
              onClick={() => switchTab(t.id)}
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
        {visitedTabs.has("orders") && <div hidden={tab !== "orders"}><OrdersTab /></div>}
        {visitedTabs.has("photo-orders") && <div hidden={tab !== "photo-orders"}><PhotoOrdersTab /></div>}
        {visitedTabs.has("products") && <div hidden={tab !== "products"}><ProductsTab /></div>}
        {visitedTabs.has("categories") && <div hidden={tab !== "categories"}><CategoriesTab /></div>}
        {visitedTabs.has("customers") && <div hidden={tab !== "customers"}><CustomersTab /></div>}
        {visitedTabs.has("reviews") && <div hidden={tab !== "reviews"}><ReviewsTab /></div>}
        {visitedTabs.has("offers") && <div hidden={tab !== "offers"}><CustomOffersTab /></div>}
        {visitedTabs.has("sets") && <div hidden={tab !== "sets"}><SetsTab /></div>}
        {visitedTabs.has("before-after") && <div hidden={tab !== "before-after"}><BeforeAfterTab /></div>}
        {visitedTabs.has("landing-pages") && <div hidden={tab !== "landing-pages"}><LandingPagesTab /></div>}
        {visitedTabs.has("media") && <div hidden={tab !== "media"}><MediaLibraryTab /></div>}
        {visitedTabs.has("homepage") && <div hidden={tab !== "homepage"}><HomepageTab /></div>}
        {visitedTabs.has("mockups") && <div hidden={tab !== "mockups"}><FrameMockupsTab /></div>}
        {visitedTabs.has("health") && <div hidden={tab !== "health"}><SystemHealthTab /></div>}
        {visitedTabs.has("settings") && <div hidden={tab !== "settings"}><SettingsTab /></div>}
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
  payment_screenshot: string | null;
  payment_reference: string | null;
  notes: string | null;
  created_at: string;
};

const ORDER_STATUSES = ["new", "confirmed", "processing", "shipped", "delivered", "cancelled", "returned"];

function OrdersTab() {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [printTarget, setPrintTarget] = useState<AdminOrder[] | null>(null);

  const load = async () => {
    const rows = await listOrdersAdmin({ data: filter ? { status: filter } : {} });
    setOrders(rows as AdminOrder[]);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // Print only fires once the packing-slip markup for printTarget has
  // actually rendered — doing it in the click handler would print the
  // previous (empty) print area since setState is async.
  useEffect(() => {
    if (!printTarget) return;
    const id = window.setTimeout(() => {
      window.print();
      setPrintTarget(null);
    }, 50);
    return () => window.clearTimeout(id);
  }, [printTarget]);

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleSelectAll = () => {
    if (!orders) return;
    setSelected((prev) => (prev.size === orders.length ? new Set() : new Set(orders.map((o) => o.id))));
  };
  const printSelected = () => {
    if (!orders) return;
    const rows = orders.filter((o) => selected.has(o.id));
    if (rows.length === 0) return;
    setPrintTarget(rows);
  };

  const exportOrders = async () => {
    if (!orders || orders.length === 0) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const rows = orders.map((o) => ({
        "Order Number": o.order_number ?? o.id.slice(0, 8),
        Date: new Date(o.created_at).toLocaleString(),
        Customer: o.customer_name,
        Phone: o.phone,
        Governorate: o.governorate,
        Address: o.address,
        Poster: o.poster_title ?? "",
        "Frame Type": o.frame_type,
        "Frame Color": o.frame_color,
        Size: o.size,
        Quantity: o.quantity,
        Total: Number(o.total_price ?? 0),
        "Payment Method": o.payment_method,
        "Payment Status": o.payment_status,
        Status: o.status,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Orders");
      XLSX.writeFile(wb, `brwazwneon-orders-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

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
        <button
          onClick={printSelected}
          disabled={selected.size === 0}
          className="ml-auto rounded-sm border border-border px-3 py-1.5 text-xs disabled:opacity-50"
        >
          Print selected ({selected.size})
        </button>
        <button
          onClick={exportOrders}
          disabled={exporting || orders.length === 0}
          className="rounded-sm border border-border px-3 py-1.5 text-xs disabled:opacity-50"
        >
          {exporting ? "Exporting…" : "Export .xlsx"}
        </button>
      </div>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No orders yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-card text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={orders.length > 0 && selected.size === orders.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Payment</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelected(o.id)} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{o.order_number}</td>
                  <td className="px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      {o.poster_image ? (
                        <a href={o.poster_image} target="_blank" rel="noreferrer">
                          <img
                            src={o.poster_image}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-sm border border-border object-cover"
                          />
                        </a>
                      ) : (
                        <div className="h-10 w-10 shrink-0 rounded-sm border border-dashed border-border" />
                      )}
                      <span>
                        {o.poster_title} · {o.size} · {o.frame_type}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div>{o.customer_name}</div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span>
                        {o.phone} · {o.governorate}
                      </span>
                      <a
                        href={customerWhatsappLink(o.phone)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-500 hover:underline"
                        title="Message on WhatsApp"
                      >
                        WA
                      </a>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-medium">{o.total_price} EGP</td>
                  <td className="px-3 py-2 text-xs">
                    <div>
                      {o.payment_method} / {o.payment_status}
                    </div>
                    {o.payment_screenshot && (
                      <a
                        href={o.payment_screenshot}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-500 hover:underline"
                      >
                        View payment proof
                      </a>
                    )}
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
                  <td className="px-3 py-2">
                    <button onClick={() => setPrintTarget([o])} className="text-xs text-cyan-500 hover:underline">
                      Print
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {printTarget && <OrderPackingSlips orders={printTarget} />}
    </div>
  );
}

// Packing-slip print layout. Kept out of normal flow (only rendered
// while actually printing) and isolated via @media print so the rest of
// the admin UI never shows up in the printout.
function OrderPackingSlips({ orders }: { orders: AdminOrder[] }) {
  return (
    <div className="print-area">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; inset: 0; }
        }
        @media screen {
          .print-area { display: none; }
        }
      `}</style>
      {orders.map((o) => (
        <div key={o.id} style={{ pageBreakAfter: "always", padding: "24px", fontFamily: "sans-serif" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>BRWAZWNEON</h1>
          <p style={{ fontSize: 12, color: "#666" }}>Packing slip</p>
          <hr style={{ margin: "12px 0" }} />
          <table style={{ width: "100%", fontSize: 14 }}>
            <tbody>
              <tr>
                <td style={{ fontWeight: 700, paddingRight: 12 }}>Order</td>
                <td>{o.order_number}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700, paddingRight: 12 }}>Customer</td>
                <td>{o.customer_name}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700, paddingRight: 12 }}>Phone</td>
                <td>{o.phone}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700, paddingRight: 12 }}>Governorate</td>
                <td>{o.governorate}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700, paddingRight: 12, verticalAlign: "top" }}>Address</td>
                <td>{o.address}</td>
              </tr>
            </tbody>
          </table>
          <hr style={{ margin: "12px 0" }} />
          {o.poster_image && (
            <img
              src={o.poster_image}
              alt=""
              style={{ maxWidth: 240, maxHeight: 240, objectFit: "contain", marginBottom: 12 }}
            />
          )}
          <table style={{ width: "100%", fontSize: 14 }}>
            <tbody>
              <tr>
                <td style={{ fontWeight: 700, paddingRight: 12 }}>Item</td>
                <td>{o.poster_title}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700, paddingRight: 12 }}>Frame</td>
                <td>
                  {o.frame_type} · {o.frame_color} · {o.size}
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700, paddingRight: 12 }}>Quantity</td>
                <td>{o.quantity}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700, paddingRight: 12 }}>Total</td>
                <td>{o.total_price} EGP</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700, paddingRight: 12 }}>Payment</td>
                <td>
                  {o.payment_method} ({o.payment_status})
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------
// Photo Orders (4x6 printing + general photo printing)
// ---------------------------------------------------------------
type AdminPhotoOrder = {
  id: string;
  order_number: string | null;
  kind: "photo_4x6" | "photo_printing";
  customer_name: string;
  phone: string;
  governorate: string;
  address: string;
  detail: string;
  quantity: number;
  total_price: number;
  status: string;
  photos: string[];
  created_at: string;
};

const PHOTO_ORDER_KIND_LABEL: Record<AdminPhotoOrder["kind"], string> = {
  photo_4x6: "4×6 Printing",
  photo_printing: "Photo Printing",
};

function PhotoOrdersTab() {
  const [orders, setOrders] = useState<AdminPhotoOrder[] | null>(null);

  const load = async () => setOrders((await listPhotoOrdersAdmin()) as AdminPhotoOrder[]);
  useEffect(() => {
    load();
  }, []);

  const changeStatus = async (o: AdminPhotoOrder, status: string) => {
    try {
      await updatePhotoOrderStatus({ data: { id: o.id, kind: o.kind, status } });
      toast.success("Order updated");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  if (orders === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Photo orders</h2>
        <span className="text-xs text-muted-foreground">{orders.length} orders</span>
      </div>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">No photo orders yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-card text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Detail</th>
                <th className="px-3 py-2">Photos</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={`${o.kind}-${o.id}`} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{o.order_number}</td>
                  <td className="px-3 py-2 text-xs">{PHOTO_ORDER_KIND_LABEL[o.kind]}</td>
                  <td className="px-3 py-2">
                    <div>{o.customer_name}</div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span>
                        {o.phone} · {o.governorate}
                      </span>
                      <a
                        href={customerWhatsappLink(o.phone)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-500 hover:underline"
                        title="Message on WhatsApp"
                      >
                        WA
                      </a>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {o.detail} · qty {o.quantity}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {o.photos.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        o.photos.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer">
                            <img
                              src={url}
                              alt=""
                              className="h-10 w-10 rounded-sm border border-border object-cover"
                            />
                          </a>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-medium">{Number(o.total_price)} EGP</td>
                  <td className="px-3 py-2">
                    <select
                      value={o.status}
                      onChange={(e) => changeStatus(o, e.target.value)}
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
  name_ar?: string | null;
  slug: string;
  description?: string | null;
  image: string | null;
  hidden: boolean;
  featured: boolean;
  sort_order: number;
  show_in_header?: boolean;
  show_in_collections?: boolean;
  parent_id?: string | null;
};

function CategoriesTab() {
  const [categories, setCategories] = useState<AdminCategory[] | null>(null);
  const [editing, setEditing] = useState<Partial<AdminCategory> | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => setCategories((await listCategoriesAdmin()) as AdminCategory[]);
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
        <div className="mb-6 grid gap-4 rounded-sm border border-border bg-card p-4 sm:grid-cols-[140px_1fr]">
          <div>
            {editing.image ? (
              <img src={editing.image} alt="" className="aspect-square w-full rounded-sm object-cover" />
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
                  onChange={(e) => setEditing({ ...editing, show_in_collections: e.target.checked })}
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
        {categories
          .filter((c) => !c.parent_id)
          .map((main) => {
            const subs = categories.filter((c) => c.parent_id === main.id);
            return (
              <div key={main.id}>
                <div className="flex items-center justify-between rounded-sm border border-border p-3">
                  <div>
                    <div className="text-sm font-medium">{main.name}</div>
                    <div className="text-xs text-muted-foreground">
                      /{main.slug}
                      {main.hidden ? " · hidden" : ""}
                      {subs.length > 0 ? ` · ${subs.length} subcategories` : ""}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(main)} className="text-xs text-cyan-500 hover:underline">
                      Edit
                    </button>
                    <button onClick={() => remove(main.id)} className="text-xs text-red-500 hover:underline">
                      Delete
                    </button>
                  </div>
                </div>
                <div className="ml-6 mt-1 space-y-1 border-l border-border pl-4">
                  {subs.map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-sm border border-border p-2">
                      <div className="text-xs">
                        {s.name}
                        {s.hidden ? " · hidden" : ""}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setEditing(s)} className="text-xs text-cyan-500 hover:underline">
                          Edit
                        </button>
                        <button onClick={() => remove(s.id)} className="text-xs text-red-500 hover:underline">
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <input
                      value={newSubName[main.id] ?? ""}
                      onChange={(e) => setNewSubName((prev) => ({ ...prev, [main.id]: e.target.value }))}
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
        {categories.length === 0 && <p className="text-sm text-muted-foreground">No categories yet.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Customers — derived from orders grouped by phone
// ---------------------------------------------------------------
type AdminCustomer = {
  phone: string;
  customer_name: string;
  governorate: string;
  order_count: number;
  total_spent: number;
  last_order_at: string;
};

function CustomersTab() {
  const [customers, setCustomers] = useState<AdminCustomer[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => setCustomers((await listCustomersAdmin()) as AdminCustomer[]))();
  }, []);

  const filtered = useMemo(() => {
    if (!customers) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter(
      (c) => c.phone.includes(needle) || c.customer_name.toLowerCase().includes(needle),
    );
  }, [customers, q]);

  if (customers === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Customers</h2>
        <input
          placeholder="Search name or phone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-64 rounded-sm border border-border bg-background px-3 py-1.5 text-sm"
        />
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No customers yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-card text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Governorate</th>
                <th className="px-3 py-2">Orders</th>
                <th className="px-3 py-2">Total spent</th>
                <th className="px-3 py-2">Last order</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.phone} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{c.customer_name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{c.phone}</td>
                  <td className="px-3 py-2 text-xs">{c.governorate}</td>
                  <td className="px-3 py-2">{c.order_count}</td>
                  <td className="px-3 py-2 font-medium">{Number(c.total_spent)} EGP</td>
                  <td className="px-3 py-2 text-xs">{new Date(c.last_order_at).toLocaleDateString()}</td>
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
// Reviews
// ---------------------------------------------------------------
type AdminReview = {
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

function ReviewsTab() {
  const [reviews, setReviews] = useState<AdminReview[] | null>(null);
  const [editing, setEditing] = useState<Partial<AdminReview> | null>(null);

  const load = async () => setReviews((await listReviewsAdmin()) as AdminReview[]);
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!editing?.customer_name) return toast.error("Customer name is required");
    try {
      await upsertReview({ data: editing });
      toast.success("Saved");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this review?")) return;
    await deleteReview({ data: id });
    load();
  };

  const toggleApproved = async (r: AdminReview) => {
    await upsertReview({ data: { ...r, approved: !r.approved } });
    load();
  };

  if (reviews === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <h2 className="text-lg font-semibold">Reviews</h2>
        <button
          onClick={() => setEditing({ rating: 5, approved: true })}
          className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          + New review
        </button>
      </div>

      {editing && (
        <div className="mb-6 space-y-3 rounded-sm border border-border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              placeholder="Customer name"
              value={editing.customer_name ?? ""}
              onChange={(e) => setEditing({ ...editing, customer_name: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              placeholder="Governorate (optional)"
              value={editing.governorate ?? ""}
              onChange={(e) => setEditing({ ...editing, governorate: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <textarea
            placeholder="Review text"
            value={editing.review_text ?? ""}
            onChange={(e) => setEditing({ ...editing, review_text: e.target.value })}
            rows={3}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            placeholder="Photo URL (optional)"
            value={editing.photo_url ?? ""}
            onChange={(e) => setEditing({ ...editing, photo_url: e.target.value })}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              Rating
              <select
                value={editing.rating ?? 5}
                onChange={(e) => setEditing({ ...editing, rating: Number(e.target.value) })}
                className="rounded-sm border border-border bg-background px-2 py-1 text-sm"
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} ★
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.approved !== false}
                onChange={(e) => setEditing({ ...editing, approved: e.target.checked })}
              />
              Approved (visible on site)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(editing.featured)}
                onChange={(e) => setEditing({ ...editing, featured: e.target.checked })}
              />
              Featured
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
        {reviews.map((r) => (
          <div key={r.id} className="flex items-start justify-between gap-3 rounded-sm border border-border p-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                {r.customer_name}
                <span className="text-xs text-muted-foreground">{"★".repeat(r.rating)}</span>
                {!r.approved && (
                  <span className="rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-[10px] uppercase text-amber-500">
                    Pending
                  </span>
                )}
                {r.featured && (
                  <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 text-[10px] uppercase text-primary">
                    Featured
                  </span>
                )}
              </div>
              {r.review_text && <p className="mt-1 truncate text-xs text-muted-foreground">{r.review_text}</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              <button onClick={() => toggleApproved(r)} className="text-xs text-cyan-500 hover:underline">
                {r.approved ? "Unapprove" : "Approve"}
              </button>
              <button onClick={() => setEditing(r)} className="text-xs text-cyan-500 hover:underline">
                Edit
              </button>
              <button onClick={() => remove(r.id)} className="text-xs text-red-500 hover:underline">
                Delete
              </button>
            </div>
          </div>
        ))}
        {reviews.length === 0 && <p className="text-sm text-muted-foreground">No reviews yet.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Offers — admin-curated bundle deals
// ---------------------------------------------------------------
type AdminCustomOffer = {
  id: string;
  title: string;
  subtitle: string | null;
  size: string;
  count: number;
  price: number;
  image_url: string | null;
  badge: string | null;
  sort_order: number;
  enabled: boolean;
};

function CustomOffersTab() {
  const [offers, setOffers] = useState<AdminCustomOffer[] | null>(null);
  const [editing, setEditing] = useState<Partial<AdminCustomOffer> | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => setOffers((await listCustomOffersAdmin()) as AdminCustomOffer[]);
  useEffect(() => {
    load();
  }, []);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const optimized = await optimizeImage(file, { maxDim: 1600, quality: 0.85 });
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
    if (!editing?.title) return toast.error("Title is required");
    if (!editing?.size) return toast.error("Size is required");
    if (!editing?.price) return toast.error("Price is required");
    try {
      await upsertCustomOffer({ data: editing });
      toast.success("Saved");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this offer?")) return;
    await deleteCustomOffer({ data: id });
    load();
  };

  const toggleEnabled = async (o: AdminCustomOffer) => {
    await upsertCustomOffer({ data: { ...o, enabled: !o.enabled } });
    load();
  };

  if (offers === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <div>
          <h2 className="text-lg font-semibold">Offers</h2>
          <p className="text-xs text-muted-foreground">
            Bundle deals shown on /offers alongside the two default bundles.
          </p>
        </div>
        <button
          onClick={() => setEditing({ count: 1 })}
          className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          + New offer
        </button>
      </div>

      {editing && (
        <div className="mb-6 grid gap-4 rounded-sm border border-border bg-card p-4 sm:grid-cols-[160px_1fr]">
          <div>
            {editing.image_url ? (
              <img src={editing.image_url} alt="" className="aspect-square w-full rounded-sm object-cover" />
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
            <input
              placeholder="Title (e.g. 6 Frames Bundle)"
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
            <div className="grid grid-cols-3 gap-3">
              <input
                placeholder="Size (e.g. 20x30)"
                value={editing.size ?? ""}
                onChange={(e) => setEditing({ ...editing, size: e.target.value })}
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                type="number"
                min={1}
                placeholder="Count"
                value={editing.count ?? 1}
                onChange={(e) => setEditing({ ...editing, count: Number(e.target.value) })}
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                type="number"
                min={1}
                placeholder="Price (EGP)"
                value={editing.price ?? ""}
                onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })}
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <input
              placeholder="Badge (optional, e.g. Best Value)"
              value={editing.badge ?? ""}
              onChange={(e) => setEditing({ ...editing, badge: e.target.value })}
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
        {offers.map((o) => (
          <div key={o.id} className="flex items-center justify-between rounded-sm border border-border p-3">
            <div className="flex items-center gap-3">
              {o.image_url ? (
                <img src={o.image_url} alt="" className="h-12 w-12 rounded-sm object-cover" />
              ) : (
                <div className="h-12 w-12 rounded-sm border border-dashed border-border" />
              )}
              <div>
                <div className="text-sm font-medium">{o.title}</div>
                <div className="text-xs text-muted-foreground">
                  {o.count}× {o.size} · {o.price} EGP{o.enabled ? "" : " · disabled"}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => toggleEnabled(o)} className="text-xs text-cyan-500 hover:underline">
                {o.enabled ? "Disable" : "Enable"}
              </button>
              <button onClick={() => setEditing(o)} className="text-xs text-cyan-500 hover:underline">
                Edit
              </button>
              <button onClick={() => remove(o.id)} className="text-xs text-red-500 hover:underline">
                Delete
              </button>
            </div>
          </div>
        ))}
        {offers.length === 0 && <p className="text-sm text-muted-foreground">No custom offers yet.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Sets — curated frame-set bundles (/sets page + homepage teaser)
// ---------------------------------------------------------------
type AdminSet = {
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
  const [sets, setSets] = useState<AdminSet[] | null>(null);
  const [editing, setEditing] = useState<Partial<AdminSet> | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => setSets((await listSetsAdmin()) as AdminSet[]);
  useEffect(() => {
    load();
  }, []);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const optimized = await optimizeImage(file, { maxDim: 1600, quality: 0.85 });
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
    if (!editing?.name) return toast.error("Name is required");
    if (!editing?.price) return toast.error("Price is required");
    try {
      await upsertSet({ data: editing });
      toast.success("Saved");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this set?")) return;
    await deleteSet({ data: id });
    load();
  };

  const toggleEnabled = async (s: AdminSet) => {
    await upsertSet({ data: { ...s, enabled: !s.enabled } });
    load();
  };

  if (sets === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <div>
          <h2 className="text-lg font-semibold">Sets</h2>
          <p className="text-xs text-muted-foreground">
            Curated frame-set bundles shown on /sets and the homepage teaser.
          </p>
        </div>
        <button
          onClick={() => setEditing({ frames_count: 1 })}
          className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          + New set
        </button>
      </div>

      {editing && (
        <div className="mb-6 grid gap-4 rounded-sm border border-border bg-card p-4 sm:grid-cols-[160px_1fr]">
          <div>
            {editing.image_url ? (
              <img src={editing.image_url} alt="" className="aspect-square w-full rounded-sm object-cover" />
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
            <input
              placeholder="Name (e.g. Gallery Wall Set)"
              value={editing.name ?? ""}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <textarea
              placeholder="Description (optional)"
              value={editing.description ?? ""}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              rows={2}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-3 gap-3">
              <input
                type="number"
                min={1}
                placeholder="Frames count"
                value={editing.frames_count ?? 1}
                onChange={(e) => setEditing({ ...editing, frames_count: Number(e.target.value) })}
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                type="number"
                min={1}
                placeholder="Price (EGP)"
                value={editing.price ?? ""}
                onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })}
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                type="number"
                min={0}
                placeholder="Old price (optional)"
                value={editing.old_price ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, old_price: e.target.value ? Number(e.target.value) : null })
                }
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.enabled !== false}
                  onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
                />
                Enabled
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(editing.featured)}
                  onChange={(e) => setEditing({ ...editing, featured: e.target.checked })}
                />
                Featured
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

      <div className="space-y-2">
        {sets.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-sm border border-border p-3">
            <div className="flex items-center gap-3">
              {s.image_url ? (
                <img src={s.image_url} alt="" className="h-12 w-12 rounded-sm object-cover" />
              ) : (
                <div className="h-12 w-12 rounded-sm border border-dashed border-border" />
              )}
              <div>
                <div className="text-sm font-medium">{s.name}</div>
                <div className="text-xs text-muted-foreground">
                  {s.frames_count} frames · {s.price} EGP{s.enabled ? "" : " · disabled"}
                  {s.featured ? " · featured" : ""}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => toggleEnabled(s)} className="text-xs text-cyan-500 hover:underline">
                {s.enabled ? "Disable" : "Enable"}
              </button>
              <button onClick={() => setEditing(s)} className="text-xs text-cyan-500 hover:underline">
                Edit
              </button>
              <button onClick={() => remove(s.id)} className="text-xs text-red-500 hover:underline">
                Delete
              </button>
            </div>
          </div>
        ))}
        {sets.length === 0 && <p className="text-sm text-muted-foreground">No sets yet.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Before / After — showcase pairs shown on homepage, product pages,
// photo-printing, and custom-design.
// ---------------------------------------------------------------
type AdminBeforeAfter = {
  id: string;
  title: string | null;
  description: string | null;
  before_url: string;
  after_url: string;
  location: string;
  sort_order: number;
  active: boolean;
};

const BEFORE_AFTER_LOCATIONS = ["homepage", "product", "photo-printing", "custom-design"] as const;

function BeforeAfterTab() {
  const [items, setItems] = useState<AdminBeforeAfter[] | null>(null);
  const [editing, setEditing] = useState<Partial<AdminBeforeAfter> | null>(null);
  const [uploadingSide, setUploadingSide] = useState<"before" | "after" | null>(null);
  const beforeFileRef = useRef<HTMLInputElement | null>(null);
  const afterFileRef = useRef<HTMLInputElement | null>(null);

  const load = async () => setItems((await listBeforeAfterAdmin()) as AdminBeforeAfter[]);
  useEffect(() => {
    load();
  }, []);

  const handleFile = async (file: File, side: "before" | "after") => {
    setUploadingSide(side);
    try {
      const optimized = await optimizeImage(file, { maxDim: 1600, quality: 0.85 });
      const dataUrl = await fileToDataUrl(optimized);
      const { url } = await uploadPosterImage({ data: { dataUrl, filename: file.name } });
      setEditing((prev) => ({
        ...(prev ?? {}),
        [side === "before" ? "before_url" : "after_url"]: url,
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingSide(null);
    }
  };

  const save = async () => {
    if (!editing?.before_url || !editing?.after_url) return toast.error("Both images are required");
    try {
      await upsertBeforeAfter({ data: editing });
      toast.success("Saved");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this pair?")) return;
    await deleteBeforeAfter({ data: id });
    load();
  };

  const toggleActive = async (item: AdminBeforeAfter) => {
    await upsertBeforeAfter({ data: { ...item, active: !item.active } });
    load();
  };

  if (items === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <div>
          <h2 className="text-lg font-semibold">Before / After</h2>
          <p className="text-xs text-muted-foreground">
            Shown on the homepage, product pages, photo printing, and custom design — filtered by
            location.
          </p>
        </div>
        <button
          onClick={() => setEditing({ location: "homepage" })}
          className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          + New pair
        </button>
      </div>

      {editing && (
        <div className="mb-6 space-y-4 rounded-sm border border-border bg-card p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {(["before", "after"] as const).map((side) => (
              <div key={side}>
                <p className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">
                  {side === "before" ? "Before image" : "After image"}
                </p>
                {editing[side === "before" ? "before_url" : "after_url"] ? (
                  <img
                    src={editing[side === "before" ? "before_url" : "after_url"] as string}
                    alt=""
                    className="aspect-[4/3] w-full rounded-sm object-cover"
                  />
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center rounded-sm border border-dashed border-border text-xs text-muted-foreground">
                    No image
                  </div>
                )}
                <button
                  onClick={() => (side === "before" ? beforeFileRef : afterFileRef).current?.click()}
                  disabled={uploadingSide !== null}
                  className="mt-2 w-full rounded-sm border border-border px-2 py-1.5 text-xs disabled:opacity-50"
                >
                  {uploadingSide === side ? "Uploading…" : "Upload"}
                </button>
                <input
                  ref={side === "before" ? beforeFileRef : afterFileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleFile(e.target.files[0], side);
                    e.target.value = "";
                  }}
                />
              </div>
            ))}
          </div>
          <input
            placeholder="Title (optional)"
            value={editing.title ?? ""}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
          <textarea
            placeholder="Description (optional)"
            value={editing.description ?? ""}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            rows={2}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-4">
            <select
              value={editing.location ?? "homepage"}
              onChange={(e) => setEditing({ ...editing, location: e.target.value })}
              className="rounded-sm border border-border bg-background px-3 py-2 text-sm"
            >
              {BEFORE_AFTER_LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.active !== false}
                onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
              />
              Active
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
        {items.map((it) => (
          <div key={it.id} className="flex items-center justify-between rounded-sm border border-border p-3">
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                <img src={it.before_url} alt="" className="h-12 w-12 rounded-sm object-cover" />
                <img src={it.after_url} alt="" className="h-12 w-12 rounded-sm object-cover" />
              </div>
              <div>
                <div className="text-sm font-medium">{it.title || "Untitled pair"}</div>
                <div className="text-xs text-muted-foreground">
                  {it.location}
                  {it.active ? "" : " · inactive"}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => toggleActive(it)} className="text-xs text-cyan-500 hover:underline">
                {it.active ? "Disable" : "Enable"}
              </button>
              <button onClick={() => setEditing(it)} className="text-xs text-cyan-500 hover:underline">
                Edit
              </button>
              <button onClick={() => remove(it.id)} className="text-xs text-red-500 hover:underline">
                Delete
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground">No before/after pairs yet.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Landing Pages — ad campaign destinations for /landing/$audience.
// One fixed row per audience key, seeded by the migration.
// ---------------------------------------------------------------
type AdminLandingPage = {
  id: string;
  audience_key: string;
  visible: boolean;
  title_ar: string | null;
  title_en: string | null;
  subtitle_ar: string | null;
  subtitle_en: string | null;
  hero_image: string | null;
  whatsapp_message: string | null;
  cta_text: string | null;
  source_category_id: string | null;
  display_mode: "manual" | "category" | "smart_mix";
  poster_limit: number;
  manual_poster_ids: string[];
  seo_title: string | null;
  meta_description: string | null;
};

function LandingPagesTab() {
  const [pages, setPages] = useState<AdminLandingPage[] | null>(null);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [editing, setEditing] = useState<AdminLandingPage | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    const [p, c] = await Promise.all([listLandingPagesAdmin(), listCategoriesAdmin()]);
    setPages(p as AdminLandingPage[]);
    setCategories(c as AdminCategory[]);
  };
  useEffect(() => {
    load();
  }, []);

  const handleHeroFile = async (file: File) => {
    if (!editing) return;
    setUploading(true);
    try {
      const optimized = await optimizeImage(file, { maxDim: 1920, quality: 0.85 });
      const dataUrl = await fileToDataUrl(optimized);
      const { url } = await uploadPosterImage({ data: { dataUrl, filename: file.name } });
      setEditing({ ...editing, hero_image: url });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!editing) return;
    try {
      await upsertLandingPage({ data: editing });
      toast.success("Saved");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const remove = async (p: AdminLandingPage) => {
    if (!confirm(`Delete the "${p.audience_key}" landing page? This can't be undone.`)) return;
    await deleteLandingPage({ data: { id: p.id } });
    toast.success("Deleted");
    load();
  };

  const copyLink = async (audienceKey: string) => {
    const url = landingUtmUrl(window.location.origin, audienceKey);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Ad link copied — paste it into Meta Ads");
    } catch {
      toast.error(url);
    }
  };

  const usedKeys = new Set(pages?.map((p) => p.audience_key) ?? []);
  // "General" is a campaign page not tied to any one category — smart-mix
  // across the whole catalog, for an overall/umbrella ad rather than a
  // per-category one.
  const availableCategories = categories.filter((c) => !usedKeys.has(c.slug));
  const hasGeneral = usedKeys.has("general");

  const createFor = (opts: { audienceKey: string; categoryId: string | null; titleEn: string; titleAr: string }) => {
    setEditing({
      id: "",
      audience_key: opts.audienceKey,
      visible: false,
      title_ar: opts.titleAr,
      title_en: opts.titleEn,
      subtitle_ar: null,
      subtitle_en: null,
      hero_image: null,
      whatsapp_message: null,
      cta_text: null,
      source_category_id: opts.categoryId,
      display_mode: opts.categoryId ? "category" : "smart_mix",
      poster_limit: 24,
      manual_poster_ids: [],
      seo_title: null,
      meta_description: null,
    });
  };

  if (pages === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Landing Pages</h2>
          <p className="text-xs text-muted-foreground">
            Ad campaign destinations at /landing/&#123;audience&#125; — used as Meta Ads links. Each
            page pulls its posters automatically (category or trending/best-seller mix) unless set to
            manual. Make one per category for targeted ads, plus one "General" page for an umbrella
            campaign across everything.
          </p>
        </div>
        {(availableCategories.length > 0 || !hasGeneral) && (
          <select
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              if (v === "__general__") {
                createFor({ audienceKey: "general", categoryId: null, titleEn: "All Posters", titleAr: "كل البوسترات" });
              } else {
                const cat = categories.find((c) => c.id === v);
                if (cat) createFor({ audienceKey: cat.slug, categoryId: cat.id, titleEn: cat.name, titleAr: cat.name_ar || cat.name });
              }
            }}
            className="rounded-sm border border-border bg-background px-3 py-1.5 text-xs"
          >
            <option value="">+ New landing page…</option>
            {!hasGeneral && <option value="__general__">General (all categories)</option>}
            {availableCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {editing ? (
        <div className="mb-6 space-y-4 rounded-sm border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-widest">{editing.audience_key}</h3>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.visible}
                onChange={(e) => setEditing({ ...editing, visible: e.target.checked })}
              />
              Visible (live)
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              placeholder="Title (Arabic)"
              dir="rtl"
              value={editing.title_ar ?? ""}
              onChange={(e) => setEditing({ ...editing, title_ar: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              placeholder="Title (English)"
              value={editing.title_en ?? ""}
              onChange={(e) => setEditing({ ...editing, title_en: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              placeholder="Subtitle (Arabic)"
              dir="rtl"
              value={editing.subtitle_ar ?? ""}
              onChange={(e) => setEditing({ ...editing, subtitle_ar: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              placeholder="Subtitle (English)"
              value={editing.subtitle_en ?? ""}
              onChange={(e) => setEditing({ ...editing, subtitle_en: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <p className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Hero image</p>
            {editing.hero_image ? (
              <img src={editing.hero_image} alt="" className="aspect-[3/1] w-full rounded-sm object-cover" />
            ) : (
              <div className="flex aspect-[3/1] items-center justify-center rounded-sm border border-dashed border-border text-xs text-muted-foreground">
                No image
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="mt-2 rounded-sm border border-border px-2 py-1.5 text-xs disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                if (e.target.files?.[0]) handleHeroFile(e.target.files[0]);
                e.target.value = "";
              }}
            />
          </div>

          <input
            placeholder="WhatsApp message (optional)"
            value={editing.whatsapp_message ?? ""}
            onChange={(e) => setEditing({ ...editing, whatsapp_message: e.target.value })}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            placeholder="CTA button text (optional)"
            value={editing.cta_text ?? ""}
            onChange={(e) => setEditing({ ...editing, cta_text: e.target.value })}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <select
              value={editing.display_mode}
              onChange={(e) =>
                setEditing({ ...editing, display_mode: e.target.value as AdminLandingPage["display_mode"] })
              }
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="smart_mix">Smart mix (trending/best-sellers)</option>
              <option value="category">From a category</option>
              <option value="manual">Manual poster IDs</option>
            </select>
            {editing.display_mode === "category" && (
              <select
                value={editing.source_category_id ?? ""}
                onChange={(e) => setEditing({ ...editing, source_category_id: e.target.value || null })}
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Select category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <input
              type="number"
              min={1}
              max={200}
              placeholder="Poster limit"
              value={editing.poster_limit}
              onChange={(e) => setEditing({ ...editing, poster_limit: Number(e.target.value) || 24 })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          {editing.display_mode === "manual" && (
            <textarea
              placeholder="Poster IDs, one per line (in display order)"
              value={editing.manual_poster_ids.join("\n")}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  manual_poster_ids: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                })
              }
              rows={4}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 font-mono text-xs"
            />
          )}

          <details className="rounded-sm border border-border">
            <summary className="cursor-pointer px-3 py-2 text-xs uppercase tracking-widest text-muted-foreground">
              SEO (optional)
            </summary>
            <div className="space-y-3 border-t border-border p-3">
              <input
                placeholder="SEO title"
                value={editing.seo_title ?? ""}
                onChange={(e) => setEditing({ ...editing, seo_title: e.target.value })}
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
              <textarea
                placeholder="Meta description"
                value={editing.meta_description ?? ""}
                onChange={(e) => setEditing({ ...editing, meta_description: e.target.value })}
                rows={2}
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </details>

          <div className="flex gap-2">
            <button onClick={save} className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
              Save
            </button>
            <button onClick={() => setEditing(null)} className="rounded-sm border border-border px-3 py-1.5 text-xs">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        {pages.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-sm border border-border p-3">
            <div>
              <div className="text-sm font-medium">
                /landing/{p.audience_key} — {p.title_en || p.audience_key}
              </div>
              <div className="text-xs text-muted-foreground">
                {p.display_mode}
                {p.visible ? " · live" : " · hidden"}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => copyLink(p.audience_key)} className="text-xs text-cyan-500 hover:underline">
                Copy ad link
              </button>
              <button onClick={() => setEditing(p)} className="text-xs text-cyan-500 hover:underline">
                Edit
              </button>
              <button onClick={() => remove(p)} className="text-xs text-red-500 hover:underline">
                Delete
              </button>
            </div>
          </div>
        ))}
        {pages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No landing pages yet — use "+ New landing page" above to create one per category, plus a
            general one.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Media Library — every uploaded blob, cross-referenced against products
// so the admin can spot orphaned uploads and safely clean them up.
// ---------------------------------------------------------------
type MediaBlob = { url: string; pathname: string; size: number; uploadedAt: string };

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function MediaLibraryTab() {
  const [blobs, setBlobs] = useState<MediaBlob[] | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [usedUrls, setUsedUrls] = useState<Set<string>>(new Set());
  const [onlyOrphaned, setOnlyOrphaned] = useState(false);

  const loadPage = async (after?: string) => {
    const res = await listMediaLibraryAdmin({ data: after ? { cursor: after } : {} });
    setBlobs((prev) => (after ? [...(prev ?? []), ...res.blobs] : res.blobs));
    setCursor(res.cursor);
    setHasMore(res.hasMore);
  };

  useEffect(() => {
    (async () => {
      // Every upload in this admin (products, gallery images, categories,
      // hero banners, homepage slider, highlights, sets, custom offers,
      // before/after, landing pages, frame mockups) goes through
      // uploadPosterImage into the same "posters/" blob prefix that this
      // library lists — so ALL of these must be cross-referenced, or
      // legitimately-used images from every tab except Products/Hero
      // Banners would incorrectly show up as "Unused".
      const [
        products,
        posterImages,
        banners,
        categories,
        sliderImages,
        highlights,
        sets,
        customOffers,
        beforeAfter,
        landingPages,
        settings,
      ] = await Promise.all([
        listPostersAdmin({ data: {} }),
        listAllPosterImageUrlsAdmin(),
        listHeroBannersAdmin(),
        listCategoriesAdmin(),
        listSliderImagesAdmin(),
        listHighlightsAdmin(),
        listSetsAdmin(),
        listCustomOffersAdmin(),
        listBeforeAfterAdmin(),
        listLandingPagesAdmin(),
        getAllSiteSettingsAdmin(),
      ]);
      const used = new Set<string>();
      for (const p of products as AdminPoster[]) used.add(p.image_url);
      for (const pi of posterImages as Array<{ image_url: string }>) used.add(pi.image_url);
      for (const b of banners as AdminHeroBanner[]) used.add(b.image_url);
      for (const c of categories as AdminCategory[]) if (c.image) used.add(c.image);
      for (const s of sliderImages as AdminSliderImage[]) used.add(s.image_url);
      for (const h of highlights as AdminHighlight[]) if (h.image_url) used.add(h.image_url);
      for (const s of sets as AdminSet[]) if (s.image_url) used.add(s.image_url);
      for (const o of customOffers as AdminCustomOffer[]) if (o.image_url) used.add(o.image_url);
      for (const ba of beforeAfter as AdminBeforeAfter[]) {
        used.add(ba.before_url);
        used.add(ba.after_url);
      }
      for (const lp of landingPages as AdminLandingPage[]) if (lp.hero_image) used.add(lp.hero_image);
      const settingsMap = new Map(
        (settings as Array<{ key: string; value: unknown }>).map((r) => [r.key, r.value]),
      );
      for (const color of MOCKUP_COLORS) {
        const mockup = parseMockup(settingsMap.get(MOCKUP_KEYS[color]), MOCKUP_DEFAULTS[color]);
        if (mockup.image) used.add(mockup.image);
      }
      setUsedUrls(used);
      await loadPage();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      await loadPage(cursor);
    } finally {
      setLoadingMore(false);
    }
  };

  const remove = async (url: string) => {
    if (usedUrls.has(url) && !confirm("This image is used by a product or banner. Delete anyway?")) return;
    if (!usedUrls.has(url) && !confirm("Delete this image permanently?")) return;
    try {
      await deleteMediaAssetAdmin({ data: { url } });
      setBlobs((prev) => prev?.filter((b) => b.url !== url) ?? null);
      toast.success("Deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("URL copied");
    } catch {
      toast.error("Couldn't copy URL");
    }
  };

  if (blobs === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const visible = onlyOrphaned ? blobs.filter((b) => !usedUrls.has(b.url)) : blobs;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Media library</h2>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={onlyOrphaned} onChange={(e) => setOnlyOrphaned(e.target.checked)} />
          Unused only
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">No images found.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {visible.map((b) => (
            <div key={b.url} className="group relative overflow-hidden rounded-sm border border-border">
              <img src={b.url} alt="" className="aspect-square w-full object-cover" />
              {!usedUrls.has(b.url) && (
                <span className="absolute left-1 top-1 rounded-sm bg-amber-500/90 px-1 py-0.5 text-[9px] font-medium text-black">
                  Unused
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/70 p-1 opacity-0 transition group-hover:opacity-100">
                <button onClick={() => copyUrl(b.url)} className="text-[10px] text-white hover:underline">
                  Copy
                </button>
                <button onClick={() => remove(b.url)} className="text-[10px] text-red-400 hover:underline">
                  Delete
                </button>
              </div>
              <div className="border-t border-border bg-card px-1.5 py-1 text-[9px] text-muted-foreground">
                {formatBytes(b.size)}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasMore && !onlyOrphaned && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-4 w-full rounded-sm border border-border py-2 text-xs disabled:opacity-50"
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
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
  description?: string | null;
  image_url: string;
  category_id: string | null;
  badge: string | null;
  hidden: boolean;
  featured: boolean;
  trending: boolean;
  is_best_seller: boolean;
  tags?: string[];
  seo_title?: string | null;
  seo_description?: string | null;
  alt_text?: string | null;
  review_status: string;
};

// Inlined from src/lib/ai-review.ts's pure logic (not imported directly —
// that file also exports a Supabase-backed hook, and importing it would
// pull `@/integrations/supabase/client`'s eager `createClient()` call into
// this Neon-only bundle). Same reasons vocabulary, same 0.75 default
// threshold, just without the admin-configurable-threshold Supabase hook.
type ReviewReason =
  | "low_confidence"
  | "category_unclear"
  | "missing_subcategory"
  | "ai_failed";
const REVIEW_REASON_LABEL: Record<ReviewReason, string> = {
  low_confidence: "Low confidence",
  category_unclear: "Category unclear",
  missing_subcategory: "Missing subcategory",
  ai_failed: "AI analysis failed",
};
const AI_THRESHOLD_DEFAULT = 0.75;
function computeReviewReasons(input: {
  confidence: number | null;
  categoryId: string | null;
  subCategoryId: string | null;
  hasSubsUnderCategory: boolean;
  aiFailed: boolean;
}): ReviewReason[] {
  const reasons: ReviewReason[] = [];
  if (input.aiFailed) reasons.push("ai_failed");
  if (input.confidence != null && input.confidence < AI_THRESHOLD_DEFAULT) reasons.push("low_confidence");
  if (!input.categoryId) reasons.push("category_unclear");
  if (input.categoryId && !input.subCategoryId && input.hasSubsUnderCategory) {
    reasons.push("missing_subcategory");
  }
  return reasons;
}

const REVIEW_LABELS: Record<string, string> = {
  approved: "Approved",
  needs_edit: "Needs review",
};
const REVIEW_BADGE_CLASS: Record<string, string> = {
  needs_edit: "bg-amber-500/15 text-amber-500",
};

type QueueStatus =
  | "queued"
  | "optimizing"
  | "analyzing"
  | "ready"
  | "warning"
  | "fixed"
  | "publishing"
  | "published"
  | "failed";

type QueueItem = {
  id: string;
  file: File; // never mutated — source of truth for re-optimize + archived original
  previewUrl: string;
  status: QueueStatus;
  error?: string;
  productId?: string;

  // Analyze All output
  width: number | null;
  height: number | null;
  ratio: number | null;
  aspectBucket: AspectBucket | null;
  mockupFit: MockupFit;

  // AI (best-effort)
  aiFailed: boolean;
  title: string;
  description: string;
  seo_title: string;
  seo_description: string;
  alt_text: string;
  badge: string | null;
  tags: string[];
  confidence: number;

  // Category — batch-applied via "Apply to All", with a per-item override escape hatch
  categoryId: string | null;
  categoryName: string | null;
  subCategoryId: string | null;
  subCategoryName: string | null;
  categoryOverridden: boolean;

  // Mockup editor
  editSettings: EditSettings | null; // null = DEFAULT_EDIT_SETTINGS applies
  warningAccepted: boolean;

  publishedWithWarning?: boolean;
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
  analyzing: "Analyzing",
  ready: "Ready",
  warning: "Warning",
  fixed: "Fixed",
  publishing: "Publishing",
  published: "Published",
  failed: "Failed",
};
const QUEUE_STATUS_BADGE_CLASS: Record<QueueStatus, string> = {
  queued: "bg-accent text-muted-foreground",
  optimizing: "bg-accent text-muted-foreground",
  analyzing: "bg-accent text-muted-foreground",
  ready: "bg-emerald-500/15 text-emerald-500",
  warning: "bg-amber-500/15 text-amber-500",
  fixed: "bg-cyan-500/15 text-cyan-500",
  publishing: "bg-accent text-muted-foreground",
  published: "bg-emerald-500/15 text-emerald-500",
  failed: "bg-red-500/15 text-red-500",
};

type AdminPosterImage = {
  id: string;
  poster_id: string;
  image_url: string;
  label: string | null;
  kind: string | null;
  sort_order: number;
  is_default: boolean;
};

function PosterGalleryImagesEditor({ posterId }: { posterId: string }) {
  const [images, setImages] = useState<AdminPosterImage[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () =>
    setImages((await listPosterImagesAdmin({ data: { posterId } })) as AdminPosterImage[]);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posterId]);

  const addFiles = async (files: FileList) => {
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const optimized = await optimizeImage(file, { maxDim: 1600, quality: 0.85 });
        const dataUrl = await fileToDataUrl(optimized);
        const { url } = await uploadPosterImage({ data: { dataUrl, filename: file.name } });
        await upsertPosterImage({
          data: { poster_id: posterId, image_url: url, sort_order: images?.length ?? 0 },
        });
      }
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: string) => {
    await deletePosterImage({ data: id });
    load();
  };

  return (
    <details className="rounded-sm border border-border">
      <summary className="cursor-pointer px-3 py-2 text-xs uppercase tracking-widest text-muted-foreground">
        Gallery images (optional)
      </summary>
      <div className="space-y-3 border-t border-border p-3">
        <p className="text-xs text-muted-foreground">
          Extra angle/detail photos shown as a thumbnail strip on the product page, alongside the
          main frame preview.
        </p>
        {images === null ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {images.map((img) => (
              <div key={img.id} className="group relative aspect-square overflow-hidden rounded-sm border border-border">
                <img src={img.image_url} alt="" className="h-full w-full object-cover" />
                <button
                  onClick={() => remove(img.id)}
                  className="absolute inset-0 flex items-center justify-center bg-background/80 text-xs opacity-0 transition group-hover:opacity-100"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="rounded-sm border border-border px-2 py-1.5 text-xs disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "+ Add images"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </details>
  );
}

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
  const [onlyNeedsReview, setOnlyNeedsReview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const categoriesRef = useRef<AdminCategory[]>([]);
  categoriesRef.current = categories;

  // ---- Bulk Smart Upload Studio ----
  const [applyCategoryId, setApplyCategoryId] = useState("");
  const [applySubCategoryId, setApplySubCategoryId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newSubCategoryName, setNewSubCategoryName] = useState("");
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const [gridFilter, setGridFilter] = useState<"all" | "warning">("all");
  const [gridPage, setGridPage] = useState(0);
  const [overrideOpenId, setOverrideOpenId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [mockupFrameColor, setMockupFrameColor] = useState<"black" | "white" | "wood">("black");
  const GRID_PAGE_SIZE = 60;

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

  // ---- Bulk Smart Upload Studio ----
  // Select -> Analyze All (optimize + measure mockup fit + AI metadata, no
  // upload yet) -> pick category/subcategory once and Apply to All -> fix
  // or accept any mockup-fit warnings -> Publish All (uploads + creates the
  // posters). A discarded item never touched the network, so it leaves no
  // orphaned blob or DB row.
  const updateQueueItem = (id: string, patch: Partial<QueueItem>) =>
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));

  // ---- Analyze All: optimize -> measure dimensions/mockup fit -> AI
  // metadata on the local data URL. Category is deliberately NOT resolved
  // here — it's chosen once, after analysis, via Apply to All below. ----
  const analyzeItem = async (item: QueueItem) => {
    try {
      updateQueueItem(item.id, { status: "optimizing", error: undefined });
      const optimized = await optimizeImage(item.file, { maxDim: 2000, quality: 0.85 });

      const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const probe = new Image();
        probe.onload = () => resolve({ w: probe.naturalWidth, h: probe.naturalHeight });
        probe.onerror = () => reject(new Error("Could not read image dimensions"));
        probe.src = item.previewUrl;
      });
      const ratio = dims.w / dims.h;
      const aspectBucket = bucketAspect(ratio);
      const mockupFit = computeMockupFit(ratio);
      updateQueueItem(item.id, {
        status: "analyzing",
        width: dims.w,
        height: dims.h,
        ratio,
        aspectBucket,
        mockupFit,
      });

      let meta: Partial<GeneratedPosterMeta> = {};
      let aiFailed = false;
      try {
        const dataUrl = await fileToDataUrl(optimized);
        meta = await generatePosterMeta({
          data: { imageUrl: dataUrl, filename: item.file.name, categories: [] },
        });
      } catch {
        // AI assist is best-effort: a failure here still leaves a usable
        // draft (filename-derived title). It's folded into review_status
        // at publish time, never blocks the flow here.
        aiFailed = true;
      }

      updateQueueItem(item.id, {
        status: mockupFit.ok ? "ready" : "warning",
        aiFailed,
        title: meta.title || filenameToTitle(item.file.name),
        description: meta.description || "",
        seo_title: meta.seo_title || "",
        seo_description: meta.seo_description || "",
        alt_text: meta.alt_text || "",
        badge: meta.badge ?? null,
        tags: meta.tags ?? [],
        confidence: aiFailed ? 0 : typeof meta.confidence === "number" ? meta.confidence : 1,
      });
    } catch (err) {
      updateQueueItem(item.id, {
        status: "failed",
        error: err instanceof Error ? err.message : "Analysis failed",
      });
    }
  };

  // ---- Publish All: bake any manual crop, upload web + archival original,
  // create the poster. review_status folds in both the mockup-fit warning
  // (if published anyway) and any AI-quality reasons, reusing the same
  // "Needs review" system already live on the product list below. ----
  const publishItem = async (item: QueueItem) => {
    updateQueueItem(item.id, { status: "publishing", error: undefined });
    try {
      let toOptimize: File = item.file;
      if (item.editSettings && !isDefaultEdit(item.editSettings)) {
        const img = await loadImage(item.previewUrl);
        const outH = 2400;
        const outW = Math.round(outH * item.editSettings.ratio);
        const blob = await renderEditToBlob(img, item.editSettings, outW, outH, 0.92);
        toOptimize = new File([blob], item.file.name.replace(/\.[^.]+$/, "") + "-edited.jpg", {
          type: "image/jpeg",
        });
      }
      const optimized = await optimizeImage(toOptimize, { maxDim: 2000, quality: 0.85 });
      const [webDataUrl, originalDataUrl] = await Promise.all([
        fileToDataUrl(optimized),
        fileToDataUrl(item.file),
      ]);
      const [{ url: imageUrl }, { url: originalUrl }] = await Promise.all([
        uploadPosterImage({ data: { dataUrl: webDataUrl, filename: item.file.name } }),
        uploadPosterImage({ data: { dataUrl: originalDataUrl, filename: item.file.name } }),
      ]);

      const hasSubs = categoriesRef.current.some((c) => c.parent_id === item.categoryId);
      const reasons = computeReviewReasons({
        confidence: item.confidence,
        categoryId: item.categoryId,
        subCategoryId: item.subCategoryId,
        hasSubsUnderCategory: hasSubs,
        aiFailed: item.aiFailed,
      });
      const needsEdit = Boolean(item.publishedWithWarning) || reasons.length > 0;

      const { id: productId } = await upsertPoster({
        data: {
          title: item.title || filenameToTitle(item.file.name),
          image_url: imageUrl,
          original_url: originalUrl,
          edit_settings: item.editSettings ?? DEFAULT_EDIT_SETTINGS,
          category_id: item.subCategoryId ?? item.categoryId ?? null,
          badge: item.badge,
          tags: item.tags,
          seo_title: item.seo_title || null,
          seo_description: item.seo_description || null,
          alt_text: item.alt_text || null,
          description: item.description || null,
          hidden: false,
          trending: false,
          review_status: needsEdit ? "needs_edit" : "approved",
        },
      });
      updateQueueItem(item.id, { status: "published", productId });
      load();
    } catch (err) {
      updateQueueItem(item.id, {
        status: "failed",
        error: err instanceof Error ? err.message : "Publish failed",
      });
    }
  };

  // 9 rotating Gemini keys are configured, so a higher concurrency spreads
  // load across them instead of one key eating the whole rate limit.
  const MAX_CONCURRENT = 8;
  const activeCountRef = useRef(0);
  const pendingRef = useRef<QueueItem[]>([]);
  const pump = () => {
    while (activeCountRef.current < MAX_CONCURRENT && pendingRef.current.length > 0) {
      const item = pendingRef.current.shift();
      if (!item) break;
      activeCountRef.current++;
      analyzeItem(item).finally(() => {
        activeCountRef.current--;
        pump();
      });
    }
  };

  // Separate pump for publishing, so "Publish All" can fan many items out
  // at once without competing with any still-in-flight analysis.
  const publishActiveCountRef = useRef(0);
  const publishPendingRef = useRef<QueueItem[]>([]);
  const pumpPublish = () => {
    while (publishActiveCountRef.current < MAX_CONCURRENT && publishPendingRef.current.length > 0) {
      const item = publishPendingRef.current.shift();
      if (!item) break;
      publishActiveCountRef.current++;
      publishItem(item).finally(() => {
        publishActiveCountRef.current--;
        pumpPublish();
      });
    }
  };
  const queuePublish = (item: QueueItem) => {
    publishPendingRef.current.push(item);
    pumpPublish();
  };

  // ---- Select Images: only enqueues. Analysis is a deliberate next step. ----
  const addFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (incoming.length === 0) return;
    const items: QueueItem[] = incoming.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: "queued",
      width: null,
      height: null,
      ratio: null,
      aspectBucket: null,
      mockupFit: { ok: true, reason: null },
      aiFailed: false,
      title: "",
      description: "",
      seo_title: "",
      seo_description: "",
      alt_text: "",
      badge: null,
      tags: [],
      confidence: 1,
      categoryId: null,
      categoryName: null,
      subCategoryId: null,
      subCategoryName: null,
      categoryOverridden: false,
      editSettings: null,
      warningAccepted: false,
    }));
    setQueue((prev) => [...prev, ...items]);
  };

  const startAnalysis = () => {
    const toAnalyze = queue.filter((q) => q.status === "queued");
    if (toAnalyze.length === 0) return;
    pendingRef.current.push(...toAnalyze);
    pump();
  };

  const retryItem = (item: QueueItem) => {
    if (item.width === null) {
      updateQueueItem(item.id, { status: "queued", error: undefined });
      pendingRef.current.push({ ...item, status: "queued" });
      pump();
    } else {
      updateQueueItem(item.id, { status: item.mockupFit.ok ? "ready" : "warning", error: undefined });
      queuePublish(item);
    }
  };

  const discardItem = (item: QueueItem) => {
    URL.revokeObjectURL(item.previewUrl);
    setQueue((prev) => prev.filter((q) => q.id !== item.id));
  };

  const clearPublished = () => setQueue((prev) => prev.filter((q) => q.status !== "published"));

  // ---- Top Control Bar: pick category+subcategory once, apply to every
  // queued image, with a per-item override escape hatch for stragglers. ----
  const addTopCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      const { id } = await upsertCategory({ data: { name } });
      const newCat = { id, name, slug: id, parent_id: null } as AdminCategory;
      categoriesRef.current = [...categoriesRef.current, newCat];
      setCategories((prev) => [...prev, newCat]);
      setApplyCategoryId(id);
      setApplySubCategoryId("");
      setNewCategoryName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add category");
    }
  };

  const addTopSubCategory = async () => {
    if (!applyCategoryId) return;
    const name = newSubCategoryName.trim();
    if (!name) return;
    try {
      const { id, created } = await findOrCreateCategory({ data: { name, parentId: applyCategoryId } });
      if (created) {
        const newCat = { id, name, slug: id, parent_id: applyCategoryId } as AdminCategory;
        categoriesRef.current = [...categoriesRef.current, newCat];
        setCategories((prev) => [...prev, newCat]);
      }
      setApplySubCategoryId(id);
      setNewSubCategoryName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add subcategory");
    }
  };

  const requestApplyToAll = () => {
    if (!applyCategoryId) {
      toast.error("Pick a category first");
      return;
    }
    if (queue.length === 0) return;
    setShowApplyConfirm(true);
  };

  const confirmApplyToAll = () => {
    const catName = categories.find((c) => c.id === applyCategoryId)?.name ?? null;
    const subName = applySubCategoryId
      ? (categories.find((c) => c.id === applySubCategoryId)?.name ?? null)
      : null;
    setQueue((prev) =>
      prev.map((q) => ({
        ...q,
        categoryId: applyCategoryId,
        categoryName: catName,
        subCategoryId: applySubCategoryId || null,
        subCategoryName: subName,
        categoryOverridden: false,
      })),
    );
    setShowApplyConfirm(false);
    toast.success(`Applied ${catName}${subName ? ` → ${subName}` : ""} to ${queue.length} image(s)`);
  };

  const overrideItemCategory = (item: QueueItem, categoryId: string | null, subCategoryId: string | null) => {
    const catName = categoryId ? (categories.find((c) => c.id === categoryId)?.name ?? null) : null;
    const subName = subCategoryId ? (categories.find((c) => c.id === subCategoryId)?.name ?? null) : null;
    updateQueueItem(item.id, {
      categoryId,
      categoryName: catName,
      subCategoryId,
      subCategoryName: subName,
      categoryOverridden: true,
    });
  };

  const overriddenCount = queue.filter((q) => q.categoryOverridden).length;
  const readyCount = queue.filter((q) => q.status === "ready").length;
  const warningCount = queue.filter((q) => q.status === "warning").length;
  const fixedCount = queue.filter((q) => q.status === "fixed").length;
  const publishedCount = queue.filter((q) => q.status === "published").length;
  const publishableCount = readyCount + fixedCount + warningCount;

  const runPublishAll = () => {
    const targets = queue.filter((q) => q.status === "ready" || q.status === "fixed");
    targets.forEach(queuePublish);
  };

  const requestPublishAll = () => {
    const unresolvedWarnings = queue.filter((q) => q.status === "warning" && !q.warningAccepted);
    if (unresolvedWarnings.length > 0) {
      setPublishDialogOpen(true);
      return;
    }
    runPublishAll();
  };

  const publishAsIs = () => {
    setQueue((prev) =>
      prev.map((q) =>
        q.status === "warning" ? { ...q, warningAccepted: true, publishedWithWarning: true } : q,
      ),
    );
    setPublishDialogOpen(false);
    // Publish everything ready/fixed, plus the warnings just accepted.
    const targets = queue.filter((q) => q.status === "ready" || q.status === "fixed" || q.status === "warning");
    targets.forEach((q) => queuePublish({ ...q, warningAccepted: true, publishedWithWarning: q.status === "warning" || q.publishedWithWarning }));
  };

  const fixImagesInstead = () => {
    setPublishDialogOpen(false);
    setGridFilter("warning");
    setGridPage(0);
    const firstWarning = queue.find((q) => q.status === "warning");
    if (firstWarning) setEditingItemId(firstWarning.id);
  };

  // ---- Selection + bulk actions ----
  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearSelection = () => setSelected(new Set());

  const applyBulk = async (patch: {
    category_id?: string;
    badge?: string | null;
    hidden?: boolean;
    trending?: boolean;
    is_best_seller?: boolean;
  }) => {
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
    const ids = Array.from(selected);
    const results = await Promise.allSettled(ids.map((id) => deletePoster({ data: id })));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (ids.length - failed > 0) toast.success(`Deleted ${ids.length - failed} product(s)`);
    if (failed > 0) toast.error(`${failed} product(s) failed to delete`);
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
    try {
      await deletePoster({ data: id });
      toast.success("Deleted");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const markReviewed = async (id: string) => {
    try {
      await bulkUpdatePosters({ data: { ids: [id], patch: { review_status: "approved" } } });
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark reviewed");
    }
  };

  if (products === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const visibleProducts = onlyNeedsReview
    ? products.filter((p) => p.review_status !== "approved")
    : products;

  const gridItems = gridFilter === "warning" ? queue.filter((q) => q.status === "warning") : queue;
  const totalPages = Math.max(1, Math.ceil(gridItems.length / GRID_PAGE_SIZE));
  const pagedItems = gridItems.slice(gridPage * GRID_PAGE_SIZE, (gridPage + 1) * GRID_PAGE_SIZE);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Products</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={onlyNeedsReview}
              onChange={(e) => setOnlyNeedsReview(e.target.checked)}
            />
            Needs review only
          </label>
          <button
            onClick={() => setEditing({})}
            className="rounded-sm border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            + Single product (advanced)
          </button>
        </div>
      </div>

      {/* ---- 1. Select Images ---- */}
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
        <p className="text-sm font-medium">+ SELECT IMAGES — drag & drop, or click to browse</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Add 10, 100, or 500+ at once · nothing is analyzed or published automatically
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

      {queue.length > 0 && (
        <div className="mb-6 rounded-sm border border-border bg-card">
          {/* ---- 2. Analyze All ---- */}
          {queue.some((q) => q.status === "queued") && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
              <span className="text-xs text-muted-foreground">
                {queue.length} image(s) selected ·{" "}
                {queue.filter((q) => q.status !== "queued").length} analyzed
              </span>
              <button
                onClick={startAnalysis}
                className="rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground"
              >
                Analyze Images
              </button>
            </div>
          )}

          {/* ---- 3. Top Control Bar ---- */}
          {queue.some((q) => q.status !== "queued") && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2">
              <select
                value={applyCategoryId}
                onChange={(e) => {
                  setApplyCategoryId(e.target.value);
                  setApplySubCategoryId("");
                }}
                className="rounded-sm border border-border bg-background px-2 py-1.5 text-xs"
              >
                <option value="">Category…</option>
                {categories
                  .filter((c) => !c.parent_id)
                  .map((main) => (
                    <option key={main.id} value={main.id}>
                      {main.name}
                    </option>
                  ))}
              </select>
              <input
                placeholder="+ New category"
                dir="ltr"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addTopCategory();
                }}
                className="w-28 rounded-sm border border-border bg-background px-2 py-1.5 text-xs"
              />
              <button
                onClick={addTopCategory}
                disabled={!newCategoryName.trim()}
                className="rounded-sm border border-border px-2 py-1.5 text-xs disabled:opacity-40"
              >
                Add
              </button>

              <select
                value={applySubCategoryId}
                disabled={!applyCategoryId}
                onChange={(e) => setApplySubCategoryId(e.target.value)}
                className="rounded-sm border border-border bg-background px-2 py-1.5 text-xs disabled:opacity-50"
              >
                <option value="">Subcategory (optional)…</option>
                {categories
                  .filter((c) => c.parent_id === applyCategoryId)
                  .map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name}
                    </option>
                  ))}
              </select>
              <input
                placeholder="+ New subcategory"
                dir="ltr"
                disabled={!applyCategoryId}
                value={newSubCategoryName}
                onChange={(e) => setNewSubCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addTopSubCategory();
                }}
                className="w-28 rounded-sm border border-border bg-background px-2 py-1.5 text-xs disabled:opacity-50"
              />
              <button
                onClick={addTopSubCategory}
                disabled={!applyCategoryId || !newSubCategoryName.trim()}
                className="rounded-sm border border-border px-2 py-1.5 text-xs disabled:opacity-40"
              >
                Add
              </button>

              <button
                onClick={requestApplyToAll}
                disabled={!applyCategoryId}
                className="rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground disabled:opacity-40"
              >
                Apply to All
              </button>

              <div className="ml-auto flex flex-wrap items-center gap-3">
                {warningCount > 0 && gridFilter === "all" && (
                  <button
                    onClick={() => {
                      setGridFilter("warning");
                      setGridPage(0);
                    }}
                    className="text-xs text-amber-500 hover:underline"
                  >
                    {warningCount} need attention
                  </button>
                )}
                {gridFilter === "warning" && (
                  <button
                    onClick={() => {
                      setGridFilter("all");
                      setGridPage(0);
                    }}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    Show all
                  </button>
                )}
                <span className="text-xs text-muted-foreground">
                  {readyCount} ready · {warningCount} warning · {fixedCount} fixed · {publishedCount} published
                </span>
                <button
                  onClick={requestPublishAll}
                  disabled={publishableCount === 0}
                  className="rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground disabled:opacity-40"
                >
                  Publish All ({publishableCount})
                </button>
                <button onClick={clearPublished} className="text-xs text-muted-foreground hover:text-foreground">
                  Clear published
                </button>
              </div>
            </div>
          )}

          {/* ---- 4. Image Grid ---- */}
          <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {pagedItems.map((q) => (
              <div
                key={q.id}
                className={`group relative overflow-hidden rounded-sm border bg-background ${
                  q.status === "warning"
                    ? "border-amber-500"
                    : q.status === "failed"
                      ? "border-red-500"
                      : "border-border"
                }`}
              >
                <div
                  className="aspect-square cursor-pointer bg-muted"
                  onClick={() => {
                    if (q.status === "warning" || q.status === "fixed") setEditingItemId(q.id);
                  }}
                >
                  <img src={q.previewUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                </div>
                {q.categoryOverridden && (
                  <span className="absolute left-1 top-1 rounded-sm bg-primary px-1.5 py-0.5 text-[9px] uppercase text-primary-foreground">
                    Override
                  </span>
                )}
                <button
                  onClick={() => discardItem(q)}
                  className="absolute right-1 top-1 rounded-sm bg-background/80 px-1 py-0.5 text-[10px] text-red-500 opacity-0 transition group-hover:opacity-100"
                >
                  ✕
                </button>
                <div className="space-y-0.5 border-t border-border bg-background px-1.5 py-1 text-[9px]">
                  <div className="truncate font-medium">{q.title || q.file.name}</div>
                  {q.width && q.ratio !== null && (
                    <div className="text-muted-foreground">
                      {q.width}×{q.height} · {friendlyRatio(q.ratio)}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`rounded-sm px-1 py-0.5 uppercase tracking-wide ${QUEUE_STATUS_BADGE_CLASS[q.status]}`}
                    >
                      {q.status === "warning"
                        ? "⚠ Warning"
                        : q.status === "ready" || q.status === "fixed"
                          ? "✓ Good fit"
                          : QUEUE_STATUS_LABEL[q.status]}
                    </span>
                    {q.status === "failed" && (
                      <button onClick={() => retryItem(q)} className="text-cyan-500 hover:underline">
                        Retry
                      </button>
                    )}
                  </div>
                  {q.status === "warning" && q.mockupFit.reason && (
                    <div className="text-amber-500">{q.mockupFit.reason}</div>
                  )}
                  <button
                    onClick={() => setOverrideOpenId(overrideOpenId === q.id ? null : q.id)}
                    className="block w-full truncate text-left text-cyan-500 hover:underline"
                  >
                    {q.categoryName ?? "No category"}
                    {q.subCategoryName ? ` > ${q.subCategoryName}` : ""}
                  </button>
                </div>
                {overrideOpenId === q.id && (
                  <div className="absolute inset-0 z-10 flex flex-col gap-1 bg-background/95 p-2 text-[10px]">
                    <select
                      value={q.categoryId ?? ""}
                      onChange={(e) => overrideItemCategory(q, e.target.value || null, null)}
                      className="rounded-sm border border-border bg-background px-1 py-1"
                    >
                      <option value="">No category</option>
                      {categories
                        .filter((c) => !c.parent_id)
                        .map((main) => (
                          <option key={main.id} value={main.id}>
                            {main.name}
                          </option>
                        ))}
                    </select>
                    <select
                      value={q.subCategoryId ?? ""}
                      disabled={!q.categoryId}
                      onChange={(e) => overrideItemCategory(q, q.categoryId, e.target.value || null)}
                      className="rounded-sm border border-border bg-background px-1 py-1 disabled:opacity-50"
                    >
                      <option value="">No subcategory</option>
                      {categories
                        .filter((c) => c.parent_id === q.categoryId)
                        .map((sub) => (
                          <option key={sub.id} value={sub.id}>
                            {sub.name}
                          </option>
                        ))}
                    </select>
                    <button
                      onClick={() => setOverrideOpenId(null)}
                      className="rounded-sm border border-border py-1 hover:bg-accent"
                    >
                      Done
                    </button>
                  </div>
                )}
              </div>
            ))}
            {pagedItems.length === 0 && (
              <p className="col-span-full py-6 text-center text-xs text-muted-foreground">
                {gridFilter === "warning" ? "No images need attention." : "No images yet."}
              </p>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 border-t border-border py-2 text-xs">
              <button
                disabled={gridPage === 0}
                onClick={() => setGridPage((p) => p - 1)}
                className="disabled:opacity-40"
              >
                Prev
              </button>
              <span className="text-muted-foreground">
                Page {gridPage + 1} / {totalPages}
              </span>
              <button
                disabled={gridPage >= totalPages - 1}
                onClick={() => setGridPage((p) => p + 1)}
                className="disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}

          {/* ---- 5. Publish Bar ---- */}
          {queue.some((q) => q.status !== "queued") && (
            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-4 py-2">
              <span className="text-xs text-muted-foreground">
                {readyCount} ready · {warningCount} warning · {fixedCount} fixed · {publishedCount} published
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={requestPublishAll}
                  disabled={publishableCount === 0}
                  className="rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground disabled:opacity-40"
                >
                  Publish All ({publishableCount})
                </button>
                <button onClick={clearPublished} className="text-xs text-muted-foreground hover:text-foreground">
                  Clear published
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- Publish dialog ---- */}
      {publishDialogOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-sm border border-border bg-card p-5">
            <p className="text-sm">{warningCount} images may not fit correctly inside the mockup.</p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={publishAsIs}
                className="rounded-sm bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground"
              >
                Publish As Is
              </button>
              <button
                onClick={fixImagesInstead}
                className="rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
              >
                Fix Images
              </button>
              <button
                onClick={() => setPublishDialogOpen(false)}
                className="text-xs text-muted-foreground hover:underline"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Apply to All confirm ---- */}
      {showApplyConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-sm border border-border bg-card p-5">
            <p className="text-sm">
              Apply {categories.find((c) => c.id === applyCategoryId)?.name}
              {applySubCategoryId ? ` → ${categories.find((c) => c.id === applySubCategoryId)?.name}` : ""} to{" "}
              {queue.length} image(s)?
              {overriddenCount > 0 &&
                ` ${overriddenCount} of these have a manual override that will be replaced.`}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowApplyConfirm(false)}
                className="rounded-sm border border-border px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={confirmApplyToAll}
                className="rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
              >
                {overriddenCount > 0 ? "Apply Anyway" : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Mockup Editor ---- */}
      {editingItemId &&
        (() => {
          const item = queue.find((q) => q.id === editingItemId);
          if (!item) return null;
          return (
            <PosterImageEditor
              source={item.file}
              initial={item.editSettings ?? undefined}
              mockupFrame={mockupFrameColor}
              onCancel={() => setEditingItemId(null)}
              onSave={(s) => {
                updateQueueItem(item.id, {
                  editSettings: s,
                  status: item.status === "warning" ? "fixed" : item.status,
                  warningAccepted: item.status === "warning" ? true : item.warningAccepted,
                });
                setEditingItemId(null);
                toast.success("Saved — applied when published");
              }}
            />
          );
        })()}

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
            {categories
              .filter((c) => !c.parent_id)
              .map((main) => {
                const subs = categories.filter((c) => c.parent_id === main.id);
                return (
                  <optgroup key={main.id} label={main.name}>
                    <option value={main.id}>{main.name}</option>
                    {subs.map((s) => (
                      <option key={s.id} value={s.id}>
                        — {s.name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
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
          <button onClick={() => applyBulk({ is_best_seller: true })} className="rounded-sm border border-border px-2 py-1 text-xs">
            + Best Seller
          </button>
          <button onClick={() => applyBulk({ is_best_seller: false })} className="rounded-sm border border-border px-2 py-1 text-xs">
            − Best Seller
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
              dir="ltr"
              value={editing.title ?? ""}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              placeholder="Image URL"
              dir="ltr"
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
              {categories
                .filter((c) => !c.parent_id)
                .map((main) => {
                  const subs = categories.filter((c) => c.parent_id === main.id);
                  return (
                    <optgroup key={main.id} label={main.name}>
                      <option value={main.id}>{main.name}</option>
                      {subs.map((s) => (
                        <option key={s.id} value={s.id}>
                          — {s.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
            </select>
            <input
              placeholder="Badge (e.g. New, Sale) — optional"
              dir="ltr"
              value={editing.badge ?? ""}
              onChange={(e) => setEditing({ ...editing, badge: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <details className="rounded-sm border border-border">
              <summary className="cursor-pointer px-3 py-2 text-xs uppercase tracking-widest text-muted-foreground">
                SEO (optional)
              </summary>
              <div className="space-y-3 border-t border-border p-3">
                <input
                  placeholder="SEO title (falls back to product title)"
                  dir="ltr"
                  value={editing.seo_title ?? ""}
                  onChange={(e) => setEditing({ ...editing, seo_title: e.target.value })}
                  className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
                />
                <textarea
                  placeholder="SEO description (falls back to a default)"
                  dir="ltr"
                  value={editing.seo_description ?? ""}
                  onChange={(e) => setEditing({ ...editing, seo_description: e.target.value })}
                  rows={2}
                  className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
                />
                <input
                  placeholder="Image alt text"
                  dir="ltr"
                  value={editing.alt_text ?? ""}
                  onChange={(e) => setEditing({ ...editing, alt_text: e.target.value })}
                  className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            </details>
            {editing.id && <PosterGalleryImagesEditor posterId={editing.id} />}
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
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(editing.is_best_seller)}
                  onChange={(e) => setEditing({ ...editing, is_best_seller: e.target.checked })}
                />
                Best Seller
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
        {visibleProducts.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-sm border border-border p-3">
            <div className="flex items-center gap-3">
              <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelected(p.id)} />
              <img src={p.image_url} alt="" className="h-12 w-9 rounded-sm object-cover" />
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  {p.title}
                  {p.review_status !== "approved" && (
                    <span
                      className={`rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                        REVIEW_BADGE_CLASS[p.review_status] ?? "bg-accent text-muted-foreground"
                      }`}
                    >
                      {REVIEW_LABELS[p.review_status] ?? p.review_status}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {categoryName(p.category_id)}
                  {p.hidden ? " · draft" : " · published"}
                  {p.trending ? " · trending" : ""}
                  {p.is_best_seller ? " · best seller" : ""}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {p.review_status !== "approved" && (
                <button onClick={() => markReviewed(p.id)} className="text-xs text-emerald-500 hover:underline">
                  Mark reviewed
                </button>
              )}
              <button onClick={() => setEditing(p)} className="text-xs text-cyan-500 hover:underline">
                Edit
              </button>
              <button onClick={() => remove(p.id)} className="text-xs text-red-500 hover:underline">
                Delete
              </button>
            </div>
          </div>
        ))}
        {visibleProducts.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {onlyNeedsReview ? "Nothing needs review." : "No products yet — drop some images above."}
          </p>
        )}
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

      <div className="mt-10 border-t border-border pt-8">
        <SliderImagesSection />
      </div>

      <div className="mt-10 border-t border-border pt-8">
        <HighlightsSection />
      </div>

      <div className="mt-10 border-t border-border pt-8">
        <TrustFaqSection />
      </div>
    </div>
  );
}

type AdminSliderImage = {
  id: string;
  image_url: string;
  title: string | null;
  link_url: string | null;
  sort_order: number;
  enabled: boolean;
};

function SliderImagesSection() {
  const [items, setItems] = useState<AdminSliderImage[] | null>(null);
  const [editing, setEditing] = useState<Partial<AdminSliderImage> | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => setItems((await listSliderImagesAdmin()) as AdminSliderImage[]);
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
    if (!editing?.image_url) return toast.error("Slide image is required");
    try {
      await upsertSliderImage({ data: editing });
      toast.success("Saved");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this slide?")) return;
    await deleteSliderImage({ data: id });
    load();
  };

  const toggleEnabled = async (s: AdminSliderImage) => {
    await upsertSliderImage({ data: { ...s, enabled: !s.enabled } });
    load();
  };

  if (items === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <div>
          <h2 className="text-lg font-semibold">Homepage slider</h2>
          <p className="text-xs text-muted-foreground">
            Full-width slider section, separate from the hero banners above.
          </p>
        </div>
        <button
          onClick={() => setEditing({})}
          className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          + New slide
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
              placeholder="Link (optional, e.g. /category/football)"
              value={editing.link_url ?? ""}
              onChange={(e) => setEditing({ ...editing, link_url: e.target.value })}
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
        {items
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-sm border border-border p-3">
              <div className="flex items-center gap-3">
                <img src={s.image_url} alt="" className="h-12 w-20 rounded-sm object-cover" />
                <div>
                  <div className="text-sm font-medium">{s.title || "(no title)"}</div>
                  <div className="text-xs text-muted-foreground">{s.enabled ? "Enabled" : "Disabled"}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => toggleEnabled(s)} className="text-xs text-cyan-500 hover:underline">
                  {s.enabled ? "Disable" : "Enable"}
                </button>
                <button onClick={() => setEditing(s)} className="text-xs text-cyan-500 hover:underline">
                  Edit
                </button>
                <button onClick={() => remove(s.id)} className="text-xs text-red-500 hover:underline">
                  Delete
                </button>
              </div>
            </div>
          ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground">No slides yet.</p>}
      </div>
    </div>
  );
}

type AdminHighlight = {
  id: string;
  key: string;
  title: string;
  image_url: string | null;
  link: string;
  sort_order: number;
  enabled: boolean;
};

function HighlightsSection() {
  const [items, setItems] = useState<AdminHighlight[] | null>(null);
  const [editing, setEditing] = useState<Partial<AdminHighlight> | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => setItems((await listHighlightsAdmin()) as AdminHighlight[]);
  useEffect(() => {
    load();
  }, []);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const optimized = await optimizeImage(file, { maxDim: 800, quality: 0.85 });
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
    if (!editing?.title) return toast.error("Title is required");
    if (!editing?.link) return toast.error("Link is required");
    try {
      await upsertHighlight({ data: editing });
      toast.success("Saved");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this highlight?")) return;
    await deleteHighlight({ data: id });
    load();
  };

  const toggleEnabled = async (h: AdminHighlight) => {
    await upsertHighlight({ data: { ...h, enabled: !h.enabled } });
    load();
  };

  if (items === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <div>
          <h2 className="text-lg font-semibold">Highlights</h2>
          <p className="text-xs text-muted-foreground">
            Round shortcut icons under the hero (e.g. Football, Movies, Custom Design).
          </p>
        </div>
        <button
          onClick={() => setEditing({})}
          className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          + New highlight
        </button>
      </div>

      {editing && (
        <div className="mb-6 grid gap-4 rounded-sm border border-border bg-card p-4 sm:grid-cols-[120px_1fr]">
          <div>
            {editing.image_url ? (
              <img src={editing.image_url} alt="" className="aspect-square w-full rounded-full object-cover" />
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-full border border-dashed border-border text-xs text-muted-foreground">
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
            <input
              placeholder="Title"
              value={editing.title ?? ""}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              placeholder="Link (e.g. /category/football)"
              value={editing.link ?? ""}
              onChange={(e) => setEditing({ ...editing, link: e.target.value })}
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

      <div className="flex flex-wrap gap-3">
        {items.map((h) => (
          <div key={h.id} className="w-24 rounded-sm border border-border p-2 text-center">
            {h.image_url ? (
              <img src={h.image_url} alt="" className="mx-auto h-14 w-14 rounded-full object-cover" />
            ) : (
              <div className="mx-auto h-14 w-14 rounded-full border border-dashed border-border" />
            )}
            <div className="mt-1 truncate text-[10px] font-medium">{h.title}</div>
            <div className="text-[9px] text-muted-foreground">{h.enabled ? "On" : "Off"}</div>
            <div className="mt-1 flex justify-center gap-1.5">
              <button onClick={() => toggleEnabled(h)} className="text-[10px] text-cyan-500 hover:underline">
                {h.enabled ? "Hide" : "Show"}
              </button>
              <button onClick={() => setEditing(h)} className="text-[10px] text-cyan-500 hover:underline">
                Edit
              </button>
              <button onClick={() => remove(h.id)} className="text-[10px] text-red-500 hover:underline">
                Del
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground">No highlights yet.</p>}
      </div>
    </div>
  );
}

// Trust points ("Why choose us") + FAQ shown on the homepage. Both are a
// FIXED set of items (ids like "print-quality", "delivery-time") with a
// built-in EN/AR default — this editor only lets the admin enable/hide
// each one and override its title text, matching normalizeStorefrontContent's
// merge semantics (nothing here supports adding/removing items).
function TrustFaqSection() {
  const [content, setContent] = useState<StorefrontContent | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const settings = await getAllSiteSettingsAdmin();
    const row = (settings as Array<{ key: string; value: unknown }>).find(
      (r) => r.key === STOREFRONT_CONTENT_KEY,
    );
    setContent(normalizeStorefrontContent(row?.value));
  };
  useEffect(() => {
    load();
  }, []);

  const save = async (next: StorefrontContent) => {
    setContent(next);
    setSaving(true);
    try {
      await setSiteSetting({ data: { key: STOREFRONT_CONTENT_KEY, value: next } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (content === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const updatePoint = (id: string, patch: Partial<TrustPoint>) => {
    save({
      ...content,
      trust: {
        ...content.trust,
        points: content.trust.points.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      },
    });
  };

  const updateFaq = (id: string, patch: Partial<FAQItem>) => {
    save({
      ...content,
      faq: { ...content.faq, items: content.faq.items.map((f) => (f.id === id ? { ...f, ...patch } : f)) },
    });
  };

  return (
    <div>
      <h2 className="text-lg font-semibold">Trust points & FAQ</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Enable/hide items and edit their title text. Every item has a built-in EN/AR default.
      </p>

      <h3 className="mt-5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Why choose us
      </h3>
      <div className="mt-2 space-y-2">
        {content.trust.points.map((p) => (
          <div key={p.id} className="rounded-sm border border-border p-2.5">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={p.enabled}
                disabled={saving}
                onChange={(e) => updatePoint(p.id, { enabled: e.target.checked })}
              />
              <span className="w-40 shrink-0 text-xs text-muted-foreground">{p.id}</span>
              <input
                value={p.en}
                disabled={saving}
                onChange={(e) => updatePoint(p.id, { en: e.target.value })}
                className="flex-1 rounded-sm border border-border bg-background px-2 py-1 text-sm"
              />
              <input
                value={p.ar}
                dir="rtl"
                disabled={saving}
                onChange={(e) => updatePoint(p.id, { ar: e.target.value })}
                className="flex-1 rounded-sm border border-border bg-background px-2 py-1 text-sm"
              />
            </div>
          </div>
        ))}
      </div>

      <h3 className="mt-6 text-xs font-semibold uppercase tracking-widest text-muted-foreground">FAQ</h3>
      <div className="mt-2 space-y-2">
        {content.faq.items.map((f) => (
          <div key={f.id} className="rounded-sm border border-border p-2.5">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={f.enabled}
                disabled={saving}
                onChange={(e) => updateFaq(f.id, { enabled: e.target.checked })}
              />
              <span className="w-40 shrink-0 text-xs text-muted-foreground">{f.id}</span>
              <input
                value={f.en}
                disabled={saving}
                onChange={(e) => updateFaq(f.id, { en: e.target.value })}
                className="flex-1 rounded-sm border border-border bg-background px-2 py-1 text-sm"
              />
              <input
                value={f.ar}
                dir="rtl"
                disabled={saving}
                onChange={(e) => updateFaq(f.id, { ar: e.target.value })}
                className="flex-1 rounded-sm border border-border bg-background px-2 py-1 text-sm"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Frame Mockups — where/how the product photo sits inside each frame
// mockup image (black/white/wood). Was previously not editable at all:
// FramePreview read these values but never actually applied the
// rotate/skew/scale/flip transform to the artwork (fixed alongside this
// editor), so even the hardcoded defaults had no visible effect beyond
// position/size.
// ---------------------------------------------------------------
const MOCKUP_COLORS: Array<keyof FrameMockups> = ["black", "white", "wood"];

function MockupArtworkPreview({ mockup, posterUrl }: { mockup: FrameMockup; posterUrl: string }) {
  const skewX = mockup.skewX ?? 0;
  const skewY = mockup.skewY ?? 0;
  const rotateX = mockup.rotateX ?? 0;
  const rotateY = mockup.rotateY ?? 0;
  const perspective = Math.max(200, mockup.perspective ?? 1000);
  const transform = [
    rotateX ? `rotateX(${rotateX}deg)` : "",
    rotateY ? `rotateY(${rotateY}deg)` : "",
    mockup.rotate ? `rotate(${mockup.rotate}deg)` : "",
    skewX ? `skewX(${skewX}deg)` : "",
    skewY ? `skewY(${skewY}deg)` : "",
    `scale(${(mockup.scale ?? 1) * (mockup.flipX ? -1 : 1)}, ${(mockup.scale ?? 1) * (mockup.flipY ? -1 : 1)})`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="relative aspect-[2/3] w-full overflow-hidden">
      <div
        className="absolute z-0 overflow-hidden"
        style={{
          top: `${mockup.top}%`,
          left: `${mockup.left}%`,
          width: `${mockup.width}%`,
          height: `${mockup.height}%`,
          borderRadius: `${mockup.borderRadius ?? 0}%`,
          perspective: `${perspective}px`,
        }}
      >
        {posterUrl && (
          <img
            src={posterUrl}
            alt=""
            className="block h-full w-full object-cover object-center"
            style={{ transform, transformStyle: "preserve-3d", backfaceVisibility: "hidden" }}
          />
        )}
      </div>
      {mockup.image && (
        <img src={mockup.image} alt="" className="pointer-events-none absolute inset-0 z-10 h-full w-full object-fill" />
      )}
    </div>
  );
}

const MOCKUP_NUMBER_FIELDS: Array<{ key: keyof FrameMockup; label: string; step?: number; min?: number; max?: number }> = [
  { key: "top", label: "Top (%)", step: 0.1 },
  { key: "left", label: "Left (%)", step: 0.1 },
  { key: "width", label: "Width (%)", step: 0.1 },
  { key: "height", label: "Height (%)", step: 0.1 },
  { key: "rotate", label: "Rotate (deg)", step: 0.5 },
  { key: "skewX", label: "Skew X (deg)", step: 0.5 },
  { key: "skewY", label: "Skew Y (deg)", step: 0.5 },
  { key: "rotateX", label: "3D tilt X (deg)", step: 0.5 },
  { key: "rotateY", label: "3D tilt Y (deg)", step: 0.5 },
  { key: "scale", label: "Scale", step: 0.01 },
  { key: "perspective", label: "Perspective (px)", step: 10 },
  { key: "borderRadius", label: "Corner radius (%)", step: 0.5 },
];

function FrameMockupsTab() {
  const [color, setColor] = useState<keyof FrameMockups>("black");
  const [mockups, setMockups] = useState<FrameMockups | null>(null);
  const [sampleUrl, setSampleUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    const [settings, posters] = await Promise.all([
      getAllSiteSettingsAdmin(),
      listPostersAdmin({ data: {} }),
    ]);
    const rows = settings as Array<{ key: string; value: unknown }>;
    const map = new Map(rows.map((r) => [r.key, r.value]));
    setMockups({
      black: parseMockup(map.get(MOCKUP_KEYS.black), MOCKUP_DEFAULTS.black),
      white: parseMockup(map.get(MOCKUP_KEYS.white), MOCKUP_DEFAULTS.white),
      wood: parseMockup(map.get(MOCKUP_KEYS.wood), MOCKUP_DEFAULTS.wood),
    });
    const withImage = (posters as AdminPoster[]).find((p) => p.image_url);
    if (withImage) setSampleUrl(withImage.image_url);
  };
  useEffect(() => {
    load();
  }, []);

  const current = mockups?.[color];

  const update = (patch: Partial<FrameMockup>) => {
    if (!mockups) return;
    setMockups({ ...mockups, [color]: { ...mockups[color], ...patch } });
  };

  const save = async () => {
    if (!mockups) return;
    setSaving(true);
    try {
      await setSiteSetting({ data: { key: MOCKUP_KEYS[color], value: mockups[color] } });
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = () => update({ ...MOCKUP_DEFAULTS[color] });

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const optimized = await optimizeImage(file, { maxDim: 1600, quality: 0.9 });
      const dataUrl = await fileToDataUrl(optimized);
      const { url } = await uploadPosterImage({ data: { dataUrl, filename: file.name } });
      update({ image: url });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (mockups === null || !current) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <h2 className="text-lg font-semibold">Frame mockups</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Controls exactly where and how the product photo sits inside each frame mockup photo.
      </p>

      <div className="mt-4 flex gap-1">
        {MOCKUP_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={`rounded-sm border px-3 py-1.5 text-xs capitalize ${
              color === c ? "border-primary bg-primary text-primary-foreground" : "border-border"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-6 sm:grid-cols-[220px_1fr]">
        <div>
          <MockupArtworkPreview mockup={current} posterUrl={sampleUrl} />
          <p className="mt-2 text-center text-[10px] text-muted-foreground">Live preview (sample product photo)</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">Mockup photo</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                value={current.image}
                onChange={(e) => update({ image: e.target.value })}
                className="flex-1 rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="shrink-0 rounded-sm border border-border px-3 py-2 text-xs disabled:opacity-50"
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
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {MOCKUP_NUMBER_FIELDS.map((f) => (
              <label key={f.key} className="text-xs text-muted-foreground">
                {f.label}
                <input
                  type="number"
                  step={f.step ?? 1}
                  value={(current[f.key] as number | undefined) ?? 0}
                  onChange={(e) => update({ [f.key]: Number(e.target.value) } as Partial<FrameMockup>)}
                  className="mt-1 w-full rounded-sm border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                />
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(current.flipX)} onChange={(e) => update({ flipX: e.target.checked })} />
              Flip horizontal
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(current.flipY)} onChange={(e) => update({ flipY: e.target.checked })} />
              Flip vertical
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={current.enabled !== false}
                onChange={(e) => update({ enabled: e.target.checked })}
              />
              Enabled on storefront
            </label>
          </div>

          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-sm bg-primary px-4 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={resetToDefault} className="rounded-sm border border-border px-4 py-2 text-xs">
              Reset to default
            </button>
          </div>
        </div>
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

type GeminiKeyStatusRow = {
  label: string;
  masked: string;
  present: boolean;
  state: "available" | "rate_limited" | "failed" | "disabled" | "unknown";
  requests: number;
  successes: number;
  failures: number;
};

const KEY_STATE_COLOR: Record<GeminiKeyStatusRow["state"], string> = {
  available: "text-green-500",
  rate_limited: "text-yellow-500",
  failed: "text-red-500",
  disabled: "text-muted-foreground",
  unknown: "text-muted-foreground",
};

function GeminiKeysStatusSection() {
  const [keys, setKeys] = useState<GeminiKeyStatusRow[] | null>(null);

  const load = async () => setKeys((await getGeminiKeysStatusAdmin()) as GeminiKeyStatusRow[]);
  useEffect(() => {
    load();
    const id = window.setInterval(load, 15_000);
    return () => window.clearInterval(id);
  }, []);

  const present = keys?.filter((k) => k.present) ?? [];

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">AI image analysis keys (Gemini)</h3>
        <button onClick={load} className="text-xs text-cyan-500 hover:underline">
          Refresh
        </button>
      </div>
      {keys === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : present.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No Gemini API keys configured — bulk upload AI title/SEO generation is disabled.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-card uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Key</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Requests</th>
                <th className="px-3 py-2">Success</th>
                <th className="px-3 py-2">Failures</th>
              </tr>
            </thead>
            <tbody>
              {present.map((k) => (
                <tr key={k.label} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono">
                    {k.label} <span className="text-muted-foreground">{k.masked}</span>
                  </td>
                  <td className={`px-3 py-2 font-medium ${KEY_STATE_COLOR[k.state]}`}>{k.state}</td>
                  <td className="px-3 py-2">{k.requests}</td>
                  <td className="px-3 py-2">{k.successes}</td>
                  <td className="px-3 py-2">{k.failures}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-border bg-card p-2 text-[10px] text-muted-foreground">
            Requests automatically rotate to the next key once one is rate-limited or fails — counts
            reset when the server restarts, so treat this as a live snapshot, not full history.
          </p>
        </div>
      )}
    </div>
  );
}

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

      <GeminiKeysStatusSection />

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
  { key: "frame_wood_40x50", label: "Wood 40×50 (EGP)" },
  { key: "frame_wood_40x60", label: "Wood 40×60 (EGP)" },
  { key: "frame_wood_50x60", label: "Wood 50×60 (EGP)" },
  { key: "frame_wood_50x70", label: "Wood 50×70 (EGP)" },
  { key: "frame_wood_60x90", label: "Wood 60×90 (EGP)" },
  { key: "frame_wood_100x60", label: "Wood 100×60 (EGP)" },
  { key: "photo_10x15", label: "Photo 10×15 (EGP)" },
  { key: "photo_13x18", label: "Photo 13×18 (EGP)" },
  { key: "photo_15x20", label: "Photo 15×20 (EGP)" },
  { key: "custom_design_fee", label: "Custom design fee (EGP)" },
  { key: "packaging_fee", label: "Packaging fee (EGP)" },
  { key: "offer_6_20x30", label: "Bundle: 6× 20×30 (EGP)" },
  { key: "offer_4_30x40", label: "Bundle: 4× 30×40 (EGP)" },
  { key: "double_face_tape_price", label: "Double-face tape (EGP)" },
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

  // usePricing() (src/lib/use-settings.ts) reads this key live to decide
  // whether the double-face-tape upsell prompt appears at checkout at all
  // (src/routes/cart.tsx) — it had no admin input even though the price
  // field right above it does, so the tape couldn't be turned off without
  // a DB console. Persists immediately, like the feature-flag toggles below.
  const tapeEnabled = values["double_face_tape_enabled"] !== "false" && values["double_face_tape_enabled"] !== "0";
  const toggleTapeEnabled = async (checked: boolean) => {
    setValues({ ...values, double_face_tape_enabled: String(checked) });
    try {
      await setSiteSetting({ data: { key: "double_face_tape_enabled", value: checked } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <div>
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
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={tapeEnabled} onChange={(e) => toggleTapeEnabled(e.target.checked)} />
          Offer double-face tape at checkout
        </label>
      </div>

      <div className="mt-10 max-w-md border-t border-border pt-8">
        <FeatureFlagsSection />
      </div>

      <div className="mt-10 max-w-md border-t border-border pt-8">
        <StorefrontConfigSection />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Storefront config — settings the storefront reads live but that
// previously had no admin editor at all (grid_display_mode,
// post_order_success_message_enabled, photo_4x6_config).
// ---------------------------------------------------------------
function StorefrontConfigSection() {
  const [gridMode, setGridMode] = useState<GridDisplayMode>(GRID_DISPLAY_MODE_DEFAULT);
  const [postOrderMsg, setPostOrderMsg] = useState(true);
  const [photo4x6, setPhoto4x6] = useState<Photo4x6Config>(PHOTO_4X6_DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    const rows = (await getAllSiteSettingsAdmin()) as Array<{ key: string; value: unknown }>;
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const gm = map.get(GRID_DISPLAY_MODE_KEY);
    setGridMode(
      typeof gm === "string" && ["black", "white", "wood"].includes(gm)
        ? (gm as GridDisplayMode)
        : GRID_DISPLAY_MODE_DEFAULT,
    );
    setPostOrderMsg(parsePostOrderMessageEnabled(map.get(POST_ORDER_MESSAGE_ENABLED_KEY)));
    setPhoto4x6(parsePhoto4x6(map.get(PHOTO_4X6_KEY)));
    setLoaded(true);
  };
  useEffect(() => {
    load();
  }, []);

  const saveGridMode = async (mode: GridDisplayMode) => {
    setGridMode(mode);
    try {
      await setSiteSetting({ data: { key: GRID_DISPLAY_MODE_KEY, value: mode } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const savePostOrderMsg = async (enabled: boolean) => {
    setPostOrderMsg(enabled);
    try {
      await setSiteSetting({ data: { key: POST_ORDER_MESSAGE_ENABLED_KEY, value: enabled } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const savePhoto4x6 = async (next: Photo4x6Config) => {
    setPhoto4x6(next);
    try {
      await setSiteSetting({ data: { key: PHOTO_4X6_KEY, value: next } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const updatePackage = (index: number, patch: Partial<Photo4x6Package>) => {
    const packages = photo4x6.packages.map((p, i) => (i === index ? { ...p, ...patch } : p));
    savePhoto4x6({ ...photo4x6, packages });
  };

  const removePackage = (index: number) => {
    savePhoto4x6({ ...photo4x6, packages: photo4x6.packages.filter((_, i) => i !== index) });
  };

  const addPackage = () => {
    savePhoto4x6({
      ...photo4x6,
      packages: [...photo4x6.packages, { key: `p${Date.now()}`, photos: 8, price: 80, label: "8 Photos 4×6" }],
    });
  };

  if (!loaded) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Storefront config</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Settings the storefront reads live that previously had no admin control.
        </p>
      </div>

      <div>
        <label className="block text-sm text-muted-foreground">
          Default frame color shown in product grids
        </label>
        <select
          value={gridMode}
          onChange={(e) => saveGridMode(e.target.value as GridDisplayMode)}
          className="mt-1 rounded-sm border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="black">Black</option>
          <option value="white">White</option>
          <option value="wood">Wood</option>
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={postOrderMsg} onChange={(e) => savePostOrderMsg(e.target.checked)} />
        Show the "order received" success message after checkout
      </label>

      <div>
        <h3 className="text-sm font-semibold">4×6 Photo Printing</h3>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={photo4x6.enabled}
            onChange={(e) => savePhoto4x6({ ...photo4x6, enabled: e.target.checked })}
          />
          Enabled
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={photo4x6.aiEnhanceEnabled}
            onChange={(e) => savePhoto4x6({ ...photo4x6, aiEnhanceEnabled: e.target.checked })}
          />
          Offer AI enhancement
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={photo4x6.aiSuitEnabled}
            onChange={(e) => savePhoto4x6({ ...photo4x6, aiSuitEnabled: e.target.checked })}
          />
          Offer AI suit conversion
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={photo4x6.upsellEnabled}
            onChange={(e) => savePhoto4x6({ ...photo4x6, upsellEnabled: e.target.checked })}
          />
          Show as an upsell after regular checkout
        </label>

        <div className="mt-3 space-y-2">
          {photo4x6.packages.map((p, i) => (
            <div key={p.key} className="flex items-center gap-2">
              <input
                value={p.label}
                onChange={(e) => updatePackage(i, { label: e.target.value })}
                placeholder="Label"
                className="w-40 rounded-sm border border-border bg-background px-2 py-1.5 text-xs"
              />
              <input
                type="number"
                min={1}
                value={p.photos}
                onChange={(e) => updatePackage(i, { photos: Number(e.target.value) || 1 })}
                placeholder="Photos"
                className="w-20 rounded-sm border border-border bg-background px-2 py-1.5 text-xs"
              />
              <input
                type="number"
                min={0}
                value={p.price}
                onChange={(e) => updatePackage(i, { price: Number(e.target.value) || 0 })}
                placeholder="Price (EGP)"
                className="w-24 rounded-sm border border-border bg-background px-2 py-1.5 text-xs"
              />
              <button onClick={() => removePackage(i)} className="text-xs text-red-500 hover:underline">
                Remove
              </button>
            </div>
          ))}
          <button onClick={addPackage} className="rounded-sm border border-border px-3 py-1.5 text-xs">
            + Add package
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Feature / performance flags — the "emergency lever" to stabilise the
// site without a code deploy (src/lib/performance-flags.ts).
// ---------------------------------------------------------------
const FLAG_TOGGLES: { key: keyof PerformanceFlags; label: string; hint?: string }[] = [
  { key: "safe_mode", label: "Safe mode", hint: "Forces conservative defaults across the whole site" },
  { key: "emergency_fast_mode", label: "Emergency fast mode", hint: "Smallest public payload, no slow personal rails" },
  { key: "pause_heavy_jobs", label: "Pause heavy jobs", hint: "Blocks bulk AI SEO / image-variant jobs" },
  { key: "disable_preloader", label: "Disable preloader" },
  { key: "disable_social_proof", label: "Disable social proof popups" },
  { key: "disable_floating_offer", label: "Disable floating offer bubble" },
  { key: "whatsapp_enabled", label: "WhatsApp button" },
  { key: "assistant_enabled", label: "AI assistant button" },
  { key: "offers_enabled", label: "Today's Offers bubble" },
  { key: "collapse_tools_mobile", label: "Collapse tools on mobile" },
];

// Raw parse (no SAFE_MODE_OVERRIDES/EMERGENCY_FAST_OVERRIDES applied) so
// each toggle in this editor reflects and edits exactly what's stored —
// the storefront-facing usePerformanceFlags() is the one that applies
// those overrides at read time.
function parsePerfFlagsRaw(raw: unknown): PerformanceFlags {
  const base = { ...PERFORMANCE_DEFAULTS };
  if (raw && typeof raw === "object") {
    Object.assign(base, raw as Partial<PerformanceFlags>);
  }
  return base;
}

function FeatureFlagsSection() {
  const [flags, setFlags] = useState<PerformanceFlags | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const settings = await getAllSiteSettingsAdmin();
    const row = (settings as Array<{ key: string; value: unknown }>).find(
      (r) => r.key === "performance_flags",
    );
    setFlags(parsePerfFlagsRaw(row?.value));
  };
  useEffect(() => {
    load();
  }, []);

  const save = async (next: PerformanceFlags) => {
    setFlags(next);
    setSaving(true);
    try {
      await setSiteSetting({ data: { key: "performance_flags", value: next } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (flags === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <h2 className="text-lg font-semibold">Feature flags</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Emergency levers to stabilise the site without a code deploy.
      </p>
      <div className="mt-4 space-y-2">
        {FLAG_TOGGLES.map((f) => (
          <label key={f.key} className="flex items-center justify-between gap-3 rounded-sm border border-border p-2.5">
            <span>
              <span className="block text-sm">{f.label}</span>
              {f.hint && <span className="block text-xs text-muted-foreground">{f.hint}</span>}
            </span>
            <input
              type="checkbox"
              checked={Boolean(flags[f.key])}
              disabled={saving}
              onChange={(e) => save({ ...flags, [f.key]: e.target.checked })}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
