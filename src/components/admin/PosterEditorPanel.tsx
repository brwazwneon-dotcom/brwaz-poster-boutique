import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  upsertPoster,
  setPosterCategoriesAdmin,
  getPosterCategoryIdsAdmin,
  listPosterImagesAdmin,
  upsertPosterImage,
  deletePosterImage,
} from "@/lib/db-admin.functions";
import { uploadPosterImage } from "@/lib/image-upload.functions";
import { optimizeImage } from "@/lib/image-optimize";
import { uploadResponsiveSrcSets } from "@/lib/responsive-image";
import { loadImage, renderEditToBlob, type EditSettings } from "@/lib/poster-edit";
import { FramePreview } from "@/components/FramePreview";
import { PosterImageEditor } from "@/components/admin/PosterImageEditor";
import {
  fileToDataUrl,
  type AdminCategory,
  type AdminPoster,
} from "@/components/admin/tabs/shared";

// Extracted verbatim from ProductsTab.tsx's former inline "Single-product
// advanced edit" panel (Phase 1 of the Categories → Poster Management
// Center plan) — pure relocation, no behavior change. ProductsTab still
// owns the product list, bulk actions, and the Bulk Upload Studio; this
// component owns everything about editing ONE already-listed poster
// (or creating a new one), so the same panel can be reused from the
// upcoming Category Poster Manager view without duplicating this logic.

type AdminPosterImage = {
  id: string;
  poster_id: string;
  image_url: string;
  label: string | null;
  kind: string | null;
  sort_order: number;
  is_default: boolean;
};

// Unchanged from the original ProductsTab.tsx — only used inside this
// editor panel (via editing.id below), so it moves here with it rather
// than staying exported from a shared module nothing else references.
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
              <div
                key={img.id}
                className="group relative aspect-square overflow-hidden rounded-sm border border-border"
              >
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

/**
 * Full single-poster editor: image/mockup, title, category, Website
 * Placement (Trending/Best Seller/Additional Categories — migration 026),
 * SEO, gallery images. `poster` seeds the panel's own local copy once on
 * mount (an empty object `{}` for a new product); the caller only needs
 * to know when to render this component, not manage its internal form
 * state.
 */
export function PosterEditorPanel({
  poster,
  categories,
  onSaved,
  onClose,
}: {
  poster: Partial<AdminPoster>;
  categories: AdminCategory[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<Partial<AdminPoster>>(poster);
  // Website Placement (migration 026): the currently-editing poster's
  // ADDITIONAL categories (never its primary category_id, which stays on
  // `editing` itself).
  const [placementCategoryIds, setPlacementCategoryIds] = useState<Set<string>>(new Set());
  const [placementCategorySearch, setPlacementCategorySearch] = useState("");
  const [previewFrame, setPreviewFrame] = useState<"black" | "white" | "wood">("black");
  const [recropping, setRecropping] = useState(false);

  // Loads this poster's Website Placement state alongside it — a
  // brand-new product (no id) starts with an empty set, an existing one
  // is read fresh from poster_categories so the checkboxes always
  // reflect what's actually saved.
  useEffect(() => {
    if (!poster.id) {
      setPlacementCategoryIds(new Set());
      return;
    }
    let cancelled = false;
    getPosterCategoryIdsAdmin({ data: { posterId: poster.id } })
      .then((ids) => {
        if (!cancelled) setPlacementCategoryIds(new Set(ids as string[]));
      })
      .catch(() => {
        if (!cancelled) setPlacementCategoryIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [poster.id]);

  const save = async () => {
    if (!editing.title) return toast.error("Title is required");
    if (!editing.image_url) return toast.error("Image URL is required");
    try {
      const { id } = await upsertPoster({ data: editing });
      // Best-effort: Website Placement's additional categories save
      // separately from the core product fields (same reasoning as
      // saveMerchandisingFields on the server — never let a
      // migration-026 hiccup block the ordinary "save this product" flow
      // every admin already relies on).
      try {
        await setPosterCategoriesAdmin({
          data: { posterId: id, categoryIds: Array.from(placementCategoryIds) },
        });
      } catch {
        toast.error("Saved, but Website Placement categories could not be updated");
      }
      toast.success("Saved");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  // Re-crop an already-published poster's image (distinct from the Bulk
  // Upload Studio's PosterImageEditor usage, which only edits a
  // not-yet-uploaded File). Bakes the new crop into a fresh image_url +
  // srcsets the same way publishing a new poster does, then hands it to
  // this same edit form / Save button rather than writing straight to
  // the DB, so title/etc. edits made in the same session aren't lost.
  const applyRecrop = async (settings: EditSettings) => {
    if (!editing.image_url) return;
    setRecropping(false);
    try {
      const img = await loadImage(editing.image_url);
      const outH = 2400;
      const outW = Math.round(outH * settings.ratio);
      const blob = await renderEditToBlob(img, settings, outW, outH, 0.92);
      const file = new File([blob], "recrop.jpg", { type: "image/jpeg" });
      const optimized = await optimizeImage(file, { maxDim: 2000, quality: 0.85 });
      const dataUrl = await fileToDataUrl(optimized);
      const [{ url: imageUrl }, { webp_srcset, avif_srcset }] = await Promise.all([
        uploadPosterImage({ data: { dataUrl, filename: "recrop.jpg" } }),
        uploadResponsiveSrcSets(file, uploadPosterImage),
      ]);
      setEditing((prev) => ({
        ...prev,
        image_url: imageUrl,
        webp_srcset,
        avif_srcset,
        edit_settings: settings,
      }));
      toast.success("Image re-cropped — click Save to publish");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-crop failed");
    }
  };

  return (
    <div className="mb-6 grid gap-4 rounded-sm border border-border bg-card p-4 sm:grid-cols-[200px_1fr]">
      <div>
        {editing.image_url ? (
          <>
            <FramePreview
              posterUrl={editing.image_url}
              color={previewFrame}
              aspectClassName="aspect-[3/4]"
            />
            <div className="mt-2 flex gap-1">
              {(["black", "white", "wood"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setPreviewFrame(c)}
                  className={`flex-1 rounded-sm border px-1 py-1 text-[10px] capitalize ${
                    previewFrame === c
                      ? "border-primary text-foreground"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <button
              onClick={() => setRecropping(true)}
              className="mt-2 w-full rounded-sm border border-border px-2 py-1.5 text-xs hover:bg-accent"
            >
              Re-crop image
            </button>
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

        {/* ---- Website Placement (migration 026) ---- */}
        <div className="space-y-3 rounded-sm border border-border p-3">
          <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Website Placement
          </h4>

          <div className="space-y-2 rounded-sm border border-border p-2">
            <span className="text-xs font-medium">
              Trending {editing.trending ? "— Enabled" : "— Disabled"}
            </span>
            {editing.trending && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <label className="block text-[11px] text-muted-foreground">
                  Display Order
                  <input
                    type="number"
                    value={editing.trending_order ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        trending_order: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    placeholder="Auto"
                    className="mt-1 w-full rounded-sm border border-border bg-background px-2 py-1 text-xs"
                  />
                </label>
                <label className="block text-[11px] text-muted-foreground">
                  Start Date
                  <input
                    type="date"
                    value={editing.trending_starts_at?.slice(0, 10) ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        trending_starts_at: e.target.value || null,
                      })
                    }
                    className="mt-1 w-full rounded-sm border border-border bg-background px-2 py-1 text-xs"
                  />
                </label>
                <label className="block text-[11px] text-muted-foreground">
                  End Date
                  <input
                    type="date"
                    value={editing.trending_ends_at?.slice(0, 10) ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        trending_ends_at: e.target.value || null,
                      })
                    }
                    className="mt-1 w-full rounded-sm border border-border bg-background px-2 py-1 text-xs"
                  />
                </label>
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-sm border border-border p-2">
            <span className="text-xs font-medium">
              Best Seller {editing.is_best_seller ? "— Enabled" : "— Disabled"}
            </span>
            <p className="text-[10px] text-muted-foreground">
              Ordered automatically by sales — this is only an optional override to pin a product
              ahead of the sales ranking. Leave blank to keep the automatic order.
            </p>
            {editing.is_best_seller && (
              <label className="block text-[11px] text-muted-foreground">
                Manual Position Override
                <input
                  type="number"
                  value={editing.best_seller_order ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      best_seller_order: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  placeholder="Auto (by sales)"
                  className="mt-1 w-32 rounded-sm border border-border bg-background px-2 py-1 text-xs"
                />
              </label>
            )}
          </div>

          <div className="space-y-2 rounded-sm border border-border p-2">
            <span className="text-xs font-medium">Additional Categories</span>
            <p className="text-[10px] text-muted-foreground">
              Shows this product in more categories too, on top of its primary category above — no
              duplicate product is created.
            </p>
            <input
              type="text"
              value={placementCategorySearch}
              onChange={(e) => setPlacementCategorySearch(e.target.value)}
              placeholder="Search categories…"
              className="w-full rounded-sm border border-border bg-background px-2 py-1 text-xs"
            />
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {categories
                .filter((c) => c.id !== editing.category_id)
                .filter((c) =>
                  placementCategorySearch.trim()
                    ? c.name.toLowerCase().includes(placementCategorySearch.trim().toLowerCase())
                    : true,
                )
                .map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={placementCategoryIds.has(c.id)}
                      onChange={(e) => {
                        const next = new Set(placementCategoryIds);
                        if (e.target.checked) next.add(c.id);
                        else next.delete(c.id);
                        setPlacementCategoryIds(next);
                      }}
                    />
                    {c.parent_id ? `— ${c.name}` : c.name}
                  </label>
                ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={save}
            className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            Save
          </button>
          <button onClick={onClose} className="rounded-sm border border-border px-3 py-1.5 text-xs">
            Cancel
          </button>
        </div>
      </div>

      {recropping && editing.image_url && (
        <PosterImageEditor
          source={editing.image_url}
          initial={editing.edit_settings ?? undefined}
          mockupFrame={previewFrame}
          onCancel={() => setRecropping(false)}
          onSave={applyRecrop}
        />
      )}
    </div>
  );
}
