import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  listHeroBannersAdmin,
  upsertHeroBanner,
  deleteHeroBanner,
  listSliderImagesAdmin,
  upsertSliderImage,
  deleteSliderImage,
  listHighlightsAdmin,
  upsertHighlight,
  deleteHighlight,
  getAllSiteSettingsAdmin,
  setSiteSetting,
} from "@/lib/db-admin.functions";
import { uploadPosterImage } from "@/lib/image-upload.functions";
import { optimizeImage } from "@/lib/image-optimize";
import {
  generateResponsiveImageSet,
  blobToFile,
  buildSrcSet,
  type ResponsiveVariant,
} from "@/lib/responsive-image";
import {
  STOREFRONT_CONTENT_KEY,
  normalizeStorefrontContent,
  type StorefrontContent,
  type TrustPoint,
  type FAQItem,
} from "@/lib/storefront-content";
import {
  fileToDataUrl,
  type AdminHeroBanner,
  type AdminSliderImage,
  type AdminHighlight,
} from "./shared";
import { useConfirm } from "@/components/admin/layout/ConfirmDialogProvider";
import { HomepageLayoutSection } from "./HomepageLayoutSection";
import { LoadingRows, LoadingForm } from "@/components/admin/layout/LoadingState";

// Shared by both the Hero Banner and Homepage Slider upload flows below —
// both are full-bleed, above-the-fold images where "high quality" and
// "fast to load" are otherwise in tension. Generates WebP (and AVIF where
// the browser can encode it) at several widths from the ORIGINAL file (not
// the already-downscaled JPEG used for image_url, to keep the largest
// variant as sharp as possible), uploads each, and returns ready-to-store
// srcset strings. Visitors' browsers then pick the smallest file that
// still fills their viewport — a phone never downloads the 2200px version.
async function uploadResponsiveSrcSets(
  file: File,
): Promise<{ webp_srcset: string | null; avif_srcset: string | null }> {
  const { webp, avif } = await generateResponsiveImageSet(file);
  const base = file.name.replace(/\.[^.]+$/, "");

  const uploadVariant = async (v: ResponsiveVariant, ext: string) => {
    const variantFile = blobToFile(v.blob, `${base}-${v.width}w.${ext}`);
    const dataUrl = await fileToDataUrl(variantFile);
    const { url } = await uploadPosterImage({ data: { dataUrl, filename: variantFile.name } });
    return { width: v.width, url };
  };

  const [webpUploaded, avifUploaded] = await Promise.all([
    Promise.all(webp.map((v) => uploadVariant(v, "webp"))),
    Promise.all(avif.map((v) => uploadVariant(v, "avif"))),
  ]);

  return {
    webp_srcset: webpUploaded.length ? buildSrcSet(webpUploaded) : null,
    avif_srcset: avifUploaded.length ? buildSrcSet(avifUploaded) : null,
  };
}

export function HomepageTab() {
  const confirm = useConfirm();
  const [banners, setBanners] = useState<AdminHeroBanner[] | null>(null);
  const [editing, setEditing] = useState<Partial<AdminHeroBanner> | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => setBanners((await listHeroBannersAdmin()) as AdminHeroBanner[]);
  useEffect(() => {
    load();
  }, []);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const optimized = await optimizeImage(file, { maxDim: 2400, quality: 0.85 });
      const dataUrl = await fileToDataUrl(optimized);
      const { url } = await uploadPosterImage({ data: { dataUrl, filename: file.name } });
      const { webp_srcset, avif_srcset } = await uploadResponsiveSrcSets(file);
      setEditing((prev) => ({ ...(prev ?? {}), image_url: url, webp_srcset, avif_srcset }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!editing?.image_url) return toast.error("Banner image is required");
    try {
      await upsertHeroBanner({ data: editing });
      toast.success("Saved");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const remove = async (id: string) => {
    if (!(await confirm("Delete this banner?"))) return;
    await deleteHeroBanner({ data: id });
    load();
  };

  const toggleEnabled = async (b: AdminHeroBanner) => {
    await upsertHeroBanner({ data: { ...b, enabled: !b.enabled } });
    load();
  };

  const move = async (b: AdminHeroBanner, dir: -1 | 1) => {
    if (!banners) return;
    const sorted = [...banners].sort((a, c) => a.sort_order - c.sort_order);
    const idx = sorted.findIndex((x) => x.id === b.id);
    const swapWith = sorted[idx + dir];
    if (!swapWith) return;
    await Promise.all([
      upsertHeroBanner({ data: { ...b, sort_order: swapWith.sort_order } }),
      upsertHeroBanner({ data: { ...swapWith, sort_order: b.sort_order } }),
    ]);
    load();
  };

  if (banners === null) return <LoadingRows />;

  return (
    <div>
      <HomepageLayoutSection />

      <div className="mt-10 border-t border-border pt-8">
        <div className="mb-4 flex justify-between">
          <h2 className="text-lg font-semibold">Homepage banners</h2>
          <button
            onClick={() => setEditing({})}
            className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            + New banner
          </button>
        </div>

      {editing && (
        <div className="mb-6 grid gap-4 rounded-sm border border-border bg-card p-4 sm:grid-cols-[200px_1fr]">
          <div>
            {editing.image_url ? (
              <img src={editing.image_url} alt="" className="aspect-[16/7] w-full rounded-sm object-cover" />
            ) : (
              <div className="flex aspect-[16/7] items-center justify-center rounded-sm border border-dashed border-border text-xs text-muted-foreground">
                No image
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="mt-2 w-full rounded-sm border border-border px-2 py-1.5 text-xs disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Upload image"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                if (e.target.files?.[0]) handleFile(e.target.files[0]);
                e.target.value = "";
              }}
            />
          </div>
          <div className="space-y-3">
            <input
              placeholder="Title (optional)"
              value={editing.title ?? ""}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              placeholder="Subtitle (optional)"
              value={editing.subtitle ?? ""}
              onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              placeholder="Button text (optional)"
              value={editing.button_text ?? ""}
              onChange={(e) => setEditing({ ...editing, button_text: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              placeholder="Button link (optional, e.g. /category/football)"
              value={editing.button_link ?? ""}
              onChange={(e) => setEditing({ ...editing, button_link: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.enabled !== false}
                onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
              />
              Enabled
            </label>
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

      <div className="space-y-2">
        {banners
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-sm border border-border p-3">
              <div className="flex items-center gap-3">
                <img src={b.image_url} alt="" className="h-12 w-20 rounded-sm object-cover" />
                <div>
                  <div className="text-sm font-medium">{b.title || "(no title)"}</div>
                  <div className="text-xs text-muted-foreground">{b.enabled ? "Enabled" : "Disabled"}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => move(b, -1)} className="text-xs text-muted-foreground hover:text-foreground">
                  ↑
                </button>
                <button onClick={() => move(b, 1)} className="text-xs text-muted-foreground hover:text-foreground">
                  ↓
                </button>
                <button onClick={() => toggleEnabled(b)} className="text-xs text-cyan-500 hover:underline">
                  {b.enabled ? "Disable" : "Enable"}
                </button>
                <button onClick={() => setEditing(b)} className="text-xs text-cyan-500 hover:underline">
                  Edit
                </button>
                <button onClick={() => remove(b.id)} className="text-xs text-red-500 hover:underline">
                  Delete
                </button>
              </div>
            </div>
          ))}
        {banners.length === 0 && <p className="text-sm text-muted-foreground">No banners yet.</p>}
      </div>
      </div>

      <div className="mt-10 border-t border-border pt-8">
        <SliderImagesSection />
      </div>

      <div className="mt-10 border-t border-border pt-8">
        <HighlightsSection />
      </div>

      <div className="mt-10 border-t border-border pt-8">
        <TrustFaqSection />
      </div>
    </div>
  );
}

function SliderImagesSection() {
  const confirm = useConfirm();
  const [items, setItems] = useState<AdminSliderImage[] | null>(null);
  const [editing, setEditing] = useState<Partial<AdminSliderImage> | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => setItems((await listSliderImagesAdmin()) as AdminSliderImage[]);
  useEffect(() => {
    load();
  }, []);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const optimized = await optimizeImage(file, { maxDim: 2400, quality: 0.85 });
      const dataUrl = await fileToDataUrl(optimized);
      const { url } = await uploadPosterImage({ data: { dataUrl, filename: file.name } });
      const { webp_srcset, avif_srcset } = await uploadResponsiveSrcSets(file);
      setEditing((prev) => ({ ...(prev ?? {}), image_url: url, webp_srcset, avif_srcset }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!editing?.image_url) return toast.error("Slide image is required");
    try {
      await upsertSliderImage({ data: editing });
      toast.success("Saved");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const remove = async (id: string) => {
    if (!(await confirm("Delete this slide?"))) return;
    await deleteSliderImage({ data: id });
    load();
  };

  const toggleEnabled = async (s: AdminSliderImage) => {
    await upsertSliderImage({ data: { ...s, enabled: !s.enabled } });
    load();
  };

  if (items === null) return <LoadingRows />;

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <div>
          <h2 className="text-lg font-semibold">Homepage slider</h2>
          <p className="text-xs text-muted-foreground">
            Full-width slider section, separate from the hero banners above.
          </p>
        </div>
        <button
          onClick={() => setEditing({})}
          className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          + New slide
        </button>
      </div>

      {editing && (
        <div className="mb-6 grid gap-4 rounded-sm border border-border bg-card p-4 sm:grid-cols-[200px_1fr]">
          <div>
            {editing.image_url ? (
              <img src={editing.image_url} alt="" className="aspect-[16/7] w-full rounded-sm object-cover" />
            ) : (
              <div className="flex aspect-[16/7] items-center justify-center rounded-sm border border-dashed border-border text-xs text-muted-foreground">
                No image
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="mt-2 w-full rounded-sm border border-border px-2 py-1.5 text-xs disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Upload image"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                if (e.target.files?.[0]) handleFile(e.target.files[0]);
                e.target.value = "";
              }}
            />
          </div>
          <div className="space-y-3">
            <input
              placeholder="Title (optional)"
              value={editing.title ?? ""}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              placeholder="Link (optional, e.g. /category/football)"
              value={editing.link_url ?? ""}
              onChange={(e) => setEditing({ ...editing, link_url: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.enabled !== false}
                onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
              />
              Enabled
            </label>
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

      <div className="space-y-2">
        {items
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-sm border border-border p-3">
              <div className="flex items-center gap-3">
                <img src={s.image_url} alt="" className="h-12 w-20 rounded-sm object-cover" />
                <div>
                  <div className="text-sm font-medium">{s.title || "(no title)"}</div>
                  <div className="text-xs text-muted-foreground">{s.enabled ? "Enabled" : "Disabled"}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => toggleEnabled(s)} className="text-xs text-cyan-500 hover:underline">
                  {s.enabled ? "Disable" : "Enable"}
                </button>
                <button onClick={() => setEditing(s)} className="text-xs text-cyan-500 hover:underline">
                  Edit
                </button>
                <button onClick={() => remove(s.id)} className="text-xs text-red-500 hover:underline">
                  Delete
                </button>
              </div>
            </div>
          ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground">No slides yet.</p>}
      </div>
    </div>
  );
}

function HighlightsSection() {
  const confirm = useConfirm();
  const [items, setItems] = useState<AdminHighlight[] | null>(null);
  const [editing, setEditing] = useState<Partial<AdminHighlight> | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => setItems((await listHighlightsAdmin()) as AdminHighlight[]);
  useEffect(() => {
    load();
  }, []);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const optimized = await optimizeImage(file, { maxDim: 800, quality: 0.85 });
      const dataUrl = await fileToDataUrl(optimized);
      const { url } = await uploadPosterImage({ data: { dataUrl, filename: file.name } });
      setEditing((prev) => ({ ...(prev ?? {}), image_url: url }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!editing?.title) return toast.error("Title is required");
    if (!editing?.link) return toast.error("Link is required");
    try {
      await upsertHighlight({ data: editing });
      toast.success("Saved");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const remove = async (id: string) => {
    if (!(await confirm("Delete this highlight?"))) return;
    await deleteHighlight({ data: id });
    load();
  };

  const toggleEnabled = async (h: AdminHighlight) => {
    await upsertHighlight({ data: { ...h, enabled: !h.enabled } });
    load();
  };

  if (items === null) return <LoadingRows />;

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <div>
          <h2 className="text-lg font-semibold">Highlights</h2>
          <p className="text-xs text-muted-foreground">
            Round shortcut icons under the hero (e.g. Football, Movies, Custom Design).
          </p>
        </div>
        <button
          onClick={() => setEditing({})}
          className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          + New highlight
        </button>
      </div>

      {editing && (
        <div className="mb-6 grid gap-4 rounded-sm border border-border bg-card p-4 sm:grid-cols-[120px_1fr]">
          <div>
            {editing.image_url ? (
              <img src={editing.image_url} alt="" className="aspect-square w-full rounded-full object-cover" />
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-full border border-dashed border-border text-xs text-muted-foreground">
                No image
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="mt-2 w-full rounded-sm border border-border px-2 py-1.5 text-xs disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                if (e.target.files?.[0]) handleFile(e.target.files[0]);
                e.target.value = "";
              }}
            />
          </div>
          <div className="space-y-3">
            <input
              placeholder="Title"
              value={editing.title ?? ""}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              placeholder="Link (e.g. /category/football)"
              value={editing.link ?? ""}
              onChange={(e) => setEditing({ ...editing, link: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.enabled !== false}
                onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
              />
              Enabled
            </label>
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

      <div className="flex flex-wrap gap-3">
        {items.map((h) => (
          <div key={h.id} className="w-24 rounded-sm border border-border p-2 text-center">
            {h.image_url ? (
              <img src={h.image_url} alt="" className="mx-auto h-14 w-14 rounded-full object-cover" />
            ) : (
              <div className="mx-auto h-14 w-14 rounded-full border border-dashed border-border" />
            )}
            <div className="mt-1 truncate text-[10px] font-medium">{h.title}</div>
            <div className="text-[9px] text-muted-foreground">{h.enabled ? "On" : "Off"}</div>
            <div className="mt-1 flex justify-center gap-1.5">
              <button onClick={() => toggleEnabled(h)} className="text-[10px] text-cyan-500 hover:underline">
                {h.enabled ? "Hide" : "Show"}
              </button>
              <button onClick={() => setEditing(h)} className="text-[10px] text-cyan-500 hover:underline">
                Edit
              </button>
              <button onClick={() => remove(h.id)} className="text-[10px] text-red-500 hover:underline">
                Del
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground">No highlights yet.</p>}
      </div>
    </div>
  );
}

// Trust points ("Why choose us") + FAQ shown on the homepage. Both are a
// FIXED set of items (ids like "print-quality", "delivery-time") with a
// built-in EN/AR default — this editor only lets the admin enable/hide
// each one and override its title text, matching normalizeStorefrontContent's
// merge semantics (nothing here supports adding/removing items).
function TrustFaqSection() {
  const [content, setContent] = useState<StorefrontContent | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const settings = await getAllSiteSettingsAdmin();
    const row = (settings as Array<{ key: string; value: unknown }>).find(
      (r) => r.key === STOREFRONT_CONTENT_KEY,
    );
    setContent(normalizeStorefrontContent(row?.value));
  };
  useEffect(() => {
    load();
  }, []);

  const save = async (next: StorefrontContent) => {
    setContent(next);
    setSaving(true);
    try {
      await setSiteSetting({ data: { key: STOREFRONT_CONTENT_KEY, value: next } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (content === null) return <LoadingForm />;

  const updatePoint = (id: string, patch: Partial<TrustPoint>) => {
    save({
      ...content,
      trust: {
        ...content.trust,
        points: content.trust.points.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      },
    });
  };

  const updateFaq = (id: string, patch: Partial<FAQItem>) => {
    save({
      ...content,
      faq: { ...content.faq, items: content.faq.items.map((f) => (f.id === id ? { ...f, ...patch } : f)) },
    });
  };

  return (
    <div>
      <h2 className="text-lg font-semibold">Trust points & FAQ</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Enable/hide items and edit their title text. Every item has a built-in EN/AR default.
      </p>

      <h3 className="mt-5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Why choose us
      </h3>
      <div className="mt-2 space-y-2">
        {content.trust.points.map((p) => (
          <div key={p.id} className="rounded-sm border border-border p-2.5">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={p.enabled}
                disabled={saving}
                onChange={(e) => updatePoint(p.id, { enabled: e.target.checked })}
              />
              <span className="w-40 shrink-0 text-xs text-muted-foreground">{p.id}</span>
              <input
                value={p.en}
                disabled={saving}
                onChange={(e) => updatePoint(p.id, { en: e.target.value })}
                className="flex-1 rounded-sm border border-border bg-background px-2 py-1 text-sm"
              />
              <input
                value={p.ar}
                dir="rtl"
                disabled={saving}
                onChange={(e) => updatePoint(p.id, { ar: e.target.value })}
                className="flex-1 rounded-sm border border-border bg-background px-2 py-1 text-sm"
              />
            </div>
          </div>
        ))}
      </div>

      <h3 className="mt-6 text-xs font-semibold uppercase tracking-widest text-muted-foreground">FAQ</h3>
      <div className="mt-2 space-y-2">
        {content.faq.items.map((f) => (
          <div key={f.id} className="rounded-sm border border-border p-2.5">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={f.enabled}
                disabled={saving}
                onChange={(e) => updateFaq(f.id, { enabled: e.target.checked })}
              />
              <span className="w-40 shrink-0 text-xs text-muted-foreground">{f.id}</span>
              <input
                value={f.en}
                disabled={saving}
                onChange={(e) => updateFaq(f.id, { en: e.target.value })}
                className="flex-1 rounded-sm border border-border bg-background px-2 py-1 text-sm"
              />
              <input
                value={f.ar}
                dir="rtl"
                disabled={saving}
                onChange={(e) => updateFaq(f.id, { ar: e.target.value })}
                className="flex-1 rounded-sm border border-border bg-background px-2 py-1 text-sm"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
