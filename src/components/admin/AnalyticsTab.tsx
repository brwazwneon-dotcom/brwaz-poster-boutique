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

function computeRange(preset: "today" | "yesterday" | "7d" | "30d" | "90d" | "custom", cFrom: string, cTo: string): { from: string; to: string } {
  const now = new Date();
  const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const todayStart = dayStart(now);
  const tomorrow = new Date(todayStart.getTime() + 86400000);
  if (preset === "today") return { from: todayStart.toISOString(), to: tomorrow.toISOString() };
  if (preset === "yesterday") {
    const y = new Date(todayStart.getTime() - 86400000);
    return { from: y.toISOString(), to: todayStart.toISOString() };
  }
  if (preset === "custom" && cFrom && cTo) {
    return { from: new Date(cFrom).toISOString(), to: new Date(new Date(cTo).getTime() + 86400000).toISOString() };
  }
  const days = preset === "7d" ? 7 : preset === "90d" ? 90 : 30;
  const from = new Date(todayStart.getTime() - (days - 1) * 86400000);
  return { from: from.toISOString(), to: tomorrow.toISOString() };
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

  const insights = buildInsights(data);

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
            onClick={() => exportDashboardPdf(data)}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-accent"
          >
            <FileDown className="h-3.5 w-3.5" /> Export PDF
          </button>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-accent"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Date range filter */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
        <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Range</span>
        {([
          ["today","Today"],["yesterday","Yesterday"],["7d","7d"],["30d","30d"],["90d","90d"],["custom","Custom"],
        ] as const).map(([k,l]) => (
          <button
            key={k}
            onClick={() => setPreset(k)}
            className={`rounded-sm border px-2 py-1 text-[11px] uppercase tracking-widest ${preset===k ? "border-primary bg-primary/15 text-primary" : "border-border hover:bg-accent"}`}
          >{l}</button>
        ))}
        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="rounded-sm border border-border bg-background px-2 py-1 text-xs" />
            <span className="text-xs text-muted-foreground">→</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="rounded-sm border border-border bg-background px-2 py-1 text-xs" />
          </div>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {fmtNum(data.orders_range)} orders · {fmtEGP(data.revenue_range)} · {fmtNum(data.visitors_range)} visitors
        </span>
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

      {/* Customer KPIs + order status grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Total Customers" value={fmtNum(data.customers?.total_customers ?? 0)} icon={<Users className="h-4 w-4" />} accent="info" />
        <KpiCard label="Returning Customers" value={fmtNum(data.customers?.returning_customers ?? 0)} icon={<Repeat className="h-4 w-4" />} accent="success" />
        <KpiCard label="New Customers (30d)" value={fmtNum(data.customers?.new_customers ?? 0)} icon={<Sparkles className="h-4 w-4" />} accent="success" />
        <KpiCard label="Weekly Revenue" value={fmtEGP(data.revenue_week)} icon={<Calendar className="h-4 w-4" />} accent="success" />
        <KpiCard label="Total Revenue" value={fmtEGP(data.revenue_total)} icon={<Banknote className="h-4 w-4" />} accent="success" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <KpiCard label="Pending" value={fmtNum(data.orders_pending)} icon={<Clock className="h-4 w-4" />} accent="warning" onClick={goto("orders")} />
        <KpiCard label="Processing" value={fmtNum(data.orders_processing ?? 0)} icon={<Activity className="h-4 w-4" />} accent="info" onClick={goto("orders")} />
        <KpiCard label="Printed" value={fmtNum(data.orders_printed ?? 0)} icon={<Package className="h-4 w-4" />} accent="info" onClick={goto("orders")} />
        <KpiCard label="Shipped" value={fmtNum(data.orders_shipped ?? 0)} icon={<Truck className="h-4 w-4" />} accent="info" onClick={goto("orders")} />
        <KpiCard label="Delivered" value={fmtNum(data.orders_delivered ?? 0)} icon={<CheckCircle2 className="h-4 w-4" />} accent="success" onClick={goto("orders")} />
        <KpiCard label="Completed" value={fmtNum(data.orders_completed)} icon={<CheckCircle2 className="h-4 w-4" />} accent="success" onClick={goto("orders")} />
        <KpiCard label="Cancelled" value={fmtNum(data.orders_cancelled)} icon={<XCircle className="h-4 w-4" />} accent="danger" onClick={goto("orders")} />
      </div>

      {/* AI Business Insights */}
      <Panel title="AI Business Insights" icon={<Lightbulb className="h-4 w-4 text-amber-300" />}>
        {insights.length === 0 ? (
          <div className="text-xs text-muted-foreground">Insights will appear once you have more sales data.</div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {insights.map((s, i) => (
              <li key={i} className="rounded-sm border border-border/60 bg-background/40 p-3 text-xs leading-relaxed">
                <span className="mr-2 inline-flex items-center rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-amber-300">Insight</span>
                {s}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Profit analytics */}
      <ProfitPanel data={data} onSaved={refetch} />

      {/* Extra performers + lowest + sizes */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Top Selling Sizes" icon={<Package className="h-4 w-4 text-muted-foreground" />}>
          {(data.top_sizes ?? []).length === 0 ? (
            <div className="text-xs text-muted-foreground">No size data yet.</div>
          ) : (
            <ul className="divide-y divide-border/60 text-sm">
              {(data.top_sizes ?? []).map((s) => (
                <li key={s.size} className="flex items-center justify-between py-2">
                  <span className="font-medium">{s.size}</span>
                  <span className="text-[11px] text-muted-foreground">{fmtNum(s.orders)} orders · {fmtEGP(s.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Top Sub Categories" icon={<FolderTree className="h-4 w-4 text-muted-foreground" />}>
          {(data.top_subcategories ?? []).length === 0 ? (
            <div className="text-xs text-muted-foreground">No sub-category sales yet.</div>
          ) : (
            <ul className="divide-y divide-border/60 text-sm">
              {(data.top_subcategories ?? []).slice(0, 8).map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2">
                  <Link to="/category/$slug" params={{ slug: c.slug }} className="truncate hover:text-primary">{c.name}</Link>
                  <span className="text-[11px] text-muted-foreground">{fmtNum(c.sales)} sold</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Lowest Performing" icon={<TrendingDown className="h-4 w-4 text-rose-300" />}>
          {(data.lowest_performing ?? []).length === 0 ? (
            <div className="text-xs text-muted-foreground">All posters are converting — nice.</div>
          ) : (
            <ul className="divide-y divide-border/60 text-sm">
              {(data.lowest_performing ?? []).slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2">
                  <SafeImage src={p.image_url} alt={p.title} className="h-10 w-8 rounded-sm border border-border object-cover" loading="lazy" />
                  <span className="flex-1 truncate">{p.title}</span>
                  <span className="rounded-sm bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-200">{fmtNum(p.views_count)} views · 0 sales</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Top cities + returning customers + no-result searches */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Top Cities" icon={<MapPin className="h-4 w-4 text-muted-foreground" />}>
          {(data.top_cities ?? []).length === 0 ? (
            <div className="text-xs text-muted-foreground">No order locations yet.</div>
          ) : (
            <ul className="divide-y divide-border/60 text-sm">
              {(data.top_cities ?? []).slice(0, 8).map((c) => (
                <li key={c.city} className="flex items-center justify-between py-2">
                  <span className="truncate">{c.city}</span>
                  <span className="text-[11px] text-muted-foreground">{fmtNum(c.orders)} · {fmtEGP(c.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Most Returning Customers" icon={<Repeat className="h-4 w-4 text-muted-foreground" />}>
          {(data.top_returning ?? []).length === 0 ? (
            <div className="text-xs text-muted-foreground">No returning customers yet.</div>
          ) : (
            <ul className="divide-y divide-border/60 text-sm">
              {(data.top_returning ?? []).map((c, i) => (
                <li key={i} className="flex items-center justify-between py-2">
                  <div className="min-w-0">
                    <div className="truncate">{c.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{c.phone ?? "—"} · {c.gov ?? "—"}</div>
                  </div>
                  <span className="text-[11px] text-muted-foreground">{fmtNum(c.orders)}× · {fmtEGP(c.spent)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Searches with No Results" icon={<AlertCircle className="h-4 w-4 text-amber-300" />}>
          {(data.no_result_searches ?? []).length === 0 ? (
            <div className="text-xs text-muted-foreground">Every search returned results 👌</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(data.no_result_searches ?? []).map((s) => (
                <span key={s.q} className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
                  {s.q} <span className="opacity-70">×{s.c}</span>
                </span>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Live activity feed */}
      <Panel
        title="Live Activity"
        icon={<Bell className="h-4 w-4 text-emerald-300" />}
        action={<span className="text-[10px] uppercase tracking-widest text-muted-foreground">Auto-refreshing</span>}
      >
        <ul className="divide-y divide-border/60 text-sm">
          {buildLiveFeed(data).slice(0, 12).map((a, i) => (
            <li key={i} className="flex items-center gap-3 py-2">
              <span className={`grid h-7 w-7 place-items-center rounded-full ${a.tone}`}>{a.icon}</span>
              <span className="flex-1 truncate">{a.text}</span>
              <span className="text-[10px] text-muted-foreground">{fmtTime(a.at)}</span>
            </li>
          ))}
          {buildLiveFeed(data).length === 0 && (
            <li className="py-2 text-xs text-muted-foreground">Activity will appear here as it happens.</li>
          )}
        </ul>
      </Panel>

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

/* ----------------------------- AI Insights ----------------------------- */

function buildInsights(d: Dashboard): string[] {
  const out: string[] = [];
  const cats = d.top_categories ?? [];
  const totalSales = cats.reduce((a, c) => a + (c.sales || 0), 0);
  if (cats[0] && totalSales > 0) {
    const pct = ((cats[0].sales / totalSales) * 100).toFixed(0);
    out.push(`${cats[0].name} posters generated ${pct}% of total category sales.`);
  }
  const sizes = d.top_sizes ?? [];
  if (sizes[0]) out.push(`${sizes[0].size} is your best-selling size (${fmtNum(sizes[0].orders)} orders).`);
  const govs = d.top_governorates ?? [];
  if (govs[0]) out.push(`${govs[0].governorate} leads in revenue with ${fmtEGP(govs[0].revenue)} across ${fmtNum(govs[0].orders)} orders.`);
  const top = d.top_selling?.[0];
  if (top && top.sales_count > 1) out.push(`${top.title} is your top performer with ${fmtNum(top.sales_count)} sales.`);
  const cust = d.customers;
  if (cust && cust.total_customers > 0) {
    const rate = ((cust.returning_customers / cust.total_customers) * 100).toFixed(0);
    out.push(`${rate}% of customers have ordered more than once — focus on retention to grow this.`);
  }
  const lowest = d.lowest_performing ?? [];
  if (lowest[0]) out.push(`${lowest[0].title} has ${fmtNum(lowest[0].views_count)} views but no sales — consider better pricing or imagery.`);
  const noRes = d.no_result_searches ?? [];
  if (noRes[0]) out.push(`Customers are searching for “${noRes[0].q}” (${fmtNum(noRes[0].c)}× with no results) — add matching products.`);
  const conv = d.conversions;
  if (conv?.custom_design > 0) out.push(`Custom design has ${fmtNum(conv.custom_design)} orders — promote this premium service more.`);
  if (d.orders_cancelled > 0 && d.orders_total > 0) {
    const r = ((d.orders_cancelled / d.orders_total) * 100).toFixed(1);
    if (Number(r) > 5) out.push(`Cancellation rate is ${r}% — review checkout and shipping to reduce drop-off.`);
  }
  return out.slice(0, 8);
}

/* ----------------------------- Live feed ----------------------------- */

type FeedItem = { text: string; at: string; tone: string; icon: ReactNode };

function buildLiveFeed(d: Dashboard): FeedItem[] {
  const items: FeedItem[] = [];
  (d.recent_orders ?? []).forEach((o) => items.push({
    text: `${o.customer_name ?? "A customer"} from ${o.governorate ?? "Egypt"} placed an order ${o.order_number ? `· ${o.order_number}` : ""}`,
    at: o.created_at,
    tone: "bg-emerald-500/20 text-emerald-300",
    icon: <ShoppingCart className="h-3.5 w-3.5" />,
  }));
  (d.recent_custom ?? []).forEach((c) => items.push({
    text: `${c.customer_name ?? "A customer"} submitted a custom design (${fmtNum(c.image_count)} image${c.image_count === 1 ? "" : "s"})`,
    at: c.created_at,
    tone: "bg-violet-500/20 text-violet-300",
    icon: <ImagePlus className="h-3.5 w-3.5" />,
  }));
  (d.recent_photo ?? []).forEach((p) => items.push({
    text: `${p.customer_name ?? "A customer"} ordered ${fmtNum(p.quantity)} photo prints`,
    at: p.created_at,
    tone: "bg-sky-500/20 text-sky-300",
    icon: <ImgIcon className="h-3.5 w-3.5" />,
  }));
  (d.recent_reviews ?? []).forEach((r) => items.push({
    text: `${r.customer_name} left a ${r.rating}★ review`,
    at: r.created_at,
    tone: "bg-amber-500/20 text-amber-300",
    icon: <Star className="h-3.5 w-3.5" />,
  }));
  return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

/* ----------------------------- Profit panel ----------------------------- */

function ProfitPanel({ data, onSaved }: { data: Dashboard; onSaved: () => void }) {
  const initial: Required<ProfitCosts> = {
    product_cost: Number(data.profit_costs?.product_cost ?? 0),
    packaging_cost: Number(data.profit_costs?.packaging_cost ?? 0),
    shipping_cost: Number(data.profit_costs?.shipping_cost ?? 0),
    advertising_cost: Number(data.profit_costs?.advertising_cost ?? 0),
  };
  const [costs, setCosts] = useState<Required<ProfitCosts>>(initial);
  const [saving, setSaving] = useState(false);

  const totalOrders = data.orders_total || 0;
  const gross = Number(data.revenue_total || 0);
  const totalProductCost = (costs.product_cost || 0) * totalOrders;
  const totalPackagingCost = (costs.packaging_cost || 0) * totalOrders;
  const totalShippingCost = (costs.shipping_cost || 0) * totalOrders;
  const totalAdCost = costs.advertising_cost || 0;
  const totalCost = totalProductCost + totalPackagingCost + totalShippingCost + totalAdCost;
  const net = gross - totalCost;
  const perOrder = totalOrders > 0 ? net / totalOrders : 0;

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("site_settings")
      .upsert({ key: "profit_costs", value: costs as unknown as never }, { onConflict: "key" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Profit costs saved");
    onSaved();
  };

  const Field = ({ label, k }: { label: string; k: keyof ProfitCosts }) => (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      <input
        type="number"
        min={0}
        value={costs[k] ?? 0}
        onChange={(e) => setCosts({ ...costs, [k]: Number(e.target.value) || 0 })}
        className="mt-1 w-full rounded-sm border border-border bg-background px-2 py-1.5 text-sm"
      />
    </label>
  );

  return (
    <Panel
      title="Profit Analytics"
      icon={<Banknote className="h-4 w-4 text-emerald-300" />}
      action={
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-accent disabled:opacity-50">
          <SettingsIcon className="h-3 w-3" /> {saving ? "Saving…" : "Save costs"}
        </button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Product cost / order" k="product_cost" />
          <Field label="Packaging cost / order" k="packaging_cost" />
          <Field label="Shipping cost / order" k="shipping_cost" />
          <Field label="Total advertising cost" k="advertising_cost" />
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Stat label="Gross Revenue" value={fmtEGP(gross)} tone="success" />
          <Stat label="Total Costs" value={fmtEGP(totalCost)} tone="danger" />
          <Stat label="Net Profit" value={fmtEGP(net)} tone={net >= 0 ? "success" : "danger"} />
          <Stat label="Profit / Order" value={fmtEGP(perOrder)} tone={perOrder >= 0 ? "success" : "danger"} />
        </div>
      </div>
    </Panel>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "success" | "danger" | "default" }) {
  const cls =
    tone === "success" ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-200" :
    tone === "danger" ? "border-rose-500/40 bg-rose-500/5 text-rose-200" :
    "border-border bg-background/40";
  return (
    <div className={`rounded-sm border ${cls} p-3`}>
      <div className="text-[10px] uppercase tracking-[0.2em] opacity-80">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

/* ----------------------------- PDF export ----------------------------- */

async function exportDashboardPdf(d: Dashboard) {
  try {
    const [{ jsPDF }, autoTableMod] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const autoTable = (autoTableMod as { default: (doc: unknown, opts: unknown) => void }).default;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    doc.setFontSize(18);
    doc.text("BRWAZWNEON · Dashboard Report", 40, 50);
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`Generated ${new Date().toLocaleString("en-EG")}`, 40, 68);

    autoTable(doc, {
      startY: 90,
      head: [["KPI", "Value"]],
      body: [
        ["Today's Revenue", fmtEGP(d.revenue_today)],
        ["Weekly Revenue", fmtEGP(d.revenue_week)],
        ["Monthly Revenue", fmtEGP(d.revenue_month)],
        ["Total Revenue", fmtEGP(d.revenue_total)],
        ["Today's Orders", fmtNum(d.orders_today)],
        ["Total Orders", fmtNum(d.orders_total)],
        ["Pending / Processing / Printed", `${d.orders_pending} / ${d.orders_processing ?? 0} / ${d.orders_printed ?? 0}`],
        ["Shipped / Delivered / Cancelled", `${d.orders_shipped ?? 0} / ${d.orders_delivered ?? 0} / ${d.orders_cancelled}`],
        ["Total Customers", fmtNum(d.customers?.total_customers ?? 0)],
        ["Returning Customers", fmtNum(d.customers?.returning_customers ?? 0)],
        ["Visitors (today / month / total)", `${d.visitors_today} / ${d.visitors_month} / ${d.visitors_total}`],
      ],
      theme: "grid",
      headStyles: { fillColor: [20, 20, 20] },
    });

    autoTable(doc, {
      head: [["Top Selling Poster", "Sales"]],
      body: (d.top_selling ?? []).slice(0, 10).map((p) => [p.title, fmtNum(p.sales_count)]),
      theme: "striped",
    });
    autoTable(doc, {
      head: [["Top Category", "Sales", "Views"]],
      body: (d.top_categories ?? []).slice(0, 10).map((c) => [c.name, fmtNum(c.sales), fmtNum(c.views)]),
      theme: "striped",
    });
    autoTable(doc, {
      head: [["Top Governorate", "Orders", "Revenue"]],
      body: (d.top_governorates ?? []).slice(0, 10).map((g) => [g.governorate, fmtNum(g.orders), fmtEGP(g.revenue)]),
      theme: "striped",
    });

    doc.save(`brwazwneon-dashboard-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success("PDF exported");
  } catch (e) {
    toast.error((e as Error).message);
  }
}