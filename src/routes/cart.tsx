import { createFileRoute, Link } from "@tanstack/react-router";
import { SafeImage } from "@/components/SafeImage";
import { FramePreview } from "@/components/FramePreview";
import { useState } from "react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart";
import {
  labelForColor,
  labelForFrame,
  labelForSize,
} from "@/lib/poster-options";
import { whatsappLink } from "@/lib/whatsapp";
import { supabase } from "@/integrations/supabase/client";
import { Trash2, Plus, Minus, Upload, X, FileText } from "lucide-react";
import { useSiteSettings, computeShipping, usePricing } from "@/lib/use-settings";
import { trackEvent, setUserData } from "@/lib/meta-pixel";

const INSTAPAY_NUMBER = "01090771294";
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_SCREENSHOT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Cart — BRWAZWNEON" },
      { name: "description", content: "Review your framed posters and place your cash-on-delivery order." },
    ],
  }),
  component: CartPage,
});

const GOVERNORATES = [
  "Cairo", "Giza", "Alexandria", "Qalyubia", "Sharqia", "Dakahlia",
  "Beheira", "Kafr El Sheikh", "Gharbia", "Monufia", "Damietta",
  "Port Said", "Ismailia", "Suez", "Faiyum", "Beni Suef", "Minya",
  "Asyut", "Sohag", "Qena", "Luxor", "Aswan", "Red Sea", "New Valley",
  "Matrouh", "North Sinai", "South Sinai",
];

function CartPage() {
  const { items, remove, setQty, clear, total } = useCart();
  const settings = useSiteSettings();
  const pricing = usePricing();
  const subtotal = total;
  const bundleQty = items.reduce((s, i) => s + (i.bundle ? i.qty : 0), 0);
  const packagingFee = bundleQty * pricing.packagingFee;
  const shipping = computeShipping(subtotal, settings);
  const grand = subtotal + packagingFee + shipping;
  const remainingForFree = Math.max(0, settings.freeShippingThreshold - subtotal);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "instapay">("cod");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleScreenshotChange = (file: File | null) => {
    if (!file) {
      setScreenshot(null);
      setScreenshotPreview(null);
      return;
    }
    if (!ALLOWED_SCREENSHOT_TYPES.includes(file.type)) {
      toast.error("Only JPG, PNG, WEBP or PDF are allowed");
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      toast.error("Max file size is 10 MB");
      return;
    }
    setScreenshot(file);
    setScreenshotPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
  };

  const buildMessage = () => {
    const lines = items.map((i, idx) => {
      const head = `${idx + 1}. ${i.title} ×${i.qty}\n   ${labelForFrame(i.frameType)} · ${labelForSize(i.size)} · ${labelForColor(i.color)}\n   ${i.price * i.qty} EGP`;
      if (i.bundle) {
        return head + "\n   Posters: " + i.bundle.posters.map((p) => p.title).join(", ");
      }
      return head;
    });
    return [
      `New order from BRWAZWNEON — ${paymentMethod === "instapay" ? "Instapay / Vodafone Cash" : "Cash on delivery"}`,
      "",
      `Name: ${name}`,
      `Phone: ${phone}`,
      `Governorate: ${governorate}`,
      `Address: ${address}`,
      paymentMethod === "instapay"
        ? `Payment: Instapay / Vodafone Cash → ${INSTAPAY_NUMBER} (screenshot attached)`
        : "Payment: Cash on delivery",
      "",
      "Items:",
      ...lines,
      "",
      `Subtotal: ${subtotal} EGP`,
      ...(packagingFee > 0 ? [`Packaging Fee: ${packagingFee} EGP`] : []),
      `Shipping: ${shipping === 0 ? "FREE" : `${shipping} EGP`}`,
      `Total: ${grand} EGP`,
    ].join("\n");
  };

  const handleOrder = async () => {
    if (items.length === 0) return toast.error("Your cart is empty");
    if (!name || !phone || !governorate || !address)
      return toast.error("Please fill in all delivery fields");
    if (paymentMethod === "instapay" && !screenshot)
      return toast.error("Please upload your payment screenshot");

    setSubmitting(true);
    const contentIds = items.flatMap((i) =>
      i.bundle ? i.bundle.posters.map((p) => p.posterId) : [i.posterId],
    );
    setUserData({ phone, city: governorate, country: "EG" });
    try {
      trackEvent("InitiateCheckout", {
        content_ids: contentIds,
        contents: items.map((i) => ({ id: i.posterId, quantity: i.qty })),
        num_items: items.reduce((s, i) => s + i.qty, 0),
        value: grand,
        currency: "EGP",
      }, { phone, city: governorate, country: "EG" });
    } catch { /* noop */ }
    try {
      let screenshotPath: string | null = null;
      if (paymentMethod === "instapay" && screenshot) {
        const folder = crypto.randomUUID();
        const rawExt = (screenshot.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
        const path = `${folder}/receipt.${rawExt}`;
        const { error: upErr } = await supabase.storage
          .from("payment-screenshots")
          .upload(path, screenshot, { contentType: screenshot.type, upsert: false });
        if (upErr) throw upErr;
        screenshotPath = path;
      }

      const shippingPerItem = items.length > 0 ? shipping / items.length : 0;
      const rows = items.map((i) => {
        const linePackaging = i.bundle ? pricing.packagingFee * i.qty : 0;
        return ({
        customer_name: name,
        phone,
        governorate,
        address,
        frame_type: labelForFrame(i.frameType),
        frame_color: labelForColor(i.color),
        size: labelForSize(i.size),
        quantity: i.qty,
        selected_poster: i.bundle
          ? i.bundle.posters.map((p) => p.posterId).join(",")
          : i.posterId,
        poster_title: i.bundle
          ? `${i.title} — ${i.bundle.posters.map((p) => p.title).join(", ")}`
          : i.title,
        poster_image: i.image,
        subtotal: i.price * i.qty,
        packaging_fee: linePackaging,
        shipping_cost: shippingPerItem,
        total_price: i.price * i.qty + linePackaging + shippingPerItem,
        status: "new",
        payment_method: paymentMethod,
        payment_status: paymentMethod === "instapay" ? "pending" : "not_required",
        payment_screenshot: screenshotPath,
      });
      });
      const { error } = await supabase.from("orders").insert(rows);
      if (error) throw error;

      // Purchase event — once order is persisted.
      try {
        trackEvent("Purchase", {
          content_ids: contentIds,
          contents: items.map((i) => ({
            id: i.posterId,
            quantity: i.qty,
            item_price: i.price,
          })),
          content_type: "product",
          num_items: items.reduce((s, i) => s + i.qty, 0),
          value: grand,
          currency: "EGP",
          order_id: `BRW-${Date.now()}`,
        }, { phone, city: governorate, country: "EG" });
      } catch { /* noop */ }

      // Bump purchase counts for posters in this order (non-blocking).
      try {
        const { trackPosterSales } = await import("@/lib/poster-tracking");
        const ids: string[] = [];
        const qtyById = new Map<string, number>();
        for (const i of items) {
          if (i.bundle) {
            for (const p of i.bundle.posters) {
              qtyById.set(p.posterId, (qtyById.get(p.posterId) ?? 0) + i.qty);
              ids.push(p.posterId);
            }
          } else if (i.posterId) {
            qtyById.set(i.posterId, (qtyById.get(i.posterId) ?? 0) + i.qty);
            ids.push(i.posterId);
          }
        }
        // One RPC per quantity bucket to keep numbers correct.
        const byQty = new Map<number, string[]>();
        for (const [pid, q] of qtyById) {
          const arr = byQty.get(q) ?? [];
          arr.push(pid);
          byQty.set(q, arr);
        }
        await Promise.all(
          Array.from(byQty.entries()).map(([q, pids]) => trackPosterSales(pids, q)),
        );
      } catch (e) {
        console.warn("sales tracking failed", e);
      }

      toast.success("Order placed! Opening WhatsApp…");
      window.open(whatsappLink(buildMessage()), "_blank");
      clear();
      setName(""); setPhone(""); setGovernorate(""); setAddress("");
      setScreenshot(null); setScreenshotPreview(null); setPaymentMethod("cod");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to place order");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container-page py-16">
      <h1 className="text-display text-5xl sm:text-7xl">Cart</h1>
      <p className="mt-3 text-xs uppercase tracking-[0.25em] text-muted-foreground">
        🚚 Shipping Across Egypt: {settings.shippingFee} EGP · 🎉 Free over {settings.freeShippingThreshold} EGP
      </p>

      {items.length === 0 ? (
        <div className="mt-12 rounded-sm border border-dashed border-border p-16 text-center">
          <p className="text-muted-foreground">Your cart is empty.</p>
          <Link to="/" className="mt-4 inline-block underline">Browse collections</Link>
        </div>
      ) : (
        <div className="mt-12 grid gap-10 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-3">
            {items.map((i) => (
              <div key={i.id} className="flex gap-4 rounded-sm border border-border bg-card p-4">
                <div className="w-20 shrink-0">
                  <FramePreview
                    posterUrl={i.image}
                    title={i.title}
                    frameType={i.frameType}
                    color={i.color}
                    editSettings={i.editSettings}
                    bare
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{i.title}</div>
                      <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                        {labelForFrame(i.frameType)} · {labelForSize(i.size)} · {labelForColor(i.color)}
                      </div>
                      {i.bundle && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {i.bundle.posters.map((p) => (
                            <SafeImage
                              key={p.posterId}
                              src={p.image}
                              alt={p.title}
                              title={p.title}
                              className="h-12 w-9 rounded-sm border border-border object-cover"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => remove(i.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="inline-flex items-center rounded-sm border border-border">
                      <button className="p-2 hover:bg-accent" onClick={() => setQty(i.id, i.qty - 1)}>
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-8 text-center text-sm">{i.qty}</span>
                      <button className="p-2 hover:bg-accent" onClick={() => setQty(i.id, i.qty + 1)}>
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="text-display text-xl">
                      {i.price * i.qty} <span className="text-sm text-muted-foreground">EGP</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <button
              onClick={clear}
              className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              Clear cart
            </button>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-sm border border-border bg-card p-6">
              <h2 className="text-display text-2xl">Checkout</h2>
              <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                Cash on delivery
              </p>
              <div className="mt-5 space-y-3">
                <Field label="Full name" value={name} onChange={setName} />
                <Field label="Phone" value={phone} onChange={setPhone} type="tel" />
                <label className="block">
                  <span className="text-xs uppercase tracking-widest text-muted-foreground">
                    Governorate
                  </span>
                  <select
                    value={governorate}
                    onChange={(e) => setGovernorate(e.target.value)}
                    className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  >
                    <option value="">Select governorate…</option>
                    {GOVERNORATES.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </label>
                <Field label="Address" value={address} onChange={setAddress} textarea />
              </div>
              <div className="mt-5 border-t border-border pt-4">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">
                  Payment method
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2">
                  <label className={`flex cursor-pointer items-start gap-3 rounded-sm border p-3 text-sm transition ${paymentMethod === "cod" ? "border-primary bg-accent/40" : "border-border hover:bg-accent/20"}`}>
                    <input
                      type="radio"
                      name="pm"
                      value="cod"
                      checked={paymentMethod === "cod"}
                      onChange={() => setPaymentMethod("cod")}
                      className="mt-0.5 accent-primary"
                    />
                    <div>
                      <div className="font-semibold">Cash on delivery</div>
                      <div className="text-xs text-muted-foreground">Pay in cash when your order arrives.</div>
                    </div>
                  </label>
                  <label className={`flex cursor-pointer items-start gap-3 rounded-sm border p-3 text-sm transition ${paymentMethod === "instapay" ? "border-primary bg-accent/40" : "border-border hover:bg-accent/20"}`}>
                    <input
                      type="radio"
                      name="pm"
                      value="instapay"
                      checked={paymentMethod === "instapay"}
                      onChange={() => setPaymentMethod("instapay")}
                      className="mt-0.5 accent-primary"
                    />
                    <div>
                      <div className="font-semibold">Instapay / Vodafone Cash</div>
                      <div className="text-xs text-muted-foreground">Transfer, then upload your payment screenshot.</div>
                    </div>
                  </label>
                </div>
                {paymentMethod === "instapay" && (
                  <div className="mt-3 space-y-3 rounded-sm border border-border bg-background p-3">
                    <p className="text-xs leading-relaxed">
                      Please transfer the total amount to:
                    </p>
                    <div className="flex items-center justify-between gap-2 rounded-sm border border-border bg-card px-3 py-2">
                      <span className="text-display text-lg tracking-widest">{INSTAPAY_NUMBER}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(INSTAPAY_NUMBER).then(() => toast.success("Number copied"));
                        }}
                        className="rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-accent"
                      >
                        Copy
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      (Instapay or Vodafone Cash) — After payment, upload your payment screenshot below.
                    </p>

                    {screenshot ? (
                      <div className="relative overflow-hidden rounded-sm border border-border">
                        {screenshotPreview ? (
                          <img src={screenshotPreview} alt="Payment screenshot" className="max-h-56 w-full object-contain bg-black/40" />
                        ) : (
                          <div className="flex items-center gap-2 p-4 text-sm">
                            <FileText className="h-5 w-5" /> {screenshot.name}
                          </div>
                        )}
                        <div className="flex items-center justify-between border-t border-border bg-card px-3 py-2 text-[11px]">
                          <span className="truncate text-muted-foreground">
                            {screenshot.name} · {(screenshot.size / 1024 / 1024).toFixed(2)} MB
                          </span>
                          <button
                            type="button"
                            onClick={() => handleScreenshotChange(null)}
                            className="inline-flex items-center gap-1 text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-3 w-3" /> Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => {
                          e.preventDefault(); setDragOver(false);
                          const f = e.dataTransfer.files?.[0];
                          if (f) handleScreenshotChange(f);
                        }}
                        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-sm border border-dashed p-6 text-center text-xs transition ${dragOver ? "border-primary bg-accent/40" : "border-border hover:bg-accent/20"}`}
                      >
                        <Upload className="h-5 w-5 text-muted-foreground" />
                        <span className="font-medium">Upload payment screenshot</span>
                        <span className="text-[10px] text-muted-foreground">Drag & drop or click · JPG, PNG, WEBP, PDF · max 10 MB</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          className="hidden"
                          onChange={(e) => handleScreenshotChange(e.target.files?.[0] ?? null)}
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-6 space-y-2 border-t border-border pt-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{subtotal} EGP</span>
                </div>
                {packagingFee > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">📦 Packaging Fee</span>
                    <span>{packagingFee} EGP</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">🚚 Shipping</span>
                  <span>{shipping === 0 ? "FREE" : `${shipping} EGP`}</span>
                </div>
                {remainingForFree > 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    Add {remainingForFree} EGP more for free shipping.
                  </p>
                ) : (
                  <p className="text-[11px] text-foreground">🎉 Free shipping unlocked.</p>
                )}
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <span className="text-muted-foreground">Total</span>
                  <span className="text-display text-3xl">
                    {grand} <span className="text-base text-muted-foreground">EGP</span>
                  </span>
                </div>
              </div>
              <button
                onClick={handleOrder}
                disabled={submitting}
                className="mt-5 w-full rounded-sm bg-primary px-4 py-4 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? "Placing order…" : "Place order · WhatsApp"}
              </button>
              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                Your order is saved and WhatsApp opens to confirm.
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", textarea = false,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; textarea?: boolean;
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