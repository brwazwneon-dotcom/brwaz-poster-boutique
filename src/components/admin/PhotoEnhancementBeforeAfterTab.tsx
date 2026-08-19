import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2, RotateCcw, Save, Upload, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { PhotoEnhancementContent } from "@/components/PhotoEnhancementBeforeAfter";
import { SafeImage } from "@/components/SafeImage";
import { useAdminI18n } from "@/lib/admin-i18n";
import {
  DEFAULT_PHOTO_ENHANCEMENT,
  normalizePhotoEnhancementSettings,
  PHOTO_ENHANCEMENT_KEY,
  type PhotoEnhancementSettings,
} from "@/lib/photo-enhancement";
import { uploadAndSign } from "@/lib/storage-url";
import { supabase } from "@/integrations/supabase/client";

type PreviewSize = "desktop" | "tablet" | "mobile";

export function PhotoEnhancementBeforeAfterTab() {
  const { lang } = useAdminI18n();
  const isArabic = lang === "ar";
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<PhotoEnhancementSettings>(DEFAULT_PHOTO_ENHANCEMENT);
  const [saving, setSaving] = useState(false);
  const [generatingBefore, setGeneratingBefore] = useState(false);
  const [previewSize, setPreviewSize] = useState<PreviewSize>("desktop");

  const settingsQuery = useQuery({
    queryKey: ["admin-photo-enhancement-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", PHOTO_ENHANCEMENT_KEY)
        .maybeSingle();
      if (error) throw error;
      return normalizePhotoEnhancementSettings(data?.value);
    },
  });

  useEffect(() => {
    if (settingsQuery.data) setDraft(settingsQuery.data);
  }, [settingsQuery.data]);

  const ratiosMatch = Math.abs(draft.beforeAspectRatio - draft.afterAspectRatio) < 0.01;
  const save = async () => {
    if (!draft.beforeImage || !draft.afterImage) {
      toast.error(isArabic ? "ارفع الصورتين قبل النشر" : "Upload both images before publishing");
      return;
    }
    if (!ratiosMatch) {
      toast.error(
        isArabic
          ? "يجب أن تكون أبعاد الصورتين متطابقة"
          : "Both images must use the same aspect ratio",
      );
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("site_settings").upsert({
        key: PHOTO_ENHANCEMENT_KEY,
        value: draft as unknown as never,
      });
      if (error) throw error;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-photo-enhancement-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["photo-enhancement-settings"] }),
      ]);
      toast.success(isArabic ? "تم نشر قسم تحسين الصور" : "Photo enhancement section published");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : isArabic ? "تعذر الحفظ" : "Could not save",
      );
    } finally {
      setSaving(false);
    }
  };

  const upload = async (slot: "before" | "after", file: File) => {
    const ratio = await imageRatio(file);
    const path = `photo-enhancement/${slot}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
    const url = await uploadAndSign("posters", path, file);
    const avifUrl = file.type === "image/avif" ? url : undefined;
    if (slot === "before") {
      setDraft((current) => ({
        ...current,
        beforeImage: url,
        beforeImageAvif: avifUrl,
        beforeAspectRatio: ratio,
      }));
      return;
    }
    setDraft((current) => ({
      ...current,
      afterImage: url,
      afterImageAvif: avifUrl,
      afterAspectRatio: ratio,
    }));
    await generatePixelatedBefore(url, ratio);
  };

  const generatePixelatedBefore = async (
    sourceUrl = draft.afterImage,
    ratio = draft.afterAspectRatio,
  ) => {
    if (!sourceUrl) return;
    setGeneratingBefore(true);
    try {
      const file = await createPixelatedBeforeFile(sourceUrl, draft, isArabic);
      const path = `photo-enhancement/before/generated-${Date.now()}.webp`;
      const url = await uploadAndSign("posters", path, file);
      setDraft((current) => ({
        ...current,
        beforeImage: url,
        beforeImageAvif: undefined,
        beforeAspectRatio: ratio,
      }));
      toast.success(isArabic ? "تم إنشاء النسخة المبكسلة" : "Pixelated before image generated");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : isArabic
            ? "تعذر إنشاء النسخة المبكسلة"
            : "Could not generate pixelated before image",
      );
    } finally {
      setGeneratingBefore(false);
    }
  };

  const field = <K extends keyof PhotoEnhancementSettings>(
    key: K,
    value: PhotoEnhancementSettings[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Homepage</div>
          <h2 className="text-display text-4xl">
            {isArabic ? "قسم قبل وبعد لتحسين الصور" : "Photo Enhancement Before & After"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {isArabic
              ? "المقاس المقترح 1200 × 675 بكسل. استخدم نفس القص للصورتين للحصول على مقارنة دقيقة."
              : "Recommended: 1200 × 675px. Use the same crop for both images for an accurate comparison."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDraft(DEFAULT_PHOTO_ENHANCEMENT)}
            className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2 text-xs font-semibold uppercase tracking-widest hover:bg-accent"
          >
            <RotateCcw className="h-4 w-4" /> {isArabic ? "استعادة الافتراضي" : "Reset default"}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || settingsQuery.isLoading}
            className="inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isArabic ? "نشر" : "Publish"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4 rounded-md border border-border bg-card p-5">
          <label className="flex items-center justify-between gap-4 rounded-sm border border-border bg-background p-4 text-sm">
            <span>
              <span className="block font-semibold">
                {isArabic ? "تفعيل القسم" : "Enable section"}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {isArabic
                  ? "إظهاره أو إخفاؤه في الصفحة الرئيسية."
                  : "Show or hide it on the homepage."}
              </span>
            </span>
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) => field("enabled", event.target.checked)}
              className="h-5 w-5 accent-primary"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <ImageUpload
              label={isArabic ? "صورة قبل يدوية" : "Manual before image"}
              url={draft.beforeImage}
              ratio={draft.beforeAspectRatio}
              onUpload={(file) => upload("before", file)}
            />
            <ImageUpload
              label={isArabic ? "صورة بعد" : "After image"}
              url={draft.afterImage}
              ratio={draft.afterAspectRatio}
              onUpload={(file) => upload("after", file)}
            />
          </div>
          <button
            type="button"
            onClick={() => generatePixelatedBefore()}
            disabled={generatingBefore || !draft.afterImage}
            className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2 text-xs font-semibold uppercase tracking-widest hover:bg-accent disabled:opacity-50"
          >
            {generatingBefore ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            {isArabic ? "إنشاء نسخة مبكسلة" : "Generate Pixelated Before"}
          </button>
          {!ratiosMatch && (
            <p className="rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {isArabic
                ? "تحذير: أبعاد الصورتين مختلفة. لا يمكن النشر حتى تتطابق النسبة."
                : "Warning: image dimensions differ. Publishing is blocked until their aspect ratios match."}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={isArabic ? "العنوان بالعربية" : "Arabic heading"}>
              <input
                className="admin-room-input"
                value={draft.headingAr}
                onChange={(e) => field("headingAr", e.target.value)}
              />
            </Field>
            <Field label={isArabic ? "العنوان بالإنجليزية" : "English heading"}>
              <input
                className="admin-room-input"
                value={draft.headingEn}
                onChange={(e) => field("headingEn", e.target.value)}
              />
            </Field>
            <Field label={isArabic ? "الوصف بالعربية" : "Arabic description"}>
              <textarea
                className="admin-room-input min-h-24"
                value={draft.descriptionAr}
                onChange={(e) => field("descriptionAr", e.target.value)}
              />
            </Field>
            <Field label={isArabic ? "الوصف بالإنجليزية" : "English description"}>
              <textarea
                className="admin-room-input min-h-24"
                value={draft.descriptionEn}
                onChange={(e) => field("descriptionEn", e.target.value)}
              />
            </Field>
            <Field label={isArabic ? "موضع السلايدر الابتدائي" : "Initial slider position"}>
              <input
                type="range"
                min="0"
                max="100"
                value={draft.initialSlider}
                onChange={(e) => field("initialSlider", Number(e.target.value))}
                className="mt-3 w-full accent-primary"
              />
              <span className="text-xs text-muted-foreground">{draft.initialSlider}%</span>
            </Field>
            <RangeField
              label={isArabic ? "مستوى البكسلة" : "Pixelation level"}
              value={draft.pixelationLevel}
              min={1}
              max={100}
              suffix="%"
              onChange={(value) => field("pixelationLevel", value)}
            />
            <RangeField
              label={isArabic ? "مقدار البلور" : "Blur amount"}
              value={draft.blurAmount}
              min={0}
              max={3}
              step={0.1}
              suffix="px"
              onChange={(value) => field("blurAmount", value)}
            />
            <RangeField
              label={isArabic ? "مستوى الضغط" : "Compression level"}
              value={draft.compressionLevel}
              min={1}
              max={100}
              suffix="%"
              onChange={(value) => field("compressionLevel", value)}
            />
            <RangeField
              label={isArabic ? "قوة بهتان الألوان" : "Color fade strength"}
              value={draft.colorFadeStrength}
              min={0}
              max={100}
              suffix="%"
              onChange={(value) => field("colorFadeStrength", value)}
            />
            <Field label={isArabic ? "رابط زر التحسين" : "Enhance CTA destination"}>
              <input
                className="admin-room-input"
                value={draft.primaryCtaHref}
                onChange={(e) => field("primaryCtaHref", e.target.value)}
              />
            </Field>
            <Field label={isArabic ? "رابط زر الطباعة" : "Print CTA destination"}>
              <input
                className="admin-room-input"
                value={draft.secondaryCtaHref}
                onChange={(e) => field("secondaryCtaHref", e.target.value)}
              />
            </Field>
          </div>
        </div>

        <div className="rounded-md border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                {isArabic ? "معاينة" : "Preview"}
              </div>
              <h3 className="mt-1 text-xl font-semibold">
                {isArabic ? "ديسكتوب وتابلت وموبايل" : "Desktop, tablet, and mobile"}
              </h3>
            </div>
            <div className="flex gap-2">
              {(["desktop", "tablet", "mobile"] as PreviewSize[]).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setPreviewSize(size)}
                  className={`inline-flex items-center gap-1 rounded-sm border px-3 py-1.5 text-xs uppercase tracking-widest ${previewSize === size ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent"}`}
                >
                  <Eye className="h-3.5 w-3.5" /> {size}
                </button>
              ))}
            </div>
          </div>
          <div
            className={`mx-auto mt-5 overflow-hidden rounded-md border border-border transition-all ${previewSize === "desktop" ? "w-full" : previewSize === "tablet" ? "max-w-[768px]" : "max-w-[375px]"}`}
          >
            <PhotoEnhancementContent settings={draft} preview />
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-3 w-full accent-primary"
      />
      <span className="text-xs text-muted-foreground">
        {value}
        {suffix}
      </span>
    </Field>
  );
}

function ImageUpload({
  label,
  url,
  ratio,
  onUpload,
}: {
  label: string;
  url: string;
  ratio: number;
  onUpload: (file: File) => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  return (
    <div className="rounded-sm border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>{label}</span>
        <span>{ratio.toFixed(2)}:1</span>
      </div>
      <div
        className="mt-2 overflow-hidden rounded-sm bg-muted"
        style={{ aspectRatio: String(ratio) }}
      >
        <SafeImage src={url} alt={label} className="h-full w-full object-cover" />
      </div>
      <label className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-widest hover:bg-accent">
        <Upload className="h-3.5 w-3.5" /> {uploading ? "Uploading..." : "Upload / replace"}
        <input
          type="file"
          accept="image/avif,image/webp,image/jpeg,image/png"
          className="hidden"
          disabled={uploading}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setUploading(true);
            try {
              await onUpload(file);
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Upload failed");
            } finally {
              setUploading(false);
            }
          }}
        />
      </label>
    </div>
  );
}

async function createPixelatedBeforeFile(
  sourceUrl: string,
  settings: PhotoEnhancementSettings,
  isArabic: boolean,
) {
  const image = await loadImage(sourceUrl);
  const width = 1200;
  const height = Math.round(width / (settings.afterAspectRatio || 16 / 9));
  const pixelScale = Math.max(24, Math.round(220 - settings.pixelationLevel * 1.7));
  const smallWidth = Math.max(24, Math.round(width / pixelScale));
  const smallHeight = Math.max(16, Math.round(height / pixelScale));
  const small = document.createElement("canvas");
  small.width = smallWidth;
  small.height = smallHeight;
  const smallCtx = small.getContext("2d");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!smallCtx || !ctx)
    throw new Error(isArabic ? "المتصفح لا يدعم معالجة الصورة" : "Canvas is unavailable");

  drawCover(smallCtx, image, smallWidth, smallHeight);
  ctx.imageSmoothingEnabled = false;
  const fade = Math.max(0, Math.min(1, settings.colorFadeStrength / 100));
  ctx.filter = `blur(${settings.blurAmount}px) saturate(${1 - fade * 0.45}) contrast(${0.88 - fade * 0.16}) brightness(${0.98 - fade * 0.08})`;
  ctx.drawImage(small, 0, 0, width, height);
  ctx.filter = "none";
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  for (let y = 0; y < height; y += 12) ctx.fillRect(0, y, width, 1);
  ctx.fillStyle = "rgba(0,0,0,0.035)";
  for (let x = 0; x < width; x += 16) ctx.fillRect(x, 0, 1, height);

  const quality = Math.max(0.1, Math.min(0.8, (100 - settings.compressionLevel) / 100));
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", quality),
  );
  if (!blob) throw new Error(isArabic ? "تعذر إنشاء الصورة" : "Could not create image");
  return new File([blob], "generated-pixelated-before.webp", { type: "image/webp" });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load after image"));
    image.src = src;
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
}

function imageRatio(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image.naturalWidth / image.naturalHeight);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read image dimensions"));
    };
    image.src = objectUrl;
  });
}
