import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpRight, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tab } from "@/lib/admin-types";
import { CLOSED, DAY, egp, groupOrders, type Line, type Order } from "@/lib/admin-overview";

function Stat({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div className="border border-border bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${warn ? "text-destructive" : ""}`}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function OverviewTab({ onNavigate }: { onNavigate: (t: Tab) => void }) {
  const orders = useQuery({
    queryKey: ["admin-overview-orders"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * DAY).toISOString();
      const { data, error } = await supabase
        .from("real_orders")
        .select(
          "id,created_at,customer_name,phone,governorate,total_price,status,payment_method,payment_status,poster_title,order_number",
        )
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return groupOrders((data ?? []) as unknown as Line[]);
    },
  });

  const health = useQuery({
    queryKey: ["admin-overview-products"],
    staleTime: 60_000,
    queryFn: async () => {
      const count = async (f: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
        const { count, error } = await f(base());
        if (error) throw error;
        return count ?? 0;
      };
      const base = () => supabase.from("posters").select("id", { count: "exact", head: true });
      const [total, hidden, noImage, drafts] = await Promise.all([
        count((q) => q),
        count((q) => q.eq("hidden", true)),
        count((q) => q.or("image_url.is.null,image_url.eq.")),
        count((q) => q.in("review_status", ["draft", "needs_replace"])),
      ]);
      return { total, hidden, noImage, drafts };
    },
  });

  const stats = useMemo(() => {
    const list = orders.data ?? [];
    const now = Date.now();
    const within = (ms: number) => list.filter((o) => now - Date.parse(o.at) < ms);
    const sum = (xs: Order[]) => xs.reduce((s, o) => s + o.total, 0);
    const today = list.filter((o) => new Date(o.at).toDateString() === new Date().toDateString());
    const w = within(7 * DAY);
    const byStatus = new Map<string, number>();
    for (const o of list) byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1);
    const open = list.filter((o) => !CLOSED.has(o.status.toLowerCase()));
    const awaitingPayment = list.filter(
      (o) => o.payment === "instapay" && o.paymentStatus === "pending",
    );
    return {
      today,
      w,
      open,
      awaitingPayment,
      all: list,
      todayRev: sum(today),
      weekRev: sum(w),
      monthRev: sum(list),
      aov: list.length ? sum(list) / list.length : 0,
      byStatus: [...byStatus.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [orders.data]);

  const failed = orders.isError;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Operations overview</h2>
          <p className="text-xs text-muted-foreground">
            Real orders only (test orders excluded) · refreshes every minute
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void orders.refetch();
            void health.refetch();
          }}
          className="inline-flex min-h-9 items-center gap-2 border border-border px-3 text-xs uppercase tracking-widest hover:bg-accent"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${orders.isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {failed ? (
        <div
          role="alert"
          className="flex items-center gap-2 border border-destructive/50 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="h-4 w-4" /> Could not load orders. Check System Health.
        </div>
      ) : null}

      <section
        aria-label="Key numbers"
        className="grid grid-cols-2 gap-px bg-border md:grid-cols-4 [&>*]:bg-card"
      >
        <Stat label="Today" value={egp(stats.todayRev)} sub={`${stats.today.length} orders`} />
        <Stat label="Last 7 days" value={egp(stats.weekRev)} sub={`${stats.w.length} orders`} />
        <Stat label="Last 30 days" value={egp(stats.monthRev)} sub={`${stats.all.length} orders`} />
        <Stat label="Avg order value" value={egp(stats.aov)} sub="30 days" />
        <Stat
          label="Open orders"
          value={String(stats.open.length)}
          sub="not delivered / cancelled"
        />
        <Stat
          label="Awaiting Instapay"
          value={String(stats.awaitingPayment.length)}
          sub="payment pending"
          warn={stats.awaitingPayment.length > 0}
        />
        <Stat
          label="Posters"
          value={String(health.data?.total ?? "—")}
          sub={`${health.data?.hidden ?? "—"} hidden`}
        />
        <Stat
          label="Product issues"
          value={String((health.data?.noImage ?? 0) + (health.data?.drafts ?? 0))}
          sub={`${health.data?.noImage ?? 0} no image · ${health.data?.drafts ?? 0} need review`}
          warn={(health.data?.noImage ?? 0) > 0}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <section aria-label="Recent orders" className="border border-border">
          <header className="flex items-center justify-between border-b border-border px-4 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-widest">Recent orders</h3>
            <button
              type="button"
              onClick={() => onNavigate("orders")}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              All orders <ArrowUpRight className="h-3 w-3" />
            </button>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-2 py-2 font-medium">Customer</th>
                  <th className="px-2 py-2 font-medium">Items</th>
                  <th className="px-2 py-2 font-medium">Pay</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {stats.all.slice(0, 10).map((o) => (
                  <tr key={o.key} className="border-t border-border">
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums text-muted-foreground">
                      {new Date(o.at).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-2 py-2">
                      <div className="font-medium">{o.customer}</div>
                      <div className="text-muted-foreground">{o.gov}</div>
                    </td>
                    <td className="max-w-48 truncate px-2 py-2" title={o.titles.join(", ")}>
                      {o.items} · {o.titles[0] ?? "—"}
                    </td>
                    <td className="px-2 py-2 uppercase">
                      {o.payment}
                      {o.payment === "instapay" && o.paymentStatus === "pending" ? (
                        <span className="ms-1 text-destructive">●</span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">{o.status}</td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">
                      {egp(o.total)}
                    </td>
                  </tr>
                ))}
                {orders.isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : stats.all.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                      No orders in the last 30 days.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-6">
          <section aria-label="Orders by status" className="border border-border">
            <h3 className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-widest">
              By status (30d)
            </h3>
            <ul className="divide-y divide-border text-xs">
              {stats.byStatus.map(([s, n]) => (
                <li key={s} className="flex items-center justify-between px-4 py-2">
                  <span>{s}</span>
                  <span className="tabular-nums text-muted-foreground">{n}</span>
                </li>
              ))}
              {stats.byStatus.length === 0 ? (
                <li className="px-4 py-3 text-muted-foreground">—</li>
              ) : null}
            </ul>
          </section>
          <section aria-label="Shortcuts" className="border border-border">
            <h3 className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-widest">
              Operations
            </h3>
            <ul className="divide-y divide-border text-xs">
              {(
                [
                  ["system-health", "System health"],
                  ["backups", "Backups & recovery"],
                  ["images", "Image health"],
                  ["posters", "Products"],
                  ["realtime", "Live visitors"],
                  ["error-logs", "Error logs"],
                ] as Array<[Tab, string]>
              ).map(([t, label]) => (
                <li key={t}>
                  <button
                    type="button"
                    onClick={() => onNavigate(t)}
                    className="flex w-full items-center justify-between px-4 py-2 text-start hover:bg-accent"
                  >
                    {label} <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
