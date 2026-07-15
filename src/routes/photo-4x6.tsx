import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, X, Loader2, Sparkles, Palette, ScanFace, Focus, Printer, Shirt, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { whatsappLink } from "@/lib/whatsapp";
import { useSiteSettings, computeShipping, usePhoto4x6Config, type Photo4x6Package } from "@/lib/use-settings";
import { Slider as BeforeAfterSlider } from "@/components/BeforeAfter";
import { ProductInfoSections } from "@/components/ProductInfoSections";
import { enhancePhoto, type PhotoAiAction } from "@/lib/photo-ai.functions";

export const Route = createFileRoute("/photo-4x6")({
  validateSearch: (s: Record<string, unknown>) => ({
    from: typeof s.from === "string" ? s.from : undefined,
  }),
  head: () => ({
    meta: [
      { title: "4×6 Photo Printing — BRWAZWNEON" },
      {
        name: "description",
        content:
          "Print your personal photos in 4×6 with premium quality. AI enhancement, formal suit transformation, cash on delivery across Egypt.",
      },
      { property: "og:title", content: "4×6 Photo Printing — BRWAZWNEON" },
      { property: "og:description", content: "Upload, enhance, and print your 4×6 photos with AI. Cash on delivery." },
      { property: "og:url", content: "https://brwazwneon-com.lovable.app/photo-4x6" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://brwazwneon-com.lovable.app/photo-4x6" }],
  }),
  component: Photo4x6Page,
});

const GOVERNORATES = [
  "Cairo", "Giza", "Alexandria", "Qalyubia", "Sharqia", "Dakahlia",
  "Beheira", "Gharbia", "Monufia", "Kafr El Sheikh", "Damietta",
  "Port Said", "Ismailia", "Suez", "Faiyum", "Beni Suef", "Minya",
  "Asyut", "Sohag", "Qena", "Luxor", "Aswan", "Red Sea", "New Valley",
  "Matrouh", "North Sinai", "South Sinai",
];

const MAX_FILE_MB = 8;
const MAX_LONG_EDGE = 2400;

type PicVersion = "original" | "enhanced" | "suit";

type Pic = {
  id: string;
  file: File;
  originalDataUrl: string; // base64 preview + AI input
  enhancedDataUrl?: string;
  suitDataUrl?: string;
  processing?: PhotoAiAction | null;
  selected: PicVersion;
  warnLowRes?: boolean;
};

async function fileToCompressedDataUrl(file: File): Promise<{ dataUrl: string; blob: Blob; warnLowRes: boolean }> {
  // HEIC → decode via dynamic import
  let workingFile: Blob = file;
  const isHeic = /\.(heic|heif)$/i.test(file.name) || file.type === "image/heic" || file.type === "image/heif";
  if (isHeic) {
    try {
      const heic2any = (await import("heic2any")).default as (opts: { blob: Blob; toType?: string; quality?: number }) => Promise<Blob | Blob[]>;
      const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
      workingFile = Array.isArray(out) ? out[0] : out;
    } catch {
      throw new Error("Could not read HEIC file. Please convert to JPG.");
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

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(head)?.[1] ?? "image/jpeg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function Photo4x6Page() {
  const settings = useSiteSettings();
  const config = usePhoto4x6Config();
  const search = useSearch({ from: "/photo-4x6" });
  const [pkg, setPkg] = useState<Photo4x6Package>(config.packages[0]);
  const [pics, setPics] = useState<Pic[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [beforeAfterId, setBeforeAfterId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // If packages array changed via admin, keep selection valid
  useEffect(() => {
    if (!config.packages.find((p) => p.key === pkg.key)) setPkg(config.packages[0]);
  }, [config.packages, pkg.key]);

  const subtotal = pkg.price;
  const shipping = computeShipping(subtotal, settings);
  const total = subtotal + shipping;
  const remaining = Math.max(0, pkg.photos - pics.length);
  const over = pics.length > pkg.photos;

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    const next: Pic[] = [];
    for (const f of Array.from(files)) {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(`${f.name} exceeds ${MAX_FILE_MB}MB`);
        continue;
      }
      if (!/\.(jpe?g|png|webp|heic|heif)$/i.test(f.name) && !f.type.startsWith("image/")) {
        toast.error(`${f.name}: unsupported format`);
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
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to read image");
      }
    }
    if (next.length) setPics((prev) => [...prev, ...next]);
  };

  const removePic = (id: string) => setPics((prev) => prev.filter((p) => p.id !== id));

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
        toast.success(action === "suit" ? "Suit version ready" : "Photo enhanced");
      } else if (result.error === "no_person") {
        setPics((prev) => prev.map((p) => (p.id === id ? { ...p, processing: null } : p)));
        toast.error("Suit option works best with clear personal photos.");
      } else {
        setPics((prev) => prev.map((p) => (p.id === id ? { ...p, processing: null } : p)));
        toast.error("Our designer will enhance your photo manually before printing.");
      }
    } catch {
      setPics((prev) => prev.map((p) => (p.id === id ? { ...p, processing: null } : p)));
      toast.error("Our designer will enhance your photo manually before printing.");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pics.length < pkg.photos) return toast.error(`Please upload ${pkg.photos} photos for this package`);
    if (pics.length > pkg.photos)
      return toast.error(`This package includes ${pkg.photos} photos. Remove ${pics.length - pkg.photos}.`);
    if (!name.trim() || !phone.trim() || !governorate || !address.trim())
      return toast.error("Please fill in all delivery details");
    if (!/^01\d{9}$/.test(phone.trim()))
      return toast.error("رقم الموبايل لازم يكون 11 رقم ويبدأ بـ 01");

    setSubmitting(true);
    setProgress(0);
    try {
      const orderId = crypto.randomUUID();
      const originals: string[] = [];
      const enhanced: string[] = [];
      const suits: string[] = [];
      const selected: Record<string, PicVersion> = {};
      let done = 0;
      const total = pics.length;

      for (let i = 0; i < pics.length; i++) {
        const p = pics[i];
        const prefix = `${orderId}/${String(i).padStart(3, "0")}`;
        // upload original (from compressed data url = jpg)
        const origPath = `${prefix}-orig.jpg`;
        await supabase.storage.from("photo-4x6").upload(origPath, dataUrlToBlob(p.originalDataUrl), { contentType: "image/jpeg" });
        originals.push(origPath);
        if (p.enhancedDataUrl) {
          const path = `${prefix}-enhanced.jpg`;
          await supabase.storage.from("photo-4x6").upload(path, dataUrlToBlob(p.enhancedDataUrl), { contentType: "image/jpeg" });
          enhanced.push(path);
        }
        if (p.suitDataUrl) {
          const path = `${prefix}-suit.jpg`;
          await supabase.storage.from("photo-4x6").upload(path, dataUrlToBlob(p.suitDataUrl), { contentType: "image/jpeg" });
          suits.push(path);
        }
        selected[String(i)] = p.selected;
        done++;
        setProgress(Math.round((done / total) * 100));
      }

      const { data: inserted, error: insErr } = await supabase
        .from("photo_4x6_orders")
        .insert({
          id: orderId,
          customer_name: name.trim(),
          phone: phone.trim(),
          governorate,
          address: address.trim(),
          package_key: pkg.key,
          photo_count: pkg.photos,
          total_price: total,
          original_paths: originals,
          enhanced_paths: enhanced,
          suit_paths: suits,
          selected_versions: selected,
        })
        .select("order_number")
        .single();
      if (insErr) throw insErr;
      const orderNumber = inserted?.order_number ?? orderId.slice(0, 8);

      const msg = [
        "New 4×6 Photo Printing order",
        `Order ${orderNumber}`,
        `Name: ${name}`,
        `Phone: ${phone}`,
        `Governorate: ${governorate}`,
        `Address: ${address}`,
        `Package: ${pkg.label} (${pkg.photos} photos)`,
        `Total: ${total} EGP (Cash on delivery)`,
      ].join("\n");

      toast.success("Order submitted! Opening WhatsApp…");
      setPics([]);
      setName(""); setPhone(""); setGovernorate(""); setAddress("");
      window.location.href = whatsappLink(msg);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (!config.enabled) {
    return (
      <div className="container-page py-24 text-center">
        <h1 className="text-display text-4xl">4×6 Photo Printing</h1>
        <p className="mt-4 text-muted-foreground">This service is temporarily unavailable.</p>
      </div>
    );
  }

  const beforeAfterPic = beforeAfterId ? pics.find((p) => p.id === beforeAfterId) : null;

  return (
    <div className="bg-background text-foreground">
      {/* HERO */}
      <section className="border-b border-border bg-card">
        <div className="container-page py-16 sm:py-20">
          <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
            AI-Enhanced Personal Prints
          </p>
          <h1 className="text-display mt-3 text-5xl sm:text-7xl">4×6 Photo Printing</h1>
          <p className="mt-4 max-w-xl text-muted-foreground">
            Upload your personal photos, enhance them with AI, and receive
            premium 4×6 prints at your door. Cash on delivery across Egypt.
          </p>
          {search.from === "checkout" && (
            <div className="mt-4 inline-block rounded-sm border border-primary/40 bg-primary/10 px-3 py-1 text-[10px] uppercase tracking-widest">
              Added from your checkout
            </div>
          )}
        </div>
      </section>

      {/* PACKAGES */}
      <section className="border-b border-border">
        <div className="container-page py-14">
          <h2 className="text-display text-3xl sm:text-4xl">Choose your package</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {config.packages.map((p) => {
              const active = p.key === pkg.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPkg(p)}
                  className={`rounded-sm border-2 bg-background p-8 text-left transition ${active ? "border-primary" : "border-border hover:border-foreground/40"}`}
                >
                  <div className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">
                    {active ? "Selected" : "Choose"}
                  </div>
                  <div className="text-display mt-3 text-3xl">{p.label}</div>
                  <div className="mt-4 flex items-end gap-2">
                    <span className="text-display text-5xl">{p.price}</span>
                    <span className="pb-2 text-xs uppercase tracking-widest text-muted-foreground">EGP</span>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">{p.photos} photos · 4×6 size · premium print</p>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* UPLOAD + AI */}
      <section>
        <div className="container-page py-14">
          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <h2 className="text-display text-3xl sm:text-4xl">Upload your photos</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {remaining > 0
                  ? `Add ${remaining} more photo${remaining === 1 ? "" : "s"} to complete your package (${pkg.photos} total).`
                  : over
                  ? `You've added ${pics.length}. Remove ${pics.length - pkg.photos} to fit this package.`
                  : "All photos ready. Enhance any of them below."}
              </p>

              <label
                htmlFor="p4x6-files"
                className="mt-6 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-sm border-2 border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground hover:border-foreground/40"
              >
                <Upload className="h-6 w-6" />
                <span className="text-foreground">Click to upload</span>
                <span className="text-xs">JPG · PNG · WEBP · HEIC · Max {MAX_FILE_MB}MB each</span>
                <input
                  ref={inputRef}
                  id="p4x6-files"
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
                      p.selected === "suit" && p.suitDataUrl ? p.suitDataUrl :
                      p.selected === "enhanced" && p.enhancedDataUrl ? p.enhancedDataUrl :
                      p.originalDataUrl;
                    return (
                      <div key={p.id} className="rounded-sm border border-border bg-card p-3">
                        <div className="relative aspect-[3/4] overflow-hidden rounded-sm bg-muted">
                          <img src={activeUrl} alt={`Photo ${idx + 1}`} className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removePic(p.id)}
                            className="absolute right-2 top-2 rounded-full bg-black/70 p-1 text-white hover:bg-black"
                            aria-label="Remove"
                          >
                            <X className="h-3 w-3" />
                          </button>
                          <div className="absolute left-2 top-2 rounded-sm bg-black/70 px-2 py-0.5 text-[10px] uppercase tracking-widest text-white">
                            #{idx + 1}
                          </div>
                          {p.processing && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
                              <Loader2 className="h-5 w-5 animate-spin" />
                            </div>
                          )}
                        </div>
                        {p.warnLowRes && (
                          <p className="mt-2 text-[10px] uppercase tracking-widest text-amber-500">
                            Low resolution — quality may vary
                          </p>
                        )}

                        {/* Version picker */}
                        {(p.enhancedDataUrl || p.suitDataUrl) && (
                          <div className="mt-3 grid grid-cols-3 gap-1 text-[10px] uppercase tracking-widest">
                            <VersionPill label="Original" active={p.selected === "original"} onClick={() => setPics((prev) => prev.map((x) => x.id === p.id ? { ...x, selected: "original" } : x))} />
                            <VersionPill label="Enhanced" active={p.selected === "enhanced"} disabled={!p.enhancedDataUrl} onClick={() => setPics((prev) => prev.map((x) => x.id === p.id ? { ...x, selected: "enhanced" } : x))} />
                            <VersionPill label="Suit" active={p.selected === "suit"} disabled={!p.suitDataUrl} onClick={() => setPics((prev) => prev.map((x) => x.id === p.id ? { ...x, selected: "suit" } : x))} />
                          </div>
                        )}

                        {/* AI actions */}
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {config.aiEnhanceEnabled && (
                            <>
                              <ActionBtn icon={<Sparkles className="h-3 w-3" />} label="Enhance" onClick={() => runAction(p.id, "enhance")} disabled={!!p.processing} />
                              <ActionBtn icon={<Palette className="h-3 w-3" />} label="Colors" onClick={() => runAction(p.id, "colors")} disabled={!!p.processing} />
                              <ActionBtn icon={<ScanFace className="h-3 w-3" />} label="Sharpen Face" onClick={() => runAction(p.id, "sharpen_face")} disabled={!!p.processing} />
                              <ActionBtn icon={<Focus className="h-3 w-3" />} label="Remove Blur" onClick={() => runAction(p.id, "remove_blur")} disabled={!!p.processing} />
                              <ActionBtn icon={<Printer className="h-3 w-3" />} label="Prepare for Print" onClick={() => runAction(p.id, "prepare_print")} disabled={!!p.processing} />
                            </>
                          )}
                          {config.aiSuitEnabled && (
                            <ActionBtn
                              icon={<Shirt className="h-3 w-3" />}
                              label="Wear a Suit"
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
                              Before / After
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Checkout */}
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <form onSubmit={submit} className="rounded-sm border border-border bg-card p-6">
                <h3 className="text-display text-2xl">Checkout</h3>
                <div className="mt-4 space-y-3">
                  <Input label="Full name" value={name} onChange={setName} />
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
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">Governorate</span>
                    <select
                      value={governorate}
                      onChange={(e) => setGovernorate(e.target.value)}
                      className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    >
                      <option value="">Select…</option>
                      {GOVERNORATES.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </label>
                  <Input label="Address" value={address} onChange={setAddress} textarea />
                </div>

                <div className="mt-6 space-y-2 border-t border-border pt-4 text-sm">
                  <Row label={`Package (${pkg.label})`} value={`${pkg.price} EGP`} />
                  <Row label="Shipping" value={shipping === 0 ? "FREE" : `${shipping} EGP`} />
                  <div className="flex items-baseline justify-between pt-2 text-base">
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">Total</span>
                    <span className="text-display text-2xl">{total} EGP</span>
                  </div>
                </div>

                {submitting && (
                  <div className="mt-4">
                    <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="mt-2 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
                      Uploading photos… {progress}%
                    </p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-6 w-full rounded-sm bg-primary px-4 py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground disabled:opacity-50 hover:opacity-90"
                >
                  {submitting ? "Placing order…" : "Place order — Cash on delivery"}
                </button>
                <p className="mt-3 text-center text-[11px] text-muted-foreground">
                  Original + enhanced files are sent to our print team.
                </p>
              </form>
            </aside>
          </div>
        </div>
      </section>

      <ProductInfoSections variant="photo" />

      {beforeAfterPic && (beforeAfterPic.enhancedDataUrl || beforeAfterPic.suitDataUrl) && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur"
          onClick={() => setBeforeAfterId(null)}
          role="dialog"
        >
          <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <BeforeAfterSlider
              before={beforeAfterPic.originalDataUrl}
              after={(beforeAfterPic.selected === "suit" && beforeAfterPic.suitDataUrl) ? beforeAfterPic.suitDataUrl : (beforeAfterPic.enhancedDataUrl ?? beforeAfterPic.originalDataUrl)}
              title={beforeAfterPic.selected === "suit" ? "Suit version" : "Enhanced version"}
            />
            <div className="mt-3 flex justify-center">
              <button
                onClick={() => setBeforeAfterId(null)}
                className="rounded-sm border border-white/40 px-4 py-2 text-[11px] uppercase tracking-widest text-white hover:bg-white/10"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VersionPill({ label, active, disabled, onClick }: { label: string; active: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-sm border px-2 py-1 transition ${
        active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent"
      } ${disabled ? "opacity-30" : ""}`}
    >
      {active && <Check className="mr-1 inline h-3 w-3" />}
      {label}
    </button>
  );
}

function ActionBtn({ icon, label, subLabel, onClick, disabled, primary }: { icon: React.ReactNode; label: string; subLabel?: string; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1 rounded-sm border px-2 py-1 text-[10px] uppercase tracking-widest transition disabled:opacity-40 ${
        primary ? "border-primary bg-primary text-primary-foreground hover:opacity-90" : "border-border hover:bg-accent"
      }`}
      title={subLabel}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Input({ label, value, onChange, textarea, type = "text" }: { label: string; value: string; onChange: (v: string) => void; textarea?: boolean; type?: string }) {
  const props = {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    className: "mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary",
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