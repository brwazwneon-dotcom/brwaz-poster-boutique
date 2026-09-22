import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SafeImage } from "@/components/SafeImage";
import { IMAGE_FALLBACK } from "@/lib/storage-url";
import { cn } from "@/lib/utils";
import { updateOrderStatus } from "@/lib/db-admin.functions";
import {
  getOrderGroupAdmin,
  getOrderTimelineAdmin,
  logOrderEventAdmin,
  getOrderNotesAdmin,
  addOrderNoteAdmin,
  updateOrderNoteAdmin,
  deleteOrderNoteAdmin,
  updateOrderConfirmationAdmin,
  setOrderPaymentAdmin,
  type OrderTimelineEvent,
  type OrderNote,
} from "@/lib/order-ops.functions";
import {
  WHATSAPP_TEMPLATES,
  CONFIRMATION_STATUS_LABEL,
  QUICK_NOTES,
  humanStage,
  buildWhatsAppTemplate,
  parseBundleTitle,
  waLink,
  type WhatsAppTemplateKey,
  type ConfirmationStatus,
  type BundleTitleParts,
} from "@/lib/order-whatsapp";
import { customerWhatsappLink } from "./shared";
import {
  checkoutNumberLabel,
  photoOrderLabel,
  ORDER_STATUSES,
  type AdminOrder,
  type PhotoOrderLite,
} from "./OrdersTab";

// Safe numeric read — the Neon driver returns `numeric` columns as strings,
// legacy rows can have a null fee column, and nothing here should ever turn
// a genuinely missing value into a silent 0 that then hides inside a sum.
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// One row's price: its own total_price, or — only when that column is
// genuinely missing — its subtotal plus its own packaging/shipping (those
// two columns default to 0 in the schema, never null, so this adds real
// known numbers, not a guess). Null when nothing at all is known.
function itemPrice(i: AdminOrder): number | null {
  const known = num(i.total_price);
  if (known !== null) return known;
  const sub = num(i.subtotal);
  if (sub === null) return null;
  return sub + (num(i.packaging_fee) ?? 0) + (num(i.shipping_cost) ?? 0);
}

const CONFIRMATION_TONE: Record<ConfirmationStatus, string> = {
  not_sent: "border-border bg-muted/40 text-muted-foreground",
  prepared: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  sent: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  customer_confirmed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  customer_rejected: "border-red-500/40 bg-red-500/10 text-red-300",
  waiting_for_response: "border-amber-500/40 bg-amber-500/10 text-amber-300",
};

const STATUS_META: Record<string, { label: string; icon: string; tone: string }> = {
  new: { label: "New", icon: "🆕", tone: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300" },
  confirmed: {
    label: "Confirmed",
    icon: "✅",
    tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  },
  processing: {
    label: "Preparing",
    icon: "🛠️",
    tone: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  },
  shipped: { label: "Shipped", icon: "🚚", tone: "border-sky-500/40 bg-sky-500/10 text-sky-300" },
  delivered: {
    label: "Delivered",
    icon: "📬",
    tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  },
  cancelled: {
    label: "Cancelled",
    icon: "🚫",
    tone: "border-red-500/40 bg-red-500/10 text-red-300",
  },
  returned: { label: "Returned", icon: "↩️", tone: "border-red-500/40 bg-red-500/10 text-red-300" },
};

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[11px] font-semibold uppercase tracking-widest",
        tone,
      )}
    >
      {children}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </h3>
  );
}

function PriceRow({
  label,
  value,
  free,
  emphasis,
}: {
  label: string;
  value: number;
  free?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={cn("text-muted-foreground", emphasis && "font-medium text-foreground")}>
        {label}
      </span>
      <span
        dir="ltr"
        className={cn(
          "tabular-nums",
          emphasis ? "font-semibold text-foreground" : "text-foreground",
        )}
      >
        {free ? "FREE" : `${Math.round(value)} EGP`}
      </span>
    </div>
  );
}

// A small Cloudinary crop instead of downloading the full-size upload just
// to show a 56-108px box — same technique as PhotoPrintCartCard's thumbUrl.
// Non-Cloudinary URLs (older Supabase-storage rows) pass through unchanged.
function cloudinaryThumb(url: string): string {
  const marker = "/image/upload/";
  const at = url.indexOf(marker);
  if (at === -1 || !url.includes("res.cloudinary.com")) return url;
  return `${url.slice(0, at + marker.length)}f_auto,q_auto,w_144,h_216,c_fill/${url.slice(at + marker.length)}`;
}

const THUMB_SIZE = "h-[84px] w-14 sm:h-[108px] sm:w-[72px]";

// A poster/product thumbnail. Falls back to a clearly-labeled placeholder
// instead of a broken-image icon — for a genuinely missing poster_image, and
// for one whose URL 404s (e.g. moved storage). Loads a small Cloudinary crop
// through SafeImage (the site's one image-loading/retry/queue system — see
// src/components/SafeImage.tsx, already used across the admin's other tabs),
// retrying the full-size original once before giving up. Click (or Enter/
// Space) opens the full-size original in a lightbox, never cropped.
function ItemThumb({
  src,
  alt,
  priority,
}: {
  src: string | null;
  alt: string;
  priority?: boolean;
}) {
  const [trulyFailed, setTrulyFailed] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);

  useEffect(() => {
    if (!zoomOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomOpen]);

  if (!src || trulyFailed) {
    return (
      <div
        role="img"
        aria-label="Poster image unavailable"
        className={cn(
          "flex shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border bg-muted/20 text-center",
          THUMB_SIZE,
        )}
      >
        <span className="text-base" aria-hidden="true">
          🖼️
        </span>
        <span
          aria-hidden="true"
          className="px-1 text-[8px] font-semibold uppercase leading-tight tracking-wider text-muted-foreground"
        >
          Image unavailable
        </span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setZoomOpen(true)}
        aria-label="View poster image"
        className={cn(
          "relative block shrink-0 overflow-hidden rounded-md border border-border bg-muted/20",
          THUMB_SIZE,
        )}
      >
        <SafeImage
          src={cloudinaryThumb(src)}
          fallbackSrc={src}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          // SafeImage swaps its own <img src> to IMAGE_FALLBACK once it has
          // exhausted its internal retry (src, then fallbackSrc) — it never
          // lets a real network error reach this element, so onError never
          // fires here. onLoad does fire for that fallback SVG too (it's a
          // real, instantly-decoding image), which is the one reliable place
          // to learn "this thumbnail truly has no photo" and switch to our
          // own richer placeholder instead of SafeImage's plain icon.
          onLoad={(e) => {
            if (
              e.currentTarget.currentSrc === IMAGE_FALLBACK ||
              e.currentTarget.src === IMAGE_FALLBACK
            ) {
              setTrulyFailed(true);
            }
          }}
          className="h-full w-full object-cover"
        />
      </button>

      {zoomOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 p-4"
          onClick={() => setZoomOpen(false)}
        >
          <button
            type="button"
            aria-label="Close preview"
            onClick={() => setZoomOpen(false)}
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-lg"
          >
            ✕
          </button>
          {/* Full-size original, never the small cropped thumbnail — the
              whole point of the lightbox is seeing it uncropped. */}
          <img
            src={src}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-[90vw] rounded-sm object-contain"
          />
        </div>
      )}
    </>
  );
}

// The right-side price block — identical for a single-poster row and a
// bundle row, factored out so the two card layouts below don't duplicate it.
function ItemPriceBlock({ item }: { item: AdminOrder }) {
  const price = itemPrice(item);
  const priceIsFallback = num(item.total_price) === null && price !== null;
  return (
    <div className="shrink-0 text-right">
      {price !== null ? (
        <>
          {/* This row's price is already the LINE total for its quantity
              (the schema stores one price per row, not a separate unit
              price) — the per-unit figure below is that number divided
              back down, shown only when it adds information (qty > 1). */}
          {item.quantity > 1 && (
            <div dir="ltr" className="text-[10px] tabular-nums text-muted-foreground">
              ≈ {Math.round(price / item.quantity)} EGP each
            </div>
          )}
          <div dir="ltr" className="text-sm font-semibold tabular-nums text-foreground">
            {Math.round(price)} EGP
          </div>
          {priceIsFallback && (
            <div
              className="text-[10px] text-amber-400"
              title="total_price is missing on this row; showing subtotal + packaging + shipping instead"
            >
              estimated
            </div>
          )}
        </>
      ) : (
        <div className="text-[11px] font-medium text-amber-400">Price unavailable</div>
      )}
    </div>
  );
}

function ItemMeta({ item }: { item: AdminOrder }) {
  return (
    <>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {item.size && <span>{item.size}</span>}
        {item.frame_type && <span>{item.frame_type}</span>}
        {item.frame_color && <span>{item.frame_color}</span>}
        <span dir="ltr" className="tabular-nums">
          × {item.quantity}
        </span>
      </div>
      <div className="mt-1 font-mono text-[10px] text-muted-foreground/70">
        {item.order_number ?? item.id.slice(0, 8)}
      </div>
    </>
  );
}

// A single poster: one thumbnail, one title, its own frame/size/price.
function SingleItemCard({ item, priority }: { item: AdminOrder; priority?: boolean }) {
  const title = item.poster_title || "Untitled item";
  return (
    <div className="flex gap-3 rounded-sm border border-border bg-card p-3">
      <ItemThumb src={item.poster_image} alt={`${title} poster`} priority={priority} />
      <div className="min-w-0 flex-1">
        <div dir="auto" className="text-sm font-semibold text-foreground">
          {title}
        </div>
        <ItemMeta item={item} />
      </div>
      <ItemPriceBlock item={item} />
    </div>
  );
}

// A "N Frames Bundle" checkout, saved as ONE `orders` row with every poster
// name packed into `poster_title` (see parseBundleTitle) and, in `poster_image`,
// only ONE photo. That single image is not a generic "bundle cover" picked at
// random: the checkout (src/routes/offers.tsx's handleAdd) sets it from
// `posters[0].image_url` — the very first poster in the same ordered list
// `poster_title` is joined from — so it reliably belongs to the first name in
// `bundle.posterNames`, and is shown (and made clickable) on that tile alone.
// Every other poster in the bundle has NO image captured anywhere: the cart
// knows each one's `image` at add-to-cart time (`BundlePoster` in
// src/lib/cart.tsx), but `orders` has exactly one `poster_image` column and
// nothing else is ever written to it — see this session's root-cause note.
// Those tiles get the same honest placeholder a missing single-item image
// gets; nothing here ever copies the first poster's photo onto them.
function BundleItemCard({
  item,
  bundle,
  priority,
}: {
  item: AdminOrder;
  bundle: BundleTitleParts;
  priority?: boolean;
}) {
  return (
    <div className="rounded-sm border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div dir="auto" className="min-w-0 text-sm font-semibold text-foreground">
          {bundle.label}
        </div>
        <ItemPriceBlock item={item} />
      </div>

      {bundle.posterNames.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3">
          {bundle.posterNames.map((name, idx) => (
            <div key={idx} className="w-14 shrink-0 text-center sm:w-[72px]">
              <ItemThumb
                src={idx === 0 ? item.poster_image : null}
                alt={`${name} poster`}
                priority={priority && idx === 0}
              />
              <div
                dir="auto"
                title={name}
                className="mt-1 truncate text-[10px] leading-tight text-muted-foreground"
              >
                {idx + 1}. {name}
              </div>
            </div>
          ))}
        </div>
      )}

      <ItemMeta item={item} />
    </div>
  );
}

// One ordered line: a single poster, or a bundle — see BundleItemCard for
// why a bundle's posters get their own tiles instead of one shared image.
function OrderItemCard({ item, priority }: { item: AdminOrder; priority?: boolean }) {
  const bundle = parseBundleTitle(item.poster_title);
  if (bundle.isBundle) {
    return <BundleItemCard item={item} bundle={bundle} priority={priority} />;
  }
  return <SingleItemCard item={item} priority={priority} />;
}

export function OrderDetailsDrawer({
  order,
  open,
  onOpenChange,
  onOrderUpdated,
  photoOrders = [],
}: {
  order: AdminOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOrderUpdated: () => void;
  /** Photo-printing orders placed in the same checkout (their own table). */
  photoOrders?: PhotoOrderLite[];
}) {
  // The clicked row is one frame — `group` is every `orders` row from the
  // same checkout (same customer_id + created_at; see getOrderGroupAdmin),
  // so a 4-frame order shows and confirms as one order, not four.
  const [group, setGroup] = useState<AdminOrder[] | null>(null);
  const [timeline, setTimeline] = useState<OrderTimelineEvent[] | null>(null);
  const [notes, setNotes] = useState<OrderNote[] | null>(null);
  const [templateKey, setTemplateKey] = useState<WhatsAppTemplateKey>("confirmation");
  const [message, setMessage] = useState("");
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [justCopied, setJustCopied] = useState(false);

  const clickedId = order?.id ?? null;
  const primary = group?.[0] ?? order;
  const primaryId = primary?.id ?? null;

  const refresh = async (id: string) => {
    const [t, n] = await Promise.all([
      getOrderTimelineAdmin({ data: { orderId: id } }),
      getOrderNotesAdmin({ data: { orderId: id } }),
    ]);
    setTimeline(t);
    setNotes(n);
  };

  useEffect(() => {
    if (!open || !clickedId) return;
    setGroup(null);
    setTimeline(null);
    setNotes(null);
    setTemplateKey("confirmation");
    (async () => {
      // If the group can't be loaded, fall back to the clicked row so the
      // drawer is never empty.
      let rows: AdminOrder[] = order ? [order] : [];
      try {
        const loaded = (await getOrderGroupAdmin({ data: { orderId: clickedId } })) as AdminOrder[];
        if (loaded.length > 0) rows = loaded;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not load the whole order");
      }
      if (rows.length === 0) return;
      setGroup(rows);
      setMessage(rows[0].whatsapp_message ?? "");
      await refresh(rows[0].id);
      logOrderEventAdmin({ data: { orderId: rows[0].id, stage: "admin_viewed" } });
    })();
    // Only re-run when the drawer opens for a (possibly new) order — `order`
    // itself is read once as the synchronous fallback above, not tracked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clickedId]);

  if (!order || !primary) return null;
  const items = group ?? [order];
  const groupIds = items.map((i) => i.id);

  // Per-item price (see itemPrice above). Anything still unknown stays
  // unknown here too (never coerced to 0) — surfaced below instead of being
  // folded silently into the total.
  const itemPrices = items.map(itemPrice);
  const pricingIncomplete = itemPrices.some((p) => p === null);
  const framesTotal = itemPrices.reduce<number>((sum, p) => sum + (p ?? 0), 0);
  const photoTotal = photoOrders.reduce<number>((sum, p) => sum + (num(p.total_price) ?? 0), 0);
  const groupTotal = framesTotal + photoTotal;
  const sumOf = (pick: (i: AdminOrder) => unknown) =>
    items.reduce((n2, i) => n2 + (num(pick(i)) ?? 0), 0);
  const itemsSubtotal = sumOf((i) => i.subtotal);
  // Unlike packaging/shipping (NOT NULL, default 0 in the schema — 0 there
  // is always a real "nothing charged"), `subtotal` is nullable, so a 0 here
  // could mean either "genuinely nothing" or "never recorded". Only show it
  // as a number once at least one row actually has one.
  const subtotalKnown = items.some((i) => num(i.subtotal) !== null);
  const packagingTotal = sumOf((i) => i.packaging_fee);
  const shippingTotal = sumOf((i) => i.shipping_cost);
  // No discount/coupon column exists on `orders` yet (coupons aren't wired
  // into checkout — see neon/migrations/014_coupons.sql). Always 0 today;
  // the row below only ever appears once a real figure exists to sum here.
  const discountTotal = 0;
  // Nothing at all is known about the price — not even a fallback — so the
  // total below would otherwise show a bare, misleading "0 EGP".
  const totalUnknown = pricingIncomplete && groupTotal === 0 && photoTotal === 0;
  const proofUrl = items.find((i) => i.payment_screenshot)?.payment_screenshot ?? null;

  const buildTemplateOrder = () => ({
    customer_name: primary.customer_name,
    phone: primary.phone,
    primaryNumber: primary.order_number ?? primary.id.slice(0, 8),
    governorate: primary.governorate,
    address: primary.address,
    total: groupTotal,
    subtotal: subtotalKnown ? itemsSubtotal : null,
    packaging: packagingTotal,
    shipping: shippingTotal,
    // No discount/coupon column exists on `orders` yet — never fabricated,
    // just wired so a real value slots straight in once one does.
    discount: null,
    items: items.map((i) => ({
      poster_title: i.poster_title,
      frame_type: i.frame_type,
      frame_color: i.frame_color,
      size: i.size,
      quantity: i.quantity,
      price: itemPrice(i),
    })),
  });

  const prepareMessage = (key: WhatsAppTemplateKey = templateKey) => {
    const text = buildWhatsAppTemplate(key, buildTemplateOrder());
    setMessage(text);
    setConfirmation("prepared", text);
    return text;
  };

  // Regenerates immediately when the admin picks a different message type —
  // still built from this order's real items every time, never hand-edited
  // boilerplate that drifts from what was actually ordered.
  const changeTemplate = (key: WhatsAppTemplateKey) => {
    setTemplateKey(key);
    setMessage(buildWhatsAppTemplate(key, buildTemplateOrder()));
  };

  // Marks the whole checkout as paid / proof rejected after looking at the
  // customer's payment screenshot.
  const setPayment = async (decision: "paid" | "rejected" | "pending") => {
    if (!primaryId) return;
    if (decision === "rejected" && !confirm("Mark this payment proof as rejected?")) return;
    setSaving(true);
    try {
      await setOrderPaymentAdmin({ data: { ids: groupIds, decision } });
      const reloaded = (await getOrderGroupAdmin({ data: { orderId: primaryId } })) as AdminOrder[];
      if (reloaded.length > 0) setGroup(reloaded);
      onOrderUpdated();
      refresh(primaryId);
      toast.success(decision === "paid" ? "Payment marked as paid" : "Payment updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update payment");
    } finally {
      setSaving(false);
    }
  };

  const setConfirmation = async (status: ConfirmationStatus, msg?: string) => {
    if (!primaryId) return;
    setSaving(true);
    try {
      await updateOrderConfirmationAdmin({
        data: { ids: groupIds, confirmation_status: status, whatsapp_message: msg ?? message },
      });
      onOrderUpdated();
      refresh(primaryId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update confirmation status");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status: string) => {
    if (!primaryId) return;
    setSaving(true);
    try {
      await updateOrderStatus({ data: { ids: groupIds, status } });
      onOrderUpdated();
      toast.success("Order status updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setSaving(false);
    }
  };

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      toast.error("Could not copy — select the text and copy manually");
      return;
    }
    toast.success("✓ Message copied");
    // A toast alone can be missed — the button itself also shows the
    // success state for a moment, matching how "Add to cart" confirms.
    setJustCopied(true);
    setTimeout(() => setJustCopied(false), 1800);
    if (primaryId) logOrderEventAdmin({ data: { orderId: primaryId, stage: "whatsapp_copied" } });
  };

  const openWhatsApp = () => {
    const link = waLink(primary.phone, message);
    if (!link) return toast.error("Invalid phone number");
    window.open(link, "_blank", "noopener,noreferrer");
    if (primaryId) logOrderEventAdmin({ data: { orderId: primaryId, stage: "whatsapp_opened" } });
    if (primary.confirmation_status === "not_sent" || primary.confirmation_status === "prepared") {
      setConfirmation("sent");
    }
  };

  const rejectOrder = () => {
    if (!confirm("Mark this order as rejected by the customer?")) return;
    setConfirmation("customer_rejected");
  };

  const addNote = async () => {
    if (!newNote.trim() || !primaryId) return;
    await addOrderNoteAdmin({ data: { orderId: primaryId, text: newNote.trim() } });
    setNewNote("");
    refresh(primaryId);
  };

  const confirmationTone =
    CONFIRMATION_TONE[primary.confirmation_status] ?? CONFIRMATION_TONE.not_sent;
  const statusMeta = STATUS_META[primary.status] ?? {
    label: primary.status,
    icon: "•",
    tone: "border-border bg-muted/40 text-muted-foreground",
  };
  const createdAt = new Date(primary.created_at);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "flex h-full w-full flex-col gap-0 overflow-hidden bg-background p-0",
          "sm:max-w-none md:w-[min(760px,92vw)]",
          // The sheet's own close button — sized to a real tap target and
          // moved so it never sits over the order number.
          "[&>button:first-child]:right-3 [&>button:first-child]:top-3 [&>button:first-child]:z-20",
          "[&>button:first-child]:flex [&>button:first-child]:h-11 [&>button:first-child]:w-11",
          "[&>button:first-child]:items-center [&>button:first-child]:justify-center",
          "[&>button:first-child]:rounded-full [&>button:first-child]:bg-card/90 [&>button:first-child]:opacity-100",
          "[&>button:first-child_svg]:h-5 [&>button:first-child_svg]:w-5",
        )}
      >
        {/* ---- Header (fixed) ---- */}
        <div className="shrink-0 border-b border-border bg-card px-5 py-4 pr-16">
          <div dir="ltr" className="text-display text-xl font-semibold text-foreground">
            Order {checkoutNumberLabel(items)}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{createdAt.toLocaleDateString()}</span>
            <span aria-hidden="true">·</span>
            <span dir="ltr">{createdAt.toLocaleTimeString()}</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{primary.payment_method}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={confirmationTone}>
              {CONFIRMATION_STATUS_LABEL[primary.confirmation_status] ??
                CONFIRMATION_STATUS_LABEL.not_sent}
            </Badge>
            <span className={cn("inline-flex items-center gap-1", "")}>
              <Badge tone={statusMeta.tone}>
                {statusMeta.icon} {statusMeta.label}
              </Badge>
            </span>
            <select
              value={primary.status}
              disabled={saving}
              onChange={(e) => changeStatus(e.target.value)}
              className="rounded-sm border border-border bg-background px-2 py-1.5 text-[11px] uppercase tracking-widest disabled:opacity-50"
              aria-label="Change order status"
            >
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s]?.label ?? s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ---- Scrollable body ---- */}
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          <div className="space-y-5 px-5 py-5">
            {/* ---- Customer ---- */}
            <section className="rounded-sm border border-border bg-card p-4">
              <SectionTitle>Customer</SectionTitle>
              <div dir="auto" className="mt-2 text-base font-semibold text-foreground">
                {primary.customer_name}
              </div>
              <div className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={`tel:${primary.phone}`}
                    dir="ltr"
                    className="tabular-nums hover:text-foreground hover:underline"
                  >
                    📞 {primary.phone}
                  </a>
                  <span aria-hidden="true">·</span>
                  <span>📍 {primary.governorate}</span>
                </div>
                <div dir="auto" className="whitespace-pre-wrap">
                  🏠 {primary.address}
                </div>
                {primary.notes && (
                  <div dir="auto" className="italic text-muted-foreground/90">
                    "{primary.notes}"
                  </div>
                )}
              </div>
              <a
                href={customerWhatsappLink(primary.phone)}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-4 text-xs font-semibold uppercase tracking-widest text-emerald-300 hover:bg-emerald-500/20"
              >
                💬 Open WhatsApp
              </a>
            </section>

            {/* ---- Order items ---- */}
            <section className="rounded-sm border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <SectionTitle>
                  Order Items {items.length > 1 ? `(${items.length})` : ""}
                </SectionTitle>
                {pricingIncomplete && (
                  <span className="text-[10px] font-medium text-amber-400">
                    ⚠ price missing on some rows
                  </span>
                )}
              </div>
              <div className="mt-3 space-y-2">
                {items.map((i, idx) => (
                  <OrderItemCard key={i.id} item={i} priority={idx === 0} />
                ))}
                {photoOrders.map((ph) => (
                  <div
                    key={ph.id}
                    className="flex items-center gap-3 rounded-sm border border-primary/30 bg-primary/5 p-3"
                  >
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-sm border border-border text-2xl sm:h-24 sm:w-24">
                      📷
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-foreground">Photo printing</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {photoOrderLabel(ph)}
                        {ph.order_number ? ` · ${ph.order_number}` : ""}
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        See the Photo Orders tab for the uploaded files.
                      </div>
                    </div>
                    <div
                      dir="ltr"
                      className="shrink-0 text-sm font-semibold tabular-nums text-foreground"
                    >
                      {Math.round(num(ph.total_price) ?? 0)} EGP
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ---- Price summary ---- */}
            <section className="rounded-sm border border-border bg-card p-4">
              <SectionTitle>Price Summary</SectionTitle>
              <div className="mt-3 space-y-1.5 text-sm">
                {subtotalKnown ? (
                  <PriceRow label="Subtotal" value={itemsSubtotal} />
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="text-muted-foreground">— not recorded</span>
                  </div>
                )}
                {packagingTotal > 0 && <PriceRow label="Packaging" value={packagingTotal} />}
                <PriceRow label="Shipping" value={shippingTotal} free={shippingTotal === 0} />
                {photoTotal > 0 && <PriceRow label="Photo printing" value={photoTotal} />}
                {discountTotal > 0 && <PriceRow label="Discount / Offer" value={-discountTotal} />}
              </div>
              {pricingIncomplete && (
                <div className="mt-3 rounded-sm border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  ⚠ total_price is missing on one or more rows of this order —{" "}
                  {totalUnknown
                    ? "and no other price field is available either, so no total can be shown below."
                    : "the total below is computed from what IS known (subtotal/packaging/shipping) and may be incomplete."}{" "}
                  Check the order source rather than trusting this figure as final.
                </div>
              )}
              <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {pricingIncomplete ? "Estimated Total" : "Total"}
                </span>
                {totalUnknown ? (
                  <span className="text-sm font-medium text-amber-400">Price unavailable</span>
                ) : (
                  <span
                    dir="ltr"
                    className="text-display text-3xl font-semibold tabular-nums text-foreground"
                  >
                    {Math.round(groupTotal)}{" "}
                    <span className="text-base text-muted-foreground">EGP</span>
                  </span>
                )}
              </div>

              <div className="mt-4 space-y-2 border-t border-border pt-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Payment</span>
                  <span className="font-medium capitalize text-foreground">
                    {primary.payment_method} / {primary.payment_status}
                  </span>
                </div>
                {proofUrl?.startsWith("https://") ? (
                  <a
                    href={proofUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block w-fit"
                    title="Open the payment screenshot"
                  >
                    <img
                      src={proofUrl}
                      alt="Payment screenshot"
                      loading="lazy"
                      className="max-h-56 rounded-sm border border-border object-contain"
                    />
                  </a>
                ) : primary.payment_method === "instapay" ? (
                  <div className="text-amber-400">
                    No payment screenshot was saved for this order.
                  </div>
                ) : null}
                {primary.payment_method !== "cod" && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setPayment("paid")}
                      disabled={saving || primary.payment_status === "paid"}
                      className="min-h-[44px] rounded-sm border border-emerald-500/40 px-3 text-xs text-emerald-400 disabled:opacity-50"
                    >
                      ✅ Payment verified
                    </button>
                    <button
                      onClick={() => setPayment("rejected")}
                      disabled={saving || primary.payment_status === "rejected"}
                      className="min-h-[44px] rounded-sm border border-red-500/40 px-3 text-xs text-red-400 disabled:opacity-50"
                    >
                      ❌ Proof rejected
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* ---- WhatsApp message ---- */}
            <section className="rounded-sm border border-emerald-500/30 bg-emerald-500/5 p-4">
              <SectionTitle>WhatsApp Message</SectionTitle>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  value={templateKey}
                  onChange={(e) => changeTemplate(e.target.value as WhatsAppTemplateKey)}
                  className="min-h-[44px] rounded-sm border border-border bg-background px-2 text-xs"
                >
                  {WHATSAPP_TEMPLATES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.icon} {t.title}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => prepareMessage()}
                  disabled={saving}
                  className="min-h-[44px] rounded-sm bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  🔄 Regenerate
                </button>
              </div>
              <textarea
                dir="rtl"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Prepare a message above, or write one manually…"
                className="mt-3 min-h-[250px] w-full resize-y rounded-sm border border-border bg-background px-3 py-2 text-sm leading-relaxed sm:min-h-[300px] md:min-h-[350px]"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={copyMessage}
                  disabled={!message}
                  className={cn(
                    "min-h-[44px] rounded-sm border px-3 text-xs transition-colors disabled:opacity-50",
                    justCopied
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                      : "border-border",
                  )}
                >
                  {justCopied ? "✓ Message copied" : "📋 Copy Message"}
                </button>
                <button
                  onClick={openWhatsApp}
                  disabled={!message}
                  className="min-h-[44px] rounded-sm border border-border px-3 text-xs disabled:opacity-50"
                >
                  💬 Open WhatsApp
                </button>
              </div>
              {primary.confirmed_at && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Confirmed {new Date(primary.confirmed_at).toLocaleString()} by{" "}
                  {primary.confirmed_by}
                </p>
              )}
            </section>

            {/* ---- Internal notes ---- */}
            <section className="rounded-sm border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <SectionTitle>Internal Notes</SectionTitle>
                <span className="text-[10px] font-medium text-muted-foreground">
                  🔒 Not sent to the customer
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {QUICK_NOTES.map((qn) => (
                  <button
                    key={qn}
                    onClick={() => setNewNote(qn)}
                    className="rounded-sm border border-border px-2 py-1 text-[10px] hover:bg-accent"
                  >
                    {qn}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addNote();
                  }}
                  dir="auto"
                  placeholder="Add an internal note…"
                  className="min-h-[44px] w-full rounded-sm border border-border bg-background px-2 text-xs"
                />
                <button
                  onClick={addNote}
                  disabled={!newNote.trim()}
                  className="min-h-[44px] shrink-0 rounded-sm border border-border px-3 text-xs disabled:opacity-40"
                >
                  Add
                </button>
              </div>
              {notes === null ? (
                <p className="mt-2 text-xs text-muted-foreground">Loading…</p>
              ) : notes.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No notes yet.</p>
              ) : (
                <div className="mt-2 space-y-1">
                  {notes.map((n) => (
                    <div
                      key={n.id}
                      className="flex items-start justify-between gap-2 rounded-sm border border-border p-2"
                    >
                      <div>
                        <div dir="auto" className="text-xs text-foreground">
                          {n.text}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {n.author} · {new Date(n.created_at).toLocaleString()}
                          {n.pinned ? " · 📌 pinned" : ""}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          onClick={() =>
                            primaryId &&
                            updateOrderNoteAdmin({
                              data: { id: n.id, orderId: primaryId, pinned: !n.pinned },
                            }).then(() => refresh(primaryId))
                          }
                          className="text-[10px] text-cyan-400 hover:underline"
                        >
                          {n.pinned ? "Unpin" : "Pin"}
                        </button>
                        <button
                          onClick={() =>
                            primaryId &&
                            confirm("Delete this note?") &&
                            deleteOrderNoteAdmin({ data: { id: n.id, orderId: primaryId } }).then(
                              () => refresh(primaryId),
                            )
                          }
                          className="text-[10px] text-red-400 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ---- Timeline ---- */}
            <section className="rounded-sm border border-border bg-card p-4">
              <SectionTitle>Order Timeline</SectionTitle>
              {timeline === null ? (
                <p className="mt-2 text-xs text-muted-foreground">Loading…</p>
              ) : timeline.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No events yet.</p>
              ) : (
                <ol className="mt-2 space-y-1.5 border-l border-border pl-3">
                  {timeline.map((ev) => (
                    <li key={ev.id} className="text-xs">
                      <span className="font-medium text-foreground">{humanStage(ev.stage)}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        — {new Date(ev.created_at).toLocaleString()}
                        {ev.actor ? ` · ${ev.actor}` : ""}
                      </span>
                      {ev.note && <div className="text-muted-foreground">{ev.note}</div>}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </div>

        {/* ---- Actions (fixed) ---- */}
        <div className="shrink-0 border-t border-border bg-card px-5 py-3">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setConfirmation("customer_confirmed")}
              disabled={saving}
              className="min-h-[44px] flex-1 rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-3 text-xs font-semibold uppercase tracking-widest text-emerald-300 disabled:opacity-50"
            >
              ✅ Customer Confirmed
            </button>
            <button
              onClick={() => setConfirmation("waiting_for_response")}
              disabled={saving}
              className="min-h-[44px] flex-1 rounded-sm border border-amber-500/40 bg-amber-500/10 px-3 text-xs font-semibold uppercase tracking-widest text-amber-300 disabled:opacity-50"
            >
              ⚠️ Waiting
            </button>
            <button
              onClick={rejectOrder}
              disabled={saving}
              className="min-h-[44px] flex-1 rounded-sm border border-red-500/40 bg-red-500/10 px-3 text-xs font-semibold uppercase tracking-widest text-red-300 disabled:opacity-50"
            >
              ❌ Rejected
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
