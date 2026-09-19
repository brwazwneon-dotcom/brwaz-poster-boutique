import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Star, Trash2, Upload } from "lucide-react";
import { SafeImage } from "@/components/SafeImage";
import {
  listPhotoAlbumsAdmin,
  upsertPhotoAlbum,
  deletePhotoAlbum,
  getAllSiteSettingsAdmin,
  setSiteSetting,
} from "@/lib/db-admin.functions";
import { uploadPosterImage } from "@/lib/image-upload.functions";
import { optimizeImage } from "@/lib/image-optimize";
import { uploadResponsiveSrcSets as uploadResponsiveSrcSetsShared } from "@/lib/responsive-image";
import {
  PHOTO_PRINTING_MEDIA_KEY,
  PHOTO_PRINTING_MEDIA_DEFAULTS,
  parsePhotoPrintingMediaConfig,
  type PhotoPrintingBanner,
  type PhotoPrintingMediaConfig,
  type PhotoPrintingPageImage,
} from "@/lib/use-settings";
import {
  PHOTO_PRINTING_CONTENT_KEY,
  normalizePhotoPrintingContent,
  type PhotoPrintingContent,
} from "@/lib/photo-printing-content";
import { fileToDataUrl } from "./shared";
import { useConfirm } from "@/components/admin/layout/ConfirmDialogProvider";
import { LoadingRows, LoadingForm } from "@/components/admin/layout/LoadingState";

const uploadResponsiveSrcSets = (file: File) =>
  uploadResponsiveSrcSetsShared(file, uploadPosterImage);

type AdminPhotoAlbum = {
  id: string;
  name_en: string;
  name_ar: string;
  description_en: string | null;
  description_ar: string | null;
  price: number;
  image_url: string | null;
  enabled: boolean;
  sort_order: number;
};

export function PhotoPrintingTab() {
  return (
    <div>
      <div>
        <h2 className="text-lg font-semibold">Photo Printing</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Manages the /photo-printing landing page. The upload/AI-enhance/package/checkout engine
          itself is shared with the rest of the storefront (packages & pricing: Settings →
          Storefront config; Before/After: Before/After tab with location "Photo Printing"; Reviews:
          Reviews tab) — this section covers the page's own banners, image gallery, add-on albums,
          and marketing copy.
        </p>
      </div>

      <div className="mt-8">
        <PhotoPrintingMediaSection />
      </div>

      <div className="mt-10 border-t border-border pt-8">
        <PhotoPrintingAlbumsSection />
      </div>

      <div className="mt-10 border-t border-border pt-8">
        <PhotoPrintingContentSection />
      </div>
    </div>
  );
}

type DraftBannerFiles = { desktop: File | null; mobile: File | null };
const emptyDraft: DraftBannerFiles = { desktop: null, mobile: null };

function PhotoPrintingMediaSection() {
  const qc = useQueryClient();
  const [data, setData] = useState<PhotoPrintingMediaConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingMaterials, setUploadingMaterials] = useState(false);
  const [draftBanner, setDraftBanner] = useState<DraftBannerFiles>(emptyDraft);

  const load = async () => {
    const settings = await getAllSiteSettingsAdmin();
    const row = (settings as Array<{ key: string; value: unknown }>).find(
      (r) => r.key === PHOTO_PRINTING_MEDIA_KEY,
    );
    setData(parsePhotoPrintingMediaConfig(row?.value));
  };
  useEffect(() => {
    load();
  }, []);

  const desktopPreview = useObjectUrl(draftBanner.desktop);
  const mobilePreview = useObjectUrl(draftBanner.mobile);

  const saveConfig = async (next: PhotoPrintingMediaConfig, message = "Saved") => {
    setSaving(true);
    try {
      await setSiteSetting({ data: { key: PHOTO_PRINTING_MEDIA_KEY, value: next } });
      toast.success(message);
      setData(next);
      qc.invalidateQueries({ queryKey: ["photo-printing-media"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const uploadFile = async (file: File) => {
    const optimized = await optimizeImage(file, { maxDim: 2400, quality: 0.85 });
    const dataUrl = await fileToDataUrl(optimized);
    const { url } = await uploadPosterImage({ data: { dataUrl, filename: file.name } });
    return url;
  };

  const data0 = data ?? PHOTO_PRINTING_MEDIA_DEFAULTS;

  const addBanner = async () => {
    if (!draftBanner.desktop && !draftBanner.mobile) return toast.error("Choose a banner image");
    setUploadingBanner(true);
    try {
      const [desktopImageUrl, mobileImageUrl] = await Promise.all([
        draftBanner.desktop ? uploadFile(draftBanner.desktop) : Promise.resolve(""),
        draftBanner.mobile ? uploadFile(draftBanner.mobile) : Promise.resolve(""),
      ]);
      const now = new Date().toISOString();
      const next: PhotoPrintingMediaConfig = {
        ...data0,
        banners: [
          ...data0.banners,
          {
            id: crypto.randomUUID(),
            desktopImageUrl,
            mobileImageUrl,
            enabled: true,
            linkUrl: "",
            altText: "Photo printing banner",
            title: "",
            sortOrder: nextOrder(data0.banners),
            createdAt: now,
            updatedAt: now,
          },
        ],
      };
      await saveConfig(next, "Banner uploaded");
      setDraftBanner(emptyDraft);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingBanner(false);
    }
  };

  const uploadImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingImage(true);
    try {
      let order = nextOrder(data0.images);
      const now = new Date().toISOString();
      const uploaded: PhotoPrintingPageImage[] = [];
      for (const file of Array.from(files)) {
        const imageUrl = await uploadFile(file);
        uploaded.push({
          id: crypto.randomUUID(),
          imageUrl,
          enabled: true,
          isPrimary: data0.images.length === 0 && uploaded.length === 0,
          altText: file.name.replace(/\.[^.]+$/, ""),
          title: "",
          description: "",
          sortOrder: order++,
          createdAt: now,
          updatedAt: now,
        });
      }
      await saveConfig({ ...data0, images: [...data0.images, ...uploaded] }, "Images uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingImage(false);
    }
  };

  const patchBanner = (id: string, patch: Partial<PhotoPrintingBanner>) =>
    saveConfig(
      {
        ...data0,
        banners: data0.banners.map((banner) =>
          banner.id === id ? { ...banner, ...patch, updatedAt: new Date().toISOString() } : banner,
        ),
      },
      "Banner saved",
    );

  const patchImage = (id: string, patch: Partial<PhotoPrintingPageImage>) =>
    saveConfig(
      {
        ...data0,
        images: data0.images.map((image) =>
          image.id === id ? { ...image, ...patch, updatedAt: new Date().toISOString() } : image,
        ),
      },
      "Image saved",
    );

  const replaceBannerImage = async (
    banner: PhotoPrintingBanner,
    target: "desktop" | "mobile",
    file: File,
  ) => {
    const url = await uploadFile(file);
    await patchBanner(
      banner.id,
      target === "desktop" ? { desktopImageUrl: url } : { mobileImageUrl: url },
    );
  };

  const replacePageImage = async (image: PhotoPrintingPageImage, file: File) => {
    const imageUrl = await uploadFile(file);
    await patchImage(image.id, { imageUrl });
  };

  const moveBanner = (id: string, dir: -1 | 1) =>
    saveConfig({ ...data0, banners: moveBySort(data0.banners, id, dir) }, "Banner order saved");

  const moveImage = (id: string, dir: -1 | 1) =>
    saveConfig({ ...data0, images: moveBySort(data0.images, id, dir) }, "Image order saved");

  const setPrimary = (id: string) =>
    saveConfig(
      { ...data0, images: data0.images.map((image) => ({ ...image, isPrimary: image.id === id })) },
      "Primary image saved",
    );

  const removeBanner = (id: string) =>
    saveConfig(
      { ...data0, banners: data0.banners.filter((banner) => banner.id !== id) },
      "Banner deleted",
    );

  const removeImage = (id: string) =>
    saveConfig(
      { ...data0, images: data0.images.filter((image) => image.id !== id) },
      "Image deleted",
    );

  const uploadMaterialsImage = async (file: File | null) => {
    if (!file) return;
    setUploadingMaterials(true);
    try {
      const imageUrl = await uploadFile(file);
      await saveConfig(
        { ...data0, materialsImage: { imageUrl, altText: data0.materialsImage?.altText ?? "" } },
        "Materials image saved",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingMaterials(false);
    }
  };

  const saveMaterialsAlt = (altText: string) => {
    const current = data0.materialsImage;
    if (!current || altText === current.altText) return;
    return saveConfig({ ...data0, materialsImage: { ...current, altText } }, "Description saved");
  };

  const removeMaterialsImage = () =>
    saveConfig({ ...data0, materialsImage: null }, "Materials image removed");

  if (data === null) return <LoadingRows />;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold">Banners &amp; image gallery</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Live settings — changes appear on /photo-printing without a rebuild.
        </p>
      </div>

      <div className="rounded-sm border border-border bg-card p-4">
        <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Premium Materials picture
        </h4>
        <p className="mt-1 text-xs text-muted-foreground">
          Shown next to the &quot;Photo Printing&quot; card in the Premium Materials section at the
          bottom of /photo-printing. Wide pictures work best (about 2:1). Without one, the card
          simply uses the full width.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,220px)_1fr]">
          <div className="flex aspect-[2/1] items-center justify-center overflow-hidden rounded-sm border border-dashed border-border bg-background text-[11px] text-muted-foreground">
            {data0.materialsImage ? (
              <SafeImage
                src={data0.materialsImage.imageUrl}
                alt={data0.materialsImage.altText}
                className="h-full w-full object-cover"
              />
            ) : (
              "No picture yet"
            )}
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">
                <Upload className="h-4 w-4" />
                {uploadingMaterials
                  ? "Uploading…"
                  : data0.materialsImage
                    ? "Replace picture"
                    : "Upload picture"}
                <input
                  type="file"
                  accept="image/avif,image/webp,image/*"
                  className="hidden"
                  disabled={uploadingMaterials || saving}
                  onChange={(event) => {
                    void uploadMaterialsImage(event.target.files?.[0] ?? null);
                    event.target.value = "";
                  }}
                />
              </label>
              {data0.materialsImage ? (
                <button
                  type="button"
                  onClick={() => void removeMaterialsImage()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs hover:bg-accent disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" /> Remove
                </button>
              ) : null}
            </div>
            {data0.materialsImage ? (
              <label className="block">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Picture description (for accessibility &amp; Google)
                </span>
                <input
                  key={data0.materialsImage.imageUrl}
                  defaultValue={data0.materialsImage.altText}
                  onBlur={(event) => void saveMaterialsAlt(event.target.value.trim())}
                  className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
                  placeholder="e.g. Original FUJIFILM photo prints"
                />
              </label>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-sm border border-border bg-card p-4">
        <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Upload a new banner
        </h4>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <UploadBox
            label="Desktop banner"
            file={draftBanner.desktop}
            preview={desktopPreview}
            onChange={(file) => setDraftBanner((prev) => ({ ...prev, desktop: file }))}
          />
          <UploadBox
            label="Mobile banner"
            file={draftBanner.mobile}
            preview={mobilePreview}
            onChange={(file) => setDraftBanner((prev) => ({ ...prev, mobile: file }))}
          />
        </div>
        <button
          type="button"
          onClick={addBanner}
          disabled={uploadingBanner}
          className="mt-4 inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          <Upload className="h-4 w-4" /> {uploadingBanner ? "Uploading…" : "Save new banner"}
        </button>
      </div>

      <div className="space-y-3">
        {data0.banners.length === 0 ? (
          <p className="text-sm text-muted-foreground">No photo printing banners yet.</p>
        ) : (
          data0.banners.map((banner, index) => (
            <BannerEditor
              key={banner.id}
              banner={banner}
              index={index}
              count={data0.banners.length}
              disabled={saving}
              onPatch={(patch) => patchBanner(banner.id, patch)}
              onMove={(dir) => moveBanner(banner.id, dir)}
              onDelete={() => removeBanner(banner.id)}
              onReplace={replaceBannerImage}
            />
          ))
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border bg-card p-4">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Image gallery
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Shown below the pricing section on the page.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-sm border border-dashed border-border px-3 py-2 text-xs hover:bg-accent">
          <Upload className="h-4 w-4" /> {uploadingImage ? "Uploading…" : "Upload images"}
          <input
            type="file"
            accept="image/avif,image/webp,image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              void uploadImages(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      </div>

      <div className="space-y-3">
        {data0.images.length === 0 ? (
          <p className="text-sm text-muted-foreground">No managed images yet.</p>
        ) : (
          data0.images.map((image, index) => (
            <PageImageEditor
              key={image.id}
              image={image}
              index={index}
              count={data0.images.length}
              disabled={saving}
              onPatch={(patch) => patchImage(image.id, patch)}
              onMove={(dir) => moveImage(image.id, dir)}
              onDelete={() => removeImage(image.id)}
              onPrimary={() => setPrimary(image.id)}
              onReplace={replacePageImage}
            />
          ))
        )}
      </div>
    </div>
  );
}

function UploadBox({
  label,
  file,
  preview,
  onChange,
}: {
  label: string;
  file: File | null;
  preview: string;
  onChange: (file: File | null) => void;
}) {
  return (
    <div className="rounded-sm border border-border bg-background p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-2 aspect-[16/7] overflow-hidden rounded-sm border border-border bg-muted">
        {preview ? (
          <img src={preview} alt="Banner preview" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Preview before save
          </div>
        )}
      </div>
      <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-sm border border-dashed border-border px-3 py-1.5 text-xs hover:bg-accent">
        <Upload className="h-3.5 w-3.5" /> {file ? file.name : "Choose image"}
        <input
          type="file"
          accept="image/avif,image/webp,image/*"
          className="hidden"
          onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        />
      </label>
    </div>
  );
}

function BannerEditor({
  banner,
  index,
  count,
  disabled,
  onPatch,
  onMove,
  onDelete,
  onReplace,
}: {
  banner: PhotoPrintingBanner;
  index: number;
  count: number;
  disabled: boolean;
  onPatch: (patch: Partial<PhotoPrintingBanner>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onReplace: (
    banner: PhotoPrintingBanner,
    target: "desktop" | "mobile",
    file: File,
  ) => Promise<void>;
}) {
  return (
    <div className="rounded-sm border border-border bg-card p-4">
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <div className="overflow-hidden rounded-sm border border-border bg-muted">
          <SafeImage
            src={banner.desktopImageUrl || banner.mobileImageUrl}
            alt={banner.altText || "Photo printing banner"}
            className="aspect-[16/7] h-full w-full object-cover"
          />
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={banner.enabled}
                disabled={disabled}
                onChange={(event) => onPatch({ enabled: event.target.checked })}
              />
              Enabled
            </label>
            <OrderControls index={index} count={count} onMove={onMove} onDelete={onDelete} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <TextField
              label="Link URL"
              value={banner.linkUrl}
              onSave={(linkUrl) => onPatch({ linkUrl })}
            />
            <TextField
              label="Alt text"
              value={banner.altText}
              onSave={(altText) => onPatch({ altText })}
            />
            <TextField label="Title" value={banner.title} onSave={(title) => onPatch({ title })} />
            <ReplaceField
              label="Replace desktop"
              onReplace={(file) => onReplace(banner, "desktop", file)}
            />
            <ReplaceField
              label="Replace mobile"
              onReplace={(file) => onReplace(banner, "mobile", file)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PageImageEditor({
  image,
  index,
  count,
  disabled,
  onPatch,
  onMove,
  onDelete,
  onPrimary,
  onReplace,
}: {
  image: PhotoPrintingPageImage;
  index: number;
  count: number;
  disabled: boolean;
  onPatch: (patch: Partial<PhotoPrintingPageImage>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onPrimary: () => void;
  onReplace: (image: PhotoPrintingPageImage, file: File) => Promise<void>;
}) {
  return (
    <div className="rounded-sm border border-border bg-card p-4">
      <div className="grid gap-4 lg:grid-cols-[160px_1fr]">
        <div className="relative overflow-hidden rounded-sm border border-border bg-muted">
          <SafeImage
            src={image.imageUrl}
            alt={image.altText}
            className="aspect-square h-full w-full object-cover"
          />
          {image.isPrimary && (
            <span className="absolute left-2 top-2 rounded-sm bg-background/90 px-2 py-1 text-[10px] uppercase tracking-widest">
              Primary
            </span>
          )}
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={image.enabled}
                disabled={disabled}
                onChange={(event) => onPatch({ enabled: event.target.checked })}
              />
              Enabled
            </label>
            <button
              type="button"
              onClick={onPrimary}
              className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-accent"
            >
              <Star className="h-3.5 w-3.5" /> Make primary
            </button>
            <OrderControls index={index} count={count} onMove={onMove} onDelete={onDelete} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <TextField
              label="Alt text"
              value={image.altText}
              onSave={(altText) => onPatch({ altText })}
            />
            <TextField label="Title" value={image.title} onSave={(title) => onPatch({ title })} />
            <TextField
              label="Description"
              value={image.description}
              onSave={(description) => onPatch({ description })}
            />
            <ReplaceField label="Replace image" onReplace={(file) => onReplace(image, file)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        defaultValue={value}
        onBlur={(event) => event.target.value !== value && onSave(event.target.value)}
        className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}

function ReplaceField({ label, onReplace }: { label: string; onReplace: (file: File) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className="mt-1 inline-flex cursor-pointer items-center gap-2 rounded-sm border border-dashed border-border px-3 py-2 text-xs hover:bg-accent">
        <Upload className="h-4 w-4" /> Upload
        <input
          type="file"
          accept="image/avif,image/webp,image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onReplace(file);
            event.target.value = "";
          }}
        />
      </span>
    </label>
  );
}

function OrderControls({
  index,
  count,
  onMove,
  onDelete,
}: {
  index: number;
  count: number;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  return (
    <div className="ml-auto flex gap-1">
      <button
        type="button"
        onClick={() => onMove(-1)}
        disabled={index === 0}
        className="rounded-sm border border-border p-1.5 disabled:opacity-30"
        aria-label="Move up"
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onMove(1)}
        disabled={index === count - 1}
        className="rounded-sm border border-border p-1.5 disabled:opacity-30"
        aria-label="Move down"
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="rounded-sm border border-border p-1.5 text-muted-foreground hover:text-destructive"
        aria-label="Delete"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function useObjectUrl(file: File | null): string {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

function nextOrder(items: Array<{ sortOrder: number }>): number {
  return Math.max(0, ...items.map((item) => item.sortOrder)) + 1;
}

function moveBySort<T extends { id: string; sortOrder: number }>(
  items: T[],
  id: string,
  dir: -1 | 1,
): T[] {
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  const index = sorted.findIndex((item) => item.id === id);
  const swap = sorted[index + dir];
  if (!swap) return items;
  const current = sorted[index];
  return items.map((item) => {
    if (item.id === current.id) return { ...item, sortOrder: swap.sortOrder };
    if (item.id === swap.id) return { ...item, sortOrder: current.sortOrder };
    return item;
  });
}

function PhotoPrintingAlbumsSection() {
  const confirm = useConfirm();
  const [albums, setAlbums] = useState<AdminPhotoAlbum[] | null>(null);
  const [editing, setEditing] = useState<Partial<AdminPhotoAlbum> | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    load();
  }, []);

  async function load() {
    setAlbums((await listPhotoAlbumsAdmin()) as AdminPhotoAlbum[]);
  }

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const optimized = await optimizeImage(file, { maxDim: 2000, quality: 0.85 });
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
    if (!editing?.name_en?.trim() || !editing?.name_ar?.trim())
      return toast.error("Name (EN and AR) is required");
    if (!Number(editing.price) || Number(editing.price) <= 0)
      return toast.error("Price must be a positive number");
    try {
      await upsertPhotoAlbum({ data: editing });
      toast.success("Saved");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const remove = async (id: string) => {
    if (!(await confirm("Delete this album?"))) return;
    await deletePhotoAlbum({ data: id });
    load();
  };

  const toggleEnabled = async (a: AdminPhotoAlbum) => {
    await upsertPhotoAlbum({ data: { ...a, enabled: !a.enabled } });
    load();
  };

  const move = async (a: AdminPhotoAlbum, dir: -1 | 1) => {
    if (!albums) return;
    const sorted = [...albums].sort((x, y) => x.sort_order - y.sort_order);
    const idx = sorted.findIndex((x) => x.id === a.id);
    const swapWith = sorted[idx + dir];
    if (!swapWith) return;
    await Promise.all([
      upsertPhotoAlbum({ data: { ...a, sort_order: swapWith.sort_order } }),
      upsertPhotoAlbum({ data: { ...swapWith, sort_order: a.sort_order } }),
    ]);
    load();
  };

  if (albums === null) return <LoadingRows />;

  return (
    <div>
      <div>
        <h3 className="text-sm font-semibold">Photo albums</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Add-on products customers can add to a photo printing order (e.g. a physical album for the
          prints). Priced and validated server-side — never trust a client-submitted price.
        </p>
      </div>
      <div className="mb-4 mt-3 flex justify-end">
        <button
          onClick={() => setEditing({})}
          className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          + New album
        </button>
      </div>

      {editing && (
        <div className="mb-6 grid gap-4 rounded-sm border border-border bg-card p-4 sm:grid-cols-[180px_1fr]">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
              Image
            </label>
            {editing.image_url ? (
              <img
                src={editing.image_url}
                alt=""
                className="aspect-square w-full rounded-sm object-cover"
              />
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-sm border border-dashed border-border text-xs text-muted-foreground">
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
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                placeholder="Name (EN)"
                value={editing.name_en ?? ""}
                onChange={(e) => setEditing({ ...editing, name_en: e.target.value })}
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                placeholder="Name (AR)"
                dir="rtl"
                value={editing.name_ar ?? ""}
                onChange={(e) => setEditing({ ...editing, name_ar: e.target.value })}
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
              <textarea
                placeholder="Description (EN, optional)"
                value={editing.description_en ?? ""}
                onChange={(e) => setEditing({ ...editing, description_en: e.target.value })}
                rows={2}
                className="w-full resize-y rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
              <textarea
                placeholder="Description (AR, optional)"
                dir="rtl"
                value={editing.description_ar ?? ""}
                onChange={(e) => setEditing({ ...editing, description_ar: e.target.value })}
                rows={2}
                className="w-full resize-y rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Price (EGP)
              </span>
              <input
                type="number"
                min={1}
                step="0.01"
                value={editing.price ?? ""}
                onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })}
                className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.enabled !== false}
                onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
              />
              Enabled
            </label>
            <div className="flex gap-2">
              <button
                onClick={save}
                className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(null)}
                className="rounded-sm border border-border px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {albums.length === 0 ? (
        <p className="text-sm text-muted-foreground">No photo albums yet.</p>
      ) : (
        <div className="space-y-2">
          {albums
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-sm border border-border p-3"
              >
                <div className="flex items-center gap-3">
                  {a.image_url ? (
                    <img src={a.image_url} alt="" className="h-12 w-12 rounded-sm object-cover" />
                  ) : (
                    <div className="h-12 w-12 rounded-sm border border-dashed border-border" />
                  )}
                  <div>
                    <div className="text-sm font-medium">{a.name_en}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.price} EGP · {a.enabled ? "Enabled" : "Disabled"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => move(a, -1)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(a, 1)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => toggleEnabled(a)}
                    className="text-xs text-cyan-500 hover:underline"
                  >
                    {a.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={() => setEditing(a)}
                    className="text-xs text-cyan-500 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(a.id)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function PhotoPrintingContentSection() {
  const [content, setContent] = useState<PhotoPrintingContent | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const settings = await getAllSiteSettingsAdmin();
    const row = (settings as Array<{ key: string; value: unknown }>).find(
      (r) => r.key === PHOTO_PRINTING_CONTENT_KEY,
    );
    setContent(normalizePhotoPrintingContent(row?.value));
  };
  useEffect(() => {
    load();
  }, []);

  const save = async (next: PhotoPrintingContent) => {
    setContent(next);
    setSaving(true);
    try {
      await setSiteSetting({ data: { key: PHOTO_PRINTING_CONTENT_KEY, value: next } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (content === null) return <LoadingForm />;

  const updateHero = (patch: Partial<PhotoPrintingContent["hero"]>) =>
    save({ ...content, hero: { ...content.hero, ...patch } });
  const updateFinalCta = (patch: Partial<PhotoPrintingContent["finalCta"]>) =>
    save({ ...content, finalCta: { ...content.finalCta, ...patch } });
  const updatePayment = (patch: Partial<PhotoPrintingContent["payment"]>) =>
    save({ ...content, payment: { ...content.payment, ...patch } });
  const updateWhyPoint = (id: string, patch: { en?: string; ar?: string; enabled?: boolean }) =>
    save({
      ...content,
      why: {
        ...content.why,
        points: content.why.points.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      },
    });
  const updateStep = (id: string, patch: { en?: string; ar?: string }) =>
    save({
      ...content,
      howItWorks: {
        ...content.howItWorks,
        steps: content.howItWorks.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      },
    });
  const updateFaq = (id: string, patch: { en?: string; ar?: string; enabled?: boolean }) =>
    save({
      ...content,
      faq: {
        ...content.faq,
        items: content.faq.items.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      },
    });

  return (
    <div>
      <h3 className="text-sm font-semibold">Page content</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Edit English/Arabic text for every section. Enable/hide "Why print with us" cards and FAQ
        items without removing them.
      </p>

      <h4 className="mt-5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Hero
      </h4>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <LocalizedField
          label="Heading (EN)"
          value={content.hero.heading.en}
          onChange={(en) => updateHero({ heading: { ...content.hero.heading, en } })}
          disabled={saving}
        />
        <LocalizedField
          label="Heading (AR)"
          value={content.hero.heading.ar}
          onChange={(ar) => updateHero({ heading: { ...content.hero.heading, ar } })}
          disabled={saving}
          rtl
        />
        <LocalizedField
          label="Subheading (EN)"
          value={content.hero.subheading.en}
          onChange={(en) => updateHero({ subheading: { ...content.hero.subheading, en } })}
          disabled={saving}
          textarea
        />
        <LocalizedField
          label="Subheading (AR)"
          value={content.hero.subheading.ar}
          onChange={(ar) => updateHero({ subheading: { ...content.hero.subheading, ar } })}
          disabled={saving}
          textarea
          rtl
        />
        <LocalizedField
          label="Primary CTA (EN)"
          value={content.hero.ctaPrimary.en}
          onChange={(en) => updateHero({ ctaPrimary: { ...content.hero.ctaPrimary, en } })}
          disabled={saving}
        />
        <LocalizedField
          label="Primary CTA (AR)"
          value={content.hero.ctaPrimary.ar}
          onChange={(ar) => updateHero({ ctaPrimary: { ...content.hero.ctaPrimary, ar } })}
          disabled={saving}
          rtl
        />
      </div>

      <h4 className="mt-6 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Why print with us
      </h4>
      <div className="mt-2 space-y-2">
        {content.why.points.map((p) => (
          <div key={p.id} className="rounded-sm border border-border p-2.5">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={p.enabled}
                disabled={saving}
                onChange={(e) => updateWhyPoint(p.id, { enabled: e.target.checked })}
              />
              <span className="w-32 shrink-0 text-xs text-muted-foreground">{p.id}</span>
              <input
                value={p.en}
                disabled={saving}
                onChange={(e) => updateWhyPoint(p.id, { en: e.target.value })}
                className="flex-1 rounded-sm border border-border bg-background px-2 py-1 text-sm"
              />
              <input
                value={p.ar}
                dir="rtl"
                disabled={saving}
                onChange={(e) => updateWhyPoint(p.id, { ar: e.target.value })}
                className="flex-1 rounded-sm border border-border bg-background px-2 py-1 text-sm"
              />
            </div>
          </div>
        ))}
      </div>

      <h4 className="mt-6 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        How it works
      </h4>
      <div className="mt-2 space-y-2">
        {content.howItWorks.steps.map((s) => (
          <div key={s.id} className="rounded-sm border border-border p-2.5">
            <div className="flex items-center gap-2">
              <span className="w-32 shrink-0 text-xs text-muted-foreground">{s.id}</span>
              <input
                value={s.en}
                disabled={saving}
                onChange={(e) => updateStep(s.id, { en: e.target.value })}
                className="flex-1 rounded-sm border border-border bg-background px-2 py-1 text-sm"
              />
              <input
                value={s.ar}
                dir="rtl"
                disabled={saving}
                onChange={(e) => updateStep(s.id, { ar: e.target.value })}
                className="flex-1 rounded-sm border border-border bg-background px-2 py-1 text-sm"
              />
            </div>
          </div>
        ))}
      </div>

      <h4 className="mt-6 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        FAQ
      </h4>
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
              <span className="w-32 shrink-0 text-xs text-muted-foreground">{f.id}</span>
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

      <h4 className="mt-6 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Final CTA
      </h4>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <LocalizedField
          label="Heading (EN)"
          value={content.finalCta.heading.en}
          onChange={(en) => updateFinalCta({ heading: { ...content.finalCta.heading, en } })}
          disabled={saving}
        />
        <LocalizedField
          label="Heading (AR)"
          value={content.finalCta.heading.ar}
          onChange={(ar) => updateFinalCta({ heading: { ...content.finalCta.heading, ar } })}
          disabled={saving}
          rtl
        />
      </div>

      <h4 className="mt-6 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Payment (InstaPay / Vodafone Cash)
      </h4>
      <p className="mt-1 text-xs text-muted-foreground">
        Cash on delivery is always offered. This number is shown when a customer picks InstaPay or
        Vodafone Cash at checkout instead.
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            InstaPay / Vodafone Cash phone number
          </span>
          <input
            value={content.payment.instapayVodafonePhone}
            disabled={saving}
            onChange={(e) => updatePayment({ instapayVodafonePhone: e.target.value })}
            className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <LocalizedField
          label="Note (EN)"
          value={content.payment.note.en}
          onChange={(en) => updatePayment({ note: { ...content.payment.note, en } })}
          disabled={saving}
          textarea
        />
        <LocalizedField
          label="Note (AR)"
          value={content.payment.note.ar}
          onChange={(ar) => updatePayment({ note: { ...content.payment.note, ar } })}
          disabled={saving}
          textarea
          rtl
        />
      </div>
    </div>
  );
}

function LocalizedField({
  label,
  value,
  onChange,
  disabled,
  textarea,
  rtl,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  textarea?: boolean;
  rtl?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      {textarea ? (
        <textarea
          value={value}
          dir={rtl ? "rtl" : "ltr"}
          disabled={disabled}
          rows={2}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full resize-y rounded-sm border border-border bg-background px-3 py-2 text-sm"
        />
      ) : (
        <input
          value={value}
          dir={rtl ? "rtl" : "ltr"}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
        />
      )}
    </label>
  );
}
