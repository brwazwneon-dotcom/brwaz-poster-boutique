import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  CATALOG_CONFIG_KEY,
  CATALOG_CONFIG_DEFAULTS,
  CATALOG_BASE_URL,
  buildMetaFeedCsv,
  buildMetaRows,
  catalogIssueFor,
  fetchCatalogData,
  resolveCatalogImage,
  resolveCatalogPrice,
  type CatalogConfig,
  type CatalogIssue,
  type CatalogIssueReason,
} from "@/lib/catalog";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Play,
  RefreshCw,
  Save,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CatalogImagesView } from "@/components/admin/CatalogImagesView";

const ISSUE_LABELS: Record<CatalogIssueReason, string> = {
  hidden: "Hidden product",
  no_category: "No category",
  category_hidden: "Category hidden / draft",
  review_draft: "Review not ready",
  no_price: "No price",
  no_image: "No valid image",
};

const FEED_URL = `${CATALOG_BASE_URL}/products-feed-meta.csv`;

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-sm border border-border bg-card p-4">
      <div
        className={
          tone === "ok"
            ? "text-display text-3xl text-emerald-500"
            : tone === "warn"
              ? "text-display text-3xl text-amber-500"
              : "text-display text-3xl"
        }
      >
        {value}
      </div>
      <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}

export function ProductCatalogTab() {
  const qc = useQueryClient();
  const [view, setView] = useState<"images" | "feed">("images");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [testResult, setTestResult] = useState<{
    csv: string;
    rows: number;
    issues: CatalogIssue[];
  } | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(200);

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["admin-catalog", page, pageSize],
    queryFn: () => fetchCatalogData(supabase, { page, pageSize }),
    staleTime: 30_000,
  });

  const savedSelection = data?.config.meta.selected.join(",") ?? "";
  useEffect(() => {
    setSelected(new Set(data?.config.meta.selected ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedSelection]);

  const productIssues = useMemo(() => {
    if (!data) return new Map<string, CatalogIssueReason>();
    const m = new Map<string, CatalogIssueReason>();
    for (const p of data.products) {
      const r = catalogIssueFor(p, data);
      if (r) m.set(p.id, r);
    }
    return m;
  }, [data]);

  const issueCounts = useMemo(() => {
    const m = new Map<CatalogIssueReason, number>();
    for (const r of productIssues.values()) m.set(r, (m.get(r) ?? 0) + 1);
    return m;
  }, [productIssues]);

  const effectiveSelected = useMemo(() => {
    if (!data) return new Set<string>();
    if (selected.size === 0) {
      return new Set(data.products.filter((p) => !productIssues.has(p.id)).map((p) => p.id));
    }
    return selected;
  }, [data, selected, productIssues]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.products;
    return data.products.filter((p) => {
      const cat = data.categories.get(p.category_id ?? "")?.name ?? "";
      return p.title.toLowerCase().includes(q) || cat.toLowerCase().includes(q);
    });
  }, [data, search]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllEligible = () => {
    if (!data) return;
    setSelected(new Set(data.products.filter((p) => !productIssues.has(p.id)).map((p) => p.id)));
  };

  const clearAll = () => setSelected(new Set());

  async function save() {
    if (!data) return;
    setSaving(true);
    try {
      const next: CatalogConfig = {
        meta: { enabled: true, selected: [...selected] },
        tiktok: data.config.tiktok ?? CATALOG_CONFIG_DEFAULTS.tiktok,
      };
      const { error } = await supabase
        .from("site_settings")
        .upsert(
          { key: CATALOG_CONFIG_KEY, value: JSON.parse(JSON.stringify(next)) },
          { onConflict: "key" },
        );
      if (error) throw error;
      toast.success("Catalog selection saved");
      qc.invalidateQueries({ queryKey: ["admin-catalog"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function testFeed() {
    if (!data) return;
    const { rows, issues } = buildMetaRows(data, effectiveSelected);
    setTestResult({ csv: buildMetaFeedCsv(rows), rows: rows.length, issues });
  }

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading catalog…</div>;
  if (!data) {
    return (
      <div className="rounded-sm border border-border bg-card p-5 text-sm text-muted-foreground">
        Could not load catalog data. Check that the database is reachable.
      </div>
    );
  }

  const eligibleCount = data?.totalProducts
    ? data.totalProducts - productIssues.size
    : (data?.products.length ?? 0) - productIssues.size;

  const totalPages = Math.max(
    1,
    Math.ceil((data?.totalProducts ?? data?.products.length ?? 0) / pageSize),
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-display text-2xl">Product Catalogs</h2>
          <p className="text-sm text-muted-foreground">
            Advertising catalogs for Meta. Prices come from your store pricing — no separate catalog
            price needed. Image priority: Meta mockup → product mockup → primary image.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            { key: "images", label: "Catalog Images" },
            { key: "feed", label: "Feed & Selection" },
          ] as const
        ).map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`rounded-sm border px-3 py-2 text-xs uppercase tracking-widest ${
              view === v.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-accent"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "images" ? (
        <CatalogImagesView data={data} selected={effectiveSelected} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={testFeed}
              className="flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
            >
              <Play className="h-3.5 w-3.5" />
              Test Feed
            </button>
            <a
              href={FEED_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Live feed
            </a>
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save selection"}
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Eligible products" value={eligibleCount} tone="ok" />
            <Stat label="Issues (excluded)" value={productIssues.size} tone="warn" />
            <Stat label="Selected for export" value={effectiveSelected.size} />
          </div>

          {issueCounts.size > 0 && (
            <div className="flex flex-wrap gap-2">
              {[...issueCounts.entries()].map(([reason, n]) => (
                <div
                  key={reason}
                  className="flex items-center gap-1.5 rounded-sm border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-600"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {ISSUE_LABELS[reason]} · {n}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-sm border border-border bg-card px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products or categories…"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
            <button
              onClick={selectAllEligible}
              className="rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
            >
              Select all eligible
            </button>
            <button
              onClick={clearAll}
              className="rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
            >
              Clear
            </button>
          </div>

          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
            <div>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className={cn(
                  "rounded-sm border border-border px-2 py-1",
                  page === 1 ? "opacity-50 cursor-not-allowed" : "",
                )}
              >
                Prev
              </button>
              {`Page ${page} of ${totalPages}`}
            </div>
            <div>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
                className={cn(
                  "rounded-sm border border-border px-2 py-1",
                  page >= totalPages ? "opacity-50 cursor-not-allowed" : "",
                )}
              >
                Next
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-sm border border-border">
            <div className="max-h-[560px] divide-y divide-border overflow-y-auto">
              {filtered.map((p) => {
                const issue = productIssues.get(p.id);
                const cat = data?.categories.get(p.category_id ?? "");
                const img = resolveCatalogImage(p, data?.variants[p.id]);
                return (
                  <div key={p.id} className="flex items-center gap-3 bg-card px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id) && !issue}
                      disabled={!!issue}
                      onChange={() => toggle(p.id)}
                      className="h-4 w-4 accent-primary"
                    />
                    {img ? (
                      <img
                        src={img}
                        alt={p.title}
                        loading="lazy"
                        className="h-12 w-9 shrink-0 rounded-sm border border-border object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-9 shrink-0 items-center justify-center rounded-sm border border-border bg-muted text-[10px] text-muted-foreground">
                        No img
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.title}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {cat?.name ? `${cat.name} · ` : ""}
                        {resolveCatalogPrice(data!.pricing, p.price)} EGP · {p.review_status}
                      </div>
                    </div>
                    {issue ? (
                      <span className="flex shrink-0 items-center gap-1 rounded-sm border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-600">
                        <X className="h-3 w-3" />
                        {ISSUE_LABELS[issue]}
                      </span>
                    ) : selected.has(p.id) || effectiveSelected.has(p.id) ? (
                      <span className="flex shrink-0 items-center gap-1 rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" />
                        Ready
                      </span>
                    ) : null}
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                  No products match.
                </div>
              )}
            </div>
          </div>

          {testResult && (
            <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 p-4 backdrop-blur-sm">
              <div className="mt-8 w-full max-w-3xl overflow-hidden rounded-sm border border-border bg-card shadow-2xl">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div className="text-sm font-semibold">
                    Test Feed · {testResult.rows} rows · {testResult.issues.length} issues
                  </div>
                  <button
                    onClick={() => setTestResult(null)}
                    className="rounded-full p-1.5 text-muted-foreground hover:bg-accent"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {testResult.issues.length > 0 && (
                  <div className="max-h-32 overflow-y-auto border-b border-border px-4 py-3">
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-amber-500">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Excluded products ({testResult.issues.length})
                    </div>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {testResult.issues.slice(0, 50).map((i) => (
                        <li key={i.productId}>
                          {i.title} — {ISSUE_LABELS[i.reason]}
                        </li>
                      ))}
                      {testResult.issues.length > 50 && (
                        <li>… and {testResult.issues.length - 50} more.</li>
                      )}
                    </ul>
                  </div>
                )}
                <pre className="max-h-[55vh] overflow-auto bg-black/40 p-4 text-[11px] leading-relaxed text-foreground/80">
                  {testResult.csv}
                </pre>
                <div className="border-t border-border px-4 py-3 text-right">
                  <a
                    href={FEED_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs uppercase tracking-widest underline"
                  >
                    {FEED_URL}
                  </a>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
