import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Upload, X, Loader2 } from "lucide-react";
import { uploadCustomerPhoto } from "@/lib/image-upload.functions";
import { createPhotoOrder } from "@/lib/db-orders.functions";
import { whatsappLink } from "@/lib/whatsapp";
import {
  useSiteSettings,
  computeShipping,
  usePricing,
  usePhotoPrintingMediaConfig,
  readPostOrderMessageEnabled,
  type PhotoPrintingBanner,
  type PhotoPrintingPageImage,
} from "@/lib/use-settings";
import { BeforeAfter } from "@/components/BeforeAfter";
import { ProductInfoSections } from "@/components/ProductInfoSections";

export const Route = createFileRoute("/photo-printing")({
  head: () => ({
    meta: [
      { title: "Photo Printing — BRWAZWNEON" },
      {
        name: "description",
        content:
          "Print your photos on premium FUJIFILM paper. 10x15, 13x18, 15x20 cm. Minimum 20 photos. Cash on delivery across Egypt.",
      },
      { property: "og:title", content: "Photo Printing — BRWAZWNEON" },
      {
        property: "og:description",
        content: "Premium FUJIFILM photo printing. Upload, calculate, order. Cash on delivery.",
      },
      { property: "og:url", content: "https://brwazwneon.com/photo-printing" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://brwazwneon.com/photo-printing" }],
  }),
  component: PhotoPrintingPage,
});

type PhotoSizeId = "10x15" | "13x18" | "15x20";
const SIZE_LABELS: Record<PhotoSizeId, string> = {
  "10x15": "10 × 15 cm",
  "13x18": "13 × 18 cm",
  "15x20": "15 × 20 cm",
};

const MIN_QTY = 20;

const GOVERNORATES = [
  "Cairo",
  "Giza",
  "Alexandria",
  "Qalyubia",
  "Sharqia",
  "Dakahlia",
  "Beheira",
  "Gharbia",
  "Monufia",
  "Kafr El Sheikh",
  "Damietta",
  "Port Said",
  "Ismailia",
  "Suez",
  "Faiyum",
  "Beni Suef",
  "Minya",
  "Asyut",
  "Sohag",
  "Qena",
  "Luxor",
  "Aswan",
  "Red Sea",
  "New Valley",
  "Matrouh",
  "North Sinai",
  "South Sinai",
];

type Pic = { id: string; file: File; preview: string };

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function PhotoPrintingPage() {
  const { t } = useTranslation();
  const pricing = usePricing();
  const SIZES = (["10x15", "13x18", "15x20"] as const).map((id) => ({
    id,
    label: SIZE_LABELS[id],
    price: pricing.photo[id],
  }));
  const [sizeId, setSizeId] = useState<PhotoSizeId>("10x15");
  const [pics, setPics] = useState<Pic[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  const size = SIZES.find((s) => s.id === sizeId)!;
  const qty = pics.length;
  const subtotal = qty * size.price;
  const settings = useSiteSettings();
  const media = usePhotoPrintingMediaConfig();
  const banners = useMemo(
    () =>
      media.banners.filter(
        (banner) => banner.enabled && (banner.desktopImageUrl || banner.mobileImageUrl),
      ),
    [media.banners],
  );
  const pageImages = useMemo(
    () => media.images.filter((image) => image.enabled && image.imageUrl),
    [media.images],
  );
  const shipping = computeShipping(subtotal, settings);
  const total = subtotal + shipping;
  const remaining = Math.max(0, MIN_QTY - qty);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const next: Pic[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      next.push({ id: crypto.randomUUID(), file: f, preview: URL.createObjectURL(f) });
    }
    setPics((prev) => [...prev, ...next]);
  };

  const removePic = (id: string) => {
    setPics((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((p) => p.id !== id);
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (qty < MIN_QTY) return toast.error(t("photoPrinting.minOrderError", { min: MIN_QTY }));
    if (!name.trim() || !phone.trim() || !governorate || !address.trim())
      return toast.error(t("cart.fillDeliveryFields"));
    if (!/^01\d{9}$/.test(phone.trim()))
      return toast.error("رقم الموبايل لازم يكون 11 رقم ويبدأ بـ 01");

    setSubmitting(true);
    setProgress(0);
    try {
      const urls: string[] = new Array(pics.length);
      const CONCURRENCY = 5;
      let done = 0;
      let cursor = 0;
      const all = pics;

      const worker = async () => {
        while (cursor < all.length) {
          const i = cursor++;
          const p = all[i];
          const dataUrl = await fileToDataUrl(p.file);
          const uploaded = await uploadCustomerPhoto({
            data: { dataUrl, filename: p.file.name, folder: "photo-printing" },
          });
          urls[i] = uploaded.url;
          done++;
          setProgress(Math.round((done / all.length) * 100));
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, all.length) }, worker));

      const result = await createPhotoOrder({
        data: {
          customer_name: name.trim(),
          phone: phone.trim(),
          governorate,
          address: address.trim(),
          size_id: sizeId,
          size_label: size.label,
          quantity: qty,
          photo_urls: urls,
        },
      });
      const orderId = result.order.id;
      try {
        const { gaEvent } = await import("@/lib/ga4");
        gaEvent("photo_printing", {
          currency: "EGP",
          value: total,
          quantity: qty,
          size: size.label,
          unit_price: size.price,
        });
        const { enqueueEvent } = await import("@/lib/meta-pixel");
        enqueueEvent(
          "PhotoPrintingCustomer",
          {
            currency: "EGP",
            value: total,
            quantity: qty,
            size: size.label,
            order_id: orderId,
          },
          { phone: phone.trim(), city: governorate, country: "EG" },
        );
      } catch {
        /* noop */
      }

      const msg = [
        "New Photo Printing order",
        `Order ${result.order.order_number}`,
        `Name: ${name}`,
        `Phone: ${phone}`,
        `Governorate: ${governorate}`,
        `Address: ${address}`,
        `Size: ${size.label}`,
        `Quantity: ${qty}`,
        `Total: ${total} EGP (Cash on delivery)`,
      ].join("\n");
      window.location.href = whatsappLink(msg);

      if (await readPostOrderMessageEnabled().catch(() => true)) {
        toast.success(t("photoPrinting.orderSubmitted"));
      }
      setPics([]);
      setName("");
      setPhone("");
      setGovernorate("");
      setAddress("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("photoPrinting.submissionFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-background text-foreground">
      {/* HERO */}
      <section className="border-b border-border bg-card">
        <div className="container-page py-16 sm:py-20">
          <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
            {t("photoPrinting.premiumFujiQuality")}
          </p>
          <h1 className="text-display mt-3 text-5xl sm:text-7xl">{t("photoPrinting.title")}</h1>
          <p className="mt-4 max-w-xl text-muted-foreground">{t("photoPrinting.description")}</p>
          <p className="mt-4 text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            {t("photoPrinting.shippingInfo", {
              fee: settings.shippingFee,
              free: settings.freeShippingThreshold,
            })}
          </p>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground sm:text-xs">
            {[
              t("photoPrinting.premiumFujiQuality"),
              t("photoPrinting.multipleUpload"),
              t("photoPrinting.highResolution"),
              t("photoPrinting.livePriceCalc"),
              t("nav.cashOnDelivery"),
            ].map((f) => (
              <li key={f} className="flex items-center gap-2">
                <span className="text-foreground">✓</span> {f}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <PhotoPrintingBannerRail banners={banners} />

      {/* PRICING */}
      <section className="border-b border-border">
        <div className="container-page py-14">
          <h2 className="text-display text-3xl sm:text-4xl">{t("photoPrinting.pricing")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("photoPrinting.minimumOrder", { qty: MIN_QTY })}
          </p>
          <div className="mt-8 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-3">
            {SIZES.map((s) => {
              const active = s.id === sizeId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSizeId(s.id)}
                  className={`bg-background p-8 text-left transition ${
                    active ? "ring-2 ring-inset ring-primary" : "hover:bg-card"
                  }`}
                >
                  <div className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">
                    {active ? t("photoPrinting.selected") : t("photoPrinting.choose")}
                  </div>
                  <div className="text-display mt-3 text-3xl">{s.label}</div>
                  <div className="mt-4 flex items-end gap-2">
                    <span className="text-display text-4xl">{s.price}</span>
                    <span className="pb-1 text-xs uppercase tracking-widest text-muted-foreground">
                      {t("photoPrinting.perPhoto")}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <PhotoPrintingImagesSection images={pageImages} />

      {/* UPLOAD + ORDER */}
      <section>
        <div className="container-page py-14">
          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
            {/* Uploader */}
            <div>
              <h2 className="text-display text-3xl sm:text-4xl">
                {t("photoPrinting.uploadYourPhotos")}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("photoPrinting.addAsMany", { qty: MIN_QTY })}
              </p>

              <label
                htmlFor="photo-files"
                className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-sm border border-dashed border-border bg-card px-6 py-12 text-center transition hover:bg-accent"
              >
                <Upload className="h-6 w-6 text-muted-foreground" />
                <div className="mt-3 text-sm">
                  <span className="font-semibold">{t("photoPrinting.clickToAdd")}</span>{" "}
                  {t("photoPrinting.orDropHere")}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                  {t("photoPrinting.formats")}
                </div>
                <input
                  id="photo-files"
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />
              </label>

              {pics.length > 0 && (
                <div className="mt-6">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm">
                      {t("photoPrinting.photosReady", { count: pics.length })}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        pics.forEach((p) => URL.revokeObjectURL(p.preview));
                        setPics([]);
                      }}
                      className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                    >
                      {t("common.clearAll")}
                    </button>
                  </div>
                  <div className="grid max-h-[480px] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 md:grid-cols-5">
                    {pics.map((p) => (
                      <div
                        key={p.id}
                        className="group relative aspect-square overflow-hidden rounded-sm border border-border bg-muted"
                      >
                        <img
                          src={p.preview}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                        <button
                          type="button"
                          onClick={() => removePic(p.id)}
                          className="absolute right-1 top-1 rounded-full bg-background/90 p-1 opacity-0 transition group-hover:opacity-100"
                          aria-label={t("photoPrinting.removePhoto")}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Order summary + form */}
            <form onSubmit={submit} className="rounded-sm border border-border bg-card p-6 sm:p-8">
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
                <div className="mt-2 text-xs text-muted-foreground">
                  {t("photoPrinting.perLabel", { qty, size: size.label, price: size.price })}
                </div>
                {remaining > 0 && (
                  <div className="mt-3 rounded-sm bg-background px-3 py-2 text-[11px] text-muted-foreground">
                    {t("photoPrinting.addMoreToReachMin", { count: remaining, min: MIN_QTY })}
                  </div>
                )}
              </div>

              <div className="mt-5 space-y-3">
                <Field label={t("photoPrinting.fullName")}>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </Field>
                <Field label={t("photoPrinting.phoneNumber")}>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    required
                    inputMode="tel"
                    maxLength={11}
                    placeholder="01xxxxxxxxx"
                    className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  {phone.length > 0 && !/^01\d{9}$/.test(phone) && (
                    <span className="mt-1 block text-[11px] text-destructive">
                      رقم الموبايل لازم يكون 11 رقم ويبدأ بـ 01
                    </span>
                  )}
                </Field>
                <Field label={t("checkout.governorate")}>
                  <select
                    value={governorate}
                    onChange={(e) => setGovernorate(e.target.value)}
                    required
                    className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  >
                    <option value="">{t("photoPrinting.select")}</option>
                    {GOVERNORATES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("checkout.address")}>
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    required
                    rows={3}
                    className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </Field>
              </div>

              <button
                type="submit"
                disabled={submitting || qty < MIN_QTY}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-6 py-4 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("customDesign.uploading", { progress })}
                  </>
                ) : (
                  <>{t("photoPrinting.placeOrderCod")}</>
                )}
              </button>
              <p className="mt-3 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
                {t("photoPrinting.confirmOnWhatsapp")}
              </p>
              <div className="mt-4 text-center">
                <Link
                  to="/"
                  className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                >
                  {t("photoPrinting.backToHome")}
                </Link>
              </div>
            </form>
          </div>
        </div>
      </section>
      <BeforeAfter location="photo-printing" />
      <ProductInfoSections variant="photo" />
    </div>
  );
}

function PhotoPrintingBannerRail({ banners }: { banners: PhotoPrintingBanner[] }) {
  if (banners.length === 0) return null;
  return (
    <section className="border-b border-border bg-background">
      <div className="container-page py-8 sm:py-10">
        <div className="space-y-4">
          {banners.map((banner) => (
            <PhotoPrintingBannerCard key={banner.id} banner={banner} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PhotoPrintingBannerCard({ banner }: { banner: PhotoPrintingBanner }) {
  const { t } = useTranslation();
  const desktop = banner.desktopImageUrl || banner.mobileImageUrl;
  const mobile = banner.mobileImageUrl || banner.desktopImageUrl;
  const image = (
    <picture>
      {mobile && <source media="(max-width: 640px)" srcSet={mobile} />}
      <img
        src={desktop}
        alt={banner.altText || banner.title || t("photoPrinting.bannerAlt")}
        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.015]"
        loading="lazy"
        decoding="async"
        sizes="(max-width: 640px) 100vw, min(1120px, 100vw)"
      />
    </picture>
  );
  const content = (
    <div className="group relative isolate aspect-[16/9] overflow-hidden rounded-sm border border-border bg-card shadow-[0_24px_70px_rgba(0,0,0,0.18)] sm:aspect-[21/7]">
      {image}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.34),rgba(0,0,0,0.04)_48%,rgba(255,255,255,0.08))]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background/35 to-transparent" />
    </div>
  );
  if (!banner.linkUrl) return content;
  return (
    <a
      href={banner.linkUrl}
      className="block outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {content}
    </a>
  );
}

function PhotoPrintingImagesSection({ images }: { images: PhotoPrintingPageImage[] }) {
  const { t } = useTranslation();
  if (images.length === 0) return null;
  const primary = images.find((image) => image.isPrimary) ?? images[0];
  const secondary = images.filter((image) => image.id !== primary.id);
  return (
    <section className="border-b border-border bg-card/40">
      <div className="container-page py-14">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <figure className="overflow-hidden rounded-sm border border-border bg-background">
            <img
              src={primary.imageUrl}
              alt={primary.altText || primary.title || t("photoPrinting.primaryImageAlt")}
              className="aspect-[4/3] h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              sizes="(max-width: 1024px) 100vw, 58vw"
            />
            {(primary.title || primary.description) && (
              <figcaption className="border-t border-border p-5">
                {primary.title && <h2 className="text-display text-3xl">{primary.title}</h2>}
                {primary.description && (
                  <p className="mt-2 text-sm text-muted-foreground">{primary.description}</p>
                )}
              </figcaption>
            )}
          </figure>

          {secondary.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {secondary.map((image) => (
                <figure
                  key={image.id}
                  className="overflow-hidden rounded-sm border border-border bg-background"
                >
                  <img
                    src={image.imageUrl}
                    alt={image.altText || image.title || t("photoPrinting.secondaryImageAlt")}
                    className="aspect-square h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                    sizes="(max-width: 1024px) 50vw, 20vw"
                  />
                  {image.title && (
                    <figcaption className="border-t border-border px-3 py-2 text-xs font-semibold">
                      {image.title}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
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
