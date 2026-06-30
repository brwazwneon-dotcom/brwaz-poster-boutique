import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SafeImage } from "@/components/SafeImage";
import { Link } from "@tanstack/react-router";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import {
  ShoppingCart, DollarSign, Calendar, Clock, CheckCircle2, XCircle,
  Users, TrendingUp, Target, Wallet, Trophy, FolderTree, Search,
  Eye, Heart, PlusCircle, MapPin, Activity, Upload, Tag, Image as ImgIcon,
  Star, AlertTriangle, Smartphone, Monitor, Tablet, Facebook, Instagram,
  Globe, MessageCircle, RefreshCcw, ArrowRight, ImagePlus, Frame,
  Truck, Package, Sparkles, FileDown, Bell, AlertCircle, Lightbulb,
  TrendingDown, Repeat, Banknote, Settings as SettingsIcon,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { toast } from "sonner";

type PosterRow = { id: string; title: string; image_url: string } & Record<string, number>;
type CategoryRow = { id: string; name: string; slug: string; sales: number; views: number };
type SearchRow = { q: string; c: number };
type GovRow = { governorate: string; orders: number; revenue: number };
type DeviceRow = { device: string; visitors: number };
type SourceRow = { source: string; visitors: number };
type ChartRow = { day: string; orders: number; revenue: number; visitors: number };
type OrderRow = {
  id: string; order_number: string | null; customer_name: string | null;
  governorate: string | null; total_price: number; status: string | null; created_at: string;
};
type CustomerRow = { customer_name: string; phone: string | null; governorate: string | null; created_at: string };
type ReviewRow = {
  id: string; customer_name: string; rating: number; review_text: string | null;
  governorate: string | null; created_at: string; status: string;
};
type CustomRow = { id: string; customer_name: string | null; total_price: number; image_count: number; created_at: string };
type PhotoRow = { id: string; customer_name: string | null; total_price: number; quantity: number; created_at: string };
type CityRow = { city: string; orders: number; revenue: number };
type SizeRow = { size: string; orders: number; revenue: number };
type ReturningRow = { name: string; phone: string | null; gov: string | null; orders: number; spent: number };
type SearchEmptyRow = { q: string; c: number };
type ProfitCosts = {
  product_cost?: number; packaging_cost?: number;
  shipping_cost?: number; advertising_cost?: number;
};

type Dashboard = {
  visitors_today: number; visitors_month: number; visitors_total: number;
  orders_today: number; revenue_today: number; revenue_week: number; revenue_month: number;
  orders_total: number; revenue_total: number;
  orders_pending: number; orders_processing: number; orders_printed: number;
  orders_shipped: number; orders_delivered: number;
  orders_completed: number; orders_cancelled: number;
  orders_range: number; revenue_range: number; visitors_range: number;
  range: { from: string; to: string; days: number };
  customers: { total_customers: number; returning_customers: number; new_customers: number };
  top_returning: ReturningRow[];
  chart_14d: ChartRow[];
  chart_range: ChartRow[];
  top_selling: (PosterRow & { sales_count: number })[];
  top_viewed: (PosterRow & { views_count: number })[];
  top_cart: (PosterRow & { cart_adds_count: number })[];
  top_wishlisted: (PosterRow & { wishlist_count: number })[];
  lowest_performing: (PosterRow & { views_count: number; sales_count: number })[];
  top_categories: CategoryRow[];
  top_subcategories: CategoryRow[];
  top_sizes: SizeRow[];
  top_searches: SearchRow[];
  no_result_searches: SearchEmptyRow[];
  top_governorates: GovRow[];
  top_cities: CityRow[];
  devices: DeviceRow[];
  sources: SourceRow[];
  recent_orders: OrderRow[];
  recent_customers: CustomerRow[];
  recent_reviews: ReviewRow[];
  recent_custom: CustomRow[];
  recent_photo: PhotoRow[];
  conversions: {
    photo_printing: number; custom_design: number; wooden_portrait: number;
    frame_orders: number; black_frame: number; white_frame: number; offers: number;
  };
  health: { posters_missing_image: number; posters_hidden: number; reviews_pending: number };
  profit_costs: ProfitCosts;
};

type AdminTab =
  | "analytics" | "posters" | "categories" | "orders" | "custom" | "slider"
  | "collections" | "mockups" | "wishlists" | "reviews" | "before-after"
  | "marketing" | "exports" | "settings";

function fmtEGP(n: number | string): string {
  const v = typeof n === "string" ? Number(n) : n;
  return new Intl.NumberFormat("en-EG", { maximumFractionDigits: 0 }).format(v || 0) + " EGP";
}
function fmtNum(n: number | string): string {
  const v = typeof n === "string" ? Number(n) : n;
  return new Intl.NumberFormat("en-EG").format(v || 0);
}
function fmtShort(d: string) {
  try { return new Date(d).toLocaleDateString("en-EG", { month: "short", day: "numeric" }); }
  catch { return d; }
}
function fmtTime(d: string) {
  try {
    const dt = new Date(d);
    const diff = (Date.now() - dt.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return dt.toLocaleDateString("en-EG", { month: "short", day: "numeric" });
  } catch { return d; }
}

/* ------------------------------- Cards ------------------------------- */

function KpiCard({
  label, value, sub, icon, accent = "default", onClick,
}: {
  label: string; value: string | number; sub?: string;
  icon: ReactNode; accent?: "default" | "success" | "warning" | "danger" | "info";
  onClick?: () => void;
}) {
  const ring: Record<string, string> = {
    default: "from-white/[0.04] to-transparent",
    success: "from-emerald-500/15 to-transparent",
    warning: "from-amber-500/15 to-transparent",
    danger: "from-rose-500/15 to-transparent",
    info: "from-sky-500/15 to-transparent",
  };
  const iconBg: Record<string, string> = {
    default: "bg-white/5 text-foreground",
    success: "bg-emerald-500/15 text-emerald-300",
    warning: "bg-amber-500/15 text-amber-300",
    danger: "bg-rose-500/15 text-rose-300",
    info: "bg-sky-500/15 text-sky-300",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`group relative overflow-hidden rounded-md border border-border bg-card p-4 text-left transition hover:border-primary/60 hover:shadow-[0_0_0_1px_hsl(var(--primary)/0.4)] disabled:cursor-default disabled:hover:border-border disabled:hover:shadow-none`}
    >
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${ring[accent]}`} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{label}</div>
          <div className="mt-2 truncate text-2xl font-semibold tracking-tight">{value}</div>
          {sub ? <div className="mt-1 truncate text-[11px] text-muted-foreground">{sub}</div> : null}
        </div>
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${iconBg[accent]}`}>{icon}</div>
      </div>
    </button>
  );
}

function Panel({
  title, action, children, icon,
}: { title: string; action?: ReactNode; children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/90">{title}</h3>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function PosterList({
  items, metricKey, metricLabel, onSeeAll,
}: {
  items: PosterRow[]; metricKey: string; metricLabel: string; onSeeAll?: () => void;
}) {
  if (items.length === 0) return <div className="text-xs text-muted-foreground">No data yet.</div>;
  return (
    <ul className="divide-y divide-border/60 text-sm">
      {items.slice(0, 6).map((p, i) => (
        <li key={p.id} className="flex items-center gap-3 py-2">
          <span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
          <SafeImage src={p.image_url} alt={p.title} className="h-10 w-8 rounded-sm border border-border object-cover" loading="lazy" />
          <span className="flex-1 truncate">{p.title}</span>
          <span className="rounded-sm bg-white/5 px-2 py-0.5 text-[11px] text-foreground/80">
            {fmtNum((p as Record<string, number>)[metricKey] ?? 0)} {metricLabel}
          </span>
        </li>
      ))}
      {onSeeAll && (
        <li className="pt-2">
          <button onClick={onSeeAll} className="inline-flex items-center gap-1 text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground">
            See all <ArrowRight className="h-3 w-3" />
          </button>
        </li>
      )}
    </ul>
  );
}

function statusPill(status: string | null) {
  const s = (status || "new").toLowerCase();
  const cls =
    s === "completed" || s === "delivered" || s === "shipped" ? "bg-emerald-500/15 text-emerald-300"
    : s === "cancelled" || s === "canceled" || s === "refunded" ? "bg-rose-500/15 text-rose-300"
    : s === "processing" ? "bg-sky-500/15 text-sky-300"
    : "bg-amber-500/15 text-amber-300";
  return <span className={`rounded-sm px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest ${cls}`}>{s}</span>;
}

const SOURCE_ICONS: Record<string, ReactNode> = {
  facebook: <Facebook className="h-4 w-4" />,
  instagram: <Instagram className="h-4 w-4" />,
  google: <Globe className="h-4 w-4" />,
  whatsapp: <MessageCircle className="h-4 w-4" />,
  direct: <ArrowRight className="h-4 w-4" />,
  organic: <Search className="h-4 w-4" />,
  twitter: <Globe className="h-4 w-4" />,
  tiktok: <Globe className="h-4 w-4" />,
  other: <Globe className="h-4 w-4" />,
};

/* ------------------------------ Main tab ------------------------------ */

export function AnalyticsTab({ onNavigate }: { onNavigate?: (tab: AdminTab) => void }) {
  const goto = (t: AdminTab) => () => onNavigate?.(t);

  type RangePreset = "today" | "yesterday" | "7d" | "30d" | "90d" | "custom";
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  const { from, to } = useMemo(() => computeRange(preset, customFrom, customTo), [preset, customFrom, customTo]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-dashboard", from, to],
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_dashboard", { p_from: from, p_to: to });
      if (error) throw error;
      return data as unknown as Dashboard;
    },
  });

  const { data: live = 0 } = useQuery({
    queryKey: ["admin-live-visitors"],
    staleTime: 15_000,
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_live_visitors");
      if (error) throw error;
      return (data as number) ?? 0;
    },
  });

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-md border border-border bg-card" />
        ))}
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-6 text-sm">
        Failed to load dashboard: {(error as Error | null)?.message ?? "unknown"}
      </div>
    );
  }

  const aov = data.orders_total > 0 ? Number(data.revenue_total) / data.orders_total : 0;
  const conv = data.visitors_total > 0 ? (data.orders_total / data.visitors_total) * 100 : 0;

  const desktop = data.devices.find((d) => d.device === "desktop")?.visitors ?? 0;
  const mobile = data.devices.find((d) => d.device === "mobile")?.visitors ?? 0;
  const tablet = data.devices.find((d) => d.device === "tablet")?.visitors ?? 0;
  const deviceTotal = Math.max(1, desktop + mobile + tablet);

  const sourceMap = new Map(data.sources.map((s) => [s.source, s.visitors]));
  const fixedSources = ["facebook", "instagram", "google", "whatsapp", "direct", "organic"];
  const sourceRows = fixedSources.map((k) => ({
    key: k,
    label: k.charAt(0).toUpperCase() + k.slice(1),
    value: sourceMap.get(k) ?? 0,
  }));
  const sourceTotal = Math.max(1, sourceRows.reduce((a, r) => a + r.value, 0));

  const bestSeller = data.top_selling[0];
  const bestCategory = data.top_categories[0];

  const chartData = data.chart_14d.map((d) => ({
    day: fmtShort(d.day), orders: d.orders, revenue: Number(d.revenue), visitors: d.visitors,
  }));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-display text-3xl">Dashboard</h2>
          <p className="text-xs text-muted-foreground">BRWAZWNEON · live overview · auto-refreshing</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="font-medium">{fmtNum(live)}</span>
            <span className="uppercase tracking-widest">Online now</span>
          </div>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-accent"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <QuickAction icon={<PlusCircle className="h-4 w-4" />} label="Add Poster" onClick={goto("posters")} />
        <QuickAction icon={<FolderTree className="h-4 w-4" />} label="Add Category" onClick={goto("categories")} />
        <QuickAction icon={<Upload className="h-4 w-4" />} label="Upload Images" onClick={goto("posters")} />
        <QuickAction icon={<Tag className="h-4 w-4" />} label="Add Offer" onClick={goto("settings")} />
        <QuickAction icon={<ShoppingCart className="h-4 w-4" />} label="View Orders" onClick={goto("orders")} />
        <QuickAction icon={<Star className="h-4 w-4" />} label="View Reviews" onClick={goto("reviews")} />
      </div>

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <KpiCard label="Today's Orders" value={fmtNum(data.orders_today)} icon={<ShoppingCart className="h-4 w-4" />} accent="info" onClick={goto("orders")} />
        <KpiCard label="Today's Revenue" value={fmtEGP(data.revenue_today)} icon={<DollarSign className="h-4 w-4" />} accent="success" onClick={goto("orders")} />
        <KpiCard label="Monthly Revenue" value={fmtEGP(data.revenue_month)} sub="Last 30 days" icon={<Calendar className="h-4 w-4" />} accent="success" onClick={goto("orders")} />
        <KpiCard label="Pending Orders" value={fmtNum(data.orders_pending)} icon={<Clock className="h-4 w-4" />} accent="warning" onClick={goto("orders")} />
        <KpiCard label="Completed Orders" value={fmtNum(data.orders_completed)} icon={<CheckCircle2 className="h-4 w-4" />} accent="success" onClick={goto("orders")} />
        <KpiCard label="Cancelled Orders" value={fmtNum(data.orders_cancelled)} icon={<XCircle className="h-4 w-4" />} accent="danger" onClick={goto("orders")} />
        <KpiCard label="Visitors Today" value={fmtNum(data.visitors_today)} icon={<Users className="h-4 w-4" />} accent="info" />
        <KpiCard label="Visitors This Month" value={fmtNum(data.visitors_month)} icon={<TrendingUp className="h-4 w-4" />} accent="info" />
        <KpiCard label="Conversion Rate" value={`${conv.toFixed(2)}%`} sub={`${fmtNum(data.orders_total)} orders / ${fmtNum(data.visitors_total)} visitors`} icon={<Target className="h-4 w-4" />} />
        <KpiCard label="Average Order Value" value={fmtEGP(aov)} icon={<Wallet className="h-4 w-4" />} />
        <KpiCard
          label="Best Selling Poster"
          value={bestSeller ? `${fmtNum(bestSeller.sales_count)}×` : "—"}
          sub={bestSeller?.title ?? "No sales yet"}
          icon={<Trophy className="h-4 w-4" />}
          accent="success"
          onClick={goto("posters")}
        />
        <KpiCard
          label="Best Selling Category"
          value={bestCategory ? fmtNum(bestCategory.sales) : "—"}
          sub={bestCategory?.name ?? "No sales yet"}
          icon={<FolderTree className="h-4 w-4" />}
          accent="success"
          onClick={goto("categories")}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-md border border-border bg-card p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em]">Revenue · last 14 days</h3>
            <span className="text-[11px] text-muted-foreground">{fmtEGP(data.revenue_week)} this week</span>
          </div>
          <div className="mt-3 h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} width={48} />
                <Tooltip
                  cursor={{ stroke: "hsl(var(--primary))", strokeOpacity: 0.3 }}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                  formatter={(v: number) => fmtEGP(v)}
                />
                <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em]">Orders · last 14 days</h3>
          <div className="mt-3 h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "hsl(var(--accent))" }}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                />
                <Bar dataKey="orders" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-border bg-card p-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em]">Visitors · last 14 days</h3>
        <div className="mt-3 h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="vis" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
              <Area type="monotone" dataKey="visitors" stroke="#38bdf8" strokeWidth={2} fill="url(#vis)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top performers */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Panel title="Top Selling" icon={<Trophy className="h-4 w-4 text-muted-foreground" />}>
          <PosterList items={data.top_selling} metricKey="sales_count" metricLabel="sold" onSeeAll={goto("posters")} />
        </Panel>
        <Panel title="Top Viewed" icon={<Eye className="h-4 w-4 text-muted-foreground" />}>
          <PosterList items={data.top_viewed} metricKey="views_count" metricLabel="views" onSeeAll={goto("posters")} />
        </Panel>
        <Panel title="Most Wishlisted" icon={<Heart className="h-4 w-4 text-muted-foreground" />}>
          <PosterList items={data.top_wishlisted} metricKey="wishlist_count" metricLabel="❤" onSeeAll={goto("wishlists")} />
        </Panel>
        <Panel title="Most Added to Cart" icon={<ShoppingCart className="h-4 w-4 text-muted-foreground" />}>
          <PosterList items={data.top_cart} metricKey="cart_adds_count" metricLabel="adds" onSeeAll={goto("posters")} />
        </Panel>
      </div>

      {/* Categories + searches + locations */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Top Performing Categories" icon={<FolderTree className="h-4 w-4 text-muted-foreground" />} action={
          <button onClick={goto("categories")} className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">Manage</button>
        }>
          <ul className="divide-y divide-border/60 text-sm">
            {data.top_categories.length === 0 && <li className="py-2 text-xs text-muted-foreground">No data yet.</li>}
            {data.top_categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                <Link to="/category/$slug" params={{ slug: c.slug }} className="truncate hover:text-primary">{c.name}</Link>
                <span className="text-[11px] text-muted-foreground">{fmtNum(c.sales)} sold · {fmtNum(c.views)} views</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Top Search Keywords" icon={<Search className="h-4 w-4 text-muted-foreground" />}>
          {data.top_searches.length === 0 ? (
            <div className="text-xs text-muted-foreground">No searches yet.</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {data.top_searches.slice(0, 16).map((s) => (
                <span key={s.q} className="rounded-sm border border-border bg-background/40 px-2 py-1 text-xs">
                  {s.q} <span className="text-muted-foreground">×{s.c}</span>
                </span>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Top Governorates / Cities" icon={<MapPin className="h-4 w-4 text-muted-foreground" />}>
          <ul className="divide-y divide-border/60 text-sm">
            {data.top_governorates.length === 0 && <li className="py-2 text-xs text-muted-foreground">No orders yet.</li>}
            {data.top_governorates.slice(0, 8).map((g) => (
              <li key={g.governorate} className="flex items-center justify-between gap-2 py-2">
                <span className="truncate">{g.governorate}</span>
                <span className="text-[11px] text-muted-foreground">{fmtNum(g.orders)} · {fmtEGP(g.revenue)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* Devices + Sources */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Device Statistics" icon={<Activity className="h-4 w-4 text-muted-foreground" />}>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Desktop", v: desktop, icon: <Monitor className="h-4 w-4" /> },
              { label: "Mobile", v: mobile, icon: <Smartphone className="h-4 w-4" /> },
              { label: "Tablet", v: tablet, icon: <Tablet className="h-4 w-4" /> },
            ].map((d) => {
              const pct = (d.v / deviceTotal) * 100;
              return (
                <div key={d.label} className="rounded-sm border border-border bg-background/40 p-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">{d.icon}{d.label}</span>
                    <span>{pct.toFixed(0)}%</span>
                  </div>
                  <div className="mt-2 text-xl font-semibold">{fmtNum(d.v)}</div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="Traffic Sources" icon={<Globe className="h-4 w-4 text-muted-foreground" />}>
          <ul className="space-y-2 text-sm">
            {sourceRows.map((s) => {
              const pct = (s.value / sourceTotal) * 100;
              return (
                <li key={s.key}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-2">
                      <span className="text-muted-foreground">{SOURCE_ICONS[s.key]}</span>
                      {s.label}
                    </span>
                    <span className="text-muted-foreground">{fmtNum(s.value)} · {pct.toFixed(0)}%</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full bg-primary/80" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      {/* Order-type breakdown */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Frame Orders" value={fmtNum(data.conversions.frame_orders)} icon={<Frame className="h-4 w-4" />} onClick={goto("orders")} />
        <KpiCard label="Wood Portrait Orders" value={fmtNum(data.conversions.wooden_portrait)} icon={<Frame className="h-4 w-4" />} onClick={goto("orders")} />
        <KpiCard label="Photo Printing Orders" value={fmtNum(data.conversions.photo_printing)} icon={<ImgIcon className="h-4 w-4" />} onClick={goto("orders")} />
        <KpiCard label="Custom Design Orders" value={fmtNum(data.conversions.custom_design)} icon={<ImagePlus className="h-4 w-4" />} onClick={goto("custom")} />
        <KpiCard label="Black Frame Orders" value={fmtNum(data.conversions.black_frame)} icon={<Frame className="h-4 w-4" />} />
        <KpiCard label="White Frame Orders" value={fmtNum(data.conversions.white_frame)} icon={<Frame className="h-4 w-4" />} />
      </div>

      {/* Recent feeds */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Last Orders"
          icon={<ShoppingCart className="h-4 w-4 text-muted-foreground" />}
          action={<button onClick={goto("orders")} className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">View all</button>}
        >
          {data.recent_orders.length === 0 ? (
            <div className="text-xs text-muted-foreground">No orders yet.</div>
          ) : (
            <ul className="divide-y divide-border/60 text-sm">
              {data.recent_orders.map((o) => (
                <li key={o.id} className="flex items-center gap-2 py-2">
                  <span className="font-mono text-[11px] text-muted-foreground">{o.order_number ?? o.id.slice(0, 6)}</span>
                  <span className="min-w-0 flex-1 truncate">{o.customer_name ?? "—"} <span className="text-[11px] text-muted-foreground">· {o.governorate ?? "—"}</span></span>
                  <span className="text-xs">{fmtEGP(o.total_price)}</span>
                  {statusPill(o.status)}
                  <span className="hidden w-16 text-right text-[10px] text-muted-foreground sm:inline">{fmtTime(o.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Recent Customers" icon={<Users className="h-4 w-4 text-muted-foreground" />}>
          {data.recent_customers.length === 0 ? (
            <div className="text-xs text-muted-foreground">No customers yet.</div>
          ) : (
            <ul className="divide-y divide-border/60 text-sm">
              {data.recent_customers.map((c, i) => (
                <li key={`${c.customer_name}-${i}`} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <div className="truncate">{c.customer_name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{c.phone ?? "—"} · {c.governorate ?? "—"}</div>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{fmtTime(c.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Recent Reviews"
          icon={<Star className="h-4 w-4 text-muted-foreground" />}
          action={<button onClick={goto("reviews")} className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">Manage</button>}
        >
          {data.recent_reviews.length === 0 ? (
            <div className="text-xs text-muted-foreground">No reviews yet.</div>
          ) : (
            <ul className="space-y-3 text-sm">
              {data.recent_reviews.map((r) => (
                <li key={r.id} className="rounded-sm border border-border/60 bg-background/30 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{r.customer_name}</span>
                    <span className="text-amber-300">{"★".repeat(r.rating)}<span className="text-muted-foreground">{"★".repeat(Math.max(0, 5 - r.rating))}</span></span>
                  </div>
                  {r.review_text && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.review_text}</p>}
                  <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                    <span>{r.governorate ?? "—"} · {r.status}</span>
                    <span>{fmtTime(r.created_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel
          title="Recent Custom Designs"
          icon={<ImagePlus className="h-4 w-4 text-muted-foreground" />}
          action={<button onClick={goto("custom")} className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">Open</button>}
        >
          {data.recent_custom.length === 0 ? (
            <div className="text-xs text-muted-foreground">No custom designs yet.</div>
          ) : (
            <ul className="divide-y divide-border/60 text-sm">
              {data.recent_custom.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <div className="truncate">{c.customer_name ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground">{fmtNum(c.image_count)} image{c.image_count === 1 ? "" : "s"} · {fmtEGP(c.total_price)}</div>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{fmtTime(c.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Health / warnings */}
      <div className="grid gap-3 sm:grid-cols-3">
        <HealthCard
          label="Posters missing image"
          value={data.health.posters_missing_image}
          tone={data.health.posters_missing_image > 0 ? "warning" : "ok"}
          onClick={goto("posters")}
        />
        <HealthCard
          label="Hidden posters"
          value={data.health.posters_hidden}
          tone="info"
          onClick={goto("posters")}
        />
        <HealthCard
          label="Reviews awaiting approval"
          value={data.health.reviews_pending}
          tone={data.health.reviews_pending > 0 ? "warning" : "ok"}
          onClick={goto("reviews")}
        />
      </div>
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-3 text-xs font-medium uppercase tracking-widest transition hover:border-primary hover:bg-accent"
    >
      <span className="inline-flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-sm bg-primary/10 text-primary">{icon}</span>
        {label}
      </span>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
    </button>
  );
}

function HealthCard({
  label, value, tone, onClick,
}: { label: string; value: number; tone: "ok" | "warning" | "info"; onClick?: () => void }) {
  const cls =
    tone === "warning" ? "border-amber-500/40 bg-amber-500/5 text-amber-200" :
    tone === "info" ? "border-sky-500/30 bg-sky-500/5 text-sky-200" :
    "border-emerald-500/30 bg-emerald-500/5 text-emerald-200";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between gap-3 rounded-md border ${cls} p-4 text-left transition hover:brightness-110`}
    >
      <div className="flex items-center gap-3">
        {tone === "warning" ? <AlertTriangle className="h-5 w-5" /> : tone === "info" ? <Eye className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] opacity-80">{label}</div>
          <div className="mt-1 text-2xl font-semibold">{fmtNum(value)}</div>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 opacity-60" />
    </button>
  );
}