import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity, Users, UserPlus, Repeat, Globe, MapPin, Smartphone, Monitor, Tablet,
  Facebook, Instagram, Search, MessageCircle, Link as LinkIcon,
  Eye, Heart, ShoppingCart, CreditCard, CheckCircle2,
  FileDown, RefreshCcw, Radio,
} from "lucide-react";
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar,
} from "recharts";

type Period = "hour" | "day" | "week" | "month" | "year";

type CountryRow = { country: string; country_code: string | null; visitors: number };
type GovRow = { governorate: string; visitors: number };
type CityRow = { city: string; governorate: string; visitors: number };
type SimpleRow = { source?: string; device?: string; browser?: string; os?: string; visitors: number };
type FeedRow = {
  visitor_hash: string; path: string | null; source: string | null;
  device: string | null; browser: string | null; os: string | null;
  city: string | null; governorate: string | null; country: string | null;
  country_code: string | null; referrer: string | null; created_at: string;
};
type SearchFeed = { visitor_hash: string; q: string; ts: string };
type Hourly = { hour: string; visitors: number; pageviews: number };

type Payload = {
  period: Period;
  period_start: string;
  online_now: number;
  visitors_total: number;
  new_visitors: number;
  returning_visitors: number;
  countries: CountryRow[];
  governorates: GovRow[];
  cities: CityRow[];
  sources: SimpleRow[];
  devices: SimpleRow[];
  browsers: SimpleRow[];
  oses: SimpleRow[];
  funnel: {
    visits: number; product_views: number; wishlist_adds: number;
    cart_adds: number; checkout_started: number; orders_completed: number;
  };
  live_feed: FeedRow[];
  live_searches: SearchFeed[];
  hourly: Hourly[];
};

function fmt(n: number): string {
  return new Intl.NumberFormat("en-EG").format(n || 0);
}
function pct(a: number, b: number): string {
  if (!b) return "0%";
  return `${Math.round((a / b) * 100)}%`;
}
function timeAgo(ts: string): string {
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60) return `${Math.max(1, Math.floor(s))}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}
function flag(cc: string | null | undefined): string {
  if (!cc || cc.length !== 2) return "🌐";
  const A = 0x1f1e6, base = "A".charCodeAt(0);
  return String.fromCodePoint(A + cc.toUpperCase().charCodeAt(0) - base, A + cc.toUpperCase().charCodeAt(1) - base);
}
function sourceIcon(s: string | null | undefined) {
  const v = (s || "").toLowerCase();
  if (v.includes("facebook")) return <Facebook className="h-3.5 w-3.5" />;
  if (v.includes("instagram")) return <Instagram className="h-3.5 w-3.5" />;
  if (v.includes("google") || v.includes("organic")) return <Search className="h-3.5 w-3.5" />;
  if (v.includes("whatsapp")) return <MessageCircle className="h-3.5 w-3.5" />;
  if (v.includes("direct")) return <Globe className="h-3.5 w-3.5" />;
  return <LinkIcon className="h-3.5 w-3.5" />;
}
function deviceIcon(d: string | null | undefined) {
  const v = (d || "").toLowerCase();
  if (v === "mobile") return <Smartphone className="h-3.5 w-3.5" />;
  if (v === "tablet") return <Tablet className="h-3.5 w-3.5" />;
  return <Monitor className="h-3.5 w-3.5" />;
}

export function RealtimeAnalyticsTab() {
  const [period, setPeriod] = useState<Period>("day");
  const qc = useQueryClient();
  const [live, setLive] = useState(true);

  const query = useQuery({
    queryKey: ["admin-realtime-analytics", period],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_realtime_analytics", { p_period: period });
      if (error) throw error;
      return data as unknown as Payload;
    },
    refetchInterval: live ? 15_000 : false,
  });

  // Realtime channel: refetch when a new visit lands
  useEffect(() => {
    if (!live) return;
    const ch = supabase
      .channel("realtime-visits")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "analytics_visits" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-realtime-analytics"] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [live, qc]);

  const data = query.data;

  const funnelRows = useMemo(() => {
    if (!data) return [];
    const f = data.funnel;
    return [
      { label: "Visitors", value: f.visits, icon: Users, color: "hsl(210, 100%, 60%)" },
      { label: "Product views", value: f.product_views, icon: Eye, color: "hsl(190, 90%, 55%)" },
      { label: "Wishlist", value: f.wishlist_adds, icon: Heart, color: "hsl(340, 85%, 60%)" },
      { label: "Add to cart", value: f.cart_adds, icon: ShoppingCart, color: "hsl(30, 95%, 60%)" },
      { label: "Checkout started", value: f.checkout_started, icon: CreditCard, color: "hsl(280, 80%, 60%)" },
      { label: "Orders completed", value: f.orders_completed, icon: CheckCircle2, color: "hsl(140, 70%, 50%)" },
    ];
  }, [data]);

  const cartAbandonment = useMemo(() => {
    if (!data) return 0;
    const c = data.funnel.cart_adds;
    const o = data.funnel.orders_completed;
    if (!c) return 0;
    return Math.max(0, Math.round(((c - o) / c) * 100));
  }, [data]);

  function exportCSV() {
    if (!data) return;
    const rows: string[][] = [];
    rows.push(["Metric", "Value"]);
    rows.push(["Online now", String(data.online_now)]);
    rows.push(["Visitors (period)", String(data.visitors_total)]);
    rows.push(["New visitors", String(data.new_visitors)]);
    rows.push(["Returning visitors", String(data.returning_visitors)]);
    rows.push([]);
    rows.push(["Section", "Label", "Visitors"]);
    data.countries.forEach(c => rows.push(["Country", c.country, String(c.visitors)]));
    data.governorates.forEach(g => rows.push(["Governorate", g.governorate, String(g.visitors)]));
    data.sources.forEach(s => rows.push(["Source", s.source ?? "", String(s.visitors)]));
    data.devices.forEach(d => rows.push(["Device", d.device ?? "", String(d.visitors)]));
    data.browsers.forEach(b => rows.push(["Browser", b.browser ?? "", String(b.visitors)]));
    data.oses.forEach(o => rows.push(["OS", o.os ?? "", String(o.visitors)]));
    const csv = rows.map(r => r.map(v => `"${(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    downloadBlob(csv, `analytics-${period}-${new Date().toISOString().slice(0,10)}.csv`, "text/csv;charset=utf-8");
  }

  async function exportExcel() {
    if (!data) return;
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const summary = [
        ["Online now", data.online_now],
        ["Visitors (period)", data.visitors_total],
        ["New visitors", data.new_visitors],
        ["Returning visitors", data.returning_visitors],
        ["Cart abandonment", `${cartAbandonment}%`],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Metric","Value"], ...summary]), "Summary");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.countries), "Countries");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.governorates), "Governorates");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.sources), "Sources");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.devices), "Devices");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.browsers), "Browsers");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.oses), "Operating Systems");
      XLSX.writeFile(wb, `analytics-${period}-${new Date().toISOString().slice(0,10)}.xlsx`);
    } catch (err) {
      console.error(err);
      toast.error("Excel export failed");
    }
  }

  async function exportPDF() {
    if (!data) return;
    try {
      const [{ jsPDF }, autoTableMod] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const doc = new jsPDF();
      const autoTable = (autoTableMod as unknown as { default: (d: unknown, o: unknown) => void }).default;
      doc.setFontSize(16);
      doc.text("BRWAZWNEON — Realtime Analytics", 14, 18);
      doc.setFontSize(10);
      doc.text(`Period: ${period} • Generated: ${new Date().toLocaleString()}`, 14, 25);
      autoTable(doc, {
        startY: 32,
        head: [["Metric", "Value"]],
        body: [
          ["Online now", String(data.online_now)],
          ["Visitors", String(data.visitors_total)],
          ["New visitors", String(data.new_visitors)],
          ["Returning visitors", String(data.returning_visitors)],
          ["Cart abandonment", `${cartAbandonment}%`],
        ],
      });
      autoTable(doc, { head: [["Country", "Visitors"]], body: data.countries.map(c => [c.country, String(c.visitors)]) });
      autoTable(doc, { head: [["Governorate", "Visitors"]], body: data.governorates.map(g => [g.governorate, String(g.visitors)]) });
      autoTable(doc, { head: [["Source", "Visitors"]], body: data.sources.map(s => [s.source ?? "", String(s.visitors)]) });
      autoTable(doc, { head: [["Device", "Visitors"]], body: data.devices.map(d => [d.device ?? "", String(d.visitors)]) });
      autoTable(doc, { head: [["Browser", "Visitors"]], body: data.browsers.map(b => [b.browser ?? "", String(b.visitors)]) });
      autoTable(doc, { head: [["OS", "Visitors"]], body: data.oses.map(o => [o.os ?? "", String(o.visitors)]) });
      doc.save(`analytics-${period}-${new Date().toISOString().slice(0,10)}.pdf`);
    } catch (err) {
      console.error(err);
      toast.error("PDF export failed");
    }
  }

  if (query.isLoading || !data) {
    return <div className="text-sm text-muted-foreground">Loading realtime analytics…</div>;
  }

  if (query.error) {
    return <div className="text-sm text-destructive">Failed to load analytics.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="relative inline-flex h-2.5 w-2.5">
            <span className={`absolute inline-flex h-full w-full rounded-full ${live ? "bg-green-500 animate-ping opacity-75" : "bg-muted"}`} />
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${live ? "bg-green-500" : "bg-muted"}`} />
          </span>
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {live ? "LIVE" : "Paused"}
          </span>
          <button
            onClick={() => setLive(v => !v)}
            className="ml-2 rounded border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-muted"
          >
            <Radio className="mr-1 inline h-3 w-3" />
            {live ? "Pause" : "Resume"}
          </button>
          <button
            onClick={() => query.refetch()}
            className="rounded border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-muted"
          >
            <RefreshCcw className="mr-1 inline h-3 w-3" />
            Refresh
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(["hour", "day", "week", "month", "year"] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded px-3 py-1 text-[11px] font-semibold uppercase tracking-widest transition ${
                period === p ? "bg-foreground text-background" : "border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {p === "hour" ? "1h" : p === "day" ? "Today" : p === "week" ? "7d" : p === "month" ? "30d" : "1y"}
            </button>
          ))}
          <div className="mx-2 h-6 w-px bg-border" />
          <button onClick={exportCSV} className="rounded border border-border px-3 py-1 text-[11px] font-semibold uppercase tracking-widest hover:bg-muted">
            <FileDown className="mr-1 inline h-3 w-3" /> CSV
          </button>
          <button onClick={exportExcel} className="rounded border border-border px-3 py-1 text-[11px] font-semibold uppercase tracking-widest hover:bg-muted">
            <FileDown className="mr-1 inline h-3 w-3" /> Excel
          </button>
          <button onClick={exportPDF} className="rounded border border-border px-3 py-1 text-[11px] font-semibold uppercase tracking-widest hover:bg-muted">
            <FileDown className="mr-1 inline h-3 w-3" /> PDF
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard icon={<Activity className="h-4 w-4" />} label="Online now" value={data.online_now} accent="text-green-500" />
        <KpiCard icon={<Users className="h-4 w-4" />} label="Visitors" value={data.visitors_total} />
        <KpiCard icon={<UserPlus className="h-4 w-4" />} label="New" value={data.new_visitors} />
        <KpiCard icon={<Repeat className="h-4 w-4" />} label="Returning" value={data.returning_visitors} />
      </div>

      {/* Traffic trend (24h) */}
      <Card title="Traffic (last 24h)">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.hourly}>
              <defs>
                <linearGradient id="rtv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(210,90%,60%)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="hsl(210,90%,60%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="hour" tickFormatter={(v: string) => v.slice(11, 16)} stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
              <Area type="monotone" dataKey="visitors" stroke="hsl(210,90%,60%)" fill="url(#rtv)" name="Visitors" />
              <Area type="monotone" dataKey="pageviews" stroke="hsl(340,85%,60%)" fillOpacity={0} name="Pageviews" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Funnel */}
      <Card title="Customer behavior funnel">
        <div className="space-y-2">
          {funnelRows.map((row, i) => {
            const p = i === 0 ? 100 : Math.round(((row.value || 0) / (funnelRows[0].value || 1)) * 100);
            const Icon = row.icon;
            return (
              <div key={row.label} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{row.label}</span>
                  </span>
                  <span className="font-mono text-xs">{fmt(row.value)} · {p}%</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${p}%`, background: row.color }} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-6 text-xs text-muted-foreground">
          <span>Cart abandonment: <b className="text-foreground">{cartAbandonment}%</b></span>
          <span>View→Order: <b className="text-foreground">{pct(data.funnel.orders_completed, data.funnel.product_views)}</b></span>
        </div>
      </Card>

      {/* Live feed + Live searches */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Live visitors (${data.live_feed.length})`}>
          <div className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
            {data.live_feed.length === 0 && <div className="text-xs text-muted-foreground">No active visitors right now.</div>}
            {data.live_feed.map((v) => (
              <div key={v.visitor_hash + v.created_at} className="flex items-start gap-2 rounded border border-border/60 bg-card px-2 py-1.5 text-xs">
                <span className="text-lg leading-none">{flag(v.country_code)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase text-muted-foreground">{v.visitor_hash}</span>
                    <span className="truncate">
                      {[v.city, v.governorate, v.country].filter(Boolean).join(", ") || "Unknown location"}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    {sourceIcon(v.source)}
                    <span className="capitalize">{v.source || "direct"}</span>
                    <span>•</span>
                    {deviceIcon(v.device)}
                    <span>{v.browser}</span>
                    <span>•</span>
                    <span className="truncate">{v.path || "/"}</span>
                  </div>
                </div>
                <span className="whitespace-nowrap text-[10px] text-muted-foreground">{timeAgo(v.created_at)} ago</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Live searches">
          <div className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
            {data.live_searches.length === 0 && <div className="text-xs text-muted-foreground">No live searches.</div>}
            {data.live_searches.map((s, i) => (
              <div key={i} className="flex items-center gap-2 rounded border border-border/60 bg-card px-2 py-1.5 text-xs">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-mono text-[10px] uppercase text-muted-foreground">{s.visitor_hash}</span>
                <span className="flex-1 truncate">"{s.q}"</span>
                <span className="text-[10px] text-muted-foreground">{timeAgo(s.ts)} ago</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Location + traffic sources */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Top countries">
          <RankList rows={data.countries.map(c => ({ label: `${flag(c.country_code)} ${c.country}`, value: c.visitors }))} />
        </Card>
        <Card title="Top governorates">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.governorates} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis dataKey="governorate" type="category" width={100} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                <Bar dataKey="visitors" fill="hsl(210,90%,60%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Traffic sources">
          <RankList rows={data.sources.map(s => ({
            label: (s.source || "direct").charAt(0).toUpperCase() + (s.source || "direct").slice(1),
            value: s.visitors,
            icon: sourceIcon(s.source),
          }))} />
        </Card>
        <Card title="Devices">
          <RankList rows={data.devices.map(d => ({
            label: (d.device || "unknown").charAt(0).toUpperCase() + (d.device || "unknown").slice(1),
            value: d.visitors,
            icon: deviceIcon(d.device),
          }))} />
        </Card>
        <Card title="Cities">
          <RankList rows={data.cities.map(c => ({
            label: c.city + (c.governorate ? `, ${c.governorate}` : ""),
            value: c.visitors,
            icon: <MapPin className="h-3.5 w-3.5" />,
          }))} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Browsers">
          <RankList rows={data.browsers.map(b => ({ label: b.browser || "Other", value: b.visitors }))} />
        </Card>
        <Card title="Operating systems">
          <RankList rows={data.oses.map(o => ({ label: o.os || "Other", value: o.visitors }))} />
        </Card>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Visitor IDs are hashed. No personal information is displayed. Location is estimated from IP address at page load.
      </p>
    </div>
  );
}

function KpiCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        <span className={accent}>{icon}</span>
        {label}
      </div>
      <div className={`mt-2 text-3xl font-bold ${accent ?? ""}`}>{fmt(value)}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function RankList({ rows }: { rows: { label: string; value: number; icon?: React.ReactNode }[] }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  if (rows.length === 0) return <div className="text-xs text-muted-foreground">No data.</div>;
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={i} className="relative overflow-hidden rounded border border-border/60 bg-background/40 px-2 py-1.5 text-xs">
          <div className="absolute inset-y-0 left-0 bg-primary/10" style={{ width: `${(r.value / max) * 100}%` }} />
          <div className="relative flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 truncate">{r.icon}<span className="truncate">{r.label}</span></span>
            <span className="font-mono text-[11px] text-muted-foreground">{fmt(r.value)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}