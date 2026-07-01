import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Upload,
  X,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Trash2,
  Save,
  FileText,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { uploadAndSign } from "@/lib/storage-url";
import { optimizeImage } from "@/lib/image-optimize";
import { useCategories } from "@/lib/use-categories";
import { generatePosterMeta, type GeneratedPosterMeta } from "@/lib/poster-ai.functions";
import { POSTER_BADGES } from "@/lib/poster-badges";
import { cn } from "@/lib/utils";

type RowStatus =
  | "uploaded"
  | "ai_generating"
  | "ready"
  | "needs_review"
  | "published"
  | "draft"
  | "failed";

type Row = {
  id: string;
  file: File;
  preview: string;
  status: RowStatus;
  error?: string;
  imageUrl?: string;
  originalUrl?: string | null;
  title: string;
  description: string;
  seo_title: string;
  seo_description: string;
  alt_text: string;
  slug: string;
  tags: string[];
  category_id: string | null;
  subcategory_id: string | null;
  badge: string | null;
  colors: string[];
  orientation: "portrait" | "landscape" | "square" | null;
  confidence: number | null;
  edited: Record<string, boolean>;
};

const UPLOAD_CONCURRENCY = 4;
const AI_CONCURRENCY = 3;
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function isHeic(file: File) {
  const t = file.type.toLowerCase();
  const n = file.name.toLowerCase();
  return t.includes("heic") || t.includes("heif") || n.endsWith(".heic") || n.endsWith(".heif");
}

export function AiPosterUpload() {
  const { data: categories = [] } = useCategories();
  const mains = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);
  const subsOf = (parentId: string | null) =>
    parentId ? categories.filter((c) => c.parent_id === parentId) : [];

  const [rows, setRows] = useState<Row[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowsRef = useRef<Row[]>([]);
  rowsRef.current = rows;

  const [bulkCat, setBulkCat] = useState("");
  const [bulkSub, setBulkSub] = useState("");
  const [bulkBadge, setBulkBadge] = useState("");
  const [bulkTags, setBulkTags] = useState("");

  const update = (id: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  // Track manual edits so AI regen doesn't overwrite them.
  const editField = (id: string, patch: Partial<Row>) =>
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const edited = { ...r.edited };
        for (const k of Object.keys(patch)) edited[k] = true;
        return { ...r, ...patch, edited };
      }),
    );

  const applyAiMeta = (id: string, meta: GeneratedPosterMeta) =>
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const e = r.edited;
        const conf = meta.confidence ?? 0.7;
        return {
          ...r,
          status: conf < 0.7 ? "needs_review" : "ready",
          confidence: conf,
          colors: e.colors ? r.colors : meta.colors,
          orientation: e.orientation ? r.orientation : meta.orientation,
          title: e.title ? r.title : meta.title || r.title,
          description: e.description ? r.description : meta.description,
          seo_title: e.seo_title ? r.seo_title : meta.seo_title,
          seo_description: e.seo_description ? r.seo_description : meta.seo_description,
          alt_text: e.alt_text ? r.alt_text : meta.alt_text || meta.title || r.title,
          slug: e.slug ? r.slug : meta.slug || slugify(meta.title || r.title),
          tags: e.tags ? r.tags : meta.tags,
          category_id: e.category_id ? r.category_id : meta.category_id,
          subcategory_id: e.subcategory_id ? r.subcategory_id : meta.subcategory_id,
          badge: e.badge ? r.badge : meta.badge,
        };
      }),
    );

  const counts = useMemo(() => {
    const c = {
      total: rows.length,
      uploaded: 0,
      generating: 0,
      ready: 0,
      needs: 0,
      published: 0,
      draft: 0,
      failed: 0,
    };
    for (const r of rows) {
      if (r.status === "uploaded") c.uploaded++;
      else if (r.status === "ai_generating") c.generating++;
      else if (r.status === "ready") c.ready++;
      else if (r.status === "needs_review") c.needs++;
      else if (r.status === "published") c.published++;
      else if (r.status === "draft") c.draft++;
      else if (r.status === "failed") c.failed++;
    }
    return c;
  }, [rows]);

  const addFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files).filter(
      (f) => f.type.startsWith("image/") || isHeic(f),
    );
    if (!incoming.length) return;
    const next: Row[] = incoming.map((file) => {
      const baseName = file.name.replace(/\.[^.]+$/, "");
      return {
        id: crypto.randomUUID(),
        file,
        preview: isHeic(file) ? "" : URL.createObjectURL(file),
        status: "uploaded",
        title: baseName,
        description: "",
        seo_title: "",
        seo_description: "",
        alt_text: baseName,
        slug: slugify(baseName),
        tags: [],
        category_id: null,
        subcategory_id: null,
        badge: null,
        colors: [],
        orientation: null,
        confidence: null,
        edited: {},
      };
    });
    setRows((prev) => [...prev, ...next]);
    // Auto upload + AI in background.
    void processNew(next.map((r) => r.id));
  };

  const uploadOne = async (row: Row): Promise<{ webUrl: string; origUrl: string | null }> => {
    // HEIC files: upload original; skip optimization (canvas can't decode HEIC).
    let optimized: File = row.file;
    if (!isHeic(row.file)) {
      try {
        optimized = await optimizeImage(row.file, { maxDim: 2000, quality: 0.85 });
      } catch {
        optimized = row.file;
      }
    }
    const slug = "ai-upload";
    const uid = crypto.randomUUID();
    const baseExt = (row.file.name.split(".").pop() ?? "jpg").toLowerCase();
    const optExt = (optimized.name.split(".").pop() ?? "jpg").toLowerCase();
    const [webUrl, origUrl] = await Promise.all([
      uploadAndSign("posters", `${slug}/${uid}.${optExt}`, optimized),
      uploadAndSign("posters-originals", `${slug}/${uid}.${baseExt}`, row.file).catch(() => null),
    ]);
    return { webUrl, origUrl };
  };

  const runAi = async (row: Row, imageUrl: string) => {
    const meta: GeneratedPosterMeta = await generatePosterMeta({
      data: {
        imageUrl,
        filename: row.file.name,
        categories: categories.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          parent_id: c.parent_id ?? null,
        })),
      },
    });
    return meta;
  };

  const processNew = async (ids: string[]) => {
    setBusy(true);
    // Stage 1: upload concurrently.
    let cursor = 0;
    const uploadWorker = async () => {
      while (cursor < ids.length) {
        const i = cursor++;
        const id = ids[i];
        const r = rowsRef.current.find((x) => x.id === id);
        if (!r) continue;
        try {
          const { webUrl, origUrl } = await uploadOne(r);
          update(id, {
            imageUrl: webUrl,
            originalUrl: origUrl,
            status: "ai_generating",
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Upload failed";
          update(id, { status: "failed", error: msg });
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(UPLOAD_CONCURRENCY, ids.length) }, uploadWorker),
    );

    // Stage 2: AI concurrently.
    let aiCursor = 0;
    const aiWorker = async () => {
      while (aiCursor < ids.length) {
        const i = aiCursor++;
        const id = ids[i];
        const r = rowsRef.current.find((x) => x.id === id);
        if (!r || !r.imageUrl || r.status === "failed") continue;
        try {
          const meta = await runAi(r, r.imageUrl);
          applyAiMeta(id, meta);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "AI failed";
          // Fallback: use filename as title, mark needs review.
          update(id, {
            status: "needs_review",
            error: msg,
          });
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(AI_CONCURRENCY, ids.length) }, aiWorker),
    );
    setBusy(false);
  };

  const regenerateSelected = async () => {
    const ids = Array.from(selected).filter((id) => {
      const r = rowsRef.current.find((x) => x.id === id);
      return r && r.imageUrl && r.status !== "published";
    });
    if (!ids.length) return toast.error("Select rows to regenerate");
    setBusy(true);
    // "Regenerate with AI" = intentional overwrite; clear the edited map.
    ids.forEach((id) => update(id, { status: "ai_generating", error: undefined, edited: {} }));
    let cursor = 0;
    const worker = async () => {
      while (cursor < ids.length) {
        const i = cursor++;
        const id = ids[i];
        const r = rowsRef.current.find((x) => x.id === id);
        if (!r || !r.imageUrl) continue;
        try {
          const meta = await runAi(r, r.imageUrl);
          applyAiMeta(id, meta);
        } catch (err) {
          update(id, {
            status: "needs_review",
            error: err instanceof Error ? err.message : "AI failed",
          });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(AI_CONCURRENCY, ids.length) }, worker));
    setBusy(false);
    toast.success("Regeneration complete");
  };

  const insertPosters = async (ids: string[], hidden: boolean) => {
    const rowsToInsert = rowsRef.current.filter(
      (r) => ids.includes(r.id) && r.imageUrl && r.status !== "published",
    );
    if (!rowsToInsert.length) {
      toast.error("Nothing to publish");
      return;
    }
    const payload = rowsToInsert.map((r) => ({
      title: r.title || r.file.name,
      image_url: r.imageUrl!,
      original_url: r.originalUrl ?? null,
      category_id: r.subcategory_id || r.category_id,
      tags: r.tags,
      description: r.description || null,
      seo_title: r.seo_title || null,
      seo_description: r.seo_description || null,
      badge: r.badge,
      slug: r.slug || null,
      alt_text: r.alt_text || null,
      colors: r.colors,
      orientation: r.orientation,
      ai_confidence: r.confidence,
      hidden,
    }));
    const { error } = await supabase.from("posters").insert(payload);
    if (error) {
      toast.error(error.message);
      return;
    }
    const newStatus: RowStatus = hidden ? "draft" : "published";
    rowsToInsert.forEach((r) => update(r.id, { status: newStatus }));
    toast.success(
      `${hidden ? "Saved" : "Published"} ${rowsToInsert.length} poster${rowsToInsert.length === 1 ? "" : "s"}`,
    );
    setSelected(new Set());
  };

  const publishSelected = () => insertPosters(Array.from(selected), false);
  const saveDraftSelected = () => insertPosters(Array.from(selected), true);

  const deleteSelected = () => {
    if (!selected.size) return;
    if (!confirm(`Remove ${selected.size} row(s) from the queue? Already published posters stay live.`))
      return;
    setRows((prev) =>
      prev.filter((r) => {
        if (!selected.has(r.id)) return true;
        if (r.preview) URL.revokeObjectURL(r.preview);
        return false;
      }),
    );
    setSelected(new Set());
  };

  const applyBulk = () => {
    if (!selected.size) return toast.error("Select rows first");
    const tags = bulkTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    setRows((prev) =>
      prev.map((r) => {
        if (!selected.has(r.id)) return r;
        const patch: Partial<Row> = {};
        if (bulkCat) patch.category_id = bulkCat;
        if (bulkSub) patch.subcategory_id = bulkSub;
        if (bulkBadge) patch.badge = bulkBadge === "__none__" ? null : bulkBadge;
        if (tags.length) patch.tags = Array.from(new Set([...(r.tags ?? []), ...tags]));
        return { ...r, ...patch };
      }),
    );
    toast.success(`Applied to ${selected.size} row(s)`);
  };

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const selectAll = () => setSelected(new Set(rows.map((r) => r.id)));
  const clearSelection = () => setSelected(new Set());

  return (
    <div className="space-y-6">
      <div className="rounded-sm border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="text-display text-2xl">AI Poster Upload</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload poster artwork — AI generates title, description, SEO, tags, alt text, slug,
              category &amp; badge. Review, edit, then publish.
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>{counts.total} queued</div>
            <div>
              {counts.published} published · {counts.draft} drafts · {counts.failed} failed
            </div>
          </div>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "mt-5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-sm border-2 border-dashed px-6 py-10 text-center transition",
            dragOver
              ? "border-primary bg-accent/40"
              : "border-border bg-background hover:border-primary/60",
          )}
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div className="text-sm">
            <span className="font-semibold">Click or drop</span> images — JPG, PNG, WEBP, HEIC. 100+
            at once.
          </div>
          <div className="text-[11px] text-muted-foreground">
            Originals are stored. AI runs automatically per image and can be regenerated.
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {rows.length > 0 && (
        <div className="rounded-sm border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs">
              <span className="font-semibold">{selected.size}</span> selected ·{" "}
              <span className="text-muted-foreground">
                {counts.generating > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> {counts.generating} AI working
                  </span>
                )}
              </span>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                onClick={selectAll}
                className="rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-accent"
              >
                Select all
              </button>
              <button
                onClick={clearSelection}
                className="rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-accent"
              >
                Clear
              </button>
              <button
                disabled={busy || selected.size === 0}
                onClick={regenerateSelected}
                className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-1.5 text-[10px] uppercase tracking-widest hover:bg-accent disabled:opacity-40"
              >
                <RotateCcw className="h-3 w-3" /> Regenerate
              </button>
              <button
                disabled={selected.size === 0}
                onClick={saveDraftSelected}
                className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-1.5 text-[10px] uppercase tracking-widest hover:bg-accent disabled:opacity-40"
              >
                <Save className="h-3 w-3" /> Save as draft
              </button>
              <button
                disabled={selected.size === 0}
                onClick={publishSelected}
                className="inline-flex items-center gap-1 rounded-sm bg-primary px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-40"
              >
                <CheckCircle2 className="h-3 w-3" /> Publish
              </button>
              <button
                disabled={selected.size === 0}
                onClick={deleteSelected}
                className="inline-flex items-center gap-1 rounded-sm border border-destructive px-3 py-1.5 text-[10px] uppercase tracking-widest text-destructive hover:bg-destructive/10 disabled:opacity-40"
              >
                <Trash2 className="h-3 w-3" /> Remove
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 rounded-sm border border-border bg-background/50 p-3 md:grid-cols-5">
            <div className="md:col-span-5 text-[10px] uppercase tracking-widest text-muted-foreground">
              Bulk edit (applied to selected)
            </div>
            <select
              value={bulkCat}
              onChange={(e) => {
                setBulkCat(e.target.value);
                setBulkSub("");
              }}
              className="rounded-sm border border-border bg-background px-2 py-1.5 text-xs"
            >
              <option value="">Category…</option>
              {mains.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={bulkSub}
              onChange={(e) => setBulkSub(e.target.value)}
              disabled={!bulkCat}
              className="rounded-sm border border-border bg-background px-2 py-1.5 text-xs disabled:opacity-50"
            >
              <option value="">Sub-category…</option>
              {subsOf(bulkCat).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={bulkBadge}
              onChange={(e) => setBulkBadge(e.target.value)}
              className="rounded-sm border border-border bg-background px-2 py-1.5 text-xs"
            >
              <option value="">Badge…</option>
              <option value="__none__">— No badge —</option>
              {POSTER_BADGES.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
            <input
              value={bulkTags}
              onChange={(e) => setBulkTags(e.target.value)}
              placeholder="Add tags (comma)"
              className="rounded-sm border border-border bg-background px-2 py-1.5 text-xs"
            />
            <button
              onClick={applyBulk}
              className="rounded-sm border border-border px-3 py-1.5 text-[10px] uppercase tracking-widest hover:bg-accent"
            >
              Apply
            </button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1100px] border-separate border-spacing-y-1 text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="w-8"></th>
                  <th className="w-20">Image</th>
                  <th>Title / Slug / Alt</th>
                  <th>Category</th>
                  <th>Tags</th>
                  <th>Description &amp; SEO</th>
                  <th>Badge</th>
                  <th className="w-28">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <RowEditor
                    key={r.id}
                    row={r}
                    selected={selected.has(r.id)}
                    onToggleSelect={() => toggleSelected(r.id)}
                    mains={mains}
                    subsOf={subsOf}
                    onChange={(patch) => editField(r.id, patch)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function RowEditor({
  row,
  selected,
  onToggleSelect,
  mains,
  subsOf,
  onChange,
}: {
  row: Row;
  selected: boolean;
  onToggleSelect: () => void;
  mains: { id: string; name: string }[];
  subsOf: (id: string | null) => { id: string; name: string }[];
  onChange: (patch: Partial<Row>) => void;
}) {
  const subs = subsOf(row.category_id);
  const isLocked = row.status === "published";
  return (
    <tr className={cn("align-top", selected && "bg-accent/30")}>
      <td className="pt-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          disabled={isLocked}
        />
      </td>
      <td className="pt-2">
        {row.preview ? (
          <img
            src={row.preview}
            alt=""
            className="h-20 w-16 rounded-sm border border-border object-cover"
          />
        ) : (
          <div className="flex h-20 w-16 items-center justify-center rounded-sm border border-border bg-background text-[9px] text-muted-foreground">
            HEIC
          </div>
        )}
      </td>
      <td className="space-y-1 pr-2">
        <input
          value={row.title}
          onChange={(e) => onChange({ title: e.target.value })}
          disabled={isLocked}
          placeholder="Title"
          className="w-full rounded-sm border border-border bg-background px-2 py-1 text-xs"
        />
        <input
          value={row.slug}
          onChange={(e) => onChange({ slug: e.target.value })}
          disabled={isLocked}
          placeholder="slug-url"
          className="w-full rounded-sm border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground"
        />
        <input
          value={row.alt_text}
          onChange={(e) => onChange({ alt_text: e.target.value })}
          disabled={isLocked}
          placeholder="Image alt text"
          className="w-full rounded-sm border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground"
        />
      </td>
      <td className="space-y-1 pr-2">
        <select
          value={row.category_id ?? ""}
          onChange={(e) =>
            onChange({ category_id: e.target.value || null, subcategory_id: null })
          }
          disabled={isLocked}
          className="w-full rounded-sm border border-border bg-background px-2 py-1 text-xs"
        >
          <option value="">Main…</option>
          {mains.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={row.subcategory_id ?? ""}
          onChange={(e) => onChange({ subcategory_id: e.target.value || null })}
          disabled={isLocked || subs.length === 0}
          className="w-full rounded-sm border border-border bg-background px-2 py-1 text-xs disabled:opacity-50"
        >
          <option value="">{subs.length === 0 ? "— None —" : "Sub…"}</option>
          {subs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </td>
      <td className="pr-2">
        <textarea
          value={row.tags.join(", ")}
          onChange={(e) =>
            onChange({
              tags: e.target.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            })
          }
          disabled={isLocked}
          rows={3}
          placeholder="tag1, tag2"
          className="w-full min-w-[160px] rounded-sm border border-border bg-background px-2 py-1 text-xs"
        />
      </td>
      <td className="space-y-1 pr-2">
        <textarea
          value={row.description}
          onChange={(e) => onChange({ description: e.target.value })}
          disabled={isLocked}
          rows={2}
          placeholder="Description"
          className="w-full min-w-[220px] rounded-sm border border-border bg-background px-2 py-1 text-xs"
        />
        <input
          value={row.seo_title}
          onChange={(e) => onChange({ seo_title: e.target.value })}
          disabled={isLocked}
          placeholder="SEO title"
          className="w-full rounded-sm border border-border bg-background px-2 py-1 text-[11px]"
        />
        <input
          value={row.seo_description}
          onChange={(e) => onChange({ seo_description: e.target.value })}
          disabled={isLocked}
          placeholder="SEO description"
          className="w-full rounded-sm border border-border bg-background px-2 py-1 text-[11px]"
        />
      </td>
      <td className="pr-2">
        <select
          value={row.badge ?? ""}
          onChange={(e) => onChange({ badge: e.target.value || null })}
          disabled={isLocked}
          className="w-full rounded-sm border border-border bg-background px-2 py-1 text-xs"
        >
          <option value="">—</option>
          {POSTER_BADGES.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </td>
      <td className="pt-2">
        <StatusPill status={row.status} error={row.error} />
      </td>
    </tr>
  );
}

function StatusPill({ status, error }: { status: RowStatus; error?: string }) {
  const map: Record<RowStatus, { label: string; cls: string; icon: React.ReactNode }> = {
    uploaded: {
      label: "Uploaded",
      cls: "border-border text-muted-foreground",
      icon: <Upload className="h-3 w-3" />,
    },
    ai_generating: {
      label: "AI…",
      cls: "border-primary text-primary",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    ready: {
      label: "Ready",
      cls: "border-emerald-500 text-emerald-500",
      icon: <Sparkles className="h-3 w-3" />,
    },
    needs_review: {
      label: "Needs review",
      cls: "border-amber-500 text-amber-500",
      icon: <AlertCircle className="h-3 w-3" />,
    },
    published: {
      label: "Published",
      cls: "border-emerald-600 bg-emerald-600/10 text-emerald-500",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    draft: {
      label: "Draft",
      cls: "border-border text-foreground",
      icon: <FileText className="h-3 w-3" />,
    },
    failed: {
      label: "Failed",
      cls: "border-destructive text-destructive",
      icon: <X className="h-3 w-3" />,
    },
  };
  const s = map[status];
  return (
    <span
      title={error}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[10px] uppercase tracking-widest",
        s.cls,
      )}
    >
      {s.icon}
      {s.label}
    </span>
  );
}