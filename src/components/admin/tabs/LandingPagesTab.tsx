import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  listLandingPagesAdmin,
  upsertLandingPage,
  deleteLandingPage,
  listCategoriesAdmin,
} from "@/lib/db-admin.functions";
import { uploadPosterImage } from "@/lib/image-upload.functions";
import { optimizeImage } from "@/lib/image-optimize";
import { landingUtmUrl } from "@/lib/landing-pages";
import { fileToDataUrl, type AdminCategory, type AdminLandingPage } from "./shared";
import { useConfirm } from "@/components/admin/layout/ConfirmDialogProvider";
import { LoadingRows } from "@/components/admin/layout/LoadingState";

export function LandingPagesTab() {
  const confirm = useConfirm();
  const [pages, setPages] = useState<AdminLandingPage[] | null>(null);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [editing, setEditing] = useState<AdminLandingPage | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    const [p, c] = await Promise.all([listLandingPagesAdmin(), listCategoriesAdmin()]);
    setPages(p as AdminLandingPage[]);
    setCategories(c as AdminCategory[]);
  };
  useEffect(() => {
    load();
  }, []);

  const handleHeroFile = async (file: File) => {
    if (!editing) return;
    setUploading(true);
    try {
      const optimized = await optimizeImage(file, { maxDim: 1920, quality: 0.85 });
      const dataUrl = await fileToDataUrl(optimized);
      const { url } = await uploadPosterImage({ data: { dataUrl, filename: file.name } });
      setEditing({ ...editing, hero_image: url });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!editing) return;
    try {
      await upsertLandingPage({ data: editing });
      toast.success("Saved");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const remove = async (p: AdminLandingPage) => {
    if (!(await confirm(`Delete the "${p.audience_key}" landing page? This can't be undone.`))) return;
    await deleteLandingPage({ data: { id: p.id } });
    toast.success("Deleted");
    load();
  };

  const copyLink = async (audienceKey: string) => {
    const url = landingUtmUrl(window.location.origin, audienceKey);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Ad link copied — paste it into Meta Ads");
    } catch {
      toast.error(url);
    }
  };

  const usedKeys = new Set(pages?.map((p) => p.audience_key) ?? []);
  // "General" is a campaign page not tied to any one category — smart-mix
  // across the whole catalog, for an overall/umbrella ad rather than a
  // per-category one.
  const availableCategories = categories.filter((c) => !usedKeys.has(c.slug));
  const hasGeneral = usedKeys.has("general");

  const createFor = (opts: { audienceKey: string; categoryId: string | null; titleEn: string; titleAr: string }) => {
    setEditing({
      id: "",
      audience_key: opts.audienceKey,
      visible: false,
      title_ar: opts.titleAr,
      title_en: opts.titleEn,
      subtitle_ar: null,
      subtitle_en: null,
      hero_image: null,
      whatsapp_message: null,
      cta_text: null,
      source_category_id: opts.categoryId,
      display_mode: opts.categoryId ? "category" : "smart_mix",
      poster_limit: 24,
      manual_poster_ids: [],
      seo_title: null,
      meta_description: null,
    });
  };

  if (pages === null) return <LoadingRows />;

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Landing Pages</h2>
          <p className="text-xs text-muted-foreground">
            Ad campaign destinations at /landing/&#123;audience&#125; — used as Meta Ads links. Each
            page pulls its posters automatically (category or trending/best-seller mix) unless set to
            manual. Make one per category for targeted ads, plus one "General" page for an umbrella
            campaign across everything.
          </p>
        </div>
        {(availableCategories.length > 0 || !hasGeneral) && (
          <select
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              if (v === "__general__") {
                createFor({ audienceKey: "general", categoryId: null, titleEn: "All Posters", titleAr: "كل البوسترات" });
              } else {
                const cat = categories.find((c) => c.id === v);
                if (cat) createFor({ audienceKey: cat.slug, categoryId: cat.id, titleEn: cat.name, titleAr: cat.name_ar || cat.name });
              }
            }}
            className="rounded-sm border border-border bg-background px-3 py-1.5 text-xs"
          >
            <option value="">+ New landing page…</option>
            {!hasGeneral && <option value="__general__">General (all categories)</option>}
            {availableCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {editing ? (
        <div className="mb-6 space-y-4 rounded-sm border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-widest">{editing.audience_key}</h3>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.visible}
                onChange={(e) => setEditing({ ...editing, visible: e.target.checked })}
              />
              Visible (live)
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              placeholder="Title (Arabic)"
              dir="rtl"
              value={editing.title_ar ?? ""}
              onChange={(e) => setEditing({ ...editing, title_ar: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              placeholder="Title (English)"
              value={editing.title_en ?? ""}
              onChange={(e) => setEditing({ ...editing, title_en: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              placeholder="Subtitle (Arabic)"
              dir="rtl"
              value={editing.subtitle_ar ?? ""}
              onChange={(e) => setEditing({ ...editing, subtitle_ar: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              placeholder="Subtitle (English)"
              value={editing.subtitle_en ?? ""}
              onChange={(e) => setEditing({ ...editing, subtitle_en: e.target.value })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <p className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Hero image</p>
            {editing.hero_image ? (
              <img src={editing.hero_image} alt="" className="aspect-[3/1] w-full rounded-sm object-cover" />
            ) : (
              <div className="flex aspect-[3/1] items-center justify-center rounded-sm border border-dashed border-border text-xs text-muted-foreground">
                No image
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="mt-2 rounded-sm border border-border px-2 py-1.5 text-xs disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                if (e.target.files?.[0]) handleHeroFile(e.target.files[0]);
                e.target.value = "";
              }}
            />
          </div>

          <input
            placeholder="WhatsApp message (optional)"
            value={editing.whatsapp_message ?? ""}
            onChange={(e) => setEditing({ ...editing, whatsapp_message: e.target.value })}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            placeholder="CTA button text (optional)"
            value={editing.cta_text ?? ""}
            onChange={(e) => setEditing({ ...editing, cta_text: e.target.value })}
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <select
              value={editing.display_mode}
              onChange={(e) =>
                setEditing({ ...editing, display_mode: e.target.value as AdminLandingPage["display_mode"] })
              }
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="smart_mix">Smart mix (trending/best-sellers)</option>
              <option value="category">From a category</option>
              <option value="manual">Manual poster IDs</option>
            </select>
            {editing.display_mode === "category" && (
              <select
                value={editing.source_category_id ?? ""}
                onChange={(e) => setEditing({ ...editing, source_category_id: e.target.value || null })}
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Select category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <input
              type="number"
              min={1}
              max={200}
              placeholder="Poster limit"
              value={editing.poster_limit}
              onChange={(e) => setEditing({ ...editing, poster_limit: Number(e.target.value) || 24 })}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          {editing.display_mode === "manual" && (
            <textarea
              placeholder="Poster IDs, one per line (in display order)"
              value={editing.manual_poster_ids.join("\n")}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  manual_poster_ids: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                })
              }
              rows={4}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 font-mono text-xs"
            />
          )}

          <details className="rounded-sm border border-border">
            <summary className="cursor-pointer px-3 py-2 text-xs uppercase tracking-widest text-muted-foreground">
              SEO (optional)
            </summary>
            <div className="space-y-3 border-t border-border p-3">
              <input
                placeholder="SEO title"
                value={editing.seo_title ?? ""}
                onChange={(e) => setEditing({ ...editing, seo_title: e.target.value })}
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
              <textarea
                placeholder="Meta description"
                value={editing.meta_description ?? ""}
                onChange={(e) => setEditing({ ...editing, meta_description: e.target.value })}
                rows={2}
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </details>

          <div className="flex gap-2">
            <button onClick={save} className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
              Save
            </button>
            <button onClick={() => setEditing(null)} className="rounded-sm border border-border px-3 py-1.5 text-xs">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        {pages.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-sm border border-border p-3">
            <div>
              <div className="text-sm font-medium">
                /landing/{p.audience_key} — {p.title_en || p.audience_key}
              </div>
              <div className="text-xs text-muted-foreground">
                {p.display_mode}
                {p.visible ? " · live" : " · hidden"}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => copyLink(p.audience_key)} className="text-xs text-cyan-500 hover:underline">
                Copy ad link
              </button>
              <button onClick={() => setEditing(p)} className="text-xs text-cyan-500 hover:underline">
                Edit
              </button>
              <button onClick={() => remove(p)} className="text-xs text-red-500 hover:underline">
                Delete
              </button>
            </div>
          </div>
        ))}
        {pages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No landing pages yet — use "+ New landing page" above to create one per category, plus a
            general one.
          </p>
        )}
      </div>
    </div>
  );
}
