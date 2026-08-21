import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Star, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { SafeImage } from "@/components/SafeImage";
import { supabase } from "@/integrations/supabase/client";
import { uploadAndSign } from "@/lib/storage-url";
import {
  PHOTO_PRINTING_MEDIA_DEFAULTS,
  PHOTO_PRINTING_MEDIA_KEY,
  parsePhotoPrintingMediaConfig,
  type PhotoPrintingBanner,
  type PhotoPrintingMediaConfig,
  type PhotoPrintingPageImage,
} from "@/lib/use-settings";

type DraftBannerFiles = {
  desktop: File | null;
  mobile: File | null;
};

const emptyDraft: DraftBannerFiles = { desktop: null, mobile: null };

export function PhotoPrintingMediaTab() {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [draftBanner, setDraftBanner] = useState<DraftBannerFiles>(emptyDraft);

  const { data = PHOTO_PRINTING_MEDIA_DEFAULTS, isLoading } = useQuery({
    queryKey: ["admin-photo-printing-media"],
    queryFn: async (): Promise<PhotoPrintingMediaConfig> => {
      const { data: row, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", PHOTO_PRINTING_MEDIA_KEY)
        .maybeSingle();
      if (error) throw error;
      return parsePhotoPrintingMediaConfig(row?.value);
    },
  });

  const desktopPreview = useObjectUrl(draftBanner.desktop);
  const mobilePreview = useObjectUrl(draftBanner.mobile);

  const saveConfig = async (next: PhotoPrintingMediaConfig, message = "Saved") => {
    setSaving(true);
    try {
      const { error } = await supabase.from("site_settings").upsert({
        key: PHOTO_PRINTING_MEDIA_KEY,
        value: next as unknown as never,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success(message);
      qc.setQueryData(["admin-photo-printing-media"], next);
      qc.invalidateQueries({ queryKey: ["admin-photo-printing-media"] });
      qc.invalidateQueries({ queryKey: ["photo-printing-media"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const uploadFile = async (file: File, folder: string) => {
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
    return uploadAndSign("slider", `photo-printing/${folder}/${crypto.randomUUID()}.${ext}`, file);
  };

  const addBanner = async () => {
    if (!draftBanner.desktop && !draftBanner.mobile) return toast.error("Choose a banner image");
    setUploadingBanner(true);
    try {
      const [desktopImageUrl, mobileImageUrl] = await Promise.all([
        draftBanner.desktop ? uploadFile(draftBanner.desktop, "banners") : Promise.resolve(""),
        draftBanner.mobile ? uploadFile(draftBanner.mobile, "banners") : Promise.resolve(""),
      ]);
      const now = new Date().toISOString();
      const next: PhotoPrintingMediaConfig = {
        ...data,
        banners: [
          ...data.banners,
          {
            id: crypto.randomUUID(),
            desktopImageUrl,
            mobileImageUrl,
            enabled: true,
            linkUrl: "",
            altText: "Photo printing banner",
            title: "",
            sortOrder: nextOrder(data.banners),
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
      let order = nextOrder(data.images);
      const now = new Date().toISOString();
      const uploaded: PhotoPrintingPageImage[] = [];
      for (const file of Array.from(files)) {
        const imageUrl = await uploadFile(file, "images");
        uploaded.push({
          id: crypto.randomUUID(),
          imageUrl,
          enabled: true,
          isPrimary: data.images.length === 0 && uploaded.length === 0,
          altText: file.name.replace(/\.[^.]+$/, ""),
          title: "",
          description: "",
          sortOrder: order++,
          createdAt: now,
          updatedAt: now,
        });
      }
      await saveConfig({ ...data, images: [...data.images, ...uploaded] }, "Images uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingImage(false);
    }
  };

  const patchBanner = (id: string, patch: Partial<PhotoPrintingBanner>) =>
    saveConfig(
      {
        ...data,
        banners: data.banners.map((banner) =>
          banner.id === id ? { ...banner, ...patch, updatedAt: new Date().toISOString() } : banner,
        ),
      },
      "Banner saved",
    );

  const patchImage = (id: string, patch: Partial<PhotoPrintingPageImage>) =>
    saveConfig(
      {
        ...data,
        images: data.images.map((image) =>
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
    const url = await uploadFile(file, "banners");
    await patchBanner(
      banner.id,
      target === "desktop" ? { desktopImageUrl: url } : { mobileImageUrl: url },
    );
  };

  const replacePageImage = async (image: PhotoPrintingPageImage, file: File) => {
    const imageUrl = await uploadFile(file, "images");
    await patchImage(image.id, { imageUrl });
  };

  const moveBanner = (id: string, dir: -1 | 1) =>
    saveConfig({ ...data, banners: moveBySort(data.banners, id, dir) }, "Banner order saved");

  const moveImage = (id: string, dir: -1 | 1) =>
    saveConfig({ ...data, images: moveBySort(data.images, id, dir) }, "Image order saved");

  const setPrimary = (id: string) =>
    saveConfig(
      { ...data, images: data.images.map((image) => ({ ...image, isPrimary: image.id === id })) },
      "Primary image saved",
    );

  const removeBanner = (id: string) => {
    if (!confirm("Delete this banner?")) return;
    saveConfig(
      { ...data, banners: data.banners.filter((banner) => banner.id !== id) },
      "Banner deleted",
    );
  };

  const removeImage = (id: string) => {
    if (!confirm("Delete this image?")) return;
    saveConfig(
      { ...data, images: data.images.filter((image) => image.id !== id) },
      "Image deleted",
    );
  };

  if (isLoading)
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-8">
      <section className="rounded-sm border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-display text-2xl">Photo Printing → Banner & Images</h2>
            <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
              Live settings. Changes appear on /photo-printing without rebuilding the site.
            </p>
          </div>
          {(saving || uploadingBanner || uploadingImage) && (
            <span className="rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-muted-foreground">
              Saving…
            </span>
          )}
        </div>
      </section>

      <section className="rounded-sm border border-border bg-card p-6">
        <h3 className="text-display text-xl">Banner Upload</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a desktop banner and optionally a separate mobile crop. Use WebP/AVIF when
          possible.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
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
          className="mt-4 inline-flex items-center gap-2 rounded-sm bg-primary px-5 py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground disabled:opacity-50"
        >
          <Upload className="h-4 w-4" /> {uploadingBanner ? "Uploading…" : "Save new banner"}
        </button>
      </section>

      <section className="space-y-3">
        <h3 className="text-display text-2xl">Banners</h3>
        {data.banners.length === 0 ? (
          <EmptyState label="No photo printing banners yet." />
        ) : (
          data.banners.map((banner, index) => (
            <BannerEditor
              key={banner.id}
              banner={banner}
              index={index}
              count={data.banners.length}
              disabled={saving}
              onPatch={(patch) => patchBanner(banner.id, patch)}
              onMove={(dir) => moveBanner(banner.id, dir)}
              onDelete={() => removeBanner(banner.id)}
              onReplace={replaceBannerImage}
            />
          ))
        )}
      </section>

      <section className="rounded-sm border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-display text-2xl">Photo Printing Images</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage the image gallery shown below the pricing section.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-sm border border-dashed border-border px-4 py-2 text-xs uppercase tracking-widest hover:bg-accent">
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
      </section>

      <section className="space-y-3">
        {data.images.length === 0 ? (
          <EmptyState label="No managed photo printing images yet." />
        ) : (
          data.images.map((image, index) => (
            <PageImageEditor
              key={image.id}
              image={image}
              index={index}
              count={data.images.length}
              disabled={saving}
              onPatch={(patch) => patchImage(image.id, patch)}
              onMove={(dir) => moveImage(image.id, dir)}
              onDelete={() => removeImage(image.id)}
              onPrimary={() => setPrimary(image.id)}
              onReplace={replacePageImage}
            />
          ))
        )}
      </section>
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
    <div className="rounded-sm border border-border bg-background p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-3 aspect-[16/7] overflow-hidden rounded-sm border border-border bg-muted">
        {preview ? (
          <img src={preview} alt="Banner preview" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Preview before save
          </div>
        )}
      </div>
      <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-sm border border-dashed border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent">
        <Upload className="h-4 w-4" /> {file ? file.name : "Choose image"}
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
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="overflow-hidden rounded-sm border border-border bg-muted">
          <SafeImage
            src={banner.desktopImageUrl || banner.mobileImageUrl}
            alt={banner.altText || "Photo printing banner"}
            className="aspect-[16/7] h-full w-full object-cover"
          />
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs uppercase tracking-widest">
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
      <div className="grid gap-4 lg:grid-cols-[180px_1fr]">
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
            <label className="inline-flex items-center gap-2 text-xs uppercase tracking-widest">
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
              className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1.5 text-[10px] uppercase tracking-widest hover:bg-accent"
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
      <span className="mt-1 inline-flex cursor-pointer items-center gap-2 rounded-sm border border-dashed border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent">
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

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-sm border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
      {label}
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
