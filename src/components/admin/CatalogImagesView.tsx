import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, FileImage, Search, X } from "lucide-react";
import {
  CATALOG_CURRENCY,
  buildMetaRows,
  catalogImageDiagnostics,
  type CatalogData,
  type CatalogImageDiagnostics,
  type CatalogIssueReason,
} from "@/lib/catalog";

type FilterKey =
  | "all"
  | "ready"
  | "missing-image"
  | "missing-mockup"
  | "missing-price"
  | "invalid"
  | "not-eligible";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ready", label: "Ready" },
  { key: "missing-image", label: "Missing Image" },
  { key: "missing-mockup", label: "Missing Mockup" },
  { key: "missing-price", label: "Missing Price" },
  { key: "invalid", label: "Invalid" },
  { key: "not-eligible", label: "Not eligible" },
];

const ISSUE_LABELS: Record<CatalogIssueReason, string> = {
  hidden: "Hidden product",
  no_category: "No category",
  category_hidden: "Category hidden / draft",
  review_draft: "Review not ready",
  no_price: "No price",
  no_image: "No valid image",
};

function formatFromUrl(url: string): string {
  const m = /\.(webp|avif|jpe?g|png|gif|heic|heif|svg|bmp)(?:\?|$)/i.exec(url);
  return m ? m[1].toUpperCase() : "unknown";
}

function matchesFilter(d: CatalogImageDiagnostics, key: FilterKey): boolean {
  switch (key) {
    case "all":
      return true;
    case "ready":
      return d.ready;
    case "missing-image":
      return d.imageMissing;
    case "missing-mockup":
      return d.mockupMissing;
    case "missing-price":
      return d.priceMissing;
    case "invalid":
      return d.issue !== null || d.priceMissing || d.imageMissing || !d.categoryPresent;
    case "not-eligible":
      return d.issue !== null;
  }
}

/** Loads an image and reports dimensions / file type / load status. */
function ImageTile({
  src,
  label,
  hint,
  big,
}: {
  src: string;
  label: string;
  hint: string;
  big?: boolean;
}) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(src ? "loading" : "error");
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  if (!src) {
    return (
      <div className="rounded-sm border border-dashed border-border p-4">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-red-500">
          <X className="h-3.5 w-3.5" /> Missing
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-sm border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </div>
        <span
          className={
            status === "loaded"
              ? "rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600"
              : status === "error"
                ? "rounded-sm border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-500"
                : "rounded-sm border border-muted-foreground/30 bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
          }
        >
          {status}
        </span>
      </div>
      <div className={`relative ${big ? "mt-3" : "mt-2"}`}>
        <img
          src={src}
          alt={label}
          onLoad={(e) => {
            const img = e.currentTarget;
            setStatus("loaded");
            if (img.naturalWidth) setDims({ w: img.naturalWidth, h: img.naturalHeight });
          }}
          onError={() => setStatus("error")}
          className={
            big
              ? "mx-auto max-h-[340px] rounded-sm border border-border object-contain"
              : "mx-auto max-h-[120px] rounded-sm border border-border object-contain"
          }
        />
      </div>
      <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
        <div>
          {dims ? `${dims.w} × ${dims.h} px` : "Dimensions: —"} · {formatFromUrl(src)}
        </div>
        <div className="truncate" title={src}>
          {src}
        </div>
        <div className="text-[10px] uppercase tracking-widest">{hint}</div>
      </div>
    </div>
  );
}

function FixHint({ d }: { d: CatalogImageDiagnostics }) {
  const fixes: string[] = [];
  if (d.priceMissing)
    fixes.push(
      `Price: no usable price to export. Set a price on the product (posters.price) or make sure standard frame prices are configured — the feed falls back to PVC 30×40, then to the lowest configured frame price.`,
    );
  if (d.imageMissing)
    fixes.push(
      `Image: no public HTTPS image at all. Add posters.image_url (framed mockup) or posters.original_url (print file).`,
    );
  if (d.mockupMissing)
    fixes.push(
      `Mockup: this product only has the raw print file (no framed product mockup). Upload a framed mockup to posters.image_url or generate an image_variants row (medium*/meta*) for it.`,
    );
  if (d.metaMockupMissing && !d.mockupMissing)
    fixes.push(
      `Meta mockup: there is no dedicated meta* image variant, so the feed uses ${d.feedImageKind === "product-mockup" ? "the product mockup (image_url)" : d.feedImageKind === "display-variant" ? "the best display variant" : "the fallback image"} below. Generate a meta* variant for this product to give Meta a purpose-made mockup.`,
    );
  if (!d.categoryPresent)
    fixes.push(`Category: assign the product to a visible, published category (not hidden/draft).`);
  if (d.issue === "review_draft")
    fixes.push(`Review: mark the product review as ready (not draft / needs_replace).`);
  if (d.issue === "hidden") fixes.push(`Visibility: unhide the product.`);
  if (!fixes.length) fixes.push(`This product is ready — nothing to fix.`);
  return (
    <ul className="space-y-1.5 text-xs text-muted-foreground">
      {fixes.map((f, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-amber-500">→</span>
          <span>{f}</span>
        </li>
      ))}
    </ul>
  );
}

export function CatalogImagesView({
  data,
  selected,
}: {
  data: CatalogData;
  selected: Set<string>;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  const diagnostics = useMemo(() => {
    const m = new Map<string, CatalogImageDiagnostics>();
    for (const p of data.products) m.set(p.id, catalogImageDiagnostics(p, data));
    return m;
  }, [data]);

  const counts = useMemo(() => {
    const c = new Map<FilterKey, number>();
    for (const f of FILTERS) {
      let n = 0;
      for (const d of diagnostics.values()) if (matchesFilter(d, f.key)) n++;
      c.set(f.key, n);
    }
    return c;
  }, [diagnostics]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = data.products
      .filter((p) => matchesFilter(diagnostics.get(p.id)!, filter))
      .filter((p) => {
        if (!q) return true;
        const cat = data.categories.get(p.category_id ?? "")?.name ?? "";
        return (
          p.title.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          cat.toLowerCase().includes(q)
        );
      });
    // Problems first, then ready, then everything else; alphabetical within.
    return list.sort((a, b) => {
      const da = diagnostics.get(a.id)!;
      const db = diagnostics.get(b.id)!;
      if (!!da.issue !== !!db.issue) return da.issue ? -1 : 1;
      if (da.ready !== db.ready) return da.ready ? 1 : -1;
      return a.title.localeCompare(b.title);
    });
  }, [data, diagnostics, filter, search]);

  const detail = detailId ? data.products.find((p) => p.id === detailId) : null;
  const detailDiag = detail ? diagnostics.get(detail.id) : null;

  const previewRows = useMemo(() => {
    if (!preview) return null;
    return buildMetaRows(data, selected);
  }, [preview, data, selected]);

  const effectiveSelectedForDetail = selected.size > 0 ? selected : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-sm border px-2.5 py-1.5 text-xs uppercase tracking-widest ${
                filter === f.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-accent"
              }`}
            >
              {f.label} · {counts.get(f.key) ?? 0}
            </button>
          ))}
        </div>
        <button
          onClick={() => setPreview(true)}
          className="flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
        >
          <FileImage className="h-3.5 w-3.5" />
          Preview Meta Feed
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-sm border border-border bg-card px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by product name, Product ID, or category…"
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-sm border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          No products match the current filter.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const d = diagnostics.get(p.id)!;
            const cat = data.categories.get(p.category_id ?? "");
            return (
              <button
                key={p.id}
                onClick={() => setDetailId(p.id)}
                className="flex flex-col gap-3 rounded-sm border border-border bg-card p-4 text-left transition-colors hover:border-muted-foreground/50"
              >
                <div className="flex gap-3">
                  <div className="h-20 w-16 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
                    {d.feedImage ? (
                      <img
                        src={d.feedImage}
                        alt={p.title}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[9px] text-muted-foreground">
                        No img
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{p.title}</div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      ID: {p.id}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {cat?.name ?? "No category"} · {p.review_status}
                    </div>
                    <div className="mt-1 text-sm font-semibold">
                      {d.price > 0 ? `${d.price.toFixed(2)} ${CATALOG_CURRENCY}` : "—"}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <span
                    className={
                      d.productMockupPresent
                        ? "flex items-center gap-1 rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600"
                        : "flex items-center gap-1 rounded-sm border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-500"
                    }
                  >
                    {d.productMockupPresent ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                    Mockup {d.productMockupPresent ? "✓" : "✗"}
                  </span>
                  <span
                    className={
                      d.primaryPresent
                        ? "flex items-center gap-1 rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600"
                        : "flex items-center gap-1 rounded-sm border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-500"
                    }
                  >
                    {d.primaryPresent ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                    Primary {d.primaryPresent ? "✓" : "✗"}
                  </span>
                  <span
                    className={
                      d.metaVariantPresent
                        ? "flex items-center gap-1 rounded-sm border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-600"
                        : "flex items-center gap-1 rounded-sm border border-muted-foreground/30 bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
                    }
                  >
                    Meta variant {d.metaVariantPresent ? "✓" : "✗"}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {d.priceMissing && (
                    <span className="flex items-center gap-1 rounded-sm border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-500">
                      ❌ Missing Price
                    </span>
                  )}
                  {d.metaMockupMissing && (
                    <span className="flex items-center gap-1 rounded-sm border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-500">
                      ❌ Missing Meta Mockup
                    </span>
                  )}
                  {d.mockupMissing && (
                    <span className="flex items-center gap-1 rounded-sm border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-500">
                      ❌ Missing Mockup
                    </span>
                  )}
                  {d.imageMissing && (
                    <span className="flex items-center gap-1 rounded-sm border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-500">
                      ❌ Missing Image
                    </span>
                  )}
                  {!d.categoryPresent && (
                    <span className="flex items-center gap-1 rounded-sm border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-500">
                      ❌ Missing Category
                    </span>
                  )}
                </div>

                <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2">
                  <div className="min-w-0">
                    {d.issue ? (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        Not eligible: {ISSUE_LABELS[d.issue]}
                      </span>
                    ) : d.ready ? (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                        <CheckCircle2 className="h-3 w-3 shrink-0" />
                        Ready for Meta
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-muted-foreground">
                        In feed — check details
                      </span>
                    )}
                  </div>
                  {d.feedImage && (
                    <a
                      href={d.feedImage}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      title={d.feedImage}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {detail && detailDiag && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="mt-6 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-sm border border-border bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{detail.title}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {detailDiag.categoryName || "No category"} · ID: {detail.id} ·{" "}
                  {detail.review_status}
                </div>
              </div>
              <button
                onClick={() => setDetailId(null)}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-accent"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-4 overflow-y-auto p-4 lg:grid-cols-2">
              <div className="space-y-3">
                <ImageTile
                  src={detailDiag.feedImage}
                  label="Final image sent to Meta"
                  hint="This is the exact image_link in the feed."
                  big
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  <ImageTile
                    src={detailDiag.metaVariant || detailDiag.productMockup}
                    label="Mockup"
                    hint={
                      detailDiag.metaVariantPresent
                        ? "meta* variant — used by the feed"
                        : detailDiag.productMockupPresent
                          ? "product mockup (image_url)"
                          : "no mockup exists"
                    }
                  />
                  <ImageTile
                    src={detailDiag.primaryImage}
                    label="Original"
                    hint="posters.original_url"
                  />
                  <ImageTile
                    src={detailDiag.displayVariant}
                    label="Display variant"
                    hint={
                      detailDiag.displayVariantPresent ? "best image_variants display row" : "none"
                    }
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Feed price
                  </div>
                  <div className="mt-1 text-display text-2xl">
                    {detailDiag.price > 0
                      ? `${detailDiag.price.toFixed(2)} ${CATALOG_CURRENCY}`
                      : "Missing"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Source:{" "}
                    {detailDiag.priceSource === "poster"
                      ? "product price (posters.price)"
                      : detailDiag.priceSource === "pvc-30x40-default"
                        ? "standard PVC 30×40 store price"
                        : detailDiag.priceSource === "lowest-configured"
                          ? "lowest configured frame price"
                          : "none — no price configured"}
                    {detailDiag.priceMissing &&
                      " · the feed cannot export a price until one is available."}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Issues
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {detailDiag.priceMissing && (
                      <span className="flex items-center gap-1 rounded-sm border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-500">
                        ❌ Missing Price
                      </span>
                    )}
                    {detailDiag.metaMockupMissing && (
                      <span className="flex items-center gap-1 rounded-sm border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-500">
                        ❌ Missing Meta Mockup
                      </span>
                    )}
                    {detailDiag.mockupMissing && (
                      <span className="flex items-center gap-1 rounded-sm border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-500">
                        ❌ Missing Mockup
                      </span>
                    )}
                    {detailDiag.imageMissing && (
                      <span className="flex items-center gap-1 rounded-sm border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-500">
                        ❌ Missing Image
                      </span>
                    )}
                    {!detailDiag.categoryPresent && (
                      <span className="flex items-center gap-1 rounded-sm border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-500">
                        ❌ Missing Category
                      </span>
                    )}
                    {detailDiag.issue && (
                      <span className="flex items-center gap-1 rounded-sm border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-600">
                        <AlertTriangle className="h-3 w-3" />
                        {ISSUE_LABELS[detailDiag.issue]}
                      </span>
                    )}
                    {detailDiag.ready && (
                      <span className="flex items-center gap-1 rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" />
                        Ready for Meta
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    What the feed exports
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <div>
                      image_link:{" "}
                      {detailDiag.feedImage ? (
                        <a
                          href={detailDiag.feedImage}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="break-all text-sky-600 underline"
                        >
                          {detailDiag.feedImage}
                        </a>
                      ) : (
                        "— none"
                      )}
                    </div>
                    <div>
                      price:{" "}
                      {detailDiag.price > 0
                        ? `${detailDiag.price.toFixed(2)} ${CATALOG_CURRENCY}`
                        : "— none"}
                    </div>
                    <div>availability: in stock · condition: new</div>
                    <div>category: {detailDiag.categoryName || "—"}</div>
                    <div>
                      feed image kind:{" "}
                      {detailDiag.feedImageKind === "meta-variant"
                        ? "dedicated meta* variant"
                        : detailDiag.feedImageKind === "product-mockup"
                          ? "product mockup (image_url)"
                          : detailDiag.feedImageKind === "display-variant"
                            ? "display variant"
                            : detailDiag.feedImageKind === "primary"
                              ? "raw original print"
                              : "none"}
                    </div>
                    <div>
                      export status:{" "}
                      {detailDiag.issue
                        ? `excluded (${ISSUE_LABELS[detailDiag.issue]})`
                        : effectiveSelectedForDetail && !effectiveSelectedForDetail.has(detail.id)
                          ? "eligible but not selected"
                          : "exported to the Meta feed"}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    How to fix
                  </div>
                  <div className="mt-2">
                    <FixHint d={detailDiag} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {preview && previewRows && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="mt-6 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-sm border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="text-sm font-semibold">
                Meta Feed Preview · {previewRows.rows.length} rows · {previewRows.issues.length}{" "}
                excluded
              </div>
              <button
                onClick={() => setPreview(false)}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-accent"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">Image</th>
                    <th className="px-3 py-2 font-semibold">Product ID</th>
                    <th className="px-3 py-2 font-semibold">Title</th>
                    <th className="px-3 py-2 font-semibold">Price</th>
                    <th className="px-3 py-2 font-semibold">Availability</th>
                    <th className="px-3 py-2 font-semibold">Category</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {previewRows.rows.map((r) => {
                    const diag = diagnostics.get(r.id);
                    return (
                      <tr key={r.id} className="bg-card">
                        <td className="px-3 py-2">
                          {diag?.feedImage ? (
                            <img
                              src={diag.feedImage}
                              alt={r.title}
                              loading="lazy"
                              className="h-10 w-8 rounded-sm border border-border object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-8 items-center justify-center rounded-sm border border-border bg-muted text-[9px] text-muted-foreground">
                              —
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px]">{r.id}</td>
                        <td className="max-w-[220px] truncate px-3 py-2">{r.title}</td>
                        <td className="px-3 py-2">{r.price}</td>
                        <td className="px-3 py-2">{r.availability}</td>
                        <td className="px-3 py-2">{r.product_type || "—"}</td>
                        <td className="px-3 py-2">
                          <span className="rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
                            In feed
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
