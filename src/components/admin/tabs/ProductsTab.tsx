import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  listCategoriesAdmin,
  upsertCategory,
  findOrCreateCategory,
  listPostersAdmin,
  upsertPoster,
  deletePoster,
  bulkUpdatePosters,
  listPosterImagesAdmin,
  upsertPosterImage,
  deletePosterImage,
} from "@/lib/db-admin.functions";
import { uploadPosterImage } from "@/lib/image-upload.functions";
import { optimizeImage } from "@/lib/image-optimize";
import { FramePreview } from "@/components/FramePreview";
import { PosterImageEditor } from "@/components/admin/PosterImageEditor";
import {
  DEFAULT_EDIT_SETTINGS,
  isDefaultEdit,
  loadImage,
  renderEditToBlob,
  type EditSettings,
} from "@/lib/poster-edit";
import { bucketAspect, computeMockupFit, friendlyRatio, type AspectBucket, type MockupFit } from "@/lib/mockup-fit";
import { generatePosterMeta, type GeneratedPosterMeta } from "@/lib/poster-ai.functions";
import { fileToDataUrl, type AdminCategory, type AdminPoster } from "./shared";
import { useConfirm } from "@/components/admin/layout/ConfirmDialogProvider";

// Inlined from src/lib/ai-review.ts's pure logic (not imported directly —
// that file also exports a Supabase-backed hook, and importing it would
// pull `@/integrations/supabase/client`'s eager `createClient()` call into
// this Neon-only bundle). Same reasons vocabulary, same 0.75 default
// threshold, just without the admin-configurable-threshold Supabase hook.
type ReviewReason =
  | "low_confidence"
  | "category_unclear"
  | "missing_subcategory"
  | "ai_failed";
const REVIEW_REASON_LABEL: Record<ReviewReason, string> = {
  low_confidence: "Low confidence",
  category_unclear: "Category unclear",
  missing_subcategory: "Missing subcategory",
  ai_failed: "AI analysis failed",
};
const AI_THRESHOLD_DEFAULT = 0.75;
function computeReviewReasons(input: {
  confidence: number | null;
  categoryId: string | null;
  subCategoryId: string | null;
  hasSubsUnderCategory: boolean;
  aiFailed: boolean;
}): ReviewReason[] {
  const reasons: ReviewReason[] = [];
  if (input.aiFailed) reasons.push("ai_failed");
  if (input.confidence != null && input.confidence < AI_THRESHOLD_DEFAULT) reasons.push("low_confidence");
  if (!input.categoryId) reasons.push("category_unclear");
  if (input.categoryId && !input.subCategoryId && input.hasSubsUnderCategory) {
    reasons.push("missing_subcategory");
  }
  return reasons;
}

const REVIEW_LABELS: Record<string, string> = {
  approved: "Approved",
  needs_edit: "Needs review",
};
const REVIEW_BADGE_CLASS: Record<string, string> = {
  needs_edit: "bg-amber-500/15 text-amber-500",
};

type QueueStatus =
  | "queued"
  | "optimizing"
  | "analyzing"
  | "ready"
  | "warning"
  | "fixed"
  | "publishing"
  | "published"
  | "failed";

type QueueItem = {
  id: string;
  file: File; // never mutated — source of truth for re-optimize + archived original
  previewUrl: string;
  status: QueueStatus;
  error?: string;
  productId?: string;

  // Analyze All output
  width: number | null;
  height: number | null;
  ratio: number | null;
  aspectBucket: AspectBucket | null;
  mockupFit: MockupFit;

  // AI (best-effort)
  aiFailed: boolean;
  title: string;
  description: string;
  seo_title: string;
  seo_description: string;
  alt_text: string;
  badge: string | null;
  tags: string[];
  confidence: number;

  // Category — batch-applied via "Apply to All", with a per-item override escape hatch
  categoryId: string | null;
  categoryName: string | null;
  subCategoryId: string | null;
  subCategoryName: string | null;
  categoryOverridden: boolean;

  // Mockup editor
  editSettings: EditSettings | null; // null = DEFAULT_EDIT_SETTINGS applies
  warningAccepted: boolean;

  publishedWithWarning?: boolean;
};

function filenameToTitle(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  const words = base
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1));
  return words.join(" ") || "Untitled";
}

const QUEUE_STATUS_LABEL: Record<QueueStatus, string> = {
  queued: "Queued",
  optimizing: "Optimizing",
  analyzing: "Analyzing",
  ready: "Ready",
  warning: "Warning",
  fixed: "Fixed",
  publishing: "Publishing",
  published: "Published",
  failed: "Failed",
};
const QUEUE_STATUS_BADGE_CLASS: Record<QueueStatus, string> = {
  queued: "bg-accent text-muted-foreground",
  optimizing: "bg-accent text-muted-foreground",
  analyzing: "bg-accent text-muted-foreground",
  ready: "bg-emerald-500/15 text-emerald-500",
  warning: "bg-amber-500/15 text-amber-500",
  fixed: "bg-cyan-500/15 text-cyan-500",
  publishing: "bg-accent text-muted-foreground",
  published: "bg-emerald-500/15 text-emerald-500",
  failed: "bg-red-500/15 text-red-500",
};

type AdminPosterImage = {
  id: string;
  poster_id: string;
  image_url: string;
  label: string | null;
  kind: string | null;
  sort_order: number;
  is_default: boolean;
};

function PosterGalleryImagesEditor({ posterId }: { posterId: string }) {
  const [images, setImages] = useState<AdminPosterImage[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () =>
    setImages((await listPosterImagesAdmin({ data: { posterId } })) as AdminPosterImage[]);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posterId]);

  const addFiles = async (files: FileList) => {
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const optimized = await optimizeImage(file, { maxDim: 1600, quality: 0.85 });
        const dataUrl = await fileToDataUrl(optimized);
        const { url } = await uploadPosterImage({ data: { dataUrl, filename: file.name } });
        await upsertPosterImage({
          data: { poster_id: posterId, image_url: url, sort_order: images?.length ?? 0 },
        });
      }
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: string) => {
    await deletePosterImage({ data: id });
    load();
  };

  return (
    <details className="rounded-sm border border-border">
      <summary className="cursor-pointer px-3 py-2 text-xs uppercase tracking-widest text-muted-foreground">
        Gallery images (optional)
      </summary>
      <div className="space-y-3 border-t border-border p-3">
        <p className="text-xs text-muted-foreground">
          Extra angle/detail photos shown as a thumbnail strip on the product page, alongside the
          main frame preview.
        </p>
        {images === null ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {images.map((img) => (
              <div key={img.id} className="group relative aspect-square overflow-hidden rounded-sm border border-border">
                <img src={img.image_url} alt="" className="h-full w-full object-cover" />
                <button
                  onClick={() => remove(img.id)}
                  className="absolute inset-0 flex items-center justify-center bg-background/80 text-xs opacity-0 transition group-hover:opacity-100"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="rounded-sm border border-border px-2 py-1.5 text-xs disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "+ Add images"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </details>
  );
}

export function ProductsTab() {
  const confirm = useConfirm();
  const [products, setProducts] = useState<AdminPoster[] | null>(null);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [editing, setEditing] = useState<Partial<AdminPoster> | null>(null);
  const [previewFrame, setPreviewFrame] = useState<"black" | "white" | "wood">("black");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkBadge, setBulkBadge] = useState("");
  const [onlyNeedsReview, setOnlyNeedsReview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const categoriesRef = useRef<AdminCategory[]>([]);
  categoriesRef.current = categories;

  // ---- Bulk Smart Upload Studio ----
  const [applyCategoryId, setApplyCategoryId] = useState("");
  const [applySubCategoryId, setApplySubCategoryId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newSubCategoryName, setNewSubCategoryName] = useState("");
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const [gridFilter, setGridFilter] = useState<"all" | "warning">("all");
  const [gridPage, setGridPage] = useState(0);
  const [overrideOpenId, setOverrideOpenId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [mockupFrameColor, setMockupFrameColor] = useState<"black" | "white" | "wood">("black");
  const GRID_PAGE_SIZE = 60;

  const load = async () => {
    const [p, c] = await Promise.all([listPostersAdmin({ data: {} }), listCategoriesAdmin()]);
    setProducts(p as AdminPoster[]);
    setCategories(c as AdminCategory[]);
  };
  useEffect(() => {
    load();
  }, []);

  const categoryName = useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (map.get(id) ?? "—") : "—");
  }, [categories]);

  // ---- Bulk Smart Upload Studio ----
  // Select -> Analyze All (optimize + measure mockup fit + AI metadata, no
  // upload yet) -> pick category/subcategory once and Apply to All -> fix
  // or accept any mockup-fit warnings -> Publish All (uploads + creates the
  // posters). A discarded item never touched the network, so it leaves no
  // orphaned blob or DB row.
  const updateQueueItem = (id: string, patch: Partial<QueueItem>) =>
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));

  // ---- Analyze All: optimize -> measure dimensions/mockup fit -> AI
  // metadata on the local data URL. Category is deliberately NOT resolved
  // here — it's chosen once, after analysis, via Apply to All below. ----
  const analyzeItem = async (item: QueueItem) => {
    try {
      updateQueueItem(item.id, { status: "optimizing", error: undefined });
      const optimized = await optimizeImage(item.file, { maxDim: 2000, quality: 0.85 });

      const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const probe = new Image();
        probe.onload = () => resolve({ w: probe.naturalWidth, h: probe.naturalHeight });
        probe.onerror = () => reject(new Error("Could not read image dimensions"));
        probe.src = item.previewUrl;
      });
      const ratio = dims.w / dims.h;
      const aspectBucket = bucketAspect(ratio);
      const mockupFit = computeMockupFit(ratio);
      updateQueueItem(item.id, {
        status: "analyzing",
        width: dims.w,
        height: dims.h,
        ratio,
        aspectBucket,
        mockupFit,
      });

      let meta: Partial<GeneratedPosterMeta> = {};
      let aiFailed = false;
      try {
        const dataUrl = await fileToDataUrl(optimized);
        meta = await generatePosterMeta({
          data: { imageUrl: dataUrl, filename: item.file.name, categories: [] },
        });
      } catch {
        // AI assist is best-effort: a failure here still leaves a usable
        // draft (filename-derived title). It's folded into review_status
        // at publish time, never blocks the flow here.
        aiFailed = true;
      }

      updateQueueItem(item.id, {
        status: mockupFit.ok ? "ready" : "warning",
        aiFailed,
        title: meta.title || filenameToTitle(item.file.name),
        description: meta.description || "",
        seo_title: meta.seo_title || "",
        seo_description: meta.seo_description || "",
        alt_text: meta.alt_text || "",
        badge: meta.badge ?? null,
        tags: meta.tags ?? [],
        confidence: aiFailed ? 0 : typeof meta.confidence === "number" ? meta.confidence : 1,
      });
    } catch (err) {
      updateQueueItem(item.id, {
        status: "failed",
        error: err instanceof Error ? err.message : "Analysis failed",
      });
    }
  };

  // ---- Publish All: bake any manual crop, upload web + archival original,
  // create the poster. review_status folds in both the mockup-fit warning
  // (if published anyway) and any AI-quality reasons, reusing the same
  // "Needs review" system already live on the product list below. ----
  const publishItem = async (item: QueueItem) => {
    updateQueueItem(item.id, { status: "publishing", error: undefined });
    try {
      let toOptimize: File = item.file;
      if (item.editSettings && !isDefaultEdit(item.editSettings)) {
        const img = await loadImage(item.previewUrl);
        const outH = 2400;
        const outW = Math.round(outH * item.editSettings.ratio);
        const blob = await renderEditToBlob(img, item.editSettings, outW, outH, 0.92);
        toOptimize = new File([blob], item.file.name.replace(/\.[^.]+$/, "") + "-edited.jpg", {
          type: "image/jpeg",
        });
      }
      const optimized = await optimizeImage(toOptimize, { maxDim: 2000, quality: 0.85 });
      const [webDataUrl, originalDataUrl] = await Promise.all([
        fileToDataUrl(optimized),
        fileToDataUrl(item.file),
      ]);
      const [{ url: imageUrl }, { url: originalUrl }] = await Promise.all([
        uploadPosterImage({ data: { dataUrl: webDataUrl, filename: item.file.name } }),
        uploadPosterImage({ data: { dataUrl: originalDataUrl, filename: item.file.name } }),
      ]);

      const hasSubs = categoriesRef.current.some((c) => c.parent_id === item.categoryId);
      const reasons = computeReviewReasons({
        confidence: item.confidence,
        categoryId: item.categoryId,
        subCategoryId: item.subCategoryId,
        hasSubsUnderCategory: hasSubs,
        aiFailed: item.aiFailed,
      });
      const needsEdit = Boolean(item.publishedWithWarning) || reasons.length > 0;

      const { id: productId } = await upsertPoster({
        data: {
          title: item.title || filenameToTitle(item.file.name),
          image_url: imageUrl,
          original_url: originalUrl,
          edit_settings: item.editSettings ?? DEFAULT_EDIT_SETTINGS,
          category_id: item.subCategoryId ?? item.categoryId ?? null,
          badge: item.badge,
          tags: item.tags,
          seo_title: item.seo_title || null,
          seo_description: item.seo_description || null,
          alt_text: item.alt_text || null,
          description: item.description || null,
          hidden: false,
          trending: false,
          review_status: needsEdit ? "needs_edit" : "approved",
        },
      });
      updateQueueItem(item.id, { status: "published", productId });
      load();
    } catch (err) {
      updateQueueItem(item.id, {
        status: "failed",
        error: err instanceof Error ? err.message : "Publish failed",
      });
    }
  };

  // 9 rotating Gemini keys are configured, so a higher concurrency spreads
  // load across them instead of one key eating the whole rate limit.
  const MAX_CONCURRENT = 8;
  const activeCountRef = useRef(0);
  const pendingRef = useRef<QueueItem[]>([]);
  const pump = () => {
    while (activeCountRef.current < MAX_CONCURRENT && pendingRef.current.length > 0) {
      const item = pendingRef.current.shift();
      if (!item) break;
      activeCountRef.current++;
      analyzeItem(item).finally(() => {
        activeCountRef.current--;
        pump();
      });
    }
  };

  // Separate pump for publishing, so "Publish All" can fan many items out
  // at once without competing with any still-in-flight analysis.
  const publishActiveCountRef = useRef(0);
  const publishPendingRef = useRef<QueueItem[]>([]);
  const pumpPublish = () => {
    while (publishActiveCountRef.current < MAX_CONCURRENT && publishPendingRef.current.length > 0) {
      const item = publishPendingRef.current.shift();
      if (!item) break;
      publishActiveCountRef.current++;
      publishItem(item).finally(() => {
        publishActiveCountRef.current--;
        pumpPublish();
      });
    }
  };
  const queuePublish = (item: QueueItem) => {
    publishPendingRef.current.push(item);
    pumpPublish();
  };

  // ---- Select Images: only enqueues. Analysis is a deliberate next step. ----
  const addFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (incoming.length === 0) return;
    const items: QueueItem[] = incoming.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: "queued",
      width: null,
      height: null,
      ratio: null,
      aspectBucket: null,
      mockupFit: { ok: true, reason: null },
      aiFailed: false,
      title: "",
      description: "",
      seo_title: "",
      seo_description: "",
      alt_text: "",
      badge: null,
      tags: [],
      confidence: 1,
      categoryId: null,
      categoryName: null,
      subCategoryId: null,
      subCategoryName: null,
      categoryOverridden: false,
      editSettings: null,
      warningAccepted: false,
    }));
    setQueue((prev) => [...prev, ...items]);
  };

  const startAnalysis = () => {
    const toAnalyze = queue.filter((q) => q.status === "queued");
    if (toAnalyze.length === 0) return;
    pendingRef.current.push(...toAnalyze);
    pump();
  };

  const retryItem = (item: QueueItem) => {
    if (item.width === null) {
      updateQueueItem(item.id, { status: "queued", error: undefined });
      pendingRef.current.push({ ...item, status: "queued" });
      pump();
    } else {
      updateQueueItem(item.id, { status: item.mockupFit.ok ? "ready" : "warning", error: undefined });
      queuePublish(item);
    }
  };

  const discardItem = (item: QueueItem) => {
    URL.revokeObjectURL(item.previewUrl);
    setQueue((prev) => prev.filter((q) => q.id !== item.id));
  };

  const clearPublished = () => setQueue((prev) => prev.filter((q) => q.status !== "published"));

  // ---- Top Control Bar: pick category+subcategory once, apply to every
  // queued image, with a per-item override escape hatch for stragglers. ----
  const addTopCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      const { id } = await upsertCategory({ data: { name } });
      const newCat = { id, name, slug: id, parent_id: null } as AdminCategory;
      categoriesRef.current = [...categoriesRef.current, newCat];
      setCategories((prev) => [...prev, newCat]);
      setApplyCategoryId(id);
      setApplySubCategoryId("");
      setNewCategoryName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add category");
    }
  };

  const addTopSubCategory = async () => {
    if (!applyCategoryId) return;
    const name = newSubCategoryName.trim();
    if (!name) return;
    try {
      const { id, created } = await findOrCreateCategory({ data: { name, parentId: applyCategoryId } });
      if (created) {
        const newCat = { id, name, slug: id, parent_id: applyCategoryId } as AdminCategory;
        categoriesRef.current = [...categoriesRef.current, newCat];
        setCategories((prev) => [...prev, newCat]);
      }
      setApplySubCategoryId(id);
      setNewSubCategoryName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add subcategory");
    }
  };

  const requestApplyToAll = () => {
    if (!applyCategoryId) {
      toast.error("Pick a category first");
      return;
    }
    if (queue.length === 0) return;
    setShowApplyConfirm(true);
  };

  const confirmApplyToAll = () => {
    const catName = categories.find((c) => c.id === applyCategoryId)?.name ?? null;
    const subName = applySubCategoryId
      ? (categories.find((c) => c.id === applySubCategoryId)?.name ?? null)
      : null;
    setQueue((prev) =>
      prev.map((q) => ({
        ...q,
        categoryId: applyCategoryId,
        categoryName: catName,
        subCategoryId: applySubCategoryId || null,
        subCategoryName: subName,
        categoryOverridden: false,
      })),
    );
    setShowApplyConfirm(false);
    toast.success(`Applied ${catName}${subName ? ` → ${subName}` : ""} to ${queue.length} image(s)`);
  };

  const overrideItemCategory = (item: QueueItem, categoryId: string | null, subCategoryId: string | null) => {
    const catName = categoryId ? (categories.find((c) => c.id === categoryId)?.name ?? null) : null;
    const subName = subCategoryId ? (categories.find((c) => c.id === subCategoryId)?.name ?? null) : null;
    updateQueueItem(item.id, {
      categoryId,
      categoryName: catName,
      subCategoryId,
      subCategoryName: subName,
      categoryOverridden: true,
    });
  };

  const overriddenCount = queue.filter((q) => q.categoryOverridden).length;
  const readyCount = queue.filter((q) => q.status === "ready").length;
  const warningCount = queue.filter((q) => q.status === "warning").length;
  const fixedCount = queue.filter((q) => q.status === "fixed").length;
  const publishedCount = queue.filter((q) => q.status === "published").length;
  const publishableCount = readyCount + fixedCount + warningCount;

  const runPublishAll = () => {
    const targets = queue.filter((q) => q.status === "ready" || q.status === "fixed");
    targets.forEach(queuePublish);
  };

  const requestPublishAll = () => {
    const unresolvedWarnings = queue.filter((q) => q.status === "warning" && !q.warningAccepted);
    if (unresolvedWarnings.length > 0) {
      setPublishDialogOpen(true);
      return;
    }
    runPublishAll();
  };

  const publishAsIs = () => {
    setQueue((prev) =>
      prev.map((q) =>
        q.status === "warning" ? { ...q, warningAccepted: true, publishedWithWarning: true } : q,
      ),
    );
    setPublishDialogOpen(false);
    // Publish everything ready/fixed, plus the warnings just accepted.
    const targets = queue.filter((q) => q.status === "ready" || q.status === "fixed" || q.status === "warning");
    targets.forEach((q) => queuePublish({ ...q, warningAccepted: true, publishedWithWarning: q.status === "warning" || q.publishedWithWarning }));
  };

  const fixImagesInstead = () => {
    setPublishDialogOpen(false);
    setGridFilter("warning");
    setGridPage(0);
    const firstWarning = queue.find((q) => q.status === "warning");
    if (firstWarning) setEditingItemId(firstWarning.id);
  };

  // ---- Selection + bulk actions ----
  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearSelection = () => setSelected(new Set());

  const applyBulk = async (patch: {
    category_id?: string;
    badge?: string | null;
    hidden?: boolean;
    trending?: boolean;
    is_best_seller?: boolean;
  }) => {
    if (selected.size === 0) return;
    try {
      await bulkUpdatePosters({ data: { ids: Array.from(selected), patch } });
      toast.success(`Updated ${selected.size} product(s)`);
      clearSelection();
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk update failed");
    }
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!(await confirm(`Delete ${selected.size} product(s)? This can't be undone.`))) return;
    const ids = Array.from(selected);
    const results = await Promise.allSettled(ids.map((id) => deletePoster({ data: id })));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (ids.length - failed > 0) toast.success(`Deleted ${ids.length - failed} product(s)`);
    if (failed > 0) toast.error(`${failed} product(s) failed to delete`);
    clearSelection();
    load();
  };

  // ---- Single-product edit ----
  const save = async () => {
    if (!editing?.title) return toast.error("Title is required");
    if (!editing?.image_url) return toast.error("Image URL is required");
    try {
      await upsertPoster({ data: editing });
      toast.success("Saved");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const remove = async (id: string) => {
    if (!(await confirm("Delete this product?"))) return;
    try {
      await deletePoster({ data: id });
      toast.success("Deleted");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const markReviewed = async (id: string) => {
    try {
      await bulkUpdatePosters({ data: { ids: [id], patch: { review_status: "approved" } } });
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark reviewed");
    }
  };

  if (products === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const visibleProducts = onlyNeedsReview
    ? products.filter((p) => p.review_status !== "approved")
    : products;

  const gridItems = gridFilter === "warning" ? queue.filter((q) => q.status === "warning") : queue;
  const totalPages = Math.max(1, Math.ceil(gridItems.length / GRID_PAGE_SIZE));
  const pagedItems = gridItems.slice(gridPage * GRID_PAGE_SIZE, (gridPage + 1) * GRID_PAGE_SIZE);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Products</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={onlyNeedsReview}
              onChange={(e) => setOnlyNeedsReview(e.target.checked)}
            />
            Needs review only
          </label>
          <button
            onClick={() => setEditing({})}
            className="rounded-sm border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            + Single product (advanced)
          </button>
        </div>
      </div>

      {/* ---- 1. Select Images ---- */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`mb-4 cursor-pointer rounded-sm border-2 border-dashed p-8 text-center transition ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-foreground/40"
        }`}
      >
        <p className="text-sm font-medium">+ SELECT IMAGES — drag & drop, or click to browse</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Add 10, 100, or 500+ at once · nothing is analyzed or published automatically
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {queue.length > 0 && (
        <div className="mb-6 rounded-sm border border-border bg-card">
          {/* ---- 2. Analyze All ---- */}
          {queue.some((q) => q.status === "queued") && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
              <span className="text-xs text-muted-foreground">
                {queue.length} image(s) selected ·{" "}
                {queue.filter((q) => q.status !== "queued").length} analyzed
              </span>
              <button
                onClick={startAnalysis}
                className="rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground"
              >
                Analyze Images
              </button>
            </div>
          )}

          {/* ---- 3. Top Control Bar ---- */}
          {queue.some((q) => q.status !== "queued") && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2">
              <select
                value={applyCategoryId}
                onChange={(e) => {
                  setApplyCategoryId(e.target.value);
                  setApplySubCategoryId("");
                }}
                className="rounded-sm border border-border bg-background px-2 py-1.5 text-xs"
              >
                <option value="">Category…</option>
                {categories
                  .filter((c) => !c.parent_id)
                  .map((main) => (
                    <option key={main.id} value={main.id}>
                      {main.name}
                    </option>
                  ))}
              </select>
              <input
                placeholder="+ New category"
                dir="ltr"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addTopCategory();
                }}
                className="w-28 rounded-sm border border-border bg-background px-2 py-1.5 text-xs"
              />
              <button
                onClick={addTopCategory}
                disabled={!newCategoryName.trim()}
                className="rounded-sm border border-border px-2 py-1.5 text-xs disabled:opacity-40"
              >
                Add
              </button>

              <select
                value={applySubCategoryId}
                disabled={!applyCategoryId}
                onChange={(e) => setApplySubCategoryId(e.target.value)}
                className="rounded-sm border border-border bg-background px-2 py-1.5 text-xs disabled:opacity-50"
              >
                <option value="">Subcategory (optional)…</option>
                {categories
                  .filter((c) => c.parent_id === applyCategoryId)
                  .map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name}
                    </option>
                  ))}
              </select>
              <input
                placeholder="+ New subcategory"
                dir="ltr"
                disabled={!applyCategoryId}
                value={newSubCategoryName}
                onChange={(e) => setNewSubCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addTopSubCategory();
                }}
                className="w-28 rounded-sm border border-border bg-background px-2 py-1.5 text-xs disabled:opacity-50"
              />
              <button
                onClick={addTopSubCategory}
                disabled={!applyCategoryId || !newSubCategoryName.trim()}
                className="rounded-sm border border-border px-2 py-1.5 text-xs disabled:opacity-40"
              >
                Add
              </button>

              <button
                onClick={requestApplyToAll}
                disabled={!applyCategoryId}
                className="rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground disabled:opacity-40"
              >
                Apply to All
              </button>

              <div className="ml-auto flex flex-wrap items-center gap-3">
                {warningCount > 0 && gridFilter === "all" && (
                  <button
                    onClick={() => {
                      setGridFilter("warning");
                      setGridPage(0);
                    }}
                    className="text-xs text-amber-500 hover:underline"
                  >
                    {warningCount} need attention
                  </button>
                )}
                {gridFilter === "warning" && (
                  <button
                    onClick={() => {
                      setGridFilter("all");
                      setGridPage(0);
                    }}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    Show all
                  </button>
                )}
                <span className="text-xs text-muted-foreground">
                  {readyCount} ready · {warningCount} warning · {fixedCount} fixed · {publishedCount} published
                </span>
                <button
                  onClick={requestPublishAll}
                  disabled={publishableCount === 0}
                  className="rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground disabled:opacity-40"
                >
                  Publish All ({publishableCount})
                </button>
                <button onClick={clearPublished} className="text-xs text-muted-foreground hover:text-foreground">
                  Clear published
                </button>
              </div>
            </div>
          )}

          {/* ---- 4. Image Grid ---- */}
          <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {pagedItems.map((q) => (
              <div
                key={q.id}
                className={`group relative overflow-hidden rounded-sm border bg-background ${
                  q.status === "warning"
                    ? "border-amber-500"
                    : q.status === "failed"
                      ? "border-red-500"
                      : "border-border"
                }`}
              >
                <div
                  className="aspect-square cursor-pointer bg-muted"
                  onClick={() => {
                    if (q.status === "warning" || q.status === "fixed") setEditingItemId(q.id);
                  }}
                >
                  <img src={q.previewUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                </div>
                {q.categoryOverridden && (
                  <span className="absolute left-1 top-1 rounded-sm bg-primary px-1.5 py-0.5 text-[9px] uppercase text-primary-foreground">
                    Override
                  </span>
                )}
                <button
                  onClick={() => discardItem(q)}
                  className="absolute right-1 top-1 rounded-sm bg-background/80 px-1 py-0.5 text-[10px] text-red-500 opacity-0 transition group-hover:opacity-100"
                >
                  ✕
                </button>
                <div className="space-y-0.5 border-t border-border bg-background px-1.5 py-1 text-[9px]">
                  <div className="truncate font-medium">{q.title || q.file.name}</div>
                  {q.width && q.ratio !== null && (
                    <div className="text-muted-foreground">
                      {q.width}×{q.height} · {friendlyRatio(q.ratio)}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`rounded-sm px-1 py-0.5 uppercase tracking-wide ${QUEUE_STATUS_BADGE_CLASS[q.status]}`}
                    >
                      {q.status === "warning"
                        ? "⚠ Warning"
                        : q.status === "ready" || q.status === "fixed"
                          ? "✓ Good fit"
                          : QUEUE_STATUS_LABEL[q.status]}
                    </span>
                    {q.status === "failed" && (
                      <button onClick={() => retryItem(q)} className="text-cyan-500 hover:underline">
                        Retry
                      </button>
                    )}
                  </div>
                  {q.status === "warning" && q.mockupFit.reason && (
                    <div className="text-amber-500">{q.mockupFit.reason}</div>
                  )}
                  <button
                    onClick={() => setOverrideOpenId(overrideOpenId === q.id ? null : q.id)}
                    className="block w-full truncate text-left text-cyan-500 hover:underline"
                  >
                    {q.categoryName ?? "No category"}
                    {q.subCategoryName ? ` > ${q.subCategoryName}` : ""}
                  </button>
                </div>
                {overrideOpenId === q.id && (
                  <div className="absolute inset-0 z-10 flex flex-col gap-1 bg-background/95 p-2 text-[10px]">
                    <select
                      value={q.categoryId ?? ""}
                      onChange={(e) => overrideItemCategory(q, e.target.value || null, null)}
                      className="rounded-sm border border-border bg-background px-1 py-1"
                    >
                      <option value="">No category</option>
                      {categories
                        .filter((c) => !c.parent_id)
                        .map((main) => (
                          <option key={main.id} value={main.id}>
                            {main.name}
                          </option>
                        ))}
                    </select>
                    <select
                      value={q.subCategoryId ?? ""}
                      disabled={!q.categoryId}
                      onChange={(e) => overrideItemCategory(q, q.categoryId, e.target.value || null)}
                      className="rounded-sm border border-border bg-background px-1 py-1 disabled:opacity-50"
                    >
                      <option value="">No subcategory</option>
                      {categories
                        .filter((c) => c.parent_id === q.categoryId)
                        .map((sub) => (
                          <option key={sub.id} value={sub.id}>
                            {sub.name}
                          </option>
                        ))}
                    </select>
                    <button
                      onClick={() => setOverrideOpenId(null)}
                      className="rounded-sm border border-border py-1 hover:bg-accent"
                    >
                      Done
                    </button>
                  </div>
                )}
              </div>
            ))}
            {pagedItems.length === 0 && (
              <p className="col-span-full py-6 text-center text-xs text-muted-foreground">
                {gridFilter === "warning" ? "No images need attention." : "No images yet."}
              </p>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 border-t border-border py-2 text-xs">
              <button
                disabled={gridPage === 0}
                onClick={() => setGridPage((p) => p - 1)}
                className="disabled:opacity-40"
              >
                Prev
              </button>
              <span className="text-muted-foreground">
                Page {gridPage + 1} / {totalPages}
              </span>
              <button
                disabled={gridPage >= totalPages - 1}
                onClick={() => setGridPage((p) => p + 1)}
                className="disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}

          {/* ---- 5. Publish Bar ---- */}
          {queue.some((q) => q.status !== "queued") && (
            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-4 py-2">
              <span className="text-xs text-muted-foreground">
                {readyCount} ready · {warningCount} warning · {fixedCount} fixed · {publishedCount} published
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={requestPublishAll}
                  disabled={publishableCount === 0}
                  className="rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground disabled:opacity-40"
                >
                  Publish All ({publishableCount})
                </button>
                <button onClick={clearPublished} className="text-xs text-muted-foreground hover:text-foreground">
                  Clear published
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- Publish dialog ---- */}
      {publishDialogOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-sm border border-border bg-card p-5">
            <p className="text-sm">{warningCount} images may not fit correctly inside the mockup.</p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={publishAsIs}
                className="rounded-sm bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground"
              >
                Publish As Is
              </button>
              <button
                onClick={fixImagesInstead}
                className="rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
              >
                Fix Images
              </button>
              <button
                onClick={() => setPublishDialogOpen(false)}
                className="text-xs text-muted-foreground hover:underline"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Apply to All confirm ---- */}
      {showApplyConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-sm border border-border bg-card p-5">
            <p className="text-sm">
              Apply {categories.find((c) => c.id === applyCategoryId)?.name}
              {applySubCategoryId ? ` → ${categories.find((c) => c.id === applySubCategoryId)?.name}` : ""} to{" "}
              {queue.length} image(s)?
              {overriddenCount > 0 &&
                ` ${overriddenCount} of these have a manual override that will be replaced.`}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowApplyConfirm(false)}
                className="rounded-sm border border-border px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={confirmApplyToAll}
                className="rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
              >
                {overriddenCount > 0 ? "Apply Anyway" : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Mockup Editor ---- */}
      {editingItemId &&
        (() => {
          const item = queue.find((q) => q.id === editingItemId);
          if (!item) return null;
          return (
            <PosterImageEditor
              source={item.file}
              initial={item.editSettings ?? undefined}
              mockupFrame={mockupFrameColor}
              onCancel={() => setEditingItemId(null)}
              onSave={(s) => {
                updateQueueItem(item.id, {
                  editSettings: s,
                  status: item.status === "warning" ? "fixed" : item.status,
                  warningAccepted: item.status === "warning" ? true : item.warningAccepted,
                });
                setEditingItemId(null);
                toast.success("Saved — applied when published");
              }}
            />
          );
        })()}

      {/* ---- Bulk action bar ---- */}
      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-sm border border-primary/40 bg-primary/5 p-3">
          <span className="text-xs font-medium">{selected.size} selected</span>
          <select
            value={bulkCategory}
            onChange={(e) => setBulkCategory(e.target.value)}
            className="rounded-sm border border-border bg-background px-2 py-1 text-xs"
          >
            <option value="">Set category…</option>
            {categories
              .filter((c) => !c.parent_id)
              .map((main) => {
                const subs = categories.filter((c) => c.parent_id === main.id);
                return (
                  <optgroup key={main.id} label={main.name}>
                    <option value={main.id}>{main.name}</option>
                    {subs.map((s) => (
                      <option key={s.id} value={s.id}>
                        — {s.name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
          </select>
          <button
            disabled={!bulkCategory}
            onClick={() => applyBulk({ category_id: bulkCategory })}
            className="rounded-sm border border-border px-2 py-1 text-xs disabled:opacity-40"
          >
            Apply
          </button>
          <input
            placeholder="Set badge…"
            value={bulkBadge}
            onChange={(e) => setBulkBadge(e.target.value)}
            className="w-32 rounded-sm border border-border bg-background px-2 py-1 text-xs"
          />
          <button
            disabled={!bulkBadge}
            onClick={() => applyBulk({ badge: bulkBadge })}
            className="rounded-sm border border-border px-2 py-1 text-xs disabled:opacity-40"
          >
            Apply
          </button>
          <button onClick={() => applyBulk({ trending: true })} className="rounded-sm border border-border px-2 py-1 text-xs">
            + Trending
          </button>
          <button onClick={() => applyBulk({ is_best_seller: true })} className="rounded-sm border border-border px-2 py-1 text-xs">
            + Best Seller
          </button>
          <button onClick={() => applyBulk({ is_best_seller: false })} className="rounded-sm border border-border px-2 py-1 text-xs">
            − Best Seller
          </button>
          <button onClick={() => applyBulk({ hidden: false })} className="rounded-sm border border-border px-2 py-1 text-xs">
            Publish
          </button>
          <button onClick={() => applyBulk({ hidden: true })} className="rounded-sm border border-border px-2 py-1 text-xs">
            Hide
          </button>
          <button onClick={deleteSelected} className="rounded-sm border border-red-500/40 px-2 py-1 text-xs text-red-500">
            Delete
          </button>
          <button onClick={clearSelection} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
            Clear selection
          </button>
        </div>
      )}

      {/* ---- Single-product advanced edit ---- */}
      {editing && (
        <div className="mb-6 grid gap-4 rounded-sm border border-border bg-card p-4 sm:grid-cols-[200px_1fr]">
          <div>
            {editing.image_url ? (
              <>
                <FramePreview posterUrl={editing.image_url} color={previewFrame} aspectClassName="aspect-[3/4]" />
                <div className="mt-2 flex gap-1">
                  {(["black", "white", "wood"] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => setPreviewFrame(c)}
                      className={`flex-1 rounded-sm border px-1 py-1 text-[10px] capitalize ${
                        previewFrame === c ? "border-primary text-foreground" : "border-border text-muted-foreground"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex aspect-[3/4] items-center justify-center rounded-sm border border-dashed border-border text-xs text-muted-foreground">
                Mockup preview
              </div>
            )}
          </div>
          <div className="space-y-3">
            <input
              placeholder="Title"
              dir="ltr"
              value={editing.title ?? ""}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              placeholder="Image URL"
              dir="ltr"
              value={editing.image_url ?? ""}
              onChange={(e) => setEditing({ ...editing, image_url: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <select
              value={editing.category_id ?? ""}
              onChange={(e) => setEditing({ ...editing, category_id: e.target.value || null })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">No category</option>
              {categories
                .filter((c) => !c.parent_id)
                .map((main) => {
                  const subs = categories.filter((c) => c.parent_id === main.id);
                  return (
                    <optgroup key={main.id} label={main.name}>
                      <option value={main.id}>{main.name}</option>
                      {subs.map((s) => (
                        <option key={s.id} value={s.id}>
                          — {s.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
            </select>
            <input
              placeholder="Badge (e.g. New, Sale) — optional"
              dir="ltr"
              value={editing.badge ?? ""}
              onChange={(e) => setEditing({ ...editing, badge: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <details className="rounded-sm border border-border">
              <summary className="cursor-pointer px-3 py-2 text-xs uppercase tracking-widest text-muted-foreground">
                SEO (optional)
              </summary>
              <div className="space-y-3 border-t border-border p-3">
                <input
                  placeholder="SEO title (falls back to product title)"
                  dir="ltr"
                  value={editing.seo_title ?? ""}
                  onChange={(e) => setEditing({ ...editing, seo_title: e.target.value })}
                  className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
                />
                <textarea
                  placeholder="SEO description (falls back to a default)"
                  dir="ltr"
                  value={editing.seo_description ?? ""}
                  onChange={(e) => setEditing({ ...editing, seo_description: e.target.value })}
                  rows={2}
                  className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
                />
                <input
                  placeholder="Image alt text"
                  dir="ltr"
                  value={editing.alt_text ?? ""}
                  onChange={(e) => setEditing({ ...editing, alt_text: e.target.value })}
                  className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            </details>
            {editing.id && <PosterGalleryImagesEditor posterId={editing.id} />}
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(editing.hidden)}
                  onChange={(e) => setEditing({ ...editing, hidden: e.target.checked })}
                />
                Hidden (draft)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(editing.trending)}
                  onChange={(e) => setEditing({ ...editing, trending: e.target.checked })}
                />
                Trending
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(editing.is_best_seller)}
                  onChange={(e) => setEditing({ ...editing, is_best_seller: e.target.checked })}
                />
                Best Seller
              </label>
            </div>
            <div className="flex gap-2">
              <button onClick={save} className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
                Save
              </button>
              <button onClick={() => setEditing(null)} className="rounded-sm border border-border px-3 py-1.5 text-xs">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Product list ---- */}
      <div className="space-y-2">
        {visibleProducts.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-sm border border-border p-3">
            <div className="flex items-center gap-3">
              <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelected(p.id)} />
              <img src={p.image_url} alt="" className="h-12 w-9 rounded-sm object-cover" />
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  {p.title}
                  {p.review_status !== "approved" && (
                    <span
                      className={`rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                        REVIEW_BADGE_CLASS[p.review_status] ?? "bg-accent text-muted-foreground"
                      }`}
                    >
                      {REVIEW_LABELS[p.review_status] ?? p.review_status}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {categoryName(p.category_id)}
                  {p.hidden ? " · draft" : " · published"}
                  {p.trending ? " · trending" : ""}
                  {p.is_best_seller ? " · best seller" : ""}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {p.review_status !== "approved" && (
                <button onClick={() => markReviewed(p.id)} className="text-xs text-emerald-500 hover:underline">
                  Mark reviewed
                </button>
              )}
              <button onClick={() => setEditing(p)} className="text-xs text-cyan-500 hover:underline">
                Edit
              </button>
              <button onClick={() => remove(p.id)} className="text-xs text-red-500 hover:underline">
                Delete
              </button>
            </div>
          </div>
        ))}
        {visibleProducts.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {onlyNeedsReview ? "Nothing needs review." : "No products yet — drop some images above."}
          </p>
        )}
      </div>
    </div>
  );
}
