import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, X, RotateCcw, CheckCircle2, AlertCircle, Loader2, Pencil, Sparkles, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { uploadAndSign, signStoragePath } from "@/lib/storage-url";
import { optimizeImage } from "@/lib/image-optimize";
import { useCategories, type Category } from "@/lib/use-categories";
import { PosterImageEditor } from "@/components/admin/PosterImageEditor";
import {
  DEFAULT_EDIT_SETTINGS,
  isDefaultEdit,
  loadImage,
  renderEditToBlob,
  type EditSettings,
} from "@/lib/poster-edit";
import { cn } from "@/lib/utils";
import { generatePosterMeta } from "@/lib/poster-ai.functions";
import { CategoryPicker } from "@/components/admin/CategoryPicker";

type ItemStatus = "pending" | "optimizing" | "uploading" | "done" | "failed";
type AiStatus = "idle" | "pending" | "generated" | "needs_review" | "failed";

type UploadItem = {
  id: string;
  file: File;
  preview: string;
  status: ItemStatus;
  error?: string;
  posterId?: string;
  edit?: EditSettings;
  ai?: AiStatus;
  aiError?: string;
  aiTitle?: string;
  size?: { w: number; h: number; ratio: number };
  aspectWarning?: "square" | "tall" | "wide";
  aspectAccepted?: boolean;
};

const CONCURRENCY = 4;

export function BulkPosterUploader({ onDone }: { onDone: () => void }) {
  const { data: categories = [] } = useCategories();
  const [mainCategoryId, setMainCategoryId] = useState("");
  const [subCategoryId, setSubCategoryId] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [titlePrefix, setTitlePrefix] = useState("");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [running, setRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const mainCategories = useMemo(
    () => categories.filter((c) => !c.parent_id),
    [categories],
  );
  const subCategories = useMemo(
    () => categories.filter((c) => c.parent_id === mainCategoryId),
    [categories, mainCategoryId],
  );
  const [aiEnabled, setAiEnabled] = useState(true);

  const effectiveCategoryId = subCategoryId || mainCategoryId;
  const effectiveCategory = categories.find((c) => c.id === effectiveCategoryId);

  const counts = useMemo(() => {
    const c = { total: items.length, done: 0, failed: 0, pending: 0, busy: 0 };
    for (const it of items) {
      if (it.status === "done") c.done++;
      else if (it.status === "failed") c.failed++;
      else if (it.status === "pending") c.pending++;
      else c.busy++;
    }
    return c;
  }, [items]);

  const addFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (incoming.length === 0) return;
    const next: UploadItem[] = incoming.map((file) => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      status: "pending",
    }));
    setItems((prev) => [...prev, ...next]);
    // Measure natural dimensions and flag off-ratio images (target 2:3 ≈ 0.667).
    next.forEach((it) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const ratio = w / h;
        let warning: UploadItem["aspectWarning"];
        if (Math.abs(ratio - 1) < 0.08) warning = "square";
        else if (ratio < 0.55) warning = "tall";
        else if (ratio > 0.82) warning = "wide";
        update(it.id, { size: { w, h, ratio }, aspectWarning: warning });
      };
      img.src = it.preview;
    });
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((p) => p.id !== id);
    });
  };

  const clearAll = () => {
    items.forEach((it) => URL.revokeObjectURL(it.preview));
    setItems([]);
  };

  const update = (id: string, patch: Partial<UploadItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const processIds = async (ids: string[]) => {
    if (!effectiveCategoryId) {
      toast.error("Pick a main category first");
      return;
    }
    setRunning(true);
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const slug = effectiveCategory?.slug ?? "misc";

    let cursor = 0;
    const worker = async () => {
      while (cursor < ids.length) {
        const idx = cursor++;
        const id = ids[idx];
        const current = itemsRef.current.find((x) => x.id === id);
        if (!current) continue;
        try {
          update(id, { status: "optimizing", error: undefined });
          // If admin edited this image, render edits to a flattened JPEG and
          // optimize that; otherwise optimize the source directly.
          let toOptimize: File = current.file;
          if (current.edit && !isDefaultEdit(current.edit)) {
            const img = await loadImage(current.preview);
            // Render at a sensible print resolution (2:3 ratio @ ~2000px tall).
            const outH = 2400;
            const outW = Math.round(outH * current.edit.ratio);
            const blob = await renderEditToBlob(img, current.edit, outW, outH, 0.92);
            toOptimize = new File([blob], current.file.name.replace(/\.[^.]+$/, "") + "-edited.jpg", { type: "image/jpeg" });
          }
          const optimized = await optimizeImage(toOptimize, { maxDim: 2000, quality: 0.85 });

          update(id, { status: "uploading" });
          const uid = crypto.randomUUID();
          const baseExt = (current.file.name.split(".").pop() ?? "jpg").toLowerCase();
          const optExt = (optimized.name.split(".").pop() ?? "jpg").toLowerCase();

          // Upload optimized (public-facing) + original (admin archive) in parallel.
          const [webUrl, originalUrl] = await Promise.all([
            uploadAndSign("posters", `${slug}/${uid}.${optExt}`, optimized),
            uploadAndSign("posters-originals", `${slug}/${uid}.${baseExt}`, current.file).catch(
              () => null,
            ),
          ]);

          const baseName = current.file.name.replace(/\.[^.]+$/, "");
          const finalTitle = titlePrefix ? `${titlePrefix} ${baseName}` : baseName;

          const { data: inserted, error: insErr } = await supabase
            .from("posters")
            .insert({
              title: finalTitle,
              category_id: effectiveCategoryId,
              image_url: webUrl,
              original_url: originalUrl,
              tags,
              edit_settings: (current.edit ?? {}) as never,
            })
            .select("id")
            .single();
          if (insErr) throw insErr;

          update(id, { status: "done", posterId: inserted?.id, ai: aiEnabled ? "pending" : "idle" });

          if (aiEnabled && inserted?.id) {
            // Fire-and-forget AI generation; do not block other uploads.
            void runAiForPoster(id, inserted.id, webUrl, current.file.name);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Upload failed";
          console.error("Upload failed", current.file.name, err);
          update(id, { status: "failed", error: msg });
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, ids.length) }, () => worker()),
    );
    setRunning(false);
    onDone();
    // Final summary
    const final = itemsRef.current;
    const ok = final.filter((i) => ids.includes(i.id) && i.status === "done").length;
    const fail = final.filter((i) => ids.includes(i.id) && i.status === "failed").length;
    if (ok > 0) toast.success(`Uploaded ${ok} poster${ok === 1 ? "" : "s"}`);
    if (fail > 0) toast.error(`${fail} failed — click Retry to try again`);
  };

  const runAiForPoster = async (
    itemId: string,
    posterId: string,
    imageUrl: string,
    filename: string,
  ) => {
    try {
      const meta = await generatePosterMeta({
        data: {
          imageUrl,
          filename,
          categories: categories.map((c) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            parent_id: c.parent_id ?? null,
          })),
        },
      });
      const patch: {
        title: string;
        description: string | null;
        seo_title: string | null;
        seo_description: string | null;
        tags?: string[];
        category_id?: string;
      } = {
        title: meta.title,
        description: meta.description || null,
        seo_title: meta.seo_title || null,
        seo_description: meta.seo_description || null,
      };
      if (meta.tags.length > 0) {
        // Merge AI tags with admin-entered ones, dedup.
        const adminTags = tagsInput
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        patch.tags = Array.from(new Set([...adminTags, ...meta.tags]));
      }
      // Only override category if admin didn't pick a sub and AI found one
      if (meta.subcategory_id && !subCategoryId) {
        patch.category_id = meta.subcategory_id;
      } else if (meta.category_id && !effectiveCategoryId) {
        patch.category_id = meta.category_id;
      }
      const { error } = await supabase.from("posters").update(patch).eq("id", posterId);
      if (error) throw error;
      update(itemId, { ai: "generated", aiTitle: meta.title });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI failed";
      console.warn("AI gen failed", filename, msg);
      update(itemId, { ai: "failed", aiError: msg });
    }
  };

  // Keep a ref to items so workers always read the latest state.
  const itemsRef = useRef<UploadItem[]>([]);
  itemsRef.current = items;

  const startUpload = () => {
    const ids = items.filter((i) => i.status === "pending").map((i) => i.id);
    if (ids.length === 0) {
      toast.error("No new files to upload");
      return;
    }
    const pendingWarnings = items.filter(
      (i) => i.status === "pending" && i.aspectWarning && !i.aspectAccepted && !i.edit,
    );
    if (pendingWarnings.length > 0) {
      toast.error(
        `${pendingWarnings.length} صورة مقاسها مش 2:3 — عدّلها أو اختار "اقبل كما هي" قبل الرفع`,
      );
      return;
    }
    processIds(ids);
  };

  const retryFailed = () => {
    const ids = items.filter((i) => i.status === "failed").map((i) => i.id);
    if (ids.length === 0) return;
    processIds(ids);
  };

  const removeDone = () => {
    setItems((prev) => {
      const keep: UploadItem[] = [];
      for (const it of prev) {
        if (it.status === "done") URL.revokeObjectURL(it.preview);
        else keep.push(it);
      }
      return keep;
    });
  };

  return (
    <div className="rounded-sm border border-border bg-card p-6">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <CategoryPicker
          label="Main category"
          value={mainCategoryId}
          onChange={(id) => {
            setMainCategoryId(id);
            setSubCategoryId("");
          }}
          options={mainCategories}
          parentId={null}
          emptyText="No main categories yet"
        />
        <CategoryPicker
          label="Sub category (optional)"
          placeholder={
            !mainCategoryId
              ? "Pick a main category first"
              : subCategories.length === 0
              ? "— None available —"
              : "— None —"
          }
          value={subCategoryId}
          onChange={setSubCategoryId}
          options={subCategories}
          parentId={mainCategoryId || null}
          addDisabledReason={
            mainCategoryId ? undefined : "Please select a Main Category first."
          }
        />
        <label className="block lg:col-span-2">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Tags (comma separated)
          </span>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="Messi, Barcelona, GOAT"
            className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="block lg:col-span-4">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Title prefix (optional — appended with file name)
          </span>
          <input
            type="text"
            value={titlePrefix}
            onChange={(e) => setTitlePrefix(e.target.value)}
            placeholder="e.g. Messi Poster"
            className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
      </div>

      <label className="mt-3 inline-flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={aiEnabled}
          onChange={(e) => setAiEnabled(e.target.checked)}
        />
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        Auto-generate Title, Description, SEO &amp; Tags with AI after upload
      </label>

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
          <span className="font-semibold">Click to choose</span> or drag &amp; drop images here
        </div>
        <div className="text-[11px] text-muted-foreground">
          JPG / PNG / WEBP — auto resized to 2000px &amp; compressed for the website. Originals saved for admin.
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-sm border border-border bg-background/50 p-3">
            <div className="text-xs">
              <span className="font-semibold">{counts.total}</span>{" "}
              <span className="text-muted-foreground">files —</span>{" "}
              <span className="text-emerald-500">{counts.done} done</span>{" "}
              <span className="text-muted-foreground">/</span>{" "}
              <span className="text-destructive">{counts.failed} failed</span>{" "}
              <span className="text-muted-foreground">/ {counts.pending} pending</span>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                disabled={running || counts.pending === 0}
                onClick={startUpload}
                className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-40"
              >
                <Upload className="h-3.5 w-3.5" />
                {running ? `Uploading ${counts.busy}…` : `Upload ${counts.pending}`}
              </button>
              <button
                type="button"
                disabled={running || counts.failed === 0}
                onClick={retryFailed}
                className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-[11px] uppercase tracking-widest hover:bg-accent disabled:opacity-40"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry failed
              </button>
              <button
                type="button"
                disabled={running || counts.done === 0}
                onClick={removeDone}
                className="rounded-sm border border-border px-3 py-2 text-[11px] uppercase tracking-widest hover:bg-accent disabled:opacity-40"
              >
                Clear done
              </button>
              <button
                type="button"
                disabled={running}
                onClick={clearAll}
                className="rounded-sm border border-border px-3 py-2 text-[11px] uppercase tracking-widest hover:bg-accent disabled:opacity-40"
              >
                Clear all
              </button>
            </div>
          </div>

          {(running || counts.done > 0 || counts.failed > 0) && (
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${Math.round(((counts.done + counts.failed) / Math.max(1, counts.total)) * 100)}%`,
                }}
              />
            </div>
          )}

          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {items.map((it) => (
              <ItemTile
                key={it.id}
                item={it}
                onRemove={() => removeItem(it.id)}
                onEdit={() => setEditingId(it.id)}
                onAcceptAspect={() => update(it.id, { aspectAccepted: true })}
                disabled={running}
              />
            ))}
          </div>
        </>
      )}

      {editingId && (() => {
        const it = items.find((x) => x.id === editingId);
        if (!it) return null;
        return (
          <PosterImageEditor
            source={it.file}
            initial={it.edit}
            onCancel={() => setEditingId(null)}
            onSave={(s) => {
              update(it.id, { edit: s });
              setEditingId(null);
              toast.success("Edits saved — applied on upload");
            }}
          />
        );
      })()}
    </div>
  );
}

function ItemTile({
  item, onRemove, onEdit, onAcceptAspect, disabled,
}: { item: UploadItem; onRemove: () => void; onEdit: () => void; onAcceptAspect: () => void; disabled: boolean }) {
  const edited = !!item.edit && !isDefaultEdit({ ...DEFAULT_EDIT_SETTINGS, ...item.edit });
  const showWarning =
    !!item.aspectWarning && !item.aspectAccepted && !item.edit && item.status !== "done" && item.status !== "uploading";
  const warnLabel =
    item.aspectWarning === "square"
      ? "مقاس مربع"
      : item.aspectWarning === "tall"
        ? "طويلة جدًا"
        : "عريضة جدًا";
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-sm border bg-background",
        item.status === "done" && "border-emerald-500/60",
        item.status === "failed" && "border-destructive",
        item.status === "uploading" && "border-primary",
        item.status === "optimizing" && "border-primary/60",
        item.status === "pending" && (showWarning ? "border-amber-500" : "border-border"),
      )}
      title={item.aiError ?? item.aiTitle ?? item.error ?? item.file.name}
    >
      <div className="aspect-square bg-muted">
        <img src={item.preview} alt="" className="h-full w-full object-cover" />
      </div>
      {edited && (
        <span className="absolute left-1 top-1 rounded-sm bg-primary px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-primary-foreground">
          Edited
        </span>
      )}
      {showWarning && (
        <div className="absolute inset-x-0 top-0 flex flex-col gap-1 bg-amber-500/95 px-1.5 py-1 text-[10px] font-semibold text-black">
          <span className="inline-flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> {warnLabel} {item.size ? `(${item.size.w}×${item.size.h})` : ""}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onEdit}
              className="flex-1 rounded-sm bg-black/80 px-1 py-0.5 text-[9px] uppercase tracking-widest text-white hover:bg-black"
            >
              اظبطها
            </button>
            <button
              type="button"
              onClick={onAcceptAspect}
              className="flex-1 rounded-sm bg-black/20 px-1 py-0.5 text-[9px] uppercase tracking-widest text-black hover:bg-black/30"
            >
              سيبها
            </button>
          </div>
        </div>
      )}
      {!disabled && item.status !== "done" && item.status !== "uploading" && (
        <button
          type="button"
          onClick={onEdit}
          className="absolute right-1 top-1 rounded-sm bg-background/80 p-1 text-foreground opacity-0 transition group-hover:opacity-100"
          aria-label="Edit image"
          title="Edit image"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-background/85 px-1.5 py-1 text-[10px]">
        <StatusBadge status={item.status} ai={item.ai} />
        {!disabled && item.status !== "done" && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-sm p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Remove"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status, ai }: { status: ItemStatus; ai?: AiStatus }) {
  if (status === "done") {
    if (ai === "pending") {
      return (
        <span className="inline-flex items-center gap-1 text-primary/80">
          <Sparkles className="h-3 w-3 animate-pulse" /> AI…
        </span>
      );
    }
    if (ai === "generated") {
      return (
        <span className="inline-flex items-center gap-1 text-emerald-500">
          <Sparkles className="h-3 w-3" /> Generated
        </span>
      );
    }
    if (ai === "failed") {
      return (
        <span className="inline-flex items-center gap-1 text-amber-500">
          <AlertCircle className="h-3 w-3" /> Needs Review
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-emerald-500">
        <CheckCircle2 className="h-3 w-3" /> Done
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-destructive">
        <AlertCircle className="h-3 w-3" /> Failed
      </span>
    );
  }
  if (status === "uploading") {
    return (
      <span className="inline-flex items-center gap-1 text-primary">
        <Loader2 className="h-3 w-3 animate-spin" /> Uploading
      </span>
    );
  }
  if (status === "optimizing") {
    return (
      <span className="inline-flex items-center gap-1 text-primary/80">
        <Loader2 className="h-3 w-3 animate-spin" /> Optimizing
      </span>
    );
  }
  return <span className="text-muted-foreground">Pending</span>;
}

// Silence "unused" complaints for re-exports kept for future use.
export type { Category };
// Re-export to avoid TS unused warning if signStoragePath is later imported here.
void signStoragePath;