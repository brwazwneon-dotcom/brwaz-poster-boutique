import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import i18n from "@/lib/i18n";
import {
  Upload,
  X,
  Loader2,
  Sparkles,
  Palette,
  ScanFace,
  Focus,
  Printer,
  Shirt,
  Check,
  Camera,
  Eye,
  Package,
  Truck,
  BadgeCheck,
  Images,
  Ruler,
  CheckCircle2,
  ChevronDown,
  Crop,
} from "lucide-react";
import { uploadCustomerPhoto } from "@/lib/image-upload.functions";
import { PosterImageEditor } from "@/components/admin/PosterImageEditor";
import {
  renderEditToBlob,
  isDefaultEdit,
  loadImage as loadImageForEdit,
  type EditSettings,
} from "@/lib/poster-edit";
import { createPhoto4x6Order } from "@/lib/db-orders.functions";
import { whatsappLink } from "@/lib/whatsapp";
import {
  useSiteSettings,
  computeShipping,
  usePhoto4x6Config,
  usePricing,
  usePhotoPrintingMediaConfig,
  usePhotoAlbumsPublic,
  readPostOrderMessageEnabled,
  type Photo4x6Package,
  type PhotoPrintingBanner,
  type PhotoPrintingPageImage,
} from "@/lib/use-settings";
import { Slider as BeforeAfterSlider, BeforeAfter } from "@/components/BeforeAfter";
import { ProductInfoSections } from "@/components/ProductInfoSections";
import { enhancePhoto, type PhotoAiAction } from "@/lib/photo-ai.functions";
import {
  usePhotoPrintingContent,
  normalizePhotoPrintingContent,
  DEFAULT_PHOTO_PRINTING_CONTENT,
  PHOTO_PRINTING_CONTENT_KEY,
} from "@/lib/photo-printing-content";
import { getSiteSettingsPublic } from "@/lib/db-public.functions";
import { CustomerReviews } from "@/components/CustomerReviews";
import { trackCustom } from "@/lib/meta-pixel";

const BASE_URL = "https://brwazwneon.com";

export const Route = createFileRoute("/photo-printing")({
  validateSearch: (s: Record<string, unknown>): { from?: string } => ({
    from: typeof s.from === "string" ? s.from : undefined,
  }),
  loader: async () => {
    // Fetched server-side only so the FAQ structured-data block below can
    // mirror the admin-edited FAQ text exactly, instead of the static
    // defaults going stale the moment someone edits the FAQ from the
    // dashboard. The page itself still reads FAQ content client-side via
    // usePhotoPrintingContent() like every other section on this route.
    const settings = await getSiteSettingsPublic({ data: { keys: [PHOTO_PRINTING_CONTENT_KEY] } });
    return { content: normalizePhotoPrintingContent(settings[PHOTO_PRINTING_CONTENT_KEY]) };
  },
  head: ({ loaderData }) => {
    const title = "Photo Printing — Professional Photo Prints in Egypt | BRWAZWNEON";
    const description =
      "Professional photo printing in Egypt. Upload your photos, choose a size, and get premium-quality prints on original FUJIFILM paper — reviewed before printing, cash on delivery nationwide.";
    const url = `${BASE_URL}/photo-printing`;
    const faqItems = (loaderData?.content ?? DEFAULT_PHOTO_PRINTING_CONTENT).faq.items.filter(
      (f) => f.enabled,
    );
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Service",
                "@id": `${url}#service`,
                name: "Photo Printing",
                serviceType: "Photo printing service",
                provider: { "@type": "Organization", name: "BRWAZWNEON", url: BASE_URL },
                areaServed: { "@type": "Country", name: "Egypt" },
                url,
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "Home", item: BASE_URL },
                  { "@type": "ListItem", position: 2, name: "Photo Printing", item: url },
                ],
              },
              ...(faqItems.length > 0
                ? [
                    {
                      "@type": "FAQPage",
                      "@id": `${url}#faq`,
                      mainEntity: faqItems
                        .filter((f) => f.answer?.en)
                        .map((f) => ({
                          "@type": "Question",
                          name: f.en,
                          acceptedAnswer: { "@type": "Answer", text: f.answer!.en },
                        })),
                    },
                  ]
                : []),
            ],
          }),
        },
      ],
    };
  },
  component: PhotoPrintingPage,
});

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

const MAX_FILE_MB = 8;
const MAX_LONG_EDGE = 2400;
const MAX_NOTE_CHARS = 300;

// "4x6" is the existing bundle system (fixed packages of N photos — see
// usePhoto4x6Config). The other three are loose, per-photo sizes priced
// from the SAME photo_10x15/13x18/15x20 settings the poster/frame
// checkout already reads via usePricing() — nothing invented, just wired
// into a size selector that previously only offered 4x6.
type SizeMode = "4x6" | "10x15" | "13x18" | "15x20";
const LOOSE_SIZES: { key: Exclude<SizeMode, "4x6">; labelEn: string; labelAr: string }[] = [
  { key: "10x15", labelEn: "10×15 cm", labelAr: "10×15 سم" },
  { key: "13x18", labelEn: "13×18 cm", labelAr: "13×18 سم" },
  { key: "15x20", labelEn: "15×20 cm", labelAr: "15×20 سم" },
];
// Minimum order quantity for the loose, per-photo sizes (10×15/13×18/15×20).
// 4x6 bundles are unaffected — their quantity is fixed by the package.
const LOOSE_SIZE_MIN_QTY = 25;

// Print aspect ratio (width / height) per size, fed to the shared
// crop/zoom/rotate editor (@/lib/poster-edit, already built for the admin
// poster-artwork tool) so the live preview matches the real print shape.
const SIZE_RATIOS: Record<SizeMode, number> = {
  "4x6": 2 / 3,
  "10x15": 2 / 3,
  "13x18": 13 / 18,
  "15x20": 3 / 4,
};

type PaymentMethod = "cod" | "instapay" | "vodafone_cash";
const PAYMENT_OPTIONS: { key: PaymentMethod; labelEn: string; labelAr: string }[] = [
  { key: "cod", labelEn: "Cash on delivery", labelAr: "الدفع عند الاستلام" },
  { key: "instapay", labelEn: "InstaPay", labelAr: "إنستاباي" },
  { key: "vodafone_cash", labelEn: "Vodafone Cash", labelAr: "فودافون كاش" },
];

type PicVersion = "original" | "enhanced" | "suit";

type Pic = {
  id: string;
  file: File;
  originalDataUrl: string;
  enhancedDataUrl?: string;
  suitDataUrl?: string;
  processing?: PhotoAiAction | null;
  selected: PicVersion;
  warnLowRes?: boolean;
  cropSettings?: EditSettings;
};

const WHY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  sparkles: Sparkles,
  palette: Palette,
  focus: Focus,
  camera: Camera,
  eye: Eye,
  package: Package,
  truck: Truck,
  "badge-check": BadgeCheck,
};

const STEP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  images: Images,
  ruler: Ruler,
  eye: Eye,
  "check-circle": CheckCircle2,
  printer: Printer,
  truck: Truck,
};

async function fileToCompressedDataUrl(
  file: File,
): Promise<{ dataUrl: string; blob: Blob; warnLowRes: boolean }> {
  let workingFile: Blob = file;
  const isHeic =
    /\.(heic|heif)$/i.test(file.name) || file.type === "image/heic" || file.type === "image/heif";
  if (isHeic) {
    try {
      const heic2any = (await import("heic2any")).default as (opts: {
        blob: Blob;
        toType?: string;
        quality?: number;
      }) => Promise<Blob | Blob[]>;
      const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
      workingFile = Array.isArray(out) ? out[0] : out;
    } catch {
      throw new Error(i18n.t("photo4x6.heicReadError"));
    }
  }

  const url = URL.createObjectURL(workingFile);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Invalid image"));
    el.src = url;
  });

  const long = Math.max(img.width, img.height);
  const scale = long > MAX_LONG_EDGE ? MAX_LONG_EDGE / long : 1;
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const short = Math.min(img.width, img.height);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(url);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Blob failed"))), "image/jpeg", 0.9);
  });
  return { dataUrl, blob, warnLowRes: short < 600 };
}

function L(v: { en: string; ar: string }, lang: string) {
  return lang.startsWith("ar") ? v.ar : v.en;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read cropped image"));
    reader.readAsDataURL(blob);
  });
}

function PhotoPrintingPage() {
  const { t, i18n: i18next } = useTranslation();
  const lang = i18next.language ?? "ar";
  const content = usePhotoPrintingContent();
  const settings = useSiteSettings();
  const pricing = usePricing();
  const config = usePhoto4x6Config();
  const media = usePhotoPrintingMediaConfig();
  const albums = usePhotoAlbumsPublic();
  const search = useSearch({ from: "/photo-printing" });
  const [sizeMode, setSizeMode] = useState<SizeMode>("4x6");
  const [pkg, setPkg] = useState<Photo4x6Package>(config.packages[0]);
  const [looseQty, setLooseQty] = useState(LOOSE_SIZE_MIN_QTY);
  const [albumQty, setAlbumQty] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cod");
  const [pics, setPics] = useState<Pic[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [beforeAfterId, setBeforeAfterId] = useState<string | null>(null);
  const [editingPicId, setEditingPicId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [openFaqId, setOpenFaqId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const uploadSectionRef = useRef<HTMLDivElement | null>(null);
  const viewTrackedRef = useRef(false);

  useEffect(() => {
    if (viewTrackedRef.current) return;
    viewTrackedRef.current = true;
    try {
      trackCustom("photo_page_view", { content_name: "photo_printing" });
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    if (!config.packages.find((p) => p.key === pkg.key)) setPkg(config.packages[0]);
  }, [config.packages, pkg.key]);

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

  const requiredCount = sizeMode === "4x6" ? pkg.photos : Math.max(LOOSE_SIZE_MIN_QTY, looseQty);
  const subtotal = sizeMode === "4x6" ? pkg.price : pricing.photo[sizeMode] * requiredCount;
  const albumsTotal = albums.reduce((sum, a) => sum + (albumQty[a.id] ?? 0) * a.price, 0);
  const shipping = computeShipping(subtotal + albumsTotal, settings);
  const total = subtotal + albumsTotal + shipping;
  const remaining = Math.max(0, requiredCount - pics.length);
  const over = pics.length > requiredCount;

  const setAlbumQuantity = (id: string, qty: number) => {
    setAlbumQty((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });
  };

  const scrollToUpload = () => {
    uploadSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      trackCustom("photo_upload_started", { count: files.length });
    } catch {
      /* noop */
    }
    const next: Pic[] = [];
    for (const f of Array.from(files)) {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(t("photo4x6.fileTooLarge", { name: f.name, max: MAX_FILE_MB }));
        continue;
      }
      if (!/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name) && !f.type.startsWith("image/")) {
        toast.error(t("photo4x6.unsupportedFormat", { name: f.name }));
        continue;
      }
      try {
        const { dataUrl, warnLowRes } = await fileToCompressedDataUrl(f);
        next.push({
          id: crypto.randomUUID(),
          file: f,
          originalDataUrl: dataUrl,
          selected: "original",
          warnLowRes,
        });
        if (warnLowRes) {
          try {
            trackCustom("photo_quality_warning", { name: f.name });
          } catch {
            /* noop */
          }
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("photo4x6.failedToReadImage"));
        try {
          trackCustom("photo_upload_failed", { name: f.name });
        } catch {
          /* noop */
        }
      }
    }
    if (next.length) {
      setPics((prev) => [...prev, ...next]);
      try {
        trackCustom("photo_upload_completed", { count: next.length });
      } catch {
        /* noop */
      }
    }
  };

  const removePic = (id: string) => setPics((prev) => prev.filter((p) => p.id !== id));

  const movePic = (id: string, dir: -1 | 1) => {
    setPics((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      const swapIdx = idx + dir;
      if (idx === -1 || swapIdx < 0 || swapIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  };

  const runAction = async (id: string, action: PhotoAiAction) => {
    const pic = pics.find((p) => p.id === id);
    if (!pic) return;
    setPics((prev) => prev.map((p) => (p.id === id ? { ...p, processing: action } : p)));
    try {
      const result = await enhancePhoto({ data: { imageBase64: pic.originalDataUrl, action } });
      if (result.ok && result.imageBase64) {
        setPics((prev) =>
          prev.map((p) =>
            p.id === id
              ? {
                  ...p,
                  processing: null,
                  enhancedDataUrl: action === "suit" ? p.enhancedDataUrl : result.imageBase64,
                  suitDataUrl: action === "suit" ? result.imageBase64 : p.suitDataUrl,
                  selected: action === "suit" ? "suit" : "enhanced",
                }
              : p,
          ),
        );
        toast.success(
          action === "suit" ? t("photo4x6.suitVersionReady") : t("photo4x6.photoEnhanced"),
        );
      } else if (result.error === "no_person") {
        setPics((prev) => prev.map((p) => (p.id === id ? { ...p, processing: null } : p)));
        toast.error(t("photo4x6.suitWorksBest"));
      } else {
        setPics((prev) => prev.map((p) => (p.id === id ? { ...p, processing: null } : p)));
        toast.error(t("photo4x6.designerWillEnhance"));
      }
    } catch {
      setPics((prev) => prev.map((p) => (p.id === id ? { ...p, processing: null } : p)));
      toast.error(t("photo4x6.designerWillEnhance"));
    }
  };

  const sizeLabel =
    sizeMode === "4x6"
      ? pkg.label
      : (LOOSE_SIZES.find((s) => s.key === sizeMode)?.labelEn ?? sizeMode);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pics.length < requiredCount)
      return toast.error(t("photo4x6.uploadPhotosCount", { total: requiredCount }));
    if (pics.length > requiredCount)
      return toast.error(
        t("photo4x6.removeExtraPhotos", {
          total: requiredCount,
          extra: pics.length - requiredCount,
        }),
      );
    if (!name.trim() || !phone.trim() || !governorate || !address.trim())
      return toast.error(t("cart.fillDeliveryFields"));
    if (!/^01\d{9}$/.test(phone.trim()))
      return toast.error("رقم الموبايل لازم يكون 11 رقم ويبدأ بـ 01");

    setSubmitting(true);
    setProgress(0);
    try {
      trackCustom("photo_checkout_started", { size: sizeMode, total });
    } catch {
      /* noop */
    }
    try {
      const originals: string[] = [];
      const enhanced: string[] = [];
      const suits: string[] = [];
      const selected: Record<string, PicVersion> = {};
      let done = 0;
      const totalPics = pics.length;

      for (let i = 0; i < pics.length; i++) {
        const p = pics[i];
        const filenamePrefix = String(i).padStart(3, "0");

        let originalDataUrl = p.originalDataUrl;
        let enhancedDataUrl = p.enhancedDataUrl;
        let suitDataUrl = p.suitDataUrl;

        // Apply the crop/zoom/rotate the customer confirmed in the editor,
        // baking it into whichever version they'll actually print (the one
        // they have selected) before it's uploaded — non-destructive until
        // this exact point, matching the admin poster editor's own model.
        if (p.cropSettings && !isDefaultEdit(p.cropSettings)) {
          const activeSrc =
            p.selected === "suit" && p.suitDataUrl
              ? p.suitDataUrl
              : p.selected === "enhanced" && p.enhancedDataUrl
                ? p.enhancedDataUrl
                : p.originalDataUrl;
          try {
            const img = await loadImageForEdit(activeSrc);
            const outH = 2000;
            const outW = Math.round(outH * p.cropSettings.ratio);
            const blob = await renderEditToBlob(img, p.cropSettings, outW, outH, 0.9);
            const croppedDataUrl = await blobToDataUrl(blob);
            if (p.selected === "suit") suitDataUrl = croppedDataUrl;
            else if (p.selected === "enhanced") enhancedDataUrl = croppedDataUrl;
            else originalDataUrl = croppedDataUrl;
          } catch {
            /* fall back to the uncropped version rather than blocking checkout */
          }
        }

        const orig = await uploadCustomerPhoto({
          data: {
            dataUrl: originalDataUrl,
            filename: `${filenamePrefix}-orig.jpg`,
            folder: "photo-printing",
          },
        });
        originals.push(orig.url);
        if (enhancedDataUrl) {
          const uploaded = await uploadCustomerPhoto({
            data: {
              dataUrl: enhancedDataUrl,
              filename: `${filenamePrefix}-enhanced.jpg`,
              folder: "photo-printing",
            },
          });
          enhanced.push(uploaded.url);
        }
        if (suitDataUrl) {
          const uploaded = await uploadCustomerPhoto({
            data: {
              dataUrl: suitDataUrl,
              filename: `${filenamePrefix}-suit.jpg`,
              folder: "photo-printing",
            },
          });
          suits.push(uploaded.url);
        }
        selected[String(i)] = p.selected;
        done++;
        setProgress(Math.round((done / totalPics) * 100));
      }

      const selectedAlbums = Object.entries(albumQty)
        .filter(([, qty]) => qty > 0)
        .map(([id, qty]) => ({ id, qty }));

      const result = await createPhoto4x6Order({
        data: {
          customer_name: name.trim(),
          phone: phone.trim(),
          governorate,
          address: address.trim(),
          ...(sizeMode === "4x6"
            ? { package_key: pkg.key }
            : { size_key: sizeMode, quantity: requiredCount }),
          notes: notes.trim() || null,
          original_paths: originals,
          enhanced_paths: enhanced,
          suit_paths: suits,
          selected_versions: selected,
          selected_albums: selectedAlbums,
          payment_method: paymentMethod,
        },
      });
      const orderNumber = result.order.order_number;

      const paymentLabel =
        PAYMENT_OPTIONS.find((p) => p.key === paymentMethod)?.labelEn ?? "Cash on delivery";
      const albumsLines =
        selectedAlbums.length > 0
          ? albums
              .filter((a) => selectedAlbums.some((s) => s.id === a.id))
              .map((a) => `Album: ${a.nameEn} x${albumQty[a.id]}`)
          : [];

      const msg = [
        "New Photo Printing order",
        `Order ${orderNumber}`,
        `Name: ${name}`,
        `Phone: ${phone}`,
        `Governorate: ${governorate}`,
        `Address: ${address}`,
        `Size: ${sizeLabel} (${requiredCount} photos)`,
        ...albumsLines,
        ...(notes.trim() ? [`Customer notes: ${notes.trim()}`] : []),
        `Payment: ${paymentLabel}${paymentMethod !== "cod" ? ` (to ${content.payment.instapayVodafonePhone})` : ""}`,
        `Total: ${total} EGP`,
      ].join("\n");

      try {
        trackCustom("photo_order_completed", { order_number: orderNumber, total, size: sizeMode });
      } catch {
        /* noop */
      }

      if (await readPostOrderMessageEnabled().catch(() => true)) {
        toast.success(t("photo4x6.orderSubmitted"));
      }
      setPics([]);
      setName("");
      setPhone("");
      setGovernorate("");
      setAddress("");
      setNotes("");
      setAlbumQty({});
      setPaymentMethod("cod");
      window.location.href = whatsappLink(msg);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("photo4x6.submissionFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!config.enabled) {
    return (
      <div className="container-page py-24 text-center">
        <h1 className="text-display text-4xl">{t("photo4x6.printing")}</h1>
        <p className="mt-4 text-muted-foreground">{t("photo4x6.serviceUnavailable")}</p>
      </div>
    );
  }

  const beforeAfterPic = beforeAfterId ? pics.find((p) => p.id === beforeAfterId) : null;
  const editingPic = editingPicId ? pics.find((p) => p.id === editingPicId) : null;

  return (
    <div className="bg-background text-foreground">
      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden border-b border-border bg-card">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, currentColor 1px, transparent 1px), radial-gradient(circle at 80% 60%, currentColor 1px, transparent 1px)",
            backgroundSize: "48px 48px, 64px 64px",
          }}
        />
        <div className="container-page py-16 sm:py-24">
          <p className="animate-in fade-in slide-in-from-bottom-2 text-[10px] uppercase tracking-[0.5em] text-muted-foreground duration-700">
            {L(content.hero.eyebrow, lang)}
          </p>
          <h1 className="text-display animate-in fade-in slide-in-from-bottom-3 mt-3 max-w-3xl text-5xl duration-700 sm:text-7xl">
            {L(content.hero.heading, lang)}
          </h1>
          <p className="animate-in fade-in slide-in-from-bottom-3 mt-5 max-w-xl text-muted-foreground delay-100 duration-700">
            {L(content.hero.subheading, lang)}
          </p>
          <div className="animate-in fade-in slide-in-from-bottom-3 mt-8 flex flex-wrap gap-3 delay-150 duration-700">
            <button
              type="button"
              onClick={scrollToUpload}
              className="rounded-sm bg-primary px-6 py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition hover:opacity-90"
            >
              {L(content.hero.ctaPrimary, lang)}
            </button>
            <a
              href="#quality"
              className="rounded-sm border border-border px-6 py-3 text-xs font-semibold uppercase tracking-widest transition hover:bg-accent"
            >
              {L(content.hero.ctaSecondary, lang)}
            </a>
          </div>
          {search.from === "checkout" && (
            <div className="mt-4 inline-block rounded-sm border border-primary/40 bg-primary/10 px-3 py-1 text-[10px] uppercase tracking-widest">
              {t("photo4x6.addedFromCheckout")}
            </div>
          )}
        </div>
      </section>

      <PhotoPrintingBannerRail banners={banners} />

      {/* ============ WHY PRINT WITH US ============ */}
      <section className="border-b border-border">
        <div className="container-page py-16 sm:py-20">
          <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
            {L(content.why.label, lang)}
          </p>
          <h2 className="text-display mt-3 text-3xl sm:text-4xl">{L(content.why.heading, lang)}</h2>
          <div className="mt-10 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {content.why.points
              .filter((p) => p.enabled)
              .map((p) => {
                const Icon = WHY_ICONS[p.icon] ?? Sparkles;
                return (
                  <div key={p.id} className="bg-background p-6">
                    <Icon className="h-5 w-5 text-primary" />
                    <div className="mt-3 text-sm font-semibold">{L(p, lang)}</div>
                    {p.description && (
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        {L(p.description, lang)}
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </section>

      <PhotoPrintingImagesSection images={pageImages} />

      {/* ============ SIZE SELECTOR + UPLOAD + CHECKOUT ============ */}
      <section ref={uploadSectionRef}>
        <div className="container-page py-14">
          <h2 className="text-display text-3xl sm:text-4xl">
            {lang.startsWith("ar") ? "اختار المقاس" : "Choose Your Size"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {lang.startsWith("ar")
              ? "باقات صور 4×6، أو أي مقاس تاني بالعدد اللي تحتاجه."
              : "4×6 bundles, or any other size in exactly the quantity you need."}
          </p>

          {/* Size mode switcher */}
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSizeMode("4x6")}
              className={`rounded-sm border px-4 py-2 text-xs font-semibold uppercase tracking-widest transition ${sizeMode === "4x6" ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent"}`}
            >
              4×6 {lang.startsWith("ar") ? "(باقات)" : "(bundles)"}
            </button>
            {LOOSE_SIZES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSizeMode(s.key)}
                className={`rounded-sm border px-4 py-2 text-xs font-semibold uppercase tracking-widest transition ${sizeMode === s.key ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent"}`}
              >
                {lang.startsWith("ar") ? s.labelAr : s.labelEn}
              </button>
            ))}
          </div>

          {sizeMode === "4x6" ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {config.packages.map((p) => {
                const active = p.key === pkg.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => {
                      setPkg(p);
                      try {
                        trackCustom("photo_size_selected", {
                          size: "4x6",
                          package: p.key,
                          photos: p.photos,
                        });
                      } catch {
                        /* noop */
                      }
                    }}
                    className={`rounded-sm border-2 bg-background p-8 text-left transition ${active ? "border-primary" : "border-border hover:border-foreground/40"}`}
                  >
                    <div className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">
                      {active ? t("photo4x6.selected") : t("photo4x6.choose")}
                    </div>
                    <div className="text-display mt-3 text-3xl">{p.label}</div>
                    <div className="mt-4 flex items-end gap-2">
                      <span className="text-display text-5xl">{p.price}</span>
                      <span className="pb-2 text-xs uppercase tracking-widest text-muted-foreground">
                        {t("egp")}
                      </span>
                      {p.originalPrice && p.originalPrice > p.price && (
                        <span className="pb-2 text-sm text-muted-foreground line-through">
                          {p.originalPrice}
                        </span>
                      )}
                    </div>
                    {p.originalPrice && p.originalPrice > p.price && (
                      <div className="mt-1.5 inline-block rounded-sm bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-primary">
                        {lang.startsWith("ar")
                          ? `وفر ${p.originalPrice - p.price} جنيه`
                          : `Save ${p.originalPrice - p.price} EGP`}
                      </div>
                    )}
                    <p className="mt-3 text-xs text-muted-foreground">
                      {t("photo4x6.packageDescription", { photos: p.photos })}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-6 max-w-sm rounded-sm border-2 border-primary bg-background p-8">
              <div className="text-display text-3xl">
                {lang.startsWith("ar")
                  ? LOOSE_SIZES.find((s) => s.key === sizeMode)?.labelAr
                  : LOOSE_SIZES.find((s) => s.key === sizeMode)?.labelEn}
              </div>
              <div className="mt-4 flex items-end gap-2">
                <span className="text-display text-5xl">{pricing.photo[sizeMode]}</span>
                <span className="pb-2 text-xs uppercase tracking-widest text-muted-foreground">
                  {t("egp")} {lang.startsWith("ar") ? "/ صورة" : "/ photo"}
                </span>
              </div>
              <div className="mt-5 flex items-center gap-3">
                <span className="text-xs uppercase tracking-widest text-muted-foreground">
                  {lang.startsWith("ar") ? "عدد الصور" : "Quantity"}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLooseQty((q) => Math.max(LOOSE_SIZE_MIN_QTY, q - 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-sm border border-border text-sm hover:bg-accent"
                    aria-label={lang.startsWith("ar") ? "إنقاص" : "Decrease"}
                  >
                    −
                  </button>
                  <span className="w-10 text-center text-lg font-semibold tabular-nums">
                    {looseQty}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = Math.min(50, looseQty + 1);
                      setLooseQty(next);
                      try {
                        trackCustom("photo_size_selected", { size: sizeMode, quantity: next });
                      } catch {
                        /* noop */
                      }
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-sm border border-border text-sm hover:bg-accent"
                    aria-label={lang.startsWith("ar") ? "زيادة" : "Increase"}
                  >
                    +
                  </button>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {lang.startsWith("ar")
                  ? `أقل عدد للطلب بهذا المقاس ${LOOSE_SIZE_MIN_QTY} صورة.`
                  : `Minimum order for this size is ${LOOSE_SIZE_MIN_QTY} photos.`}
              </p>
              <p className="mt-4 text-xs text-muted-foreground">
                {lang.startsWith("ar")
                  ? `${looseQty} صورة × ${pricing.photo[sizeMode]} جنيه = ${pricing.photo[sizeMode] * looseQty} جنيه`
                  : `${looseQty} photos × ${pricing.photo[sizeMode]} EGP = ${pricing.photo[sizeMode] * looseQty} EGP`}
              </p>
            </div>
          )}
        </div>

        {albums.length > 0 && (
          <div className="border-t border-border">
            <div className="container-page py-10">
              <h3 className="text-display text-2xl">
                {lang.startsWith("ar") ? "ألبومات الصور" : "Photo Albums"}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {lang.startsWith("ar")
                  ? "ضيف ألبوم لحفظ صورك المطبوعة، يتباع مع طلبك في نفس الشحنة."
                  : "Add an album to keep your prints in, shipped together with your order."}
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {albums.map((album) => {
                  const qty = albumQty[album.id] ?? 0;
                  const name = lang.startsWith("ar") ? album.nameAr : album.nameEn;
                  const description = lang.startsWith("ar")
                    ? album.descriptionAr
                    : album.descriptionEn;
                  return (
                    <div key={album.id} className="rounded-sm border border-border bg-card p-4">
                      <div className="flex gap-3">
                        {album.imageUrl ? (
                          <img
                            src={album.imageUrl}
                            alt={name}
                            className="h-20 w-20 shrink-0 rounded-sm border border-border object-cover"
                          />
                        ) : (
                          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-sm border border-dashed border-border text-muted-foreground">
                            <Images className="h-5 w-5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">{name}</div>
                          {description && (
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                              {description}
                            </p>
                          )}
                          <div className="mt-1.5 text-sm font-semibold">
                            {album.price} {t("egp")}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3">
                        {qty === 0 ? (
                          <button
                            type="button"
                            onClick={() => setAlbumQuantity(album.id, 1)}
                            className="w-full rounded-sm border border-primary px-3 py-2 text-xs font-semibold uppercase tracking-widest text-primary transition hover:bg-primary hover:text-primary-foreground"
                          >
                            {lang.startsWith("ar") ? "أضف للطلب" : "Add to order"}
                          </button>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setAlbumQuantity(album.id, qty - 1)}
                                className="flex h-8 w-8 items-center justify-center rounded-sm border border-border text-sm hover:bg-accent"
                                aria-label={lang.startsWith("ar") ? "إنقاص" : "Decrease"}
                              >
                                −
                              </button>
                              <span className="w-6 text-center text-sm font-semibold tabular-nums">
                                {qty}
                              </span>
                              <button
                                type="button"
                                onClick={() => setAlbumQuantity(album.id, Math.min(20, qty + 1))}
                                className="flex h-8 w-8 items-center justify-center rounded-sm border border-border text-sm hover:bg-accent"
                                aria-label={lang.startsWith("ar") ? "زيادة" : "Increase"}
                              >
                                +
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => setAlbumQuantity(album.id, 0)}
                              className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-destructive"
                            >
                              {t("common.remove")}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-border">
          <div className="container-page py-14">
            <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <h2 className="text-display text-3xl sm:text-4xl">{t("photo4x6.uploadImages")}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {remaining > 0
                    ? t("photo4x6.morePhotosNeeded", { count: remaining, total: requiredCount })
                    : over
                      ? t("photo4x6.tooManyPhotos", {
                          count: pics.length,
                          extra: pics.length - requiredCount,
                        })
                      : t("photo4x6.allPhotosReady")}
                </p>

                <label
                  htmlFor="pp-files"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    addFiles(e.dataTransfer.files);
                  }}
                  className="mt-6 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-sm border-2 border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground transition hover:border-primary/50"
                >
                  <Upload className="h-6 w-6" />
                  <span className="text-foreground">{t("photo4x6.clickToUpload")}</span>
                  <span className="text-xs">
                    {t("photo4x6.uploadFormats", { max: MAX_FILE_MB })}
                  </span>
                  <input
                    ref={inputRef}
                    id="pp-files"
                    type="file"
                    accept="image/*,.heic,.heif"
                    multiple
                    className="hidden"
                    onChange={(e) => addFiles(e.target.files)}
                  />
                </label>

                {pics.length > 0 && (
                  <div className="mt-8 grid gap-6 sm:grid-cols-2">
                    {pics.map((p, idx) => {
                      const activeUrl =
                        p.selected === "suit" && p.suitDataUrl
                          ? p.suitDataUrl
                          : p.selected === "enhanced" && p.enhancedDataUrl
                            ? p.enhancedDataUrl
                            : p.originalDataUrl;
                      return (
                        <div
                          key={p.id}
                          className="animate-in fade-in zoom-in-95 rounded-sm border border-border bg-card p-3 duration-300"
                        >
                          <div className="relative aspect-[3/4] overflow-hidden rounded-sm bg-muted">
                            <img
                              src={activeUrl}
                              alt={`Photo ${idx + 1}`}
                              className="h-full w-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => removePic(p.id)}
                              className="absolute right-2 top-2 rounded-full bg-black/70 p-1 text-white hover:bg-black"
                              aria-label={t("common.remove")}
                            >
                              <X className="h-3 w-3" />
                            </button>
                            <div className="absolute left-2 top-2 flex items-center gap-1">
                              <span className="rounded-sm bg-black/70 px-2 py-0.5 text-[10px] uppercase tracking-widest text-white">
                                #{idx + 1}
                              </span>
                              {p.cropSettings && !isDefaultEdit(p.cropSettings) && (
                                <span className="rounded-sm bg-primary/90 px-2 py-0.5 text-[10px] uppercase tracking-widest text-primary-foreground">
                                  {lang.startsWith("ar") ? "معدّلة" : "Edited"}
                                </span>
                              )}
                            </div>
                            {p.processing && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
                                <Loader2 className="h-5 w-5 animate-spin" />
                              </div>
                            )}
                            {pics.length > 1 && (
                              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-1.5 py-1">
                                <button
                                  type="button"
                                  onClick={() => movePic(p.id, -1)}
                                  disabled={idx === 0}
                                  aria-label={
                                    lang.startsWith("ar") ? "تحريك لليسار" : "Move earlier"
                                  }
                                  className="flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white disabled:opacity-30"
                                >
                                  ‹
                                </button>
                                <button
                                  type="button"
                                  onClick={() => movePic(p.id, 1)}
                                  disabled={idx === pics.length - 1}
                                  aria-label={lang.startsWith("ar") ? "تحريك لليمين" : "Move later"}
                                  className="flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white disabled:opacity-30"
                                >
                                  ›
                                </button>
                              </div>
                            )}
                          </div>
                          {p.warnLowRes && (
                            <p className="mt-2 text-[11px] leading-relaxed text-amber-600">
                              ⚠️ الصورة قد تكون منخفضة الدقة للطباعة بهذا الحجم.
                              <br />
                              لا تقلق، سنراجعها قبل الطباعة ونتأكد من أفضل نتيجة ممكنة.
                            </p>
                          )}

                          {(p.enhancedDataUrl || p.suitDataUrl) && (
                            <div className="mt-3 grid grid-cols-3 gap-1 text-[10px] uppercase tracking-widest">
                              <VersionPill
                                label={t("photo4x6.original")}
                                active={p.selected === "original"}
                                onClick={() =>
                                  setPics((prev) =>
                                    prev.map((x) =>
                                      x.id === p.id ? { ...x, selected: "original" } : x,
                                    ),
                                  )
                                }
                              />
                              <VersionPill
                                label={t("photo4x6.enhanced")}
                                active={p.selected === "enhanced"}
                                disabled={!p.enhancedDataUrl}
                                onClick={() =>
                                  setPics((prev) =>
                                    prev.map((x) =>
                                      x.id === p.id ? { ...x, selected: "enhanced" } : x,
                                    ),
                                  )
                                }
                              />
                              <VersionPill
                                label={t("photo4x6.suit")}
                                active={p.selected === "suit"}
                                disabled={!p.suitDataUrl}
                                onClick={() =>
                                  setPics((prev) =>
                                    prev.map((x) =>
                                      x.id === p.id ? { ...x, selected: "suit" } : x,
                                    ),
                                  )
                                }
                              />
                            </div>
                          )}

                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {config.aiEnhanceEnabled && (
                              <>
                                <ActionBtn
                                  icon={<Sparkles className="h-3 w-3" />}
                                  label={t("photo4x6.enhance")}
                                  onClick={() => runAction(p.id, "enhance")}
                                  disabled={!!p.processing}
                                />
                                <ActionBtn
                                  icon={<Palette className="h-3 w-3" />}
                                  label={t("photo4x6.colors")}
                                  onClick={() => runAction(p.id, "colors")}
                                  disabled={!!p.processing}
                                />
                                <ActionBtn
                                  icon={<ScanFace className="h-3 w-3" />}
                                  label={t("photo4x6.sharpenFace")}
                                  onClick={() => runAction(p.id, "sharpen_face")}
                                  disabled={!!p.processing}
                                />
                                <ActionBtn
                                  icon={<Focus className="h-3 w-3" />}
                                  label={t("photo4x6.removeBlur")}
                                  onClick={() => runAction(p.id, "remove_blur")}
                                  disabled={!!p.processing}
                                />
                                <ActionBtn
                                  icon={<Printer className="h-3 w-3" />}
                                  label={t("photo4x6.prepareForPrint")}
                                  onClick={() => runAction(p.id, "prepare_print")}
                                  disabled={!!p.processing}
                                />
                              </>
                            )}
                            {config.aiSuitEnabled && (
                              <ActionBtn
                                icon={<Shirt className="h-3 w-3" />}
                                label={t("photo4x6.wearSuit")}
                                subLabel="خلي الصورة ببدلة"
                                onClick={() => runAction(p.id, "suit")}
                                disabled={!!p.processing}
                                primary
                              />
                            )}
                            {(p.enhancedDataUrl || p.suitDataUrl) && (
                              <button
                                type="button"
                                onClick={() => setBeforeAfterId(p.id)}
                                className="rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-accent"
                              >
                                {t("photo4x6.beforeAfter")}
                              </button>
                            )}
                            <ActionBtn
                              icon={<Crop className="h-3 w-3" />}
                              label={lang.startsWith("ar") ? "قص وتعديل" : "Crop & Edit"}
                              onClick={() => {
                                setEditingPicId(p.id);
                                try {
                                  trackCustom("photo_editor_opened", { size: sizeMode });
                                } catch {
                                  /* noop */
                                }
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-8 rounded-sm border border-border bg-card p-5">
                  <label className="block">
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">
                      ملاحظات على الصور (اختياري)
                    </span>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value.slice(0, MAX_NOTE_CHARS))}
                      maxLength={MAX_NOTE_CHARS}
                      rows={4}
                      placeholder="مثال: قص الصورة من الأعلى، التركيز على الشخص، أو أي ملاحظة خاصة بالطباعة"
                      className="mt-2 w-full resize-y rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </label>
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>سنراجع ملاحظتك ونراعيها أثناء تجهيز الصور للطباعة.</span>
                    <span className="tabular-nums">
                      {notes.length} / {MAX_NOTE_CHARS}
                    </span>
                  </div>
                </div>
              </div>

              {/* Checkout */}
              <aside className="lg:sticky lg:top-24 lg:self-start">
                <form onSubmit={submit} className="rounded-sm border border-border bg-card p-6">
                  <h3 className="text-display text-2xl">{t("checkout.title")}</h3>
                  <div className="mt-4 space-y-3">
                    <Input label={t("photo4x6.fullName")} value={name} onChange={setName} />
                    <label className="block">
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">
                        Phone · رقم الموبايل
                      </span>
                      <input
                        type="tel"
                        inputMode="numeric"
                        maxLength={11}
                        placeholder="01xxxxxxxxx"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                        className={`mt-1 w-full rounded-sm border bg-background px-3 py-2 text-sm outline-none focus:border-primary ${phone && !/^01\d{9}$/.test(phone) ? "border-destructive" : "border-border"}`}
                      />
                      {phone.length > 0 && !/^01\d{9}$/.test(phone) && (
                        <span className="mt-1 block text-[11px] text-destructive">
                          رقم الموبايل لازم يكون 11 رقم ويبدأ بـ 01
                        </span>
                      )}
                    </label>
                    <label className="block">
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">
                        {t("photo4x6.governorate")}
                      </span>
                      <select
                        value={governorate}
                        onChange={(e) => setGovernorate(e.target.value)}
                        className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                      >
                        <option value="">{t("photo4x6.selectGovernorate")}</option>
                        {GOVERNORATES.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Input
                      label={t("photo4x6.address")}
                      value={address}
                      onChange={setAddress}
                      textarea
                    />
                  </div>

                  <div className="mt-6 space-y-2 border-t border-border pt-4 text-sm">
                    <Row
                      label={t("photo4x6.package", { label: sizeLabel })}
                      value={`${subtotal} ${t("egp")}`}
                    />
                    {albumsTotal > 0 && (
                      <Row
                        label={lang.startsWith("ar") ? "ألبومات الصور" : "Photo albums"}
                        value={`${albumsTotal} ${t("egp")}`}
                      />
                    )}
                    <Row
                      label={t("photo4x6.shipping")}
                      value={shipping === 0 ? t("photo4x6.free") : `${shipping} ${t("egp")}`}
                    />
                    <div className="flex items-baseline justify-between pt-2 text-base">
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">
                        {t("photo4x6.total")}
                      </span>
                      <span className="text-display text-2xl">
                        {total} {t("egp")}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 border-t border-border pt-4">
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">
                      {lang.startsWith("ar") ? "طريقة الدفع" : "Payment method"}
                    </span>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {PAYMENT_OPTIONS.map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setPaymentMethod(opt.key)}
                          className={`rounded-sm border px-2 py-2 text-[11px] font-semibold transition ${paymentMethod === opt.key ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent"}`}
                        >
                          {lang.startsWith("ar") ? opt.labelAr : opt.labelEn}
                        </button>
                      ))}
                    </div>
                    {paymentMethod !== "cod" && (
                      <div className="mt-3 rounded-sm bg-background px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
                        <div className="text-foreground">
                          {lang.startsWith("ar")
                            ? `رقم ${paymentMethod === "instapay" ? "انستاباي" : "فودافون كاش"}: `
                            : `${paymentMethod === "instapay" ? "InstaPay" : "Vodafone Cash"} number: `}
                          <span className="font-semibold tabular-nums">
                            {content.payment.instapayVodafonePhone}
                          </span>
                        </div>
                        <p className="mt-1">{L(content.payment.note, lang)}</p>
                      </div>
                    )}
                  </div>

                  {submitting && (
                    <div className="mt-4">
                      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <p className="mt-2 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
                        {t("photo4x6.uploading", { progress })}
                      </p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="mt-6 w-full rounded-sm bg-primary px-4 py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                  >
                    {submitting
                      ? t("photo4x6.placingOrder")
                      : paymentMethod === "cod"
                        ? t("photo4x6.placeOrderCod")
                        : lang.startsWith("ar")
                          ? "تأكيد الطلب عبر واتساب"
                          : "Confirm order via WhatsApp"}
                  </button>
                  <p className="mt-3 text-center text-[11px] text-muted-foreground">
                    {t("photo4x6.originalEnhancedSent")}
                  </p>
                </form>

                {/* Mobile sticky summary — only once there's actually something to summarize */}
                {pics.length > 0 && (
                  <div
                    className="fixed inset-x-0 bottom-0 flex items-center justify-between border-t border-border bg-card/95 px-4 py-3 backdrop-blur lg:hidden"
                    style={{ zIndex: "var(--z-sticky-bar)" as never }}
                  >
                    <div>
                      <div className="text-sm font-semibold">
                        {pics.length} {t("photo4x6.printing")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {total} {t("egp")}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const form = document.querySelector("form");
                        form?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                      className="rounded-sm bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground"
                    >
                      {t("common.continue") || "Continue"}
                    </button>
                  </div>
                )}
              </aside>
            </div>
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section className="border-t border-border bg-card">
        <div className="container-page py-16 sm:py-20">
          <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
            {L(content.howItWorks.label, lang)}
          </p>
          <h2 className="text-display mt-3 text-3xl sm:text-4xl">
            {L(content.howItWorks.heading, lang)}
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {content.howItWorks.steps.map((s, i) => {
              const Icon = STEP_ICONS[s.icon] ?? CheckCircle2;
              return (
                <div key={s.id} className="rounded-sm border border-border bg-background p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-primary text-xs font-semibold text-primary">
                      {i + 1}
                    </span>
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="mt-3 text-sm font-semibold">{L(s, lang)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============ BEFORE / AFTER (admin-managed, location="photo-printing") ============ */}
      <BeforeAfter location="photo-printing" />

      <div id="quality">
        <ProductInfoSections variant="photo" />
      </div>

      {/* ============ REVIEWS ============ */}
      <CustomerReviews />

      {/* ============ FAQ ============ */}
      <section className="border-t border-border">
        <div className="container-page py-16 sm:py-20">
          <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
            {L(content.faq.label, lang)}
          </p>
          <h2 className="text-display mt-3 text-3xl sm:text-4xl">{L(content.faq.heading, lang)}</h2>
          <div className="mt-8 max-w-3xl divide-y divide-border border-y border-border">
            {content.faq.items
              .filter((f) => f.enabled)
              .map((f) => {
                const open = openFaqId === f.id;
                return (
                  <div key={f.id}>
                    <button
                      type="button"
                      onClick={() => setOpenFaqId(open ? null : f.id)}
                      aria-expanded={open}
                      className="flex w-full items-center justify-between gap-4 py-4 text-left"
                    >
                      <span className="text-sm font-medium">{L(f, lang)}</span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                      />
                    </button>
                    {open && f.answer && (
                      <p className="pb-4 text-sm leading-relaxed text-muted-foreground">
                        {L(f.answer, lang)}
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </section>

      {/* ============ FINAL CTA ============ */}
      <section className="border-t border-border bg-card">
        <div className="container-page flex flex-col items-center py-16 text-center sm:py-24">
          <h2 className="text-display text-4xl sm:text-6xl">{L(content.finalCta.heading, lang)}</h2>
          <button
            type="button"
            onClick={scrollToUpload}
            className="mt-8 rounded-sm bg-primary px-8 py-4 text-sm font-semibold uppercase tracking-widest text-primary-foreground transition hover:opacity-90"
          >
            {L(content.finalCta.button, lang)}
          </button>
        </div>
      </section>

      {beforeAfterPic && (beforeAfterPic.enhancedDataUrl || beforeAfterPic.suitDataUrl) && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur"
          onClick={() => setBeforeAfterId(null)}
          role="dialog"
        >
          <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <BeforeAfterSlider
              before={beforeAfterPic.originalDataUrl}
              after={
                beforeAfterPic.selected === "suit" && beforeAfterPic.suitDataUrl
                  ? beforeAfterPic.suitDataUrl
                  : (beforeAfterPic.enhancedDataUrl ?? beforeAfterPic.originalDataUrl)
              }
              title={
                beforeAfterPic.selected === "suit"
                  ? t("photo4x6.suitVersion")
                  : t("photo4x6.enhancedVersion")
              }
            />
            <div className="mt-3 flex justify-center">
              <button
                onClick={() => setBeforeAfterId(null)}
                className="rounded-sm border border-white/40 px-4 py-2 text-[11px] uppercase tracking-widest text-white hover:bg-white/10"
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingPic && (
        <PosterImageEditor
          source={
            editingPic.selected === "suit" && editingPic.suitDataUrl
              ? editingPic.suitDataUrl
              : editingPic.selected === "enhanced" && editingPic.enhancedDataUrl
                ? editingPic.enhancedDataUrl
                : editingPic.originalDataUrl
          }
          initial={editingPic.cropSettings}
          ratio={SIZE_RATIOS[sizeMode]}
          onCancel={() => setEditingPicId(null)}
          onSave={(settings) => {
            setPics((prev) =>
              prev.map((x) => (x.id === editingPicId ? { ...x, cropSettings: settings } : x)),
            );
            setEditingPicId(null);
            try {
              trackCustom("photo_editor_completed", { size: sizeMode });
            } catch {
              /* noop */
            }
          }}
        />
      )}
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
    <section id="quality-showcase" className="border-b border-border bg-card/40">
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

function VersionPill({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-sm border px-2 py-1 transition ${active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent"} ${disabled ? "opacity-30" : ""}`}
    >
      {active && <Check className="mr-1 inline h-3 w-3" />}
      {label}
    </button>
  );
}

function ActionBtn({
  icon,
  label,
  subLabel,
  onClick,
  disabled,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  subLabel?: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1 rounded-sm border px-2 py-1 text-[10px] uppercase tracking-widest transition disabled:opacity-40 ${primary ? "border-primary bg-primary text-primary-foreground hover:opacity-90" : "border-border hover:bg-accent"}`}
      title={subLabel}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Input({
  label,
  value,
  onChange,
  textarea,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
  type?: string;
}) {
  const props = {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
    className:
      "mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary",
  };
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      {textarea ? <textarea rows={3} {...props} /> : <input type={type} {...props} />}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
