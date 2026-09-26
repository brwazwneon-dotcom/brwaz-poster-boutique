import { Fragment, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { LoadingTiles } from "@/components/admin/layout/LoadingState";
import { exportMetaAds, getMetaAdsReport, syncMetaAdsNow } from "@/lib/meta-ads.functions";
import type { RangeInput, TouchModel } from "@/lib/analytics-center.types";
import type {
  MetaAdRow,
  MetaAdsExportDataset,
  MetaAdsStatusView,
  MetaAdsetRow,
  MetaCampaignRow,
  SiteMetrics,
} from "@/lib/meta-ads.types";
import {
  EmptyState,
  ErrorState,
  Limitations,
  Notice,
  SectionTitle,
  TableWrap,
  Td,
  Th,
  downloadRows,
  fmtDay,
  fmtEgp,
  fmtNum,
  periodLabel,
  useAsync,
} from "./ui";

const STALE_AFTER_MS = 12 * 3_600_000;
const RETRY_AFTER_MS = 30 * 60_000;

const x = (n: number | null) => (n === null ? "—" : `${n.toFixed(2)}×`);
const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);
const money = (n: number | null) =>
  n === null ? "—" : n < 100 ? `${n.toFixed(2)} EGP` : fmtEgp(n);

function syncAge(status: MetaAdsStatusView): "never" | "stale" | "fresh" {
  if (!status.lastSuccess) return "never";
  return Date.now() - new Date(status.lastSuccess.finishedAt).getTime() > STALE_AFTER_MS
    ? "stale"
    : "fresh";
}

/** True when an automatic refresh is allowed right now (admin-only page, bounded). */
function shouldAutoSync(status: MetaAdsStatusView): boolean {
  if (!status.configured || !status.migrationApplied) return false;
  if (syncAge(status) === "fresh") return false;
  const last = status.lastAttempt;
  if (
    last &&
    (last.status === "running" || Date.now() - new Date(last.startedAt).getTime() < RETRY_AFTER_MS)
  )
    return false;
  return true;
}

const REASONS: Record<string, string> = {
  not_configured: "Meta Ads credentials are not set on the server.",
  migration_missing: "The database migration for Meta Ads has not been applied yet.",
  busy: "Another sync is already running.",
  auth: "Meta rejected the access token (invalid or expired).",
  permission: "The token is valid but is not allowed to read this ad account (needs ads_read).",
  rate_limit: "Meta is rate limiting requests. Try again in a few minutes.",
  server: "Meta had a temporary problem. Try again shortly.",
  network: "Could not reach Meta.",
  bad_request: "Meta did not accept the request.",
  malformed: "Meta returned something unreadable.",
  internal: "The sync failed unexpectedly.",
};

function SyncPanel({
  status,
  syncing,
  onSync,
}: {
  status: MetaAdsStatusView;
  syncing: boolean;
  onSync: () => void;
}) {
  const last = status.lastAttempt;
  const ok = status.lastSuccess;
  const setupNeeded = !status.configured || !status.migrationApplied;
  return (
    <div className="mb-4 rounded-sm border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">Meta Ads data</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {ok
              ? `Last successful sync: ${fmtDay(ok.finishedAt)} ${new Date(ok.finishedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Cairo" })}${ok.dateFrom && ok.dateTo ? ` · covered ${ok.dateFrom} to ${ok.dateTo}` : ""}`
              : "No successful sync yet"}
          </p>
        </div>
        <button
          onClick={onSync}
          disabled={syncing || setupNeeded}
          className="inline-flex items-center gap-1.5 rounded-sm border border-primary bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </div>

      {!status.migrationApplied && (
        <p className="mt-2 text-xs text-amber-600">
          Database migration <code>025_meta_ads_reporting.sql</code> has not been applied.
        </p>
      )}
      {status.migrationApplied && !status.configured && (
        <p className="mt-2 text-xs text-amber-600">
          Not connected. Missing on the server:{" "}
          {[...status.missing, ...status.invalid.map((n) => `${n} (invalid)`)].map((n, i) => (
            <Fragment key={n}>
              {i > 0 && ", "}
              <code>{n}</code>
            </Fragment>
          ))}
          . The token needs the <code>ads_read</code> permission on the ad account.
        </p>
      )}
      {status.configured && (
        <p className="mt-2 text-xs text-muted-foreground">
          Connected (API {status.apiVersion}). The token is kept on the server and is never shown.
        </p>
      )}
      {last && last.status !== "success" && (
        <p className="mt-2 text-xs text-muted-foreground">
          Last attempt {fmtDay(last.startedAt)}:{" "}
          <strong className={last.status === "failed" ? "text-red-500" : "text-amber-500"}>
            {last.status}
          </strong>
          {last.errorKind && REASONS[last.errorKind] ? ` — ${REASONS[last.errorKind]}` : ""}
          {last.message ? ` (${last.message})` : ""}
          {ok ? ". Showing the last successful data." : ""}
        </p>
      )}
      {last && last.status === "success" && (
        <p className="mt-1 text-xs text-muted-foreground">
          {fmtNum(last.rows)} rows written in the last sync.
        </p>
      )}
    </div>
  );
}

const metricCells = (r: {
  platform: {
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number | null;
    cpc: number | null;
    metaPurchases: number | null;
  };
  site: SiteMetrics;
  cpa: number | null;
  roas: number | null;
}) => (
  <>
    <Td right>{money(r.platform.spend)}</Td>
    <Td right>{fmtNum(r.platform.impressions)}</Td>
    <Td right>{fmtNum(r.platform.clicks)}</Td>
    <Td right>{pct(r.platform.ctr)}</Td>
    <Td right>{money(r.platform.cpc)}</Td>
    <Td right>{fmtNum(r.site.sessions)}</Td>
    <Td right>{fmtNum(r.site.addToCart)}</Td>
    <Td right>{fmtNum(r.site.checkout)}</Td>
    <Td right>{fmtNum(r.site.orders)}</Td>
    <Td right>{fmtEgp(r.site.revenueNet)}</Td>
    <Td right>{money(r.cpa)}</Td>
    <Td right>{x(r.roas)}</Td>
    <Td right>{r.platform.metaPurchases === null ? "—" : fmtNum(r.platform.metaPurchases)}</Td>
  </>
);

const Name = ({
  depth,
  children,
  open,
  onToggle,
}: {
  depth: number;
  children: string;
  open?: boolean;
  onToggle?: () => void;
}) => (
  <Td>
    <span className="flex items-center gap-1" style={{ paddingLeft: depth * 16 }}>
      {onToggle ? (
        <button
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? "Collapse" : "Expand"}
          className="rounded-sm p-0.5 hover:bg-accent"
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
      ) : (
        <span className="w-[18px]" />
      )}
      <span className={depth === 0 ? "font-medium" : ""} dir="auto">
        {children}
      </span>
    </span>
  </Td>
);

function AdRows({ ad }: { ad: MetaAdRow }) {
  return (
    <tr className="border-b border-border/60 text-xs last:border-0">
      <Name depth={2}>{ad.name}</Name>
      {metricCells(ad)}
    </tr>
  );
}

function AdsetRows({
  set,
  open,
  toggle,
}: {
  set: MetaAdsetRow;
  open: boolean;
  toggle: () => void;
}) {
  return (
    <>
      <tr className="border-b border-border/60 text-xs">
        <Name depth={1} open={open} onToggle={set.ads.length ? toggle : undefined}>
          {set.name}
        </Name>
        {metricCells(set)}
      </tr>
      {open && set.ads.map((a) => <AdRows key={a.id} ad={a} />)}
    </>
  );
}

function CampaignRows({
  c,
  expanded,
  toggle,
}: {
  c: MetaCampaignRow;
  expanded: Set<string>;
  toggle: (id: string) => void;
}) {
  const open = expanded.has(`c:${c.id}`);
  return (
    <>
      <tr className="border-b border-border bg-card/40">
        <Name depth={0} open={open} onToggle={() => toggle(`c:${c.id}`)}>
          {c.name}
        </Name>
        {metricCells(c)}
      </tr>
      {open &&
        c.adsets.map((s) => (
          <AdsetRows
            key={`${c.id}/${s.id}`}
            set={s}
            open={expanded.has(`s:${s.id}`)}
            toggle={() => toggle(`s:${s.id}`)}
          />
        ))}
      {open && (c.siteWithoutAd.sessions > 0 || c.siteWithoutAd.ordersAll > 0) && (
        <tr className="border-b border-border/60 text-xs text-muted-foreground">
          <Td>
            <span style={{ paddingLeft: 34 }}>Site traffic with no ad id in the link</span>
          </Td>
          <Td right>—</Td>
          <Td right>—</Td>
          <Td right>—</Td>
          <Td right>—</Td>
          <Td right>—</Td>
          <Td right>{fmtNum(c.siteWithoutAd.sessions)}</Td>
          <Td right>{fmtNum(c.siteWithoutAd.addToCart)}</Td>
          <Td right>{fmtNum(c.siteWithoutAd.checkout)}</Td>
          <Td right>{fmtNum(c.siteWithoutAd.orders)}</Td>
          <Td right>{fmtEgp(c.siteWithoutAd.revenueNet)}</Td>
          <Td right>—</Td>
          <Td right>—</Td>
          <Td right>—</Td>
        </tr>
      )}
    </>
  );
}

export function MetaAdsSection({ input, model }: { input: RangeInput; model: TouchModel }) {
  const { data, error, loading, reload } = useAsync(
    () => getMetaAdsReport({ data: { ...input, model } }),
    [input.range, input.from, input.to, model],
  );
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const autoTried = useRef(false);

  const runSync = async (auto = false) => {
    setSyncing(true);
    try {
      const r = await syncMetaAdsNow({ data: {} });
      if (r.ok) {
        if (!auto) toast.success(`Meta Ads synced (${fmtNum(r.insightRows)} daily rows)`);
      } else if (!auto) {
        toast.error(REASONS[r.errorKind ?? ""] ?? r.message ?? "Sync did not complete");
      }
      reload();
    } catch (e) {
      if (!auto) toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  // A stale (or never-run) sync refreshes itself once when an admin opens this page.
  useEffect(() => {
    if (!data || autoTried.current) return;
    autoTried.current = true;
    if (shouldAutoSync(data.status)) void runSync(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const doExport = async (dataset: MetaAdsExportDataset, format: "csv" | "xlsx") => {
    setExporting(true);
    try {
      const res = await exportMetaAds({ data: { ...input, model, dataset } });
      if (res.rows.length === 0) {
        toast.info("Nothing to export for this period");
        return;
      }
      await downloadRows(res.rows, res.filename, format);
      toast.success("Export ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <LoadingTiles count={3} />;
  const { status, report } = data;

  return (
    <div className={loading ? "opacity-70 transition" : "transition"}>
      <SyncPanel status={status} syncing={syncing} onSync={() => void runSync(false)} />

      {!report ? (
        <EmptyState>
          Meta Ads reporting needs the database migration before it can show data.
        </EmptyState>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {periodLabel(report.period)} · {model === "last" ? "last-touch" : "first-touch"}{" "}
              attribution
              {report.dataThrough ? ` · Meta data through ${report.dataThrough}` : ""}
            </p>
            <div className="flex gap-1">
              <button
                disabled={exporting}
                onClick={() => void doExport("meta_ads", "xlsx")}
                className="inline-flex items-center gap-1.5 rounded-sm border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" /> Ads (.xlsx)
              </button>
              <button
                disabled={exporting}
                onClick={() => void doExport("meta_ads", "csv")}
                className="rounded-sm border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
              >
                CSV
              </button>
              <button
                disabled={exporting}
                onClick={() => void doExport("meta_ads_orders", "csv")}
                className="rounded-sm border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
              >
                Orders → ads (CSV)
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Spend", money(report.totals.platform.spend)],
              ["Orders (site, net)", fmtNum(report.totals.matched.orders)],
              ["Revenue (site, net)", fmtEgp(report.totals.matched.revenueNet)],
              ["CPA", money(report.totals.cpa)],
              ["ROAS", x(report.totals.roas)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-sm border border-border p-3">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">
                  {label}
                </div>
                <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Of {fmtNum(report.totals.storeOrders)} orders ({fmtEgp(report.totals.storeRevenueNet)})
            in this period from every source, {fmtNum(report.totals.matched.orders)} (
            {fmtEgp(report.totals.matched.revenueNet)}) are tied to a Meta campaign.
            {report.totals.matched.revenueConfirmed > 0 ||
            report.totals.matched.revenueDelivered > 0
              ? ` Of that revenue, ${fmtEgp(report.totals.matched.revenueConfirmed)} is from confirmed orders and ${fmtEgp(report.totals.matched.revenueDelivered)} from delivered ones.`
              : " None of it is from delivered orders yet."}
          </p>

          <SectionTitle>Campaign → ad set → ad</SectionTitle>
          {report.campaigns.length === 0 ? (
            <EmptyState>No Meta spend or Meta-tagged website activity in this period.</EmptyState>
          ) : (
            <TableWrap>
              <thead className="border-b border-border bg-card">
                <tr>
                  <Th>Campaign / ad set / ad</Th>
                  <Th right>Spend</Th>
                  <Th right>Impr.</Th>
                  <Th right>Clicks</Th>
                  <Th right>CTR</Th>
                  <Th right>CPC</Th>
                  <Th right>Visits</Th>
                  <Th right>Add to cart</Th>
                  <Th right>Checkout</Th>
                  <Th right>Orders</Th>
                  <Th right>Revenue</Th>
                  <Th right>CPA</Th>
                  <Th right>ROAS</Th>
                  <Th right>Meta purch.</Th>
                </tr>
              </thead>
              <tbody>
                {report.campaigns.map((c) => (
                  <CampaignRows key={c.id || "unknown"} c={c} expanded={expanded} toggle={toggle} />
                ))}
              </tbody>
            </TableWrap>
          )}

          {(report.totals.unmatchedMeta.sessions > 0 ||
            report.totals.unmatchedMeta.ordersAll > 0) && (
            <Notice>
              {fmtNum(report.totals.unmatchedMeta.sessions)} paid Facebook/Instagram visits and{" "}
              {fmtNum(report.totals.unmatchedMeta.ordersAll)} orders carry ad tags that match no
              synced campaign (older campaigns, or tags that are not Meta ids). They are not
              dropped, just not tied to a campaign row.
            </Notice>
          )}
          <Limitations items={report.notes} />
        </>
      )}
    </div>
  );
}

export default MetaAdsSection;
