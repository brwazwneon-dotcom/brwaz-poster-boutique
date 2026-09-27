import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  getExecutiveDashboardAdmin,
  getAlertsAdmin,
  type DashboardRange,
  type AdminAlert,
} from "@/lib/db-admin.functions";
import type { Tab } from "@/components/admin/layout/nav-config";
import { LoadingTiles } from "@/components/admin/layout/LoadingState";
import { getMetaDashboardTiles } from "@/lib/meta-ads.functions";
import type { MetaDashboardTiles } from "@/lib/meta-ads.types";

type DashboardData = Awaited<ReturnType<typeof getExecutiveDashboardAdmin>>;

const RANGE_OPTIONS: { id: DashboardRange; label: string; compareLabel: string }[] = [
  { id: "today", label: "Today", compareLabel: "yesterday" },
  { id: "yesterday", label: "Yesterday", compareLabel: "the day before" },
  { id: "7d", label: "7 Days", compareLabel: "previous 7 days" },
  { id: "30d", label: "30 Days", compareLabel: "previous 30 days" },
  { id: "this_month", label: "This Month", compareLabel: "last month" },
  { id: "last_month", label: "Last Month", compareLabel: "the month before" },
];

function formatEGP(n: number): string {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 0 })} EGP`;
}

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) {
    if (current === 0) return null;
    return <span className="text-xs text-emerald-500">new</span>;
  }
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) return <span className="text-xs text-muted-foreground">flat</span>;
  const up = pct > 0;
  return (
    <span className={`text-xs ${up ? "text-emerald-500" : "text-red-500"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-border p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        {sub}
      </div>
    </div>
  );
}

const UNAVAILABLE_TILES: MetaDashboardTiles = {
  state: "unavailable",
  stale: false,
  lastSuccessAt: null,
  dataThrough: null,
  missing: [],
  currencyMismatch: false,
  spend: null,
  orders: null,
  revenueNet: null,
  cpa: null,
  roas: null,
  unmatchedOrders: 0,
};

const money = (n: number | null) =>
  n === null ? "—" : n < 100 ? `${n.toFixed(2)} EGP` : formatEGP(n);

/** Why a marketing tile has no number — always the real reason, never a fake zero. */
function marketingHint(t: MetaDashboardTiles): string {
  switch (t.state) {
    case "not_configured":
      return t.missing.length > 0
        ? `Not connected — add ${t.missing.join(", ")} on the server`
        : "Not connected — Meta Ads is not set up";
    case "migration_missing":
      return "Not connected — database migration for Meta Ads is pending";
    case "never_synced":
      return "Connected — open Meta Ads and press Sync now";
    case "not_covered":
      return "Not synced for this period — press Sync now in Meta Ads";
    default:
      return "Temporarily unavailable";
  }
}

/**
 * The four marketing tiles. They read the SAME synced Meta numbers as
 * Marketing & Analytics → Meta Ads, and load on their own: if Meta data is
 * missing or the read fails, the rest of the dashboard is unaffected.
 */
function MarketingTiles({
  range,
  onNavigate,
}: {
  range: DashboardRange;
  onNavigate?: (tab: Tab) => void;
}) {
  const [tiles, setTiles] = useState<MetaDashboardTiles | null>(null);

  useEffect(() => {
    let off = false;
    setTiles(null);
    getMetaDashboardTiles({ data: { range } })
      .then((t) => !off && setTiles(t))
      .catch(() => !off && setTiles(UNAVAILABLE_TILES));
    return () => {
      off = true;
    };
  }, [range]);

  if (tiles === null) {
    return (
      <div className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {["Marketing spend", "ROAS", "Cost per order", "Ad-sourced orders"].map((l) => (
          <Tile key={l} label={l} value="…" />
        ))}
      </div>
    );
  }

  if (tiles.state !== "ok") {
    const hint = marketingHint(tiles);
    return (
      <>
        <div className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {["Marketing spend", "ROAS", "Cost per order", "Ad-sourced orders"].map((l) => (
            <div key={l} className="rounded-sm border border-dashed border-border p-4">
              <div className="text-2xl font-semibold text-muted-foreground">—</div>
              <div className="mt-1 text-xs text-muted-foreground">{l}</div>
              <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground/70">
                {hint}
              </div>
            </div>
          ))}
        </div>
        {onNavigate && (
          <button
            onClick={() => onNavigate("analytics")}
            className="text-xs text-muted-foreground underline underline-offset-2"
          >
            Open Marketing &amp; Analytics → Meta Ads
          </button>
        )}
      </>
    );
  }

  const staleBadge = tiles.stale ? <span className="text-xs text-amber-500">stale</span> : null;
  const noRatio = tiles.currencyMismatch ? "currency ≠ EGP" : undefined;
  return (
    <>
      <div className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Marketing spend (Meta)" value={money(tiles.spend)} sub={staleBadge} />
        <Tile
          label="ROAS (placed orders, net)"
          value={tiles.roas === null ? "—" : `${tiles.roas.toFixed(2)}×`}
          sub={
            tiles.roas === null ? (
              <span className="text-xs text-muted-foreground">
                {noRatio ?? (tiles.spend ? "no orders yet" : "no spend")}
              </span>
            ) : (
              staleBadge
            )
          }
        />
        <Tile
          label="Cost per order"
          value={money(tiles.cpa)}
          sub={
            tiles.cpa === null ? (
              <span className="text-xs text-muted-foreground">
                {noRatio ?? (tiles.orders ? "no spend" : "no orders yet")}
              </span>
            ) : null
          }
        />
        <Tile
          label="Ad-sourced orders"
          value={String(tiles.orders ?? 0)}
          sub={
            tiles.unmatchedOrders > 0 ? (
              <span className="text-xs text-muted-foreground">
                +{tiles.unmatchedOrders} untraced
              </span>
            ) : null
          }
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Spend is Meta-reported{tiles.dataThrough ? ` through ${tiles.dataThrough}` : ""}. Orders and
        revenue are website orders credited to a Meta campaign (last touch), excluding cancelled —
        placed orders, not delivered.
        {tiles.stale ? " Meta data is older than 12 hours or the last sync failed." : ""}
        {onNavigate && (
          <>
            {" "}
            <button
              onClick={() => onNavigate("analytics")}
              className="underline underline-offset-2"
            >
              Campaign breakdown
            </button>
          </>
        )}
      </p>
    </>
  );
}

function AlertCenter({ onNavigate }: { onNavigate?: (tab: Tab) => void }) {
  const [alerts, setAlerts] = useState<AdminAlert[] | null>(null);

  useEffect(() => {
    getAlertsAdmin().then(setAlerts);
  }, []);

  if (alerts === null || alerts.length === 0) return null;

  return (
    <div className="mb-6 space-y-1.5">
      {alerts.map((a) => (
        <button
          key={a.id}
          onClick={() => onNavigate?.(a.tab)}
          className="flex w-full items-center gap-2 rounded-sm border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-left text-sm transition hover:bg-amber-500/15"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          <span>
            <strong className="tabular-nums">{a.count}</strong> {a.label}
          </span>
        </button>
      ))}
    </div>
  );
}

export function DashboardTab({ onNavigate }: { onNavigate?: (tab: Tab) => void }) {
  const [range, setRange] = useState<DashboardRange>("today");
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    setData(null);
    getExecutiveDashboardAdmin({ data: { range } }).then(setData);
  }, [range]);

  const rangeMeta = RANGE_OPTIONS.find((r) => r.id === range) ?? RANGE_OPTIONS[0];

  return (
    <div>
      <AlertCenter onNavigate={onNavigate} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Executive Dashboard</h2>
        <div className="flex flex-wrap gap-1">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`rounded-sm border px-3 py-1.5 text-xs ${
                range === r.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {data === null ? (
        <LoadingTiles />
      ) : (
        <>
          <p className="mb-4 text-xs text-muted-foreground">
            Compared with {rangeMeta.compareLabel}. Every number below is computed live from Neon —
            a store with no orders or traffic yet will correctly show zeros, not sample data.
          </p>

          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Sales
          </h3>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile
              label="Orders"
              value={String(data.orders)}
              sub={<DeltaBadge current={data.orders} previous={data.ordersPrev} />}
            />
            <Tile
              label="Revenue"
              value={formatEGP(data.revenue)}
              sub={<DeltaBadge current={data.revenue} previous={data.revenuePrev} />}
            />
            <Tile label="Average order value" value={formatEGP(data.averageOrderValue)} />
            <Tile
              label="Cancelled / Returned"
              value={`${data.cancelledOrders} / ${data.returnedOrders}`}
            />
          </div>

          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Customers &amp; traffic
          </h3>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="New customers" value={String(data.newCustomers)} />
            <Tile label="Returning customers" value={String(data.returningCustomers)} />
            <Tile label="Website visitors" value={String(data.visitors)} />
            <Tile
              label="Conversion rate"
              value={
                data.conversionRate === null ? "—" : `${(data.conversionRate * 100).toFixed(1)}%`
              }
            />
          </div>

          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Marketing
          </h3>
          <MarketingTiles range={range} onNavigate={onNavigate} />
        </>
      )}
    </div>
  );
}
