import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Upload,
  X,
  Loader2,
  Plus,
  Pencil,
  RefreshCw,
  Eye,
  RotateCw,
  ShoppingBag,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BeforeAfter } from "@/components/BeforeAfter";
import { ProductInfoSections } from "@/components/ProductInfoSections";
import { SizeGuide } from "@/components/SizeGuide";
import { FramePreview } from "@/components/FramePreview";
import { useCart } from "@/lib/cart";
import { useNavigate } from "@tanstack/react-router";
import i18n from "@/lib/i18n";
import { useTranslation } from "react-i18next";
import { visitorId } from "@/lib/analytics";
// Custom-design uses its own size-gated offers, not the generic bundle tiers.

const PACKAGING_FEE = 20;

// Only these exact combos get a discount — no random bundle discounts.
const CUSTOM_OFFERS = [
  { size: "30x40" as SizeId, minQty: 4, percent: 15, labelKey: "offer30x40" },
  { size: "20x30" as SizeId, minQty: 6, percent: 15, labelKey: "offer20x30" },
];

function nextCustomOffer(size: SizeId, qty: number) {
  const match = CUSTOM_OFFERS.find((o) => o.size === size && qty < o.minQty);
  return match ? { ...match, missing: match.minQty - qty } : null;
}
import {
  useSiteSettings,
  computeShipping,
  usePricing,
  priceForFrame,
  useEnabledFrameVariants,
} from "@/lib/use-settings";
import {
  FRAME_TYPES,
  FRAME_COLORS,
  SIZES,
  sizesForFrame,
  type FrameTypeId,
  type SizeId,
  type FrameColorId,
} from "@/lib/poster-options";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/custom-design")({
  head: () => ({
    meta: [
      { title: i18n.t("customDesign.metaTitle") },
      {
        name: "description",
        content: i18n.t("customDesign.metaDescription"),
      },
      { property: "og:title", content: i18n.t("customDesign.metaTitle") },
      {
        property: "og:description",
        content: i18n.t("customDesign.ogDescription"),
      },
      { property: "og:url", content: "https://brwazwneon.com/custom-design" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://brwazwneon.com/custom-design" }],
  }),
  component: CustomDesignPage,
});

const MAX_FILES_PER_BATCH = 20;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ACCEPTED_EXT = ["jpg", "jpeg", "png", "webp", "heic", "heif"];
const ACCEPT_ATTR = "image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

type Pic = {
  id: string;
  file: File;
  preview: string;
  rotate: number;
  color: FrameColorId;
  frameType: FrameTypeId;
  size: SizeId;
};

function isAcceptedFile(f: File): boolean {
  const type = (f.type || "").toLowerCase();
  if (type.startsWith("image/")) {
    const sub = type.split("/")[1] ?? "";
    if (ACCEPTED_EXT.includes(sub)) return true;
  }
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  return ACCEPTED_EXT.includes(ext);
}

function CustomDesignPage() {
  const { t, i18n: activeI18n } = useTranslation();
  const isArabic = activeI18n.language.startsWith("ar");
  const pricing = usePricing();
  const settings = useSiteSettings();
  const cart = useCart();
  const navigate = useNavigate();

  const [pics, setPics] = useState<Pic[]>([]);
  const [frameType, setFrameType] = useState<FrameTypeId>("pvc");
  const [size, setSize] = useState<SizeId>("30x40");
  const [color, setColor] = useState<FrameColorId>("black");

  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  const [lightbox, setLightbox] = useState<Pic | null>(null);
  const [editing, setEditing] = useState<Pic | null>(null);

  const addInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetId = useRef<string | null>(null);

  // Enforce per-frame-type size/color rules.
  const handleFrameType = (id: FrameTypeId) => {
    setFrameType(id);
    const allowed = sizesForFrame(id);
    if (!allowed.includes(size)) setSize(allowed[0]);
    if (id === "wood") {
      // Wooden Portrait has no color options — clear any PVC color.
      setColor("wood");
      setPics((prev) =>
        prev.map((p) => {
          const allowedForPic = sizesForFrame("wood");
          return {
            ...p,
            color: "wood",
            frameType: "wood",
            size: allowedForPic.includes(p.size) ? p.size : allowedForPic[0],
          };
        }),
      );
    } else if (color === "wood") {
      setColor("black");
      setPics((prev) =>
        prev.map((p) => {
          const allowedForPic = sizesForFrame(id);
          return {
            ...p,
            color: p.color === "wood" ? "black" : p.color,
            frameType: id,
            size: allowedForPic.includes(p.size) ? p.size : allowedForPic[0],
          };
        }),
      );
    } else {
      setPics((prev) =>
        prev.map((p) => {
          const allowedForPic = sizesForFrame(id);
          return {
            ...p,
            frameType: id,
            size: allowedForPic.includes(p.size) ? p.size : allowedForPic[0],
          };
        }),
      );
    }
  };

  // Changing the global color updates any images still on that previous color
  // (customers who explicitly picked a per-image color keep their choice).
  const handleGlobalColor = (next: FrameColorId) => {
    const prevColor = color;
    setColor(next);
    setPics((prev) => prev.map((p) => (p.color === prevColor ? { ...p, color: next } : p)));
  };

  const setPicColor = (id: string, next: FrameColorId) => {
    setPics((prev) => prev.map((p) => (p.id === id ? { ...p, color: next } : p)));
    setEditing((cur) => (cur && cur.id === id ? { ...cur, color: next } : cur));
  };

  const setPicSize = (id: string, next: SizeId) => {
    setPics((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const allowed = sizesForFrame(p.frameType);
        if (!allowed.includes(next)) return p;
        return { ...p, size: next };
      }),
    );
    setEditing((cur) => (cur && cur.id === id ? { ...cur, size: next } : cur));
  };

  const setPicFrameType = (id: string, next: FrameTypeId) => {
    setPics((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const allowed = sizesForFrame(next);
        const nextColor: FrameColorId =
          next === "wood" ? "wood" : p.color === "wood" ? "black" : p.color;
        return {
          ...p,
          frameType: next,
          color: nextColor,
          size: allowed.includes(p.size) ? p.size : allowed[0],
        };
      }),
    );
    setEditing((cur) => {
      if (!cur || cur.id !== id) return cur;
      const allowed = sizesForFrame(next);
      const nextColor: FrameColorId =
        next === "wood" ? "wood" : cur.color === "wood" ? "black" : cur.color;
      return {
        ...cur,
        frameType: next,
        color: nextColor,
        size: allowed.includes(cur.size) ? cur.size : allowed[0],
      };
    });
  };

  const availableSizes = useMemo(
    () => SIZES.filter((s) => sizesForFrame(frameType).includes(s.id)),
    [frameType],
  );

  const unitPriceFor = (ft: FrameTypeId, sz: SizeId) =>
    priceForFrame(pricing, ft, sz) + pricing.customDesignFee;
  const unit = useMemo(() => unitPriceFor(frameType, size), [pricing, frameType, size]);
  const subtotal = useMemo(
    () => pics.reduce((sum, p) => sum + unitPriceFor(p.frameType, p.size), 0),
    [pics, pricing],
  );
  const shipping = computeShipping(subtotal, settings);
  const packaging = pics.length > 0 ? PACKAGING_FEE : 0;
  // Apply size-gated offers per-size across all pics.
  const { discountAmount, appliedOffers } = useMemo(() => {
    let total = 0;
    const applied: { labelKey: string; percent: number; amount: number }[] = [];
    for (const o of CUSTOM_OFFERS) {
      const matching = pics.filter((p) => p.size === o.size);
      if (matching.length >= o.minQty) {
        const sub = matching.reduce((s, p) => s + unitPriceFor(p.frameType, p.size), 0);
        const amt = Math.round((sub * o.percent) / 100);
        total += amt;
        applied.push({ labelKey: o.labelKey, percent: o.percent, amount: amt });
      }
    }
    return { discountAmount: total, appliedOffers: applied };
  }, [pics, pricing]);
  const nextOffer = useMemo(
    () => nextCustomOffer(size, pics.filter((p) => p.size === size).length),
    [size, pics],
  );
  const total = Math.max(0, subtotal - discountAmount) + shipping + packaging;
  const formatSize = (id: SizeId) => t(`product.size_${id}`);
  const formatFrame = (id: FrameTypeId) => t(`product.frame_${id}`);
  const formatColor = (id: FrameColorId) => t(`product.color_${id}`);

  const openPicker = () => addInputRef.current?.click();

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const incoming = Array.from(files);
    const accepted: Pic[] = [];
    let rejectedType = 0;
    let rejectedSize = 0;
    for (const f of incoming) {
      if (accepted.length >= MAX_FILES_PER_BATCH) break;
      if (!isAcceptedFile(f)) {
        rejectedType++;
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        rejectedSize++;
        continue;
      }
      accepted.push({
        id: crypto.randomUUID(),
        file: f,
        preview: URL.createObjectURL(f),
        rotate: 0,
        color: frameType === "wood" ? "wood" : color,
        frameType,
        size,
      });
    }
    if (incoming.length > MAX_FILES_PER_BATCH) {
      toast.message(
        t("customDesign.maxFilesPerBatch", { max: MAX_FILES_PER_BATCH }),
      );
    }
    if (rejectedType) toast.error(t("customDesign.skippedFormat", { count: rejectedType }));
    if (rejectedSize) toast.error(t("customDesign.skippedSize", { count: rejectedSize }));
    if (accepted.length) setPics((prev) => [...prev, ...accepted]);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    addFiles(e.dataTransfer?.files ?? null);
  };

  const removePic = (id: string) => {
    setPics((prev) => {
      const t = prev.find((p) => p.id === id);
      if (t) URL.revokeObjectURL(t.preview);
      return prev.filter((p) => p.id !== id);
    });
  };

  const startReplace = (id: string) => {
    replaceTargetId.current = id;
    replaceInputRef.current?.click();
  };

  const onReplaceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    const targetId = replaceTargetId.current;
    replaceTargetId.current = null;
    if (!f || !targetId) return;
    if (!isAcceptedFile(f)) return toast.error(t("customDesign.unsupportedFormat"));
    if (f.size > MAX_FILE_BYTES) return toast.error(t("customDesign.fileTooLarge"));
    setPics((prev) =>
      prev.map((p) => {
        if (p.id !== targetId) return p;
        URL.revokeObjectURL(p.preview);
        return { ...p, file: f, preview: URL.createObjectURL(f), rotate: 0 };
      }),
    );
  };

  const rotatePic = (id: string) => {
    setPics((prev) => prev.map((p) => (p.id === id ? { ...p, rotate: (p.rotate + 90) % 360 } : p)));
    setEditing((cur) => (cur && cur.id === id ? { ...cur, rotate: (cur.rotate + 90) % 360 } : cur));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pics.length === 0) return toast.error(t("customDesign.addAtLeastOne"));

    setSubmitting(true);
    setProgress(0);
    try {
      const sessionId = visitorId();
      const orderUUID = crypto.randomUUID();
      const total = pics.length;
      const uploaded: {
        path: string;
        index: number;
        url: string;
        width: number;
        height: number;
      }[] = [];
      const CONCURRENCY = 4;
      let cursor = 0;
      let done = 0;

      const worker = async () => {
        while (cursor < total) {
          const i = cursor++;
          const pic = pics[i];
          const sanitizedName = pic.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const fileUUID = crypto.randomUUID();
          const path = `${fileUUID}/${sanitizedName}`;

          const dims = await new Promise<{ width: number; height: number }>((resolve) => {
            const img = new Image();
            img.onload = () => {
              URL.revokeObjectURL(img.src);
              resolve({ width: img.naturalWidth, height: img.naturalHeight });
            };
            img.src = URL.createObjectURL(pic.file);
          });

          // Upload original file unchanged
          const { error: upErr } = await supabase.storage.from("custom-designs").upload(path, pic.file, {
            contentType: pic.file.type || "application/octet-stream",
            upsert: false,
          });
          if (upErr) throw upErr;

          // Create a long-lived signed URL for cart display
          const { data: signed } = await supabase.storage
            .from("custom-designs")
            .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
          const signedUrl = signed?.signedUrl ?? URL.createObjectURL(pic.file);

          uploaded.push({ path, index: i, url: signedUrl, width: dims.width, height: dims.height });
          done++;
          setProgress(Math.round((done / total) * 100));
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));

      uploaded.sort((a, b) => a.index - b.index);

      // Add each uploaded image as its own cart line with metadata
      uploaded.forEach((u, idx) => {
        const pic = pics[u.index];
        const unitPrice = unitPriceFor(pic.frameType, pic.size);
        cart.add({
          posterId: `custom-${orderUUID}-${idx}`,
          title: t("customDesign.cartItemTitle", { number: idx + 1 }),
          image: u.url,
          customImagePath: u.path,
          customImageMeta: {
            originalFilename: pic.file.name,
            originalMimeType: pic.file.type || "application/octet-stream",
            originalWidth: u.width,
            originalHeight: u.height,
            originalFileSize: pic.file.size,
          },
          categoryId: null,
          categoryName: t("customDesign.categoryName"),
          frameType: pic.frameType,
          size: pic.size,
          color: pic.color,
          price: unitPrice,
        });
      });

      toast.success(t("customDesign.addedToCart", { count: pics.length }));
      pics.forEach((p) => URL.revokeObjectURL(p.preview));
      setPics([]);
      navigate({ to: "/cart" });
    } catch (err) {
      console.error("[custom-design] submit failed", err);
      toast.error(err instanceof Error ? err.message : t("customDesign.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const enabledVariants = useEnabledFrameVariants();
  const colorChoices =
    frameType === "wood"
      ? FRAME_COLORS.filter((c) => c.id === "wood" && enabledVariants.includes(c.id))
      : FRAME_COLORS.filter((c) => c.id !== "wood" && enabledVariants.includes(c.id));

  return (
    <div
      dir={isArabic ? "rtl" : "ltr"}
      className={cn("bg-background text-foreground", isArabic ? "text-right" : "text-left")}
    >
      {/* HERO */}
      <section className="border-b border-border bg-card">
        <div className="container-page py-14 sm:py-20">
          <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
            {t("customDesign.eyebrow")}
          </p>
          <h1 className="text-display mt-3 text-5xl sm:text-7xl">{t("customDesign.title")}</h1>
          <h2 className="mt-3 text-2xl font-semibold text-foreground sm:text-3xl">
            {t("customDesign.subtitle")}
          </h2>
          <p className="mt-4 max-w-xl text-muted-foreground">
            {t("customDesign.description")}
          </p>

          {/* Primary ADD IMAGES button */}
          <div className="mt-8 max-w-xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={openPicker}
                className="inline-flex items-center justify-center gap-3 rounded-sm bg-primary px-8 py-5 text-sm font-semibold uppercase tracking-[0.25em] text-primary-foreground transition hover:opacity-90"
              >
                <Plus className="h-5 w-5" />
                {t("customDesign.addImages")}
              </button>
              <Link
                to="/best-sellers"
                className="inline-flex items-center justify-center gap-3 rounded-sm border border-border px-8 py-5 text-sm font-semibold uppercase tracking-[0.25em] text-foreground transition hover:bg-accent"
              >
                {t("customDesign.browsePosters")}
              </Link>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {t("customDesign.qualityNote")}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("customDesign.wantReadyDesigns")}
            </p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
              {t("customDesign.uploadLimit", { max: MAX_FILES_PER_BATCH })}
            </p>
          </div>

          <input
            ref={addInputRef}
            type="file"
            accept={ACCEPT_ATTR}
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={replaceInputRef}
            type="file"
            accept={ACCEPT_ATTR}
            className="hidden"
            onChange={onReplaceChange}
          />
        </div>
      </section>

      {/* GALLERY + DROP ZONE */}
      <section className="border-b border-border">
        <div className="container-page py-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-display text-3xl sm:text-4xl">{t("customDesign.yourGallery")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {pics.length === 0
                  ? t("customDesign.noImagesYet")
                  : pics.length === 1
                    ? t("customDesign.imageSelected")
                    : t("customDesign.imagesSelected", { count: pics.length })}
              </p>
            </div>
            <button
              type="button"
              onClick={openPicker}
              className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2 text-xs uppercase tracking-widest hover:bg-accent"
            >
              <Plus className="h-4 w-4" /> {t("customDesign.addMore")}
            </button>
          </div>

          <div
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            className="mt-6 rounded-sm border border-dashed border-border bg-card/40 p-4"
          >
            {pics.length === 0 ? (
              <button
                type="button"
                onClick={openPicker}
                className="flex w-full flex-col items-center justify-center gap-2 px-6 py-16 text-center"
              >
                <Upload className="h-6 w-6 text-muted-foreground" />
                <div className="text-sm">
                  <span className="font-semibold">{t("customDesign.clickToAdd")}</span>{" "}
                  {t("customDesign.orDropHere")}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {t("customDesign.formats")}
                </div>
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {pics.map((p, i) => (
                  <div
                    key={p.id}
                    className="group relative overflow-hidden rounded-sm border border-border bg-muted"
                  >
                    <div className="w-full overflow-hidden bg-background">
                      <FramePreview
                        posterUrl={p.preview}
                        frameType={p.frameType}
                        color={p.color}
                        aspectClassName="aspect-[2/3]"
                        editSettings={{ rotate: p.rotate }}
                        loading="lazy"
                      />
                    </div>
                    <div className="absolute left-1 top-1 flex flex-col items-start gap-1">
                      <span className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-semibold">
                        #{i + 1}
                      </span>
                      <span className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        {formatSize(p.size)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePic(p.id)}
                      className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-foreground opacity-0 transition group-hover:opacity-100"
                      aria-label={t("customDesign.removeImage")}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    {p.frameType !== "wood" && (
                      <div className="absolute inset-x-0 top-8 flex justify-center gap-1">
                        {FRAME_COLORS.filter(
                          (c) => c.id !== "wood" && enabledVariants.includes(c.id),
                        ).map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setPicColor(p.id, c.id)}
                            className={cn(
                              "h-4 w-4 rounded-full border-2 transition",
                              p.color === c.id
                                ? "border-primary scale-110"
                                : "border-background/70 opacity-80 hover:opacity-100",
                            )}
                            style={{ background: c.swatch }}
                            aria-label={t("customDesign.setFrameColor", { label: formatColor(c.id) })}
                            title={formatColor(c.id)}
                          />
                        ))}
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-background/85 px-1 py-1 opacity-0 transition group-hover:opacity-100">
                      <IconAction onClick={() => setLightbox(p)} label={t("common.preview") }>
                        <Eye className="h-3.5 w-3.5" />
                      </IconAction>
                      <IconAction onClick={() => startReplace(p.id)} label={t("common.replace") }>
                        <RefreshCw className="h-3.5 w-3.5" />
                      </IconAction>
                      <IconAction onClick={() => setEditing(p)} label={t("common.edit") }>
                        <Pencil className="h-3.5 w-3.5" />
                      </IconAction>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {pics.length > 0 && (
            <p className="mt-3 text-center text-xs text-muted-foreground sm:text-sm">
              {t("customDesign.dontWorryPreview")}
            </p>
          )}

          {/* Privacy assurance — a core promise to our customers */}
          <div className="mx-auto mt-6 max-w-2xl rounded-sm border border-border bg-card p-5 text-center">
            <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-foreground">
              <ShieldCheck className="h-4 w-4" />
              {t("customDesign.privacyTitle")}
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {t("customDesign.privacyText")}
            </p>
          </div>
        </div>
      </section>

      {/* FRAME + ORDER */}
      <section>
        <div className="container-page py-12">
          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <h2 className="text-display text-3xl sm:text-4xl">{t("customDesign.frameOptions")}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("customDesign.defaultsDescription")}
              </p>

              <OptionBlock label={t("product.frameType")}>
                <div className="grid grid-cols-2 gap-2">
                  {FRAME_TYPES.map((f) => (
                    <Chip
                      key={f.id}
                      active={frameType === f.id}
                      onClick={() => handleFrameType(f.id)}
                    >
                      {formatFrame(f.id)}
                    </Chip>
                  ))}
                </div>
              </OptionBlock>

              <OptionBlock label={t("product.size")}>
                <div className="grid grid-cols-3 gap-2">
                  {availableSizes.map((s) => (
                    <Chip key={s.id} active={size === s.id} onClick={() => setSize(s.id)}>
                      {formatSize(s.id)}
                    </Chip>
                  ))}
                </div>
              </OptionBlock>
              <SizeGuide availableIds={availableSizes.map((s) => s.id)} />

              {frameType !== "wood" && (
                <OptionBlock label={t("product.frameColor")}>
                  <div className="flex flex-wrap gap-2">
                    {colorChoices.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleGlobalColor(c.id)}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-sm border px-3 py-2 text-xs uppercase tracking-widest transition",
                          color === c.id
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border text-muted-foreground hover:bg-accent",
                        )}
                      >
                        <span
                          className="inline-block h-4 w-4 rounded-sm border border-border"
                          style={{ background: c.swatch }}
                        />
                        {formatColor(c.id)}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                    {t("customDesign.tipColorDots")}
                  </p>
                </OptionBlock>
              )}
            </div>

            {/* Order summary + form */}
            <form onSubmit={submit} className="rounded-sm border border-border bg-card p-6 sm:p-8">
              {pics.length > 0 ? (
                <div className="border-b border-border pb-5">
                  <div className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">
                    {t("customDesign.liveTotal")}
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-display text-5xl">{total}</span>
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">
                      {t("egp")}
                    </span>
                  </div>
                  <div className="mt-4 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>
                        {t("customDesign.subtotalImages", { count: pics.length })}
                      </span>
                      <span className="text-foreground">{subtotal} {t("egp")}</span>
                    </div>
                    {appliedOffers.map((o) => (
                      <div
                        key={o.labelKey}
                        className="flex items-center justify-between font-semibold text-primary"
                      >
                        <span>
                          {t("customDesign.offerDiscount", {
                            label: t(`customDesign.${o.labelKey}`),
                            percent: o.percent,
                          })}
                        </span>
                        <span>-{o.amount} {t("egp")}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>{t("cart.shipping")}</span>
                      <span
                        className={
                          shipping === 0 ? "font-semibold text-primary" : "text-foreground"
                        }
                      >
                        {shipping === 0 ? t("cart.freeShipping") : `${shipping} ${t("egp")}`}
                      </span>
                    </div>
                    {packaging > 0 && (
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>{t("cart.packaging")}</span>
                        <span className="text-foreground">{packaging} {t("egp")}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold text-foreground">
                      <span>{t("cart.total")}</span>
                      <span>{total} {t("egp")}</span>
                    </div>
                  </div>
                  {appliedOffers.length === 0 && nextOffer && pics.length > 0 && (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {t("customDesign.nextOfferNudge", {
                        count: nextOffer.missing,
                        missing: nextOffer.missing,
                        size: formatSize(nextOffer.size),
                        percent: nextOffer.percent,
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="border-b border-border pb-5">
                  <p className="text-[11px] text-muted-foreground">
                    {t("customDesign.uploadToSeePricing")}
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || pics.length === 0}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-6 py-4 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> {t("customDesign.uploading", { progress })}
                  </>
                ) : (
                  <>
                    <ShoppingBag className="h-4 w-4" /> {t("customDesign.addToCart")}
                  </>
                )}
              </button>
              <p className="mt-3 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
                {t("customDesign.reviewCart")}
              </p>
              <Link
                to="/best-sellers"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-sm border border-border px-6 py-3 text-xs font-semibold uppercase tracking-widest text-foreground transition hover:bg-accent"
              >
                <Plus className="h-4 w-4" /> {t("customDesign.addReadyPosters")}
              </Link>
              <div className="mt-4 text-center">
                <Link
                  to="/"
                  className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                >
                  {isArabic ? "→" : "←"} {t("nav.home")}
                </Link>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox.preview}
            alt=""
            style={{ transform: `rotate(${lightbox.rotate}deg)` }}
            className="max-h-[90vh] max-w-[95vw] rounded-sm object-contain"
          />
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 rounded-full bg-background/90 p-2"
            aria-label={t("customDesign.closePreview")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full max-w-md rounded-sm border border-border bg-background p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-display text-2xl">{t("customDesign.editImage")}</h3>
              <button
                onClick={() => setEditing(null)}
                className="rounded-sm p-1.5 text-muted-foreground hover:text-foreground"
                aria-label={t("common.close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex aspect-square w-full items-center justify-center overflow-hidden rounded-sm bg-muted">
              <img
                src={editing.preview}
                alt=""
                style={{ transform: `rotate(${editing.rotate}deg)` }}
                className="max-h-full max-w-full object-contain transition-transform"
              />
            </div>
            <div className="mt-4">
              <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  {t("customDesign.frameTypeForImage")}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {FRAME_TYPES.map((f) => (
                  <Chip
                    key={f.id}
                    active={editing.frameType === f.id}
                    onClick={() => setPicFrameType(editing.id, f.id)}
                  >
                    {formatFrame(f.id)}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  {t("customDesign.sizeForImage")}
                </div>
                <div className="text-[11px] font-semibold text-primary">
                  {unitPriceFor(editing.frameType, editing.size)} {t("egp")}
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {SIZES.filter((s) => sizesForFrame(editing.frameType).includes(s.id)).map((s) => (
                  <Chip
                    key={s.id}
                    active={editing.size === s.id}
                    onClick={() => setPicSize(editing.id, s.id)}
                  >
                    {formatSize(s.id)}
                  </Chip>
                ))}
              </div>
            </div>
            {editing.frameType !== "wood" && (
              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  {t("customDesign.colorForImage")}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {FRAME_COLORS.filter(
                    (c) => c.id !== "wood" && enabledVariants.includes(c.id),
                  ).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setPicColor(editing.id, c.id)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-sm border px-3 py-2 text-xs uppercase tracking-widest transition",
                        editing.color === c.id
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:bg-accent",
                      )}
                    >
                      <span
                        className="inline-block h-4 w-4 rounded-sm border border-border"
                        style={{ background: c.swatch }}
                      />
                      {formatColor(c.id)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => rotatePic(editing.id)}
                className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
              >
                <RotateCw className="h-4 w-4" /> {t("customDesign.rotate90")}
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = editing.id;
                  setEditing(null);
                  startReplace(id);
                }}
                className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
              >
                <RefreshCw className="h-4 w-4" /> {t("common.replace")}
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = editing.id;
                  setEditing(null);
                  removePic(id);
                }}
                className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest text-destructive hover:bg-destructive/10"
              >
                <X className="h-4 w-4" /> {t("common.remove")}
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="ml-auto inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground"
              >
                {t("common.done")}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`.inp{width:100%;border-radius:.125rem;border:1px solid hsl(var(--border));background:hsl(var(--background));padding:.5rem .75rem;font-size:.875rem;outline:none}.inp:focus{border-color:hsl(var(--primary))}`}</style>
      <BeforeAfter location="custom-design" />
      <ProductInfoSections variant="all" />
    </div>
  );
}

function OptionBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{label}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-sm border px-3 py-2 text-xs uppercase tracking-widest transition",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function IconAction({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center rounded-sm bg-background px-2 py-1 text-foreground hover:bg-accent"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
