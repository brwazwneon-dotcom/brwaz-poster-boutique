import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Upload, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { whatsappLink } from "@/lib/whatsapp";

export const Route = createFileRoute("/photo-printing")({
  head: () => ({
    meta: [
      { title: "Photo Printing — BRWAZWNEON" },
      {
        name: "description",
        content:
          "Print your photos in premium Fuji quality. 10x15, 13x18, 15x20 cm. Minimum 20 photos. Cash on delivery across Egypt.",
      },
      { property: "og:title", content: "Photo Printing — BRWAZWNEON" },
      {
        property: "og:description",
        content: "Premium Fuji photo printing. Upload, calculate, order. Cash on delivery.",
      },
    ],
  }),
  component: PhotoPrintingPage,
});

const SIZES = [
  { id: "10x15", label: "10 × 15 cm", price: 10 },
  { id: "13x18", label: "13 × 18 cm", price: 15 },
  { id: "15x20", label: "15 × 20 cm", price: 20 },
] as const;

const MIN_QTY = 20;

const GOVERNORATES = [
  "Cairo", "Giza", "Alexandria", "Qalyubia", "Sharqia", "Dakahlia",
  "Beheira", "Gharbia", "Monufia", "Kafr El Sheikh", "Damietta",
  "Port Said", "Ismailia", "Suez", "Faiyum", "Beni Suef", "Minya",
  "Asyut", "Sohag", "Qena", "Luxor", "Aswan", "Red Sea", "New Valley",
  "Matrouh", "North Sinai", "South Sinai",
];

type Pic = { id: string; file: File; preview: string };

function PhotoPrintingPage() {
  const [sizeId, setSizeId] = useState<(typeof SIZES)[number]["id"]>("10x15");
  const [pics, setPics] = useState<Pic[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  const size = SIZES.find((s) => s.id === sizeId)!;
  const qty = pics.length;
  const total = qty * size.price;
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
    if (qty < MIN_QTY) return toast.error(`Minimum order is ${MIN_QTY} photos`);
    if (!name.trim() || !phone.trim() || !governorate || !address.trim())
      return toast.error("Please fill in all delivery details");

    setSubmitting(true);
    setProgress(0);
    try {
      const orderId = crypto.randomUUID();
      const urls: string[] = [];
      const CONCURRENCY = 5;
      let done = 0;
      let cursor = 0;
      const all = pics;

      const worker = async () => {
        while (cursor < all.length) {
          const i = cursor++;
          const p = all[i];
          const ext = (p.file.name.split(".").pop() ?? "jpg").toLowerCase();
          const path = `${orderId}/${String(i).padStart(4, "0")}-${crypto.randomUUID()}.${ext}`;
          const { error } = await supabase.storage
            .from("customer-photos")
            .upload(path, p.file, { contentType: p.file.type });
          if (error) throw error;
          urls.push(path);
          done++;
          setProgress(Math.round((done / all.length) * 100));
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, all.length) }, worker));

      const { error: insErr } = await supabase.from("photo_orders").insert({
        id: orderId,
        customer_name: name.trim(),
        phone: phone.trim(),
        governorate,
        address: address.trim(),
        size: size.label,
        quantity: qty,
        unit_price: size.price,
        total_price: total,
        photo_urls: urls,
      });
      if (insErr) throw insErr;

      const msg = [
        "New Photo Printing order",
        `Order #${orderId.slice(0, 8)}`,
        `Name: ${name}`,
        `Phone: ${phone}`,
        `Governorate: ${governorate}`,
        `Address: ${address}`,
        `Size: ${size.label}`,
        `Quantity: ${qty}`,
        `Total: ${total} EGP (Cash on delivery)`,
      ].join("\n");
      window.location.href = whatsappLink(msg);

      toast.success("Order submitted! Opening WhatsApp…");
      setPics([]);
      setName(""); setPhone(""); setGovernorate(""); setAddress("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed");
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
            Premium Fuji Quality
          </p>
          <h1 className="text-display mt-3 text-5xl sm:text-7xl">Photo Printing</h1>
          <p className="mt-4 max-w-xl text-muted-foreground">
            Upload your photos, pick a size, and we deliver high-resolution Fuji
            prints to your door. Cash on delivery across Egypt.
          </p>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground sm:text-xs">
            {[
              "Premium Fuji Quality",
              "Multiple Photo Upload",
              "High Resolution",
              "Live Price Calculation",
              "Cash On Delivery",
            ].map((f) => (
              <li key={f} className="flex items-center gap-2">
                <span className="text-foreground">✓</span> {f}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* PRICING */}
      <section className="border-b border-border">
        <div className="container-page py-14">
          <h2 className="text-display text-3xl sm:text-4xl">Pricing</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Minimum order: {MIN_QTY} photos.
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
                    {active ? "Selected" : "Choose"}
                  </div>
                  <div className="text-display mt-3 text-3xl">{s.label}</div>
                  <div className="mt-4 flex items-end gap-2">
                    <span className="text-display text-4xl">{s.price}</span>
                    <span className="pb-1 text-xs uppercase tracking-widest text-muted-foreground">
                      EGP / photo
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* UPLOAD + ORDER */}
      <section>
        <div className="container-page py-14">
          <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
            {/* Uploader */}
            <div>
              <h2 className="text-display text-3xl sm:text-4xl">Upload Your Photos</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Add as many photos as you like — minimum {MIN_QTY}.
              </p>

              <label
                htmlFor="photo-files"
                className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-sm border border-dashed border-border bg-card px-6 py-12 text-center transition hover:bg-accent"
              >
                <Upload className="h-6 w-6 text-muted-foreground" />
                <div className="mt-3 text-sm">
                  <span className="font-semibold">Click to add photos</span> or drop them here
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                  JPG · PNG · HEIC
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
                      {pics.length} photo{pics.length === 1 ? "" : "s"} ready
                    </div>
                    <button
                      type="button"
                      onClick={() => { pics.forEach((p) => URL.revokeObjectURL(p.preview)); setPics([]); }}
                      className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="grid max-h-[480px] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 md:grid-cols-5">
                    {pics.map((p) => (
                      <div key={p.id} className="group relative aspect-square overflow-hidden rounded-sm border border-border bg-muted">
                        <img src={p.preview} alt="" className="h-full w-full object-cover" loading="lazy" />
                        <button
                          type="button"
                          onClick={() => removePic(p.id)}
                          className="absolute right-1 top-1 rounded-full bg-background/90 p-1 opacity-0 transition group-hover:opacity-100"
                          aria-label="Remove photo"
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
                  Live total
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-display text-5xl">{total}</span>
                  <span className="text-xs uppercase tracking-widest text-muted-foreground">EGP</span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {qty} × {size.label} @ {size.price} EGP
                </div>
                {remaining > 0 && (
                  <div className="mt-3 rounded-sm bg-background px-3 py-2 text-[11px] text-muted-foreground">
                    Add {remaining} more photo{remaining === 1 ? "" : "s"} to reach the {MIN_QTY}-photo minimum.
                  </div>
                )}
              </div>

              <div className="mt-5 space-y-3">
                <Field label="Full name">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </Field>
                <Field label="Phone number">
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    inputMode="tel"
                    className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </Field>
                <Field label="Governorate">
                  <select
                    value={governorate}
                    onChange={(e) => setGovernorate(e.target.value)}
                    required
                    className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  >
                    <option value="">Select…</option>
                    {GOVERNORATES.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Address">
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
                    Uploading {progress}%
                  </>
                ) : (
                  <>Place order · Cash on delivery</>
                )}
              </button>
              <p className="mt-3 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
                We'll confirm your order on WhatsApp
              </p>
              <div className="mt-4 text-center">
                <Link to="/" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
                  ← Back to home
                </Link>
              </div>
            </form>
          </div>
        </div>
      </section>
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