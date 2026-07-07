import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, X, Loader2, Plus, Pencil, RefreshCw, Eye, RotateCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { whatsappLink } from "@/lib/whatsapp";
import { BeforeAfter } from "@/components/BeforeAfter";
import { ProductInfoSections } from "@/components/ProductInfoSections";
import { SizeGuide } from "@/components/SizeGuide";
import { FramePreview } from "@/components/FramePreview";
// Custom-design uses its own size-gated offers, not the generic bundle tiers.

const PACKAGING_FEE = 20;

// Only these exact combos get a discount — no random bundle discounts.
const CUSTOM_OFFERS = [
  { size: "30x40" as SizeId, minQty: 4, percent: 15, label: "4 posters at 30×40" },
  { size: "20x30" as SizeId, minQty: 6, percent: 15, label: "6 posters at 20×30" },
];

function customOfferFor(size: SizeId, qty: number) {
  return CUSTOM_OFFERS.find((o) => o.size === size && qty >= o.minQty) ?? null;
}

function nextCustomOffer(size: SizeId, qty: number) {
  const match = CUSTOM_OFFERS.find((o) => o.size === size && qty < o.minQty);
  return match ? { ...match, missing: match.minQty - qty } : null;
}
import {
  useSiteSettings,
  computeShipping,
  usePricing,
  priceForFrame,
} from "@/lib/use-settings";
import {
  FRAME_TYPES,
  FRAME_COLORS,
  SIZES,
  sizesForFrame,
  type FrameTypeId,
  type SizeId,
  type FrameColorId,
  labelForFrame,
  labelForSize,
  labelForColor,
} from "@/lib/poster-options";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/custom-design")({
  head: () => ({
    meta: [
      { title: "Custom Design — BRWAZWNEON" },
      {
        name: "description",
        content:
          "Upload your own photos and we'll professionally enhance them, then print and frame them with premium quality.",
      },
      { property: "og:title", content: "Custom Design — BRWAZWNEON" },
      {
        property: "og:description",
        content:
          "Upload your photos, choose a frame, and we deliver. Cash on delivery across Egypt.",
      },
    ],
  }),
  component: CustomDesignPage,
});

const MAX_FILES_PER_BATCH = 20;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ACCEPTED_EXT = ["jpg", "jpeg", "png", "webp", "heic", "heif"];
const ACCEPT_ATTR =
  "image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

const GOVERNORATES = [
  "Cairo", "Giza", "Alexandria", "Qalyubia", "Sharqia", "Dakahlia",
  "Beheira", "Gharbia", "Monufia", "Kafr El Sheikh", "Damietta",
  "Port Said", "Ismailia", "Suez", "Faiyum", "Beni Suef", "Minya",
  "Asyut", "Sohag", "Qena", "Luxor", "Aswan", "Red Sea", "New Valley",
  "Matrouh", "North Sinai", "South Sinai",
];

type Pic = {
  id: string;
  file: File;
  preview: string;
  rotate: number;
  color: FrameColorId;
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
  const pricing = usePricing();
  const settings = useSiteSettings();

  const [pics, setPics] = useState<Pic[]>([]);
  const [frameType, setFrameType] = useState<FrameTypeId>("pvc");
  const [size, setSize] = useState<SizeId>("30x40");
  const [color, setColor] = useState<FrameColorId>("black");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
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
      setPics((prev) => prev.map((p) => ({ ...p, color: "wood" })));
    } else if (color === "wood") {
      setColor("black");
      setPics((prev) => prev.map((p) => ({ ...p, color: p.color === "wood" ? "black" : p.color })));
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

  const availableSizes = useMemo(
    () => SIZES.filter((s) => sizesForFrame(frameType).includes(s.id)),
    [frameType],
  );

  const unit = useMemo(
    () => priceForFrame(pricing, frameType, size) + pricing.customDesignFee,
    [pricing, frameType, size],
  );
  const subtotal = unit * pics.length;
  const shipping = computeShipping(subtotal, settings);
  const packaging = pics.length > 0 ? PACKAGING_FEE : 0;
  const offer = useMemo(() => customOfferFor(size, pics.length), [size, pics.length]);
  const discountAmount = offer ? Math.round((subtotal * offer.percent) / 100) : 0;
  const nextOffer = useMemo(() => nextCustomOffer(size, pics.length), [size, pics.length]);
  const total = Math.max(0, subtotal - discountAmount) + shipping + packaging;

  const openPicker = () => addInputRef.current?.click();

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const incoming = Array.from(files);
    const accepted: Pic[] = [];
    let rejectedType = 0;
    let rejectedSize = 0;
    for (const f of incoming) {
      if (accepted.length >= MAX_FILES_PER_BATCH) break;
      if (!isAcceptedFile(f)) { rejectedType++; continue; }
      if (f.size > MAX_FILE_BYTES) { rejectedSize++; continue; }
      accepted.push({
        id: crypto.randomUUID(),
        file: f,
        preview: URL.createObjectURL(f),
        rotate: 0,
        color: frameType === "wood" ? "wood" : color,
      });
    }
    if (incoming.length > MAX_FILES_PER_BATCH) {
      toast.message(`You can add up to ${MAX_FILES_PER_BATCH} images per upload — extra files skipped.`);
    }
    if (rejectedType) toast.error(`${rejectedType} file(s) skipped — unsupported format.`);
    if (rejectedSize) toast.error(`${rejectedSize} file(s) skipped — over 25 MB.`);
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
    if (!isAcceptedFile(f)) return toast.error("Unsupported format.");
    if (f.size > MAX_FILE_BYTES) return toast.error("File too large (max 25 MB).");
    setPics((prev) =>
      prev.map((p) => {
        if (p.id !== targetId) return p;
        URL.revokeObjectURL(p.preview);
        return { ...p, file: f, preview: URL.createObjectURL(f), rotate: 0 };
      }),
    );
  };

  const rotatePic = (id: string) => {
    setPics((prev) =>
      prev.map((p) => (p.id === id ? { ...p, rotate: (p.rotate + 90) % 360 } : p)),
    );
    setEditing((cur) =>
      cur && cur.id === id ? { ...cur, rotate: (cur.rotate + 90) % 360 } : cur,
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pics.length === 0) return toast.error("Please add at least one image");
    if (!name.trim() || !phone.trim() || !governorate || !address.trim())
      return toast.error("Please fill in all delivery details");

    setSubmitting(true);
    setProgress(0);
    try {
      const orderId = crypto.randomUUID();
      const uploaded: { path: string; index: number }[] = [];
      const CONCURRENCY = 4;
      let cursor = 0;
      let done = 0;
      const total = pics.length;

      const worker = async () => {
        while (cursor < total) {
          const i = cursor++;
          const p = pics[i];
          const ext = (p.file.name.split(".").pop() ?? "jpg").toLowerCase();
          const path = `${orderId}/${String(i).padStart(3, "0")}-${crypto.randomUUID()}.${ext}`;
          const { error } = await supabase.storage
            .from("custom-designs")
            .upload(path, p.file, {
              contentType: p.file.type || "application/octet-stream",
              upsert: false,
            });
          if (error) throw error;
          uploaded.push({ path, index: i });
          done++;
          setProgress(Math.round((done / total) * 100));
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, total) }, worker),
      );

      uploaded.sort((a, b) => a.index - b.index);
      const imagePaths = uploaded.map((u) => u.path);

      const orderNotes = [
        notes.trim(),
        pics.some((p) => p.rotate)
          ? `Image rotations: ${pics.map((p, i) => `#${i + 1}=${p.rotate}°`).filter((_, i) => pics[i].rotate).join(", ")}`
          : "",
        `Frame colors per image: ${pics.map((p, i) => `#${i + 1}=${labelForColor(p.color)}`).join(", ")}`,
        bundle.tier ? `Bundle discount: ${bundle.tier.percent}% (-${bundle.amount} EGP)` : "",
      ].filter(Boolean).join("\n");

      // Summarise per-image frame colors into a single field for the order row.
      const colorCounts = pics.reduce<Record<string, number>>((acc, p) => {
        acc[p.color] = (acc[p.color] ?? 0) + 1;
        return acc;
      }, {});
      const colorKeys = Object.keys(colorCounts);
      const frameColorSummary =
        colorKeys.length === 1
          ? labelForColor(colorKeys[0] as FrameColorId)
          : `Mixed: ${colorKeys
              .map((k) => `${labelForColor(k as FrameColorId)}×${colorCounts[k]}`)
              .join(", ")}`;

      const { data: inserted, error: insErr } = await supabase
        .from("custom_design_orders")
        .insert({
          id: orderId,
          customer_name: name.trim(),
          phone: phone.trim(),
          governorate,
          address: address.trim(),
          frame_type: labelForFrame(frameType),
          frame_color: frameColorSummary,
          size: labelForSize(size),
          quantity: pics.length,
          image_paths: imagePaths,
          image_urls: imagePaths, // signed on demand in admin
          unit_price: unit,
          subtotal,
          shipping_cost: shipping,
          total_price: total,
          notes: orderNotes || null,
        })
        .select("order_number")
        .single();
      if (insErr) throw insErr;
      try {
        const { gaEvent } = await import("@/lib/ga4");
        gaEvent("custom_design", {
          currency: "EGP",
          value: total,
          quantity: pics.length,
          frame_type: labelForFrame(frameType),
          size: labelForSize(size),
          frame_color: labelForColor(color),
        });
        const { enqueueEvent } = await import("@/lib/meta-pixel");
        enqueueEvent("CustomDesignCustomer", {
          currency: "EGP",
          value: total,
          quantity: pics.length,
          frame_type: labelForFrame(frameType),
          size: labelForSize(size),
          order_id: orderId,
        }, { phone: phone.trim(), city: governorate, country: "EG" });
      } catch { /* noop */ }

      const orderNumber = inserted?.order_number ?? orderId.slice(0, 8);
      const msg = [
        "New Custom Design order",
        `Order #${orderNumber}`,
        `Name: ${name}`,
        `Phone: ${phone}`,
        `Governorate: ${governorate}`,
        `Address: ${address}`,
        `Frame: ${labelForFrame(frameType)} · ${labelForSize(size)} · ${frameColorSummary}`,
        `Images: ${pics.length}`,
        bundle.tier ? `Bundle discount: ${bundle.tier.percent}% (-${bundle.amount} EGP)` : "",
        `Total: ${total} EGP (Cash on delivery)`,
      ].filter(Boolean).join("\n");
      window.location.href = whatsappLink(msg);

      toast.success("Order submitted! Opening WhatsApp…");
      pics.forEach((p) => URL.revokeObjectURL(p.preview));
      setPics([]);
      setName(""); setPhone(""); setGovernorate(""); setAddress(""); setNotes("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const colorChoices = frameType === "wood"
    ? FRAME_COLORS.filter((c) => c.id === "wood")
    : FRAME_COLORS.filter((c) => c.id !== "wood");

  return (
    <div className="bg-background text-foreground">
      {/* HERO */}
      <section className="border-b border-border bg-card">
        <div className="container-page py-14 sm:py-20">
          <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
            Your Photos · Our Craft
          </p>
          <h1 className="text-display mt-3 text-5xl sm:text-7xl">Custom Design</h1>
          <p className="mt-4 max-w-xl text-muted-foreground">
            Upload your own photos. We professionally enhance every image before
            printing on premium frames and delivering to your door.
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
                Add Images
              </button>
              <Link
                to="/best-sellers"
                className="inline-flex items-center justify-center gap-3 rounded-sm border border-border px-8 py-5 text-sm font-semibold uppercase tracking-[0.25em] text-foreground transition hover:bg-accent"
              >
                Browse Posters
              </Link>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Our designer will professionally enhance your photos before printing
              to ensure the highest possible quality.
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Want ready-made designs too? Browse our shop and add posters to your cart alongside this order.
            </p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
              Up to {MAX_FILES_PER_BATCH} images per upload · Max 25 MB each · JPG, PNG, WEBP, HEIC
            </p>
          </div>

          <input
            ref={addInputRef}
            type="file"
            accept={ACCEPT_ATTR}
            multiple
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
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
              <h2 className="text-display text-3xl sm:text-4xl">Your Gallery</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {pics.length === 0
                  ? "No images yet — tap Add Images to get started."
                  : `${pics.length} Image${pics.length === 1 ? "" : "s"} Selected`}
              </p>
            </div>
            <button
              type="button"
              onClick={openPicker}
              className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2 text-xs uppercase tracking-widest hover:bg-accent"
            >
              <Plus className="h-4 w-4" /> Add More
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
                  <span className="font-semibold">Click to add photos</span> or drop them here
                </div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  JPG · PNG · WEBP · HEIC
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
                        frameType={frameType}
                        color={p.color}
                        aspectClassName="aspect-[2/3]"
                        editSettings={{ rotate: p.rotate }}
                        loading="lazy"
                      />
                    </div>
                    <div className="absolute left-1 top-1 rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-semibold">
                      #{i + 1}
                    </div>
                    <button
                      type="button"
                      onClick={() => removePic(p.id)}
                      className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-foreground opacity-0 transition group-hover:opacity-100"
                      aria-label="Remove image"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    {frameType !== "wood" && (
                      <div className="absolute inset-x-0 top-8 flex justify-center gap-1">
                        {FRAME_COLORS.filter((c) => c.id !== "wood").map((c) => (
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
                            aria-label={`Set frame color to ${c.label}`}
                            title={c.label}
                          />
                        ))}
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-background/85 px-1 py-1 opacity-0 transition group-hover:opacity-100">
                      <IconAction onClick={() => setLightbox(p)} label="Preview">
                        <Eye className="h-3.5 w-3.5" />
                      </IconAction>
                      <IconAction onClick={() => startReplace(p.id)} label="Replace">
                        <RefreshCw className="h-3.5 w-3.5" />
                      </IconAction>
                      <IconAction onClick={() => setEditing(p)} label="Edit">
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
              Don't worry if the preview isn't perfectly aligned — our designer fine-tunes every image by hand before printing.
            </p>
          )}
        </div>
      </section>

      {/* FRAME + ORDER */}
      <section>
        <div className="container-page py-12">
          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <h2 className="text-display text-3xl sm:text-4xl">Frame Options</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Every image will be printed using these settings.
              </p>

              <OptionBlock label="Frame Type">
                <div className="grid grid-cols-2 gap-2">
                  {FRAME_TYPES.map((f) => (
                    <Chip key={f.id} active={frameType === f.id} onClick={() => handleFrameType(f.id)}>
                      {f.label}
                    </Chip>
                  ))}
                </div>
              </OptionBlock>

              <OptionBlock label="Size">
                <div className="grid grid-cols-3 gap-2">
                  {availableSizes.map((s) => (
                    <Chip key={s.id} active={size === s.id} onClick={() => setSize(s.id)}>
                      {s.label}
                    </Chip>
                  ))}
                </div>
              </OptionBlock>
              <SizeGuide availableIds={availableSizes.map((s) => s.id)} />

              {frameType !== "wood" && (
                <OptionBlock label="Frame Color">
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
                        <span className="inline-block h-4 w-4 rounded-sm border border-border" style={{ background: c.swatch }} />
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                    Tip: tap the color dots on each image to pick a different frame per photo.
                  </p>
                </OptionBlock>
              )}
            </div>

            {/* Order summary + form */}
            <form
              onSubmit={submit}
              className="rounded-sm border border-border bg-card p-6 sm:p-8"
            >
              <div className="border-b border-border pb-5">
                <div className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">Live total</div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-display text-5xl">{total}</span>
                  <span className="text-xs uppercase tracking-widest text-muted-foreground">EGP</span>
                </div>
                <div className="mt-4 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Subtotal ({pics.length} × {unit} EGP)</span>
                    <span className="text-foreground">{subtotal} EGP</span>
                  </div>
                  {bundle.tier && (
                    <div className="flex items-center justify-between font-semibold text-primary">
                      <span>Bundle discount ({bundle.tier.percent}% off)</span>
                      <span>-{bundle.amount} EGP</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Shipping</span>
                    <span className={shipping === 0 ? "font-semibold text-primary" : "text-foreground"}>
                      {shipping === 0 ? "Free" : `${shipping} EGP`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold text-foreground">
                    <span>Total</span>
                    <span>{total} EGP</span>
                  </div>
                </div>
                {!bundle.tier && nextBundle && pics.length > 0 && (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Add {nextBundle.minPosters - pics.length} more image
                    {nextBundle.minPosters - pics.length === 1 ? "" : "s"} for {nextBundle.percent}% off
                  </div>
                )}
              </div>

              <div className="mt-5 space-y-3">
                <Field label="Full name">
                  <input value={name} onChange={(e) => setName(e.target.value)} required className="inp" />
                </Field>
                <Field label="Phone number">
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" className="inp" />
                </Field>
                <Field label="Governorate">
                  <select value={governorate} onChange={(e) => setGovernorate(e.target.value)} required className="inp">
                    <option value="">Select…</option>
                    {GOVERNORATES.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </Field>
                <Field label="Address">
                  <textarea value={address} onChange={(e) => setAddress(e.target.value)} required rows={3} className="inp" />
                </Field>
                <Field label="Notes (optional)">
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="inp" placeholder="Anything our designer should know" />
                </Field>
              </div>

              <button
                type="submit"
                disabled={submitting || pics.length === 0}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-6 py-4 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Uploading {progress}%</>
                ) : (
                  <>Place order · Cash on delivery</>
                )}
              </button>
              <p className="mt-3 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
                We'll confirm your order on WhatsApp
              </p>
              <Link
                to="/best-sellers"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-sm border border-border px-6 py-3 text-xs font-semibold uppercase tracking-widest text-foreground transition hover:bg-accent"
              >
                <Plus className="h-4 w-4" /> Add ready-made posters
              </Link>
              <div className="mt-4 text-center">
                <Link to="/" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
                  ← Back to home
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
            aria-label="Close preview"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setEditing(null)}>
          <div
            className="w-full max-w-md rounded-sm border border-border bg-background p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-display text-2xl">Edit image</h3>
              <button onClick={() => setEditing(null)} className="rounded-sm p-1.5 text-muted-foreground hover:text-foreground" aria-label="Close">
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
            {frameType !== "wood" && (
              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  Frame color for this image
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {FRAME_COLORS.filter((c) => c.id !== "wood").map((c) => (
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
                      <span className="inline-block h-4 w-4 rounded-sm border border-border" style={{ background: c.swatch }} />
                      {c.label}
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
                <RotateCw className="h-4 w-4" /> Rotate 90°
              </button>
              <button
                type="button"
                onClick={() => { const id = editing.id; setEditing(null); startReplace(id); }}
                className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest hover:bg-accent"
              >
                <RefreshCw className="h-4 w-4" /> Replace
              </button>
              <button
                type="button"
                onClick={() => { const id = editing.id; setEditing(null); removePic(id); }}
                className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-xs uppercase tracking-widest text-destructive hover:bg-destructive/10"
              >
                <X className="h-4 w-4" /> Remove
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="ml-auto inline-flex items-center gap-2 rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground"
              >
                Done
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
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