import { Suspense, lazy, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LoadingTiles } from "@/components/admin/layout/LoadingState";
import { exportAnalyticsDataset } from "@/lib/analytics-center.functions";
import type { ExportDataset, RangeInput, TouchModel } from "@/lib/analytics-center.types";
import type { AnalyticsRangeKey } from "@/lib/store-time";
import { downloadRows } from "./ui";

// Each section (and Recharts with it) loads only when it is opened.
const OverviewSection = lazy(() => import("./OverviewSection"));
const TrafficSection = lazy(() => import("./TrafficSection"));
const ProductsSection = lazy(() => import("./ProductsSection"));
const ClicksSection = lazy(() => import("./ClicksSection"));
const FunnelSection = lazy(() => import("./FunnelSection"));
const CartSection = lazy(() => import("./CartSection"));
const CampaignsSection = lazy(() => import("./CampaignsSection"));
const AdvertisingSection = lazy(() => import("./AdvertisingSection"));
const CustomDesignSection = lazy(() => import("./CustomDesignSection"));
const ReportsSection = lazy(() => import("./ReportsSection"));

type SectionId =
  | "overview"
  | "traffic"
  | "products"
  | "clicks"
  | "funnel"
  | "cart"
  | "campaigns"
  | "advertising"
  | "custom-design"
  | "reports";

const SECTIONS: Array<{ id: SectionId; label: string; usesRange: boolean; usesModel?: boolean }> = [
  { id: "overview", label: "Overview", usesRange: true },
  { id: "traffic", label: "Traffic", usesRange: true, usesModel: true },
  { id: "products", label: "Products", usesRange: true },
  { id: "clicks", label: "Clicks", usesRange: true },
  { id: "funnel", label: "Funnel", usesRange: true, usesModel: true },
  { id: "cart", label: "Cart", usesRange: true },
  { id: "campaigns", label: "Campaigns", usesRange: true, usesModel: true },
  { id: "advertising", label: "Advertising", usesRange: true },
  { id: "custom-design", label: "Custom Design", usesRange: true },
  { id: "reports", label: "Reports", usesRange: false },
];

const RANGES: Array<{ id: AnalyticsRangeKey; label: string }> = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Previous month" },
  { id: "custom", label: "Custom" },
];

const EXPORTS: Array<{ id: ExportDataset; label: string }> = [
  { id: "traffic", label: "Traffic" },
  { id: "products", label: "Products" },
  { id: "campaigns", label: "Campaigns" },
  { id: "cart", label: "Cart" },
  { id: "revenue", label: "Revenue (daily)" },
  { id: "orders", label: "Orders (anonymised)" },
];

const today = () => new Date().toISOString().slice(0, 10);

export function AnalyticsCenter() {
  const [section, setSection] = useState<SectionId>("overview");
  const [range, setRange] = useState<AnalyticsRangeKey>("30d");
  const [model, setModel] = useState<TouchModel>("last");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [applied, setApplied] = useState<{ from: string; to: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  const active = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  // A custom range only takes effect once both dates are applied; until then
  // the previous preset keeps showing.
  const input: RangeInput = useMemo(
    () =>
      range === "custom" && applied
        ? { range: "custom", from: applied.from, to: applied.to }
        : { range: range === "custom" ? "30d" : range },
    [range, applied],
  );

  const applyCustom = () => {
    if (!customFrom || !customTo) {
      toast.error("Choose both a start and an end date");
      return;
    }
    const [from, to] = customFrom <= customTo ? [customFrom, customTo] : [customTo, customFrom];
    setApplied({ from, to });
  };

  const runExport = async (dataset: ExportDataset, format: "csv" | "xlsx") => {
    setExporting(true);
    try {
      const res = await exportAnalyticsDataset({ data: { ...input, model, dataset } });
      if (res.rows.length === 0) {
        toast.info("Nothing to export for this period");
        return;
      }
      await downloadRows(res.rows, res.filename, format);
      toast.success(res.truncated ? "Exported (first 10,000 rows)" : "Export ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Marketing &amp; Analytics</h2>
        {active.usesRange && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                disabled={exporting}
                className="inline-flex items-center gap-1.5 rounded-sm border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" /> {exporting ? "Exporting…" : "Export"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {EXPORTS.map((d) => (
                <div key={d.id}>
                  <DropdownMenuLabel className="text-xs">{d.label}</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => runExport(d.id, "xlsx")}>
                    Excel (.xlsx)
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => runExport(d.id, "csv")}>CSV</DropdownMenuItem>
                  <DropdownMenuSeparator />
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <nav aria-label="Analytics sections" className="-mx-1 mb-4 overflow-x-auto px-1">
        <div className="flex min-w-max gap-1 border-b border-border pb-2">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              aria-current={section === s.id ? "page" : undefined}
              className={`whitespace-nowrap rounded-sm px-3 py-1.5 text-xs ${
                section === s.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </nav>

      {active.usesRange && (
        <div className="mb-4 space-y-2">
          <div className="flex flex-wrap items-center gap-1">
            {RANGES.map((r) => (
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
            {active.usesModel && (
              <div
                className="ml-auto flex items-center gap-1 text-xs text-muted-foreground"
                role="group"
                aria-label="Attribution model"
              >
                <span className="mr-1 hidden sm:inline">Attribution:</span>
                {(["last", "first"] as TouchModel[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setModel(m)}
                    title={
                      m === "last"
                        ? "The last non-direct source that brought the visitor back"
                        : "The source that originally brought the visitor"
                    }
                    className={`rounded-sm border px-2.5 py-1 ${model === m ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
                  >
                    {m === "last" ? "Last touch" : "First touch"}
                  </button>
                ))}
              </div>
            )}
          </div>
          {range === "custom" && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-muted-foreground">
                <span className="mb-1 block">From</span>
                <input
                  type="date"
                  value={customFrom}
                  max={today()}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="rounded-sm border border-border bg-background px-2 py-1 text-xs"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                <span className="mb-1 block">To</span>
                <input
                  type="date"
                  value={customTo}
                  max={today()}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="rounded-sm border border-border bg-background px-2 py-1 text-xs"
                />
              </label>
              <button
                onClick={applyCustom}
                className="rounded-sm border border-primary bg-primary px-3 py-1.5 text-xs text-primary-foreground"
              >
                Apply
              </button>
              {!applied && (
                <span className="text-xs text-muted-foreground">
                  Showing the last 30 days until you apply.
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <Suspense fallback={<LoadingTiles count={4} />}>
        {section === "overview" && <OverviewSection input={input} />}
        {section === "traffic" && <TrafficSection input={input} model={model} />}
        {section === "products" && <ProductsSection input={input} />}
        {section === "clicks" && <ClicksSection input={input} />}
        {section === "funnel" && <FunnelSection input={input} model={model} />}
        {section === "cart" && <CartSection input={input} />}
        {section === "campaigns" && <CampaignsSection input={input} model={model} />}
        {section === "advertising" && <AdvertisingSection input={input} />}
        {section === "custom-design" && <CustomDesignSection input={input} />}
        {section === "reports" && <ReportsSection />}
      </Suspense>
    </div>
  );
}

export default AnalyticsCenter;
