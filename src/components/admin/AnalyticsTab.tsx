import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SafeImage } from "@/components/SafeImage";

type Row = { label: string; value: number | string; sub?: string };

type PosterRow = { id: string; title: string; image_url: string } & Record<string, number>;
type CategoryRow = { id: string; name: string; slug: string; sales: number; views: number };
type SearchRow = { q: string; c: number };
type GovRow = { governorate: string; orders: number; revenue: number };
type DeviceRow = { device: string; visitors: number };
type SourceRow = { source: string; visitors: number };

type Dashboard = {
  visitors_today: number;
  visitors_total: number;
  orders_today: number;
  revenue_today: number;
  revenue_week: number;
  revenue_month: number;
  orders_total: number;
  revenue_total: number;
  top_selling: (PosterRow & { sales_count: number })[];
  top_viewed: (PosterRow & { views_count: number })[];
  top_cart: (PosterRow & { cart_adds_count: number })[];
  top_wishlisted: (PosterRow & { wishlist_count: number })[];
  top_categories: CategoryRow[];
  top_searches: SearchRow[];
  top_governorates: GovRow[];
  devices: DeviceRow[];
  sources: SourceRow[];
  conversions: {
    photo_printing: number;
    custom_design: number;
    wooden_portrait: number;
    black_frame: number;
    white_frame: number;
    offers: number;
  };
};

function fmtEGP(n: number | string): string {
  const v = typeof n === "string" ? Number(n) : n;
  return new Intl.NumberFormat("en-EG", { maximumFractionDigits: 0 }).format(v || 0) + " EGP";
}
function fmtNum(n: number | string): string {
  const v = typeof n === "string" ? Number(n) : n;
  return new Intl.NumberFormat("en-EG").format(v || 0);
}

function StatCard({ label, value, sub }: Row) {
  return (
    <div className="rounded-sm border border-border bg-card p-4">
      <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function PosterList({ title, items, metricKey, metricLabel }: {
  title: string;
  items: PosterRow[];
  metricKey: string;
  metricLabel: string;
}) {
  return (
    <div className="rounded-sm border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{title}</div>
      {items.length === 0 ? (
        <div className="mt-3 text-xs text-muted-foreground">No data yet.</div>
      ) : (
        <ul className="mt-3 divide-y divide-border text-sm">
          {items.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 py-2">
              <span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
              <SafeImage src={p.image_url} alt={p.title} className="h-10 w-10 rounded-sm object-cover" loading="lazy" />
              <span className="flex-1 truncate">{p.title}</span>
              <span className="text-xs text-muted-foreground">
                {fmtNum((p as Record<string, number>)[metricKey] ?? 0)} {metricLabel}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SimpleList({ title, rows }: { title: string; rows: { label: string; value: string }[] }) {
  return (
    <div className="rounded-sm border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{title}</div>
      {rows.length === 0 ? (
        <div className="mt-3 text-xs text-muted-foreground">No data yet.</div>
      ) : (
        <ul className="mt-3 divide-y divide-border text-sm">
          {rows.map((r, i) => (
            <li key={`${r.label}-${i}`} className="flex items-center justify-between py-2">
              <span className="truncate">{r.label}</span>
              <span className="text-xs text-muted-foreground">{r.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AnalyticsTab() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-dashboard"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_dashboard");
      if (error) throw error;
      return data as unknown as Dashboard;
    },
  });

  if (isLoading) {
    return <div className="py-20 text-center text-sm text-muted-foreground">Loading analytics…</div>;
  }
  if (isError || !data) {
    return (
      <div className="rounded-sm border border-destructive/40 bg-destructive/5 p-6 text-sm">
        Failed to load analytics: {(error as Error | null)?.message ?? "unknown"}
      </div>
    );
  }

  const aov = data.orders_total > 0 ? Number(data.revenue_total) / data.orders_total : 0;
  const conv = data.visitors_total > 0 ? (data.orders_total / data.visitors_total) * 100 : 0;

  const desktop = data.devices.find((d) => d.device === "desktop")?.visitors ?? 0;
  const mobile = data.devices.find((d) => d.device === "mobile")?.visitors ?? 0;
  const tablet = data.devices.find((d) => d.device === "tablet")?.visitors ?? 0;

  const sourceMap = new Map(data.sources.map((s) => [s.source, s.visitors]));
  const sourceRows = ["facebook", "instagram", "google", "whatsapp", "direct", "organic", "twitter", "tiktok", "other"]
    .filter((k) => sourceMap.has(k))
    .map((k) => ({ label: k.charAt(0).toUpperCase() + k.slice(1), value: fmtNum(sourceMap.get(k) ?? 0) + " visitors" }));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-display text-2xl">Analytics</h2>
        <button
          onClick={() => refetch()}
          className="rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
        >
          Refresh
        </button>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Today's Visitors" value={fmtNum(data.visitors_today)} />
        <StatCard label="Today's Orders" value={fmtNum(data.orders_today)} />
        <StatCard label="Today's Revenue" value={fmtEGP(data.revenue_today)} />
        <StatCard label="Weekly Revenue (7d)" value={fmtEGP(data.revenue_week)} />
        <StatCard label="Monthly Revenue (30d)" value={fmtEGP(data.revenue_month)} />
        <StatCard label="Total Revenue" value={fmtEGP(data.revenue_total)} />
        <StatCard label="Total Visitors" value={fmtNum(data.visitors_total)} />
        <StatCard label="Conversion Rate" value={`${conv.toFixed(2)}%`} sub={`${fmtNum(data.orders_total)} orders / ${fmtNum(data.visitors_total)} visitors`} />
        <StatCard label="Average Order Value" value={fmtEGP(aov)} />
      </div>

      {/* Custom conversions */}
      <div>
        <h3 className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Custom Conversions</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Photo Printing" value={fmtNum(data.conversions.photo_printing)} />
          <StatCard label="Custom Design" value={fmtNum(data.conversions.custom_design)} />
          <StatCard label="Wooden Portrait" value={fmtNum(data.conversions.wooden_portrait)} />
          <StatCard label="Black Frame" value={fmtNum(data.conversions.black_frame)} />
          <StatCard label="White Frame" value={fmtNum(data.conversions.white_frame)} />
          <StatCard label="Offers (bundles)" value={fmtNum(data.conversions.offers)} />
        </div>
      </div>

      {/* Top posters lists */}
      <div className="grid gap-4 lg:grid-cols-2">
        <PosterList title="Top Selling Posters" items={data.top_selling} metricKey="sales_count" metricLabel="sold" />
        <PosterList title="Top Viewed Posters" items={data.top_viewed} metricKey="views_count" metricLabel="views" />
        <PosterList title="Top Added-To-Cart" items={data.top_cart} metricKey="cart_adds_count" metricLabel="adds" />
        <PosterList title="Top Wishlisted" items={data.top_wishlisted} metricKey="wishlist_count" metricLabel="❤" />
      </div>

      {/* Categories + searches + locations */}
      <div className="grid gap-4 lg:grid-cols-3">
        <SimpleList
          title="Top Selling Categories"
          rows={data.top_categories.map((c) => ({ label: c.name, value: `${fmtNum(c.sales)} sold · ${fmtNum(c.views)} views` }))}
        />
        <SimpleList
          title="Most Searched Keywords"
          rows={data.top_searches.map((s) => ({ label: s.q, value: `${fmtNum(s.c)}×` }))}
        />
        <SimpleList
          title="Top Governorates"
          rows={data.top_governorates.map((g) => ({ label: g.governorate, value: `${fmtNum(g.orders)} orders · ${fmtEGP(g.revenue)}` }))}
        />
      </div>

      {/* Devices + Traffic sources */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-sm border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Top Devices</div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-sm border border-border p-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Desktop</div>
              <div className="mt-1 text-xl font-semibold">{fmtNum(desktop)}</div>
            </div>
            <div className="rounded-sm border border-border p-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Mobile</div>
              <div className="mt-1 text-xl font-semibold">{fmtNum(mobile)}</div>
            </div>
            <div className="rounded-sm border border-border p-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Tablet</div>
              <div className="mt-1 text-xl font-semibold">{fmtNum(tablet)}</div>
            </div>
          </div>
        </div>
        <SimpleList title="Traffic Sources" rows={sourceRows} />
      </div>
    </div>
  );
}