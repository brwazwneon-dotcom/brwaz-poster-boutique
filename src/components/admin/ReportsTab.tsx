import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  Download,
  Printer,
  TrendingUp,
  ShoppingBag,
  Users,
  RotateCcw,
  AlertTriangle,
  MapPin,
  Package,
} from "lucide-react";

type Row = Record<string, unknown>;

const PRESETS: { key: string; label: string; days: number }[] = [
  { key: "today", label: "Today", days: 0 },
  { key: "yesterday", label: "Yesterday", days: 1 },
  { key: "7d", label: "Last 7 Days", days: 7 },
  { key: "30d", label: "Last 30 Days", days: 30 },
  { key: "month", label: "This Month", days: -1 },
];

function range(preset: string, fromISO?: string, toISO?: string) {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (preset === "custom" && fromISO && toISO) {
    return { from: new Date(fromISO), to: new Date(new Date(toISO).getTime() + 86400000) };
  }
  if (preset === "today")
    return { from: startOfDay(now), to: new Date(startOfDay(now).getTime() + 86400000) };
  if (preset === "yesterday") {
    const s = new Date(startOfDay(now).getTime() - 86400000);
    return { from: s, to: new Date(s.getTime() + 86400000) };
  }
  if (preset === "7d")
    return {
      from: new Date(startOfDay(now).getTime() - 6 * 86400000),
      to: new Date(startOfDay(now).getTime() + 86400000),
    };
  if (preset === "30d")
    return {
      from: new Date(startOfDay(now).getTime() - 29 * 86400000),
      to: new Date(startOfDay(now).getTime() + 86400000),
    };
  if (preset === "month")
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: new Date(startOfDay(now).getTime() + 86400000),
    };
  return {
    from: new Date(startOfDay(now).getTime() - 13 * 86400000),
    to: new Date(startOfDay(now).getTime() + 86400000),
  };
}

export function ReportsTab({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [preset, setPreset] = useState("7d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { from: rf, to: rt } = range(preset, from, to);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-reports", preset, from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "admin_dashboard" as never,
        {
          p_from: rf.toISOString(),
          p_to: rt.toISOString(),
        } as never,
      );
      if (error) throw error;
      return data as unknown as Record<string, unknown>;
    },
  });

  const num = (k: string) => Number((data?.[k] as number | undefined) ?? 0);
  const list = (k: string) => (data?.[k] as Row[] | undefined) ?? [];
  const conversions = (data?.conversions as Record<string, number> | undefined) ?? {};
  const customers = (data?.customers as Record<string, number> | undefined) ?? {};

  const revenueRange = num("revenue_range");
  const ordersRange = num("orders_range");
  const avgOrder = ordersRange ? revenueRange / ordersRange : 0;

  const exportCSV = async () => {
    const sections: [string, Row[]][] = [
      ["Top Selling", list("top_selling")],
      ["Top Viewed", list("top_viewed")],
      ["Top Wishlisted", list("top_wishlisted")],
      ["Top Categories", list("top_categories")],
      ["Top Sizes", list("top_sizes")],
      ["Top Governorates", list("top_governorates")],
      ["Top Returning Customers", list("top_returning")],
      ["Recent Orders", list("recent_orders")],
    ];
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    for (const [name, rows] of sections) {
      if (!rows.length) continue;
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 30));
    }
    XLSX.writeFile(wb, `brwaz-report-${preset}.xlsx`);
  };
  const exportCSVFile = async () => {
    const rows = list("recent_orders");
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `brwaz-orders-${preset}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={cn(
              "rounded-sm border px-3 py-1.5 text-xs uppercase tracking-widest",
              preset === p.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {p.label}
          </button>
        ))}
        <div className="ml-2 flex items-center gap-1">
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPreset("custom");
            }}
            className="rounded-sm border border-border bg-background px-2 py-1 text-xs"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPreset("custom");
            }}
            className="rounded-sm border border-border bg-background px-2 py-1 text-xs"
          />
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={exportCSVFile}
            className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-accent"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-accent"
          >
            <Download className="h-3.5 w-3.5" /> Excel
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-accent"
          >
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
        </div>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading report…</div>}

      {/* Headline cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          icon={<TrendingUp className="h-4 w-4" />}
          label="Revenue"
          value={`${Math.round(revenueRange)} EGP`}
          tone="emerald"
        />
        <Stat icon={<ShoppingBag className="h-4 w-4" />} label="Orders" value={ordersRange} />
        <Stat label="Avg Order" value={`${Math.round(avgOrder)} EGP`} />
        <Stat label="Revenue Today" value={`${Math.round(num("revenue_today"))} EGP`} />
        <Stat label="Orders Today" value={num("orders_today")} />
        <Stat label="Revenue Month" value={`${Math.round(num("revenue_month"))} EGP`} />
      </div>

      {/* Customers */}
      <Section title="Customers" icon={<Users className="h-4 w-4" />}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Total" value={customers.total_customers ?? 0} />
          <Stat label="New (30d)" value={customers.new_customers ?? 0} tone="blue" />
          <Stat label="Returning" value={customers.returning_customers ?? 0} tone="emerald" />
          <Stat
            label="Returning %"
            value={
              customers.total_customers
                ? `${Math.round(((customers.returning_customers ?? 0) * 100) / customers.total_customers)}%`
                : "0%"
            }
          />
        </div>
        <TopTable
          title="Top Returning Customers"
          rows={list("top_returning")}
          cols={[
            ["name", "Name"],
            ["phone", "Phone"],
            ["gov", "Gov"],
            ["orders", "Orders"],
            ["spent", "Spent"],
          ]}
        />
      </Section>

      {/* Orders */}
      <Section title="Orders" icon={<ShoppingBag className="h-4 w-4" />}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <Stat label="New" value={num("orders_pending")} tone="blue" />
          <Stat label="Confirmed" value={num("orders_processing")} tone="emerald" />
          <Stat label="Printing" value={num("orders_printed")} />
          <Stat label="Shipped" value={num("orders_shipped")} />
          <Stat label="Delivered" value={num("orders_delivered")} tone="emerald" />
          <Stat label="Cancelled" value={num("orders_cancelled")} tone="red" />
          <Stat label="Total" value={num("orders_total")} />
        </div>
      </Section>

      {/* Products */}
      <Section title="Products" icon={<Package className="h-4 w-4" />}>
        <div className="grid gap-3 md:grid-cols-2">
          <TopTable
            title="Best Sellers"
            rows={list("top_selling")}
            cols={[
              ["title", "Title"],
              ["sales_count", "Sales"],
            ]}
          />
          <TopTable
            title="Most Viewed"
            rows={list("top_viewed")}
            cols={[
              ["title", "Title"],
              ["views_count", "Views"],
            ]}
          />
          <TopTable
            title="Most Added to Cart"
            rows={list("top_cart")}
            cols={[
              ["title", "Title"],
              ["cart_adds_count", "Adds"],
            ]}
          />
          <TopTable
            title="Most Wishlisted"
            rows={list("top_wishlisted")}
            cols={[
              ["title", "Title"],
              ["wishlist_count", "Wishes"],
            ]}
          />
          <TopTable
            title="Top Sizes"
            rows={list("top_sizes")}
            cols={[
              ["size", "Size"],
              ["orders", "Orders"],
              ["revenue", "Revenue"],
            ]}
          />
          <TopTable
            title="Lowest Performing"
            rows={list("lowest_performing")}
            cols={[
              ["title", "Title"],
              ["views_count", "Views"],
              ["sales_count", "Sales"],
            ]}
          />
        </div>
      </Section>

      {/* Geography */}
      <Section title="Geography" icon={<MapPin className="h-4 w-4" />}>
        <div className="grid gap-3 md:grid-cols-2">
          <TopTable
            title="Top Governorates"
            rows={list("top_governorates")}
            cols={[
              ["governorate", "Governorate"],
              ["orders", "Orders"],
              ["revenue", "Revenue"],
            ]}
          />
          <TopTable
            title="Top Cities"
            rows={list("top_cities")}
            cols={[
              ["city", "City"],
              ["orders", "Orders"],
              ["revenue", "Revenue"],
            ]}
          />
        </div>
      </Section>

      {/* Alerts */}
      <Section title="Need Attention" icon={<AlertTriangle className="h-4 w-4" />}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ClickStat label="Abandoned Carts" value={0} onClick={() => onNavigate?.("abandoned")} />
          <ClickStat label="Alerts" value={0} onClick={() => onNavigate?.("alerts")} />
          <ClickStat label="Error Logs" value={0} onClick={() => onNavigate?.("error-logs")} />
          <ClickStat label="Performance" value={0} onClick={() => onNavigate?.("performance")} />
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-sm border border-border bg-background p-4">
      <div className="mb-3 flex items-center gap-2 text-display text-lg">
        {icon}
        {title}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string | number;
  tone?: "emerald" | "blue" | "red";
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-sm border p-3",
        tone === "emerald" && "border-emerald-500/40 bg-emerald-500/5",
        tone === "blue" && "border-blue-500/40 bg-blue-500/5",
        tone === "red" && "border-red-500/40 bg-red-500/5",
        !tone && "border-border bg-background",
      )}
    >
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function ClickStat({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string | number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-sm border border-border bg-background p-3 text-left transition hover:border-primary hover:bg-primary/5"
    >
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-widest text-primary">Open →</div>
    </button>
  );
}

function TopTable({ title, rows, cols }: { title: string; rows: Row[]; cols: [string, string][] }) {
  return (
    <div className="rounded-sm border border-border">
      <div className="border-b border-border bg-muted/30 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="p-3 text-xs text-muted-foreground">No data.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {cols.map(([k, l]) => (
                <th key={k} className="p-2 text-left">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 10).map((r, i) => (
              <tr key={i} className="border-t border-border">
                {cols.map(([k]) => {
                  const v = r[k];
                  const val =
                    typeof v === "number"
                      ? Math.abs(v) > 100 && k.includes("evenue")
                        ? `${Math.round(v)} EGP`
                        : String(v)
                      : v == null
                        ? "—"
                        : String(v);
                  return (
                    <td key={k} className="p-2 text-xs">
                      {val}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
