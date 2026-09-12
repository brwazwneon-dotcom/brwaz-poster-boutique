import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { SafeImage } from "@/components/SafeImage";
import { FramedArtwork } from "@/components/FramedArtwork";
import { BestSellers } from "@/components/BestSellers";
import { RecentlyViewed } from "@/components/RecentlyViewed";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart";
import {
  labelForColor,
  labelForFrame,
  labelForSize,
  FRAME_TYPES,
  FRAME_COLORS,
  sizesForFrame,
  type FrameTypeId,
  type SizeId,
  type FrameColorId,
} from "@/lib/poster-options";
import { Trash2, Plus, Minus, Upload, X, FileText } from "lucide-react";
import {
  useSiteSettings,
  computeShipping,
  usePricing,
  usePhoto4x6Config,
  readPostOrderMessageEnabled,
  priceForFrame,
} from "@/lib/use-settings";
import { trackEvent, trackCustom, setUserData } from "@/lib/meta-pixel";
import { isTestMode } from "@/lib/test-mode";
import { visitorId } from "@/lib/analytics";
import { useTranslation } from "react-i18next";

const INSTAPAY_NUMBER = "01090771294";
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_SCREENSHOT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EG_PHONE_RE = /^01\d{9}$/;
const CHECKOUT_DEBUG = true;

function asUuid(value: string | null | undefined): string | null {
  return value && UUID_RE.test(value) ? value : null;
}

// Custom-design cart lines use posterId `custom-${orderUUID}-${idx}` (see
// custom-design.tsx) instead of a real posters.id, so they can be told
// apart from regular poster lines when recomputing price after an
// in-cart frame/size change — those lines must keep the custom design
// fee baked into the frame price, or editing size/frame here would
// silently drop it.
function isCustomDesignPosterId(posterId: string): boolean {
  return posterId.startsWith("custom-");
}

type CheckoutDebugInfo = {
  step: string;
  table?: string;
  operation?: string;
  payload?: unknown;
  error?: unknown;
  result?: unknown;
};

function sanitizeCheckoutDebug(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeCheckoutDebug);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => {
        if (key === "phone")
          return [key, typeof val === "string" ? `${val.slice(0, 3)}***${val.slice(-2)}` : val];
        if (key === "customer_name" || key === "name")
          return [key, typeof val === "string" ? "[customer_name]" : val];
        if (key === "address") return [key, typeof val === "string" ? "[address]" : val];
        if (
          key === "poster_image" ||
          key === "payment_screenshot" ||
          key === "image" ||
          key === "customImagePath"
        ) {
          return [key, val ? "[path/url]" : val];
        }
        if (key === "file") return [key, "[File]"];
        return [key, sanitizeCheckoutDebug(val)];
      }),
    );
  }
  return value;
}

function errorFields(error: unknown) {
  const e = (error ?? {}) as Record<string, unknown>;
  const message =
    typeof e.message === "string"
      ? e.message
      : error instanceof Error
        ? error.message
        : String(error);
  const code = typeof e.code === "string" ? e.code : undefined;
  const details = typeof e.details === "string" ? e.details : undefined;
  const hint = typeof e.hint === "string" ? e.hint : undefined;
  const name =
    typeof e.name === "string" ? e.name : error instanceof Error ? error.name : undefined;
  const status =
    typeof e.status === "number" || typeof e.status === "string" ? e.status : undefined;
  const statusCode =
    typeof e.statusCode === "number" || typeof e.statusCode === "string" ? e.statusCode : undefined;
  const constraint =
    /constraint "([^"]+)"/i.exec(`${message} ${details ?? ""}`)?.[1] ??
    /violates foreign key constraint "([^"]+)"/i.exec(`${message} ${details ?? ""}`)?.[1] ??
    /violates check constraint "([^"]+)"/i.exec(`${message} ${details ?? ""}`)?.[1] ??
    null;
  const missingColumn =
    /column "([^"]+)".*does not exist/i.exec(`${message} ${details ?? ""}`)?.[1] ??
    /Could not find the '([^']+)' column/i.exec(`${message} ${details ?? ""}`)?.[1] ??
    null;
  const isRls = /row-level security|rls/i.test(`${message} ${details ?? ""}`) || code === "42501";
  const isForeignKey = /foreign key/i.test(`${message} ${details ?? ""}`) || code === "23503";
  const isValidation = /check constraint|not-null|null value|invalid input|violates/i.test(
    `${message} ${details ?? ""}`,
  );

  return {
    name,
    message,
    code,
    postgresCode: code,
    details,
    hint,
    status,
    statusCode,
    constraint,
    rlsPolicyName: isRls
      ? "not returned by PostgREST; inspect the table INSERT policy shown with this failing table"
      : null,
    missingColumn,
    foreignKeyError: isForeignKey ? message : null,
    validationError: isValidation ? message : null,
    raw: e,
  };
}

function formatCheckoutError(info: CheckoutDebugInfo) {
  const fields = errorFields(info.error);
  return [
    `Checkout failed at: ${info.step}`,
    info.table ? `Table: ${info.table}` : null,
    info.operation ? `Operation: ${info.operation}` : null,
    `Supabase error: ${fields.message}`,
    fields.postgresCode ? `Postgres code: ${fields.postgresCode}` : null,
    fields.details ? `SQL error/details: ${fields.details}` : null,
    fields.hint ? `Hint: ${fields.hint}` : null,
    fields.constraint ? `Constraint: ${fields.constraint}` : null,
    fields.rlsPolicyName ? `RLS policy: ${fields.rlsPolicyName}` : null,
    fields.missingColumn ? `Missing column: ${fields.missingColumn}` : null,
    fields.foreignKeyError ? `Foreign key error: ${fields.foreignKeyError}` : null,
    fields.validationError ? `Validation error: ${fields.validationError}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

class CheckoutDebugError extends Error {
  info: CheckoutDebugInfo;
  constructor(info: CheckoutDebugInfo) {
    super(formatCheckoutError(info));
    this.name = "CheckoutDebugError";
    this.info = info;
  }
}

function logCheckoutStep(info: CheckoutDebugInfo) {
  if (!CHECKOUT_DEBUG) return;
  const safeInfo = {
    ...info,
    payload: sanitizeCheckoutDebug(info.payload),
    result: sanitizeCheckoutDebug(info.result),
    error: info.error ? errorFields(info.error) : undefined,
  };
  const message = `${info.error ? "[checkout-debug:error]" : "[checkout-debug]"} ${JSON.stringify(safeInfo, null, 2)}`;
  if (info.error) console.error(message);
  else console.info(message);
}

function throwCheckoutError(info: CheckoutDebugInfo): never {
  logCheckoutStep(info);
  throw new CheckoutDebugError(info);
}

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Cart — BRWAZWNEON" },
      {
        name: "description",
        content: "Review your framed posters and place your cash-on-delivery order.",
      },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://brwazwneon.com/cart" }],
  }),
  component: CartPage,
});

const GOVERNORATES = [
  "Cairo",
  "Giza",
  "Alexandria",
  "Qalyubia",
  "Sharqia",
  "Dakahlia",
  "Beheira",
  "Kafr El Sheikh",
  "Gharbia",
  "Monufia",
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

function CartPage() {
  const { items, remove, setQty, update, clear, total } = useCart();
  const settings = useSiteSettings();
  const pricing = usePricing();
  const photo4x6 = usePhoto4x6Config();
  const navigate = useNavigate();
  const subtotal = total;
  // Frame count for double-face-tape upsell: each item is one frame per qty,
  // bundles count all posters inside the bundle × qty.
  const frameCount = items.reduce(
    (s, i) => s + (i.bundle ? i.bundle.posters.length : 1) * i.qty,
    0,
  );
  // Total posters in cart (bundle posters count individually) — drives the
  // tiered bundle discount and the "add N more to unlock" hint.
  const posterCount = items.reduce(
    (s, i) => s + (i.bundle ? i.bundle.posters.length : 1) * i.qty,
    0,
  );
  // Individual same-size counts — duplicates of the same poster (qty > 1)
  // count as separate frames toward the bundle offers.
  const indiv20x30 = items.reduce((s, i) => s + (!i.bundle && i.size === "20x30" ? i.qty : 0), 0);
  const indiv30x40 = items.reduce((s, i) => s + (!i.bundle && i.size === "30x40" ? i.qty : 0), 0);
  // Average unit price the customer is currently paying for a given size —
  // used to compute the exact bundle discount when a full set is present.
  const avgUnitFor = (size: "20x30" | "30x40") => {
    let qty = 0;
    let sum = 0;
    for (const i of items) {
      if (!i.bundle && i.size === size) {
        qty += i.qty;
        sum += i.price * i.qty;
      }
    }
    return qty > 0 ? sum / qty : 0;
  };
  // Auto-apply the bundle offer once the customer reaches a full set of the
  // same size (duplicates count). Discount = (regular total for N frames) −
  // (flat offer price), per completed set.
  const autoOffer20Sets = Math.floor(indiv20x30 / 6);
  const autoOffer30Sets = Math.floor(indiv30x40 / 4);
  const autoOffer20Discount = Math.max(
    0,
    Math.round((avgUnitFor("20x30") * 6 - pricing.offers.bundle6_20x30) * autoOffer20Sets),
  );
  const autoOffer30Discount = Math.max(
    0,
    Math.round((avgUnitFor("30x40") * 4 - pricing.offers.bundle4_30x40) * autoOffer30Sets),
  );
  const autoOfferSets = autoOffer20Sets + autoOffer30Sets;
  const bundle = {
    tier: autoOfferSets > 0 ? ("auto" as const) : null,
    amount: autoOffer20Discount + autoOffer30Discount,
  };
  // Packaging: 20 EGP per bundle (explicit /offers bundles + auto-detected sets).
  const bundleQty = items.reduce((s, i) => s + (i.bundle ? i.qty : 0), 0);
  const packagingFee = (bundleQty + autoOfferSets) * pricing.packagingFee;
  const bundleNudges = [
    {
      key: "bundle-6-20x30" as const,
      size: "20 × 30",
      sizeId: "20x30" as const,
      // Only count the leftover toward the NEXT bundle — full sets are
      // already auto-discounted, no need to nudge for them.
      have: indiv20x30 % 6,
      need: 6,
      price: pricing.offers.bundle6_20x30,
    },
    {
      key: "bundle-4-30x40" as const,
      size: "30 × 40",
      sizeId: "30x40" as const,
      have: indiv30x40 % 4,
      need: 4,
      price: pricing.offers.bundle4_30x40,
    },
  ]
    // Show a nudge for EACH size independently so the customer can see
    // both the 20×30 (6-pack) and 30×40 (4-pack) offers at the same time
    // when they're close to either bundle.
    .filter((n) => n.have > 0 && n.have < n.need)
    .map((n) => {
      const unit = avgUnitFor(n.sizeId);
      const wouldPay = unit * n.need;
      const savings = Math.max(0, Math.round(wouldPay - n.price));
      const savingsPct = wouldPay > 0 ? Math.round((savings / wouldPay) * 100) : 0;
      const progressPct = Math.min(100, Math.round((n.have / n.need) * 100));
      return { ...n, savings, savingsPct, progressPct };
    });
  const [tapeChoice, setTapeChoice] = useState<null | boolean>(null);
  const [tapeOpen, setTapeOpen] = useState(false);
  const [photoUpsellOpen, setPhotoUpsellOpen] = useState(false);
  const [photoUpsellShown, setPhotoUpsellShown] = useState(false);
  const tapeUnit = pricing.doubleFaceTapePrice;
  const tapeTotal = tapeChoice === true ? frameCount * tapeUnit : 0;
  const discountedSubtotal = Math.max(0, subtotal - bundle.amount);
  const shipping = computeShipping(discountedSubtotal + tapeTotal, settings);
  const grand = discountedSubtotal + packagingFee + tapeTotal + shipping;
  const remainingForFree = Math.max(0, settings.freeShippingThreshold - discountedSubtotal);
  const freeShipPct =
    settings.freeShippingThreshold > 0
      ? Math.min(100, Math.round((discountedSubtotal / settings.freeShippingThreshold) * 100))
      : 100;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "instapay">("cod");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [zoomItem, setZoomItem] = useState<null | {
    image: string;
    title: string;
    frameType: FrameTypeId;
    color: FrameColorId;
    editSettings?: import("@/lib/poster-edit").EditSettings;
  }>(null);
  const { t } = useTranslation();

  // Fire a ViewCart custom event once per mount with the current cart contents
  // so Meta audiences can retarget cart abandoners.
  const viewCartFired = useRef(false);
  useEffect(() => {
    if (viewCartFired.current) return;
    if (items.length === 0) return;
    viewCartFired.current = true;
    try {
      trackCustom("ViewCart", {
        content_ids: items.map((i) => i.posterId).filter(Boolean),
        contents: items.map((i) => ({ id: i.posterId, quantity: i.qty })),
        content_type: "product",
        num_items: items.reduce((s, i) => s + i.qty, 0),
        value: total,
        currency: "EGP",
      });
    } catch {
      /* noop */
    }
  }, [items, total]);

  // Fire a Lead + AddPhoneNumber the first time the customer enters a valid
  // Egyptian phone number. Debounced so we don't fire on every keystroke.
  const phoneLeadFired = useRef(false);
  useEffect(() => {
    if (phoneLeadFired.current) return;
    if (!EG_PHONE_RE.test(phone.trim())) return;
    phoneLeadFired.current = true;
    try {
      setUserData({ phone: phone.trim(), country: "EG" });
    } catch {
      /* noop */
    }
    try {
      trackEvent(
        "Lead",
        { content_name: "cart_phone_entered", currency: "EGP", value: total },
        { phone: phone.trim(), country: "EG" },
      );
    } catch {
      /* noop */
    }
    try {
      trackCustom(
        "AddPhoneNumber",
        { currency: "EGP", value: total },
        { phone: phone.trim(), country: "EG" },
      );
    } catch {
      /* noop */
    }
  }, [phone, total]);

  const handleScreenshotChange = (file: File | null) => {
    if (!file) {
      setScreenshot(null);
      setScreenshotPreview(null);
      return;
    }
    if (!ALLOWED_SCREENSHOT_TYPES.includes(file.type)) {
      toast.error(t("cart.onlyJpgPngWebpPdf"));
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      toast.error(t("cart.maxFileSize"));
      return;
    }
    setScreenshot(file);
    setScreenshotPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
  };

  const handlePlaceOrderClick = () => {
    if (items.length === 0) return toast.error(t("cart.empty"));
    if (!name || !phone || !governorate || !address)
      return toast.error(t("cart.fillDeliveryFields"));
    if (!EG_PHONE_RE.test(phone.trim()))
      return toast.error("رقم الموبايل لازم يكون 11 رقم ويبدأ بـ 01");
    if (paymentMethod === "instapay" && !screenshot)
      return toast.error(t("cart.uploadPaymentScreenshot"));
    // Show the upsell popup once per checkout session, only if enabled.
    if (pricing.doubleFaceTapeEnabled && tapeUnit > 0 && frameCount > 0 && tapeChoice === null) {
      setTapeOpen(true);
      return;
    }
    // 4×6 photo upsell (once per session)
    if (
      photo4x6.enabled &&
      photo4x6.upsellEnabled &&
      !photoUpsellShown &&
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem("photo4x6_upsell_shown") !== "1"
    ) {
      setPhotoUpsellOpen(true);
      setPhotoUpsellShown(true);
      sessionStorage.setItem("photo4x6_upsell_shown", "1");
      return;
    }
    void handleOrder();
  };

  const handleOrder = async () => {
    if (submittingRef.current) return;
    if (items.length === 0) return toast.error(t("cart.empty"));
    if (!name || !phone || !governorate || !address)
      return toast.error(t("cart.fillDeliveryFields"));
    if (!EG_PHONE_RE.test(phone.trim()))
      return toast.error("رقم الموبايل لازم يكون 11 رقم ويبدأ بـ 01");
    if (paymentMethod === "instapay" && !screenshot)
      return toast.error(t("cart.uploadPaymentScreenshot"));

    setCheckoutError(null);
    submittingRef.current = true;
    setSubmitting(true);
    const contentIds = items.flatMap((i) =>
      i.bundle ? i.bundle.posters.map((p) => p.posterId) : [i.posterId],
    );
    const checkoutTotals = {
      subtotal,
      discount: bundle.amount,
      shipping,
      packaging: packagingFee,
      tape: tapeTotal,
      total: grand,
      paymentMethod,
      itemCount: items.length,
      posterCount,
      frameCount,
    };
    logCheckoutStep({
      step: "checkout_clicked",
      payload: {
        customer: { name, phone, governorate, address },
        items,
        totals: checkoutTotals,
      },
    });
    setUserData({ phone, city: governorate, country: "EG" });
    try {
      logCheckoutStep({
        step: "meta_pixel_initiate_checkout",
        operation: "trackEvent",
        payload: {
          content_ids: contentIds,
          contents: items.map((i) => ({ id: i.posterId, quantity: i.qty })),
          num_items: items.reduce((s, i) => s + i.qty, 0),
          value: grand,
          currency: "EGP",
        },
      });
      trackEvent(
        "InitiateCheckout",
        {
          content_ids: contentIds,
          contents: items.map((i) => ({ id: i.posterId, quantity: i.qty })),
          num_items: items.reduce((s, i) => s + i.qty, 0),
          value: grand,
          currency: "EGP",
        },
        { phone, city: governorate, country: "EG" },
      );
    } catch (err) {
      logCheckoutStep({
        step: "meta_pixel_initiate_checkout",
        operation: "trackEvent",
        error: err,
      });
    }
    try {
      const { logCheckoutStart } = await import("@/lib/analytics");
      logCheckoutStep({
        step: "analytics_checkout_start",
        table: "analytics_poster_events",
        operation: "insert",
      });
      logCheckoutStart();
    } catch (err) {
      logCheckoutStep({
        step: "analytics_checkout_start",
        table: "analytics_poster_events",
        operation: "insert",
        error: err,
      });
    }
    try {
      const { track } = await import("@/lib/behavior");
      logCheckoutStep({
        step: "behavior_checkout_start",
        table: "visitor_cart_events",
        operation: "insert",
      });
      track.checkoutStart();
    } catch (err) {
      logCheckoutStep({
        step: "behavior_checkout_start",
        table: "visitor_cart_events",
        operation: "insert",
        error: err,
      });
    }
    try {
      // TEMPORARY (Phase 1): payment-screenshot upload is disabled until
      // object storage is wired up on the new infrastructure (Phase 4).
      // Instapay orders still go through — the admin follows up over
      // WhatsApp for proof of payment in the meantime, same as any order
      // where a customer doesn't attach a screenshot today.
      const screenshotPath: string | null = null;

      const shippingPerItem = items.length > 0 ? shipping / items.length : 0;
      const testFlag = isTestMode();
      const guestSessionId = visitorId();
      // Apply bundle discount pro-rata to each item so DB totals line up
      // exactly with what the customer sees at checkout.
      const discountRatio = subtotal > 0 ? bundle.amount / subtotal : 0;
      const rows = items.map((i) => {
        const linePackaging = i.bundle ? pricing.packagingFee * i.qty : 0;
        const lineGross = i.price * i.qty;
        const lineDiscount = Math.round(lineGross * discountRatio);
        const lineNet = lineGross - lineDiscount;
        return {
          guest_session_id: guestSessionId,
          customer_name: name,
          phone,
          governorate,
          address,
          frame_type: labelForFrame(i.frameType),
          frame_color: labelForColor(i.color),
          size: labelForSize(i.size),
          quantity: i.qty,
          selected_poster: i.bundle ? null : asUuid(i.posterId),
          poster_title: i.bundle
            ? `${i.title} — ${i.bundle.posters.map((p) => p.title).join(", ")}`
            : i.title,
          poster_image: i.customImagePath ?? i.image,
          notes: i.customImageMeta ? JSON.stringify(i.customImageMeta) : null,
          subtotal: lineNet,
          packaging_fee: linePackaging,
          shipping_cost: shippingPerItem,
          total_price: lineNet + linePackaging + shippingPerItem,
          status: "new",
          payment_method: paymentMethod,
          payment_status: paymentMethod === "instapay" ? "pending" : "not_required",
          payment_screenshot: screenshotPath,
          is_test: testFlag,
        };
      });
      // Append the double-face-tape line as its own order row when chosen.
      if (tapeChoice === true && tapeTotal > 0) {
        rows.push({
          guest_session_id: guestSessionId,
          customer_name: name,
          phone,
          governorate,
          address,
          frame_type: labelForFrame("pvc"),
          frame_color: labelForColor("black"),
          size: labelForSize("20x30"),
          quantity: frameCount,
          selected_poster: null,
          poster_title: "Double Face Tape",
          poster_image: "",
          subtotal: tapeTotal,
          packaging_fee: 0,
          shipping_cost: 0,
          total_price: tapeTotal,
          status: "new",
          payment_method: paymentMethod,
          payment_status: paymentMethod === "instapay" ? "pending" : "not_required",
          payment_screenshot: screenshotPath,
          is_test: testFlag,
        } as (typeof rows)[number]);
      }
      const orderPayloadDebug = {
        customer: { name, phone, governorate, address },
        order: {
          payment_method: paymentMethod,
          payment_screenshot: screenshotPath,
          is_test: testFlag,
          guest_session_id: guestSessionId,
        },
        order_items: rows,
        totals: checkoutTotals,
      };
      logCheckoutStep({
        step: "orders_insert_start",
        table: "orders",
        operation: "insert",
        payload: orderPayloadDebug,
      });
      const { createOrderRows } = await import("@/lib/db-orders.functions");
      let error: unknown = null;
      try {
        await createOrderRows({ data: { rows } });
      } catch (e) {
        error = e instanceof Error ? e : new Error(String(e));
      }
      if (error) {
        throwCheckoutError({
          step: "orders_insert",
          table: "orders",
          operation: "insert",
          payload: orderPayloadDebug,
          error,
        });
      }
      logCheckoutStep({
        step: "orders_insert_complete",
        table: "orders",
        operation: "insert",
        result: { insertedRows: rows.length },
      });

      // Fire admin push notifications (non-blocking — checkout must never fail on this).
      // Skip notifications for test orders unless caller opts in via ?send_test_notification=1.
      const wantsTestNotify =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("send_test_notification") === "1";
      try {
        if (testFlag && !wantsTestNotify) throw new Error("skip test notify");
        // The order insert intentionally does not request returned rows; guest
        // customers should be able to create orders without gaining read access.
      } catch (e) {
        console.warn("order notification failed", e);
      }

      // Purchase event — once order is persisted.
      try {
        trackEvent(
          "Purchase",
          {
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
          },
          { phone, city: governorate, country: "EG" },
        );
        // Mirror as a custom event for audiences that segment on OrderCreated.
        try {
          trackCustom(
            "OrderCreated",
            {
              content_ids: contentIds,
              num_items: items.reduce((s, i) => s + i.qty, 0),
              value: grand,
              currency: "EGP",
              order_id: `BRW-${Date.now()}`,
            },
            { phone, city: governorate, country: "EG" },
          );
        } catch {
          /* noop */
        }
      } catch (err) {
        logCheckoutStep({ step: "meta_pixel_purchase", operation: "trackEvent", error: err });
      }

      // Bump purchase counts for posters in this order (non-blocking).
      // Skip for test orders so they don't inflate sales counters.
      try {
        if (testFlag) throw new Error("skip test sales tracking");
        const { trackPosterSales } = await import("@/lib/poster-tracking");
        const ids: string[] = [];
        const qtyById = new Map<string, number>();
        for (const i of items) {
          if (i.bundle) {
            for (const p of i.bundle.posters) {
              if (!asUuid(p.posterId)) continue;
              qtyById.set(p.posterId, (qtyById.get(p.posterId) ?? 0) + i.qty);
              ids.push(p.posterId);
            }
          } else if (asUuid(i.posterId)) {
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
        logCheckoutStep({
          step: "poster_sales_tracking",
          table: "posters",
          operation: "rpc increment_poster_sales",
          error: e,
        });
      }

      // Post-order success message — controlled by the admin "Post-Order
      // Settings" toggle. Read fresh from Supabase at success time so OFF is
      // always honored; the message code stays; only its visibility is gated.
      const showSuccessMessage = await readPostOrderMessageEnabled().catch(() => true);
      if (showSuccessMessage) {
        toast.success("تم استلام طلبك بنجاح، سنتواصل معك قريبًا لتأكيد التفاصيل.");
      }
      try {
        const { track } = await import("@/lib/behavior");
        const pids = items.flatMap((i) =>
          i.bundle ? i.bundle.posters.map((p) => p.posterId) : i.posterId ? [i.posterId] : [],
        );
        logCheckoutStep({
          step: "behavior_purchase",
          table: "visitor_cart_events",
          operation: "insert/rpc",
          payload: { posterIds: pids },
        });
        track.purchase(phone, pids);
      } catch (err) {
        logCheckoutStep({
          step: "behavior_purchase",
          table: "visitor_cart_events",
          operation: "insert/rpc",
          error: err,
        });
      }
      clear();
      setName("");
      setPhone("");
      setGovernorate("");
      setAddress("");
      setScreenshot(null);
      setScreenshotPreview(null);
      setPaymentMethod("cod");
      setTapeChoice(null);
      setTapeOpen(false);
    } catch (err) {
      logCheckoutStep({ step: "checkout_failed", error: err });
      const message = err instanceof Error ? err.message : String(err);
      setCheckoutError(message);
      toast.error(message);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="container-page py-16">
      <h1 className="text-display text-5xl sm:text-7xl">{t("cart.title")}</h1>
      <p className="mt-3 text-xs uppercase tracking-[0.25em] text-muted-foreground">
        🚚 Shipping Across Egypt: {settings.shippingFee} EGP · 🎉 Free over{" "}
        {settings.freeShippingThreshold} EGP
      </p>

      {items.length === 0 ? (
        <div className="mt-8">
          <div className="rounded-sm border border-dashed border-border p-16 text-center">
            <p className="text-muted-foreground">{t("cart.empty")}</p>
            <p className="mt-2 text-sm text-muted-foreground">{t("cart.emptySubtitle")}</p>
            <Link
              to="/"
              className="mt-6 inline-flex rounded-sm bg-primary px-8 py-4 text-xs font-semibold uppercase tracking-widest text-primary-foreground transition hover:opacity-90"
            >
              {t("cart.continueShopping")}
            </Link>
          </div>
          <div className="mt-16 space-y-16">
            <BestSellers />
            <RecentlyViewed />
          </div>
        </div>
      ) : (
        <div className="mt-12 grid gap-10 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-3">
            {bundleNudges.map((n) => {
              const missing = n.need - n.have;
              return (
                <div
                  key={n.key}
                  className="relative overflow-hidden rounded-sm border border-primary/50 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-lg">
                      🎁
                    </div>
                    <div className="flex-1">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-primary">
                        Bundle offer · {n.size} cm
                      </div>
                      <div className="mt-1 text-sm font-semibold text-foreground">
                        أضف {missing} برواز {missing === 1 ? "إضافي" : "كمان"} من مقاس {n.size}{" "}
                        واحصل على الـ{n.need} بسعر {n.price} {t("egp")} فقط
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        عندك {n.have} من أصل {n.need}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-sm border border-primary/30 bg-primary/10 px-3 py-2 text-xs">
                        <span className="text-muted-foreground">
                          ناقصك <span className="font-bold text-foreground">{missing}</span> برواز
                          بس
                        </span>
                        {n.savings > 0 ? (
                          <span className="text-muted-foreground">
                            · هتوفر{" "}
                            <span className="font-bold text-primary">
                              {n.savings} {t("egp")}
                            </span>
                            {n.savingsPct > 0 ? (
                              <span className="text-primary/80"> ({n.savingsPct}%)</span>
                            ) : null}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.2em]">
                          <span className="text-muted-foreground">
                            ناقص <span className="text-foreground">{missing}</span> برواز
                          </span>
                          <span className="text-primary">
                            {n.progressPct}%
                            {n.savingsPct > 0 ? (
                              <span className="ms-2 text-muted-foreground">
                                · توفير <span className="text-primary">{n.savingsPct}%</span>
                              </span>
                            ) : null}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-all duration-300"
                            style={{ width: `${n.progressPct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {items.map((i) => (
              <div key={i.id} className="flex gap-4 rounded-sm border border-border bg-card p-4">
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    const el = e.currentTarget;
                    el.setPointerCapture?.(e.pointerId);
                    (el as unknown as { _zoomTimer?: ReturnType<typeof setTimeout> })._zoomTimer =
                      setTimeout(() => {
                        setZoomItem({
                          image: i.image,
                          title: i.title,
                          frameType: i.frameType,
                          color: i.color,
                          editSettings: i.editSettings,
                        });
                      }, 200);
                  }}
                  onPointerUp={(e) => {
                    const el = e.currentTarget as unknown as {
                      _zoomTimer?: ReturnType<typeof setTimeout>;
                    };
                    if (el._zoomTimer) {
                      clearTimeout(el._zoomTimer);
                      el._zoomTimer = undefined;
                    }
                    setZoomItem(null);
                  }}
                  onPointerLeave={(e) => {
                    const el = e.currentTarget as unknown as {
                      _zoomTimer?: ReturnType<typeof setTimeout>;
                    };
                    if (el._zoomTimer) {
                      clearTimeout(el._zoomTimer);
                      el._zoomTimer = undefined;
                    }
                    setZoomItem(null);
                  }}
                  onPointerCancel={(e) => {
                    const el = e.currentTarget as unknown as {
                      _zoomTimer?: ReturnType<typeof setTimeout>;
                    };
                    if (el._zoomTimer) {
                      clearTimeout(el._zoomTimer);
                      el._zoomTimer = undefined;
                    }
                    setZoomItem(null);
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                  className="w-20 shrink-0 cursor-zoom-in touch-none select-none rounded-sm transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary"
                  aria-label={`Press and hold to zoom ${i.title}`}
                >
                  <FramedArtwork
                    posterUrl={i.image}
                    title={i.title}
                    frameType={i.frameType}
                    color={i.color}
                    editSettings={i.editSettings}
                  />
                </button>
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{i.title}</div>
                      {i.bundle ? (
                        <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                          {labelForFrame(i.frameType)} · {labelForSize(i.size)} ·{" "}
                          {labelForColor(i.color)}
                        </div>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <label className="flex flex-col gap-0.5">
                            <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                              {t("product.frameType")}
                            </span>
                            <select
                              value={i.frameType}
                              onChange={(e) => {
                                const frameType = e.target.value as FrameTypeId;
                                const allowed = sizesForFrame(frameType);
                                const size = (
                                  allowed.includes(i.size) ? i.size : allowed[0]
                                ) as SizeId;
                                const framePrice = priceForFrame(pricing, frameType, size);
                                const price = framePrice
                                  ? isCustomDesignPosterId(i.posterId)
                                    ? framePrice + pricing.customDesignFee
                                    : framePrice
                                  : i.price;
                                update(i.id, { frameType, size, price });
                              }}
                              className="rounded-sm border border-border bg-background px-2 py-1 text-xs"
                            >
                              {FRAME_TYPES.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-0.5">
                            <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                              {t("product.size")}
                            </span>
                            <select
                              value={i.size}
                              onChange={(e) => {
                                const size = e.target.value as SizeId;
                                const framePrice = priceForFrame(pricing, i.frameType, size);
                                const price = framePrice
                                  ? isCustomDesignPosterId(i.posterId)
                                    ? framePrice + pricing.customDesignFee
                                    : framePrice
                                  : i.price;
                                update(i.id, { size, price });
                              }}
                              className="rounded-sm border border-border bg-background px-2 py-1 text-xs"
                            >
                              {sizesForFrame(i.frameType).map((sid) => (
                                <option key={sid} value={sid}>
                                  {labelForSize(sid)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-0.5">
                            <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                              {t("product.frameColor")}
                            </span>
                            <select
                              value={i.color}
                              onChange={(e) =>
                                update(i.id, { color: e.target.value as FrameColorId })
                              }
                              className="rounded-sm border border-border bg-background px-2 py-1 text-xs"
                            >
                              {FRAME_COLORS.filter((c) => c.id === "black" || c.id === "white").map(
                                (c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.label}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>
                        </div>
                      )}
                      {i.bundle && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {i.bundle.posters.map((p) => (
                            <div
                              key={p.posterId}
                              className="h-12 w-9 overflow-hidden rounded-sm border border-border"
                            >
                              <FramedArtwork
                                posterUrl={p.image}
                                title={p.title}
                                frameType={i.frameType}
                                color={i.color}
                                editSettings={i.editSettings}
                                loading="lazy"
                                className="h-full w-full"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => remove(i.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={t("cart.remove")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="inline-flex items-center rounded-sm border border-border">
                      <button
                        aria-label="Decrease quantity"
                        className="p-2 hover:bg-accent"
                        onClick={() => setQty(i.id, i.qty - 1)}
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-8 text-center text-sm">{i.qty}</span>
                      <button
                        aria-label="Increase quantity"
                        className="p-2 hover:bg-accent"
                        onClick={() => setQty(i.id, i.qty + 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="text-display text-xl">
                      {i.price * i.qty}{" "}
                      <span className="text-sm text-muted-foreground">{t("egp")}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <button
              onClick={clear}
              className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              {t("cart.clearCart")}
            </button>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-sm border border-border bg-card p-6">
              <h2 className="text-display text-2xl">{t("cart.checkout")}</h2>
              <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                Cash on delivery · Instapay · Vodafone Cash
              </p>
              {items.length > 0 && (
                <div className="mt-5 rounded-sm border border-border bg-background/40 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Your order · ملخص طلبك
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {items.reduce((s, i) => s + i.qty, 0)} item(s)
                    </span>
                  </div>
                  <ul className="space-y-3">
                    {items.map((i) => (
                      <li key={`sum-${i.id}`} className="flex gap-3">
                        <div className="w-12 shrink-0">
                          <FramedArtwork
                            posterUrl={i.image}
                            title={i.title}
                            frameType={i.frameType}
                            color={i.color}
                            editSettings={i.editSettings}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className="truncate text-xs font-semibold">{i.title}</span>
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              ×{i.qty}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                            <span className="rounded-sm border border-border bg-card px-1.5 py-0.5 uppercase tracking-widest text-muted-foreground">
                              {labelForFrame(i.frameType)}
                            </span>
                            <span className="rounded-sm border border-border bg-card px-1.5 py-0.5 uppercase tracking-widest text-muted-foreground">
                              {labelForSize(i.size)}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-card px-1.5 py-0.5 uppercase tracking-widest text-muted-foreground">
                              <span
                                aria-hidden
                                className="inline-block h-2.5 w-2.5 rounded-full border border-border"
                                style={{
                                  background:
                                    i.color === "white"
                                      ? "#f5f5f2"
                                      : i.color === "wood"
                                        ? "#5a3a20"
                                        : "#0a0a0a",
                                }}
                              />
                              {labelForColor(i.color)}
                            </span>
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {i.price * i.qty} {t("egp")}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-5 space-y-3">
                <Field label={t("checkout.fullName")} value={name} onChange={setName} />
                <label className="block">
                  <span className="text-xs uppercase tracking-widest text-muted-foreground">
                    {t("checkout.phone")}
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    maxLength={11}
                    placeholder={t("cart.phonePlaceholder")}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    className={`mt-1 w-full rounded-sm border bg-background px-3 py-2 text-sm outline-none focus:border-primary ${phone && !EG_PHONE_RE.test(phone) ? "border-destructive" : "border-border"}`}
                    aria-invalid={phone.length > 0 && !EG_PHONE_RE.test(phone)}
                  />
                  {phone.length > 0 && !EG_PHONE_RE.test(phone) && (
                    <span className="mt-1 block text-[11px] text-destructive">
                      رقم الموبايل لازم يكون 11 رقم ويبدأ بـ 01
                    </span>
                  )}
                </label>
                <label className="block">
                  <span className="text-xs uppercase tracking-widest text-muted-foreground">
                    {t("checkout.governorate")}
                  </span>
                  <select
                    value={governorate}
                    onChange={(e) => setGovernorate(e.target.value)}
                    className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  >
                    <option value="">{t("cart.selectGovernorate")}</option>
                    {GOVERNORATES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </label>
                <Field
                  label={t("checkout.address")}
                  value={address}
                  onChange={setAddress}
                  textarea
                />
              </div>
              <div className="mt-5 border-t border-border pt-4">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">
                  {t("checkout.paymentMethod")}
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-sm border p-3 text-sm transition ${paymentMethod === "cod" ? "border-primary bg-accent/40" : "border-border hover:bg-accent/20"}`}
                  >
                    <input
                      type="radio"
                      name="pm"
                      value="cod"
                      checked={paymentMethod === "cod"}
                      onChange={() => setPaymentMethod("cod")}
                      className="mt-0.5 accent-primary"
                    />
                    <div>
                      <div className="font-semibold">{t("checkout.cashOnDelivery")}</div>
                      <div className="text-xs text-muted-foreground">
                        Pay in cash when your order arrives.
                      </div>
                    </div>
                  </label>
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-sm border p-3 text-sm transition ${paymentMethod === "instapay" ? "border-primary bg-accent/40" : "border-border hover:bg-accent/20"}`}
                  >
                    <input
                      type="radio"
                      name="pm"
                      value="instapay"
                      checked={paymentMethod === "instapay"}
                      onChange={() => setPaymentMethod("instapay")}
                      className="mt-0.5 accent-primary"
                    />
                    <div>
                      <div className="font-semibold">{t("checkout.instapayVodafoneCash")}</div>
                      <div className="text-xs text-muted-foreground">
                        Transfer, then upload your payment screenshot.
                      </div>
                    </div>
                  </label>
                </div>
                {paymentMethod === "instapay" && (
                  <div className="mt-3 space-y-3 rounded-sm border border-border bg-background p-3">
                    <p className="text-xs leading-relaxed">Please transfer the total amount to:</p>
                    <div className="flex items-center justify-between gap-2 rounded-sm border border-border bg-card px-3 py-2">
                      <span className="text-display text-lg tracking-widest">
                        {INSTAPAY_NUMBER}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard
                            ?.writeText(INSTAPAY_NUMBER)
                            .then(() => toast.success(t("cart.numberCopied")));
                        }}
                        className="rounded-sm border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:bg-accent"
                      >
                        {t("cart.copy")}
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      (Instapay or Vodafone Cash) — After payment, upload your payment screenshot
                      below.
                    </p>

                    {screenshot ? (
                      <div className="relative overflow-hidden rounded-sm border border-border">
                        {screenshotPreview ? (
                          <img
                            src={screenshotPreview}
                            alt="Payment screenshot"
                            className="max-h-56 w-full object-contain bg-black/40"
                          />
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
                            <X className="h-3 w-3" /> {t("cart.remove")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOver(true);
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragOver(false);
                          const f = e.dataTransfer.files?.[0];
                          if (f) handleScreenshotChange(f);
                        }}
                        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-sm border border-dashed p-6 text-center text-xs transition ${dragOver ? "border-primary bg-accent/40" : "border-border hover:bg-accent/20"}`}
                      >
                        <Upload className="h-5 w-5 text-muted-foreground" />
                        <span className="font-medium">{t("cart.screenshotUpload")}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {t("cart.screenshotHint")}
                        </span>
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
              {/* Trust badges */}
              <div className="mt-6 space-y-3">
                <div className="rounded-sm border border-border bg-card p-4">
                  <h4 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                    {t("cart.secureCheckout")}
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>🔒</span>
                      <span>{t("cart.securePayment")}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>💳</span>
                      <span>{t("checkout.cashOnDelivery")}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>📱</span>
                      <span>{t("cart.instapay")}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>🛡️</span>
                      <span>{t("cart.returnPolicy")}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-6 space-y-2 border-t border-border pt-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("cart.subtotal")}</span>
                  <span>
                    {subtotal} {t("egp")}
                  </span>
                </div>
                {bundle.amount > 0 && (
                  <div className="flex items-center justify-between text-emerald-500">
                    <span className="flex items-center gap-2">
                      <span aria-hidden>🎁</span>
                      Bundle offer applied
                    </span>
                    <span>
                      − {bundle.amount} {t("egp")}
                    </span>
                  </div>
                )}
                {packagingFee > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">📦 {t("cart.packagingFee")}</span>
                    <span>
                      {packagingFee} {t("egp")}
                    </span>
                  </div>
                )}
                {tapeTotal > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      🩹 {t("cart.doubleFaceTape")} ({frameCount} × {tapeUnit})
                    </span>
                    <span>
                      {tapeTotal} {t("egp")}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">🚚 {t("cart.shipping")}</span>
                  <span>{shipping === 0 ? t("cart.freeShipping") : `${shipping} ${t("egp")}`}</span>
                </div>
                <div className="pt-1">
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span
                      className={remainingForFree > 0 ? "text-muted-foreground" : "text-foreground"}
                    >
                      {remainingForFree > 0
                        ? `Add ${remainingForFree} EGP more for free shipping`
                        : "🎉 Free shipping unlocked"}
                    </span>
                    <span className="tabular-nums text-muted-foreground">{freeShipPct}%</span>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={freeShipPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Progress toward free shipping"
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out will-change-[width]"
                      style={{ width: `${freeShipPct}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <span className="text-muted-foreground">{t("cart.total")}</span>
                  <span className="text-display text-3xl">
                    {grand} <span className="text-base text-muted-foreground">{t("egp")}</span>
                  </span>
                </div>
              </div>
              <button
                onClick={handlePlaceOrderClick}
                disabled={submitting}
                className="mt-5 w-full rounded-sm bg-primary px-4 py-4 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? t("cart.placingOrder") : t("cart.confirmOrder")}
              </button>
              {checkoutError && (
                <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-sm border border-destructive/40 bg-destructive/10 p-3 text-left text-[11px] leading-relaxed text-destructive">
                  {checkoutError}
                </pre>
              )}
              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                Your order has been received. We will contact you soon to confirm the details.
              </p>
            </div>
          </aside>
        </div>
      )}
      {tapeOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={t("cart.needDoubleFaceTape")}
        >
          <div className="w-full max-w-md rounded-sm border border-border bg-card p-6 shadow-2xl">
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              {t("cart.optionalAddOn")}
            </div>
            <h2 className="text-display mt-2 text-3xl leading-tight">
              {t("cart.needDoubleFaceTape")}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">{t("cart.doubleFaceTapeDesc")}</p>
            <div className="mt-5 rounded-sm border border-border bg-background p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-xs uppercase tracking-widest text-muted-foreground">
                  {t("cart.unitPrice", { price: tapeUnit })} · {frameCount}{" "}
                  {t("cart.frames", { count: frameCount })}
                </span>
                <span className="text-display text-2xl">
                  {frameCount * tapeUnit}{" "}
                  <span className="text-xs text-muted-foreground">{t("egp")}</span>
                </span>
              </div>
            </div>
            <div className="mt-6 space-y-2">
              <button
                onClick={() => {
                  setTapeChoice(true);
                  setTapeOpen(false);
                  setTimeout(() => {
                    void handleOrder();
                  }, 0);
                }}
                className="w-full rounded-sm bg-primary px-4 py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90"
              >
                {t("cart.yesAddDoubleFaceTape")}
              </button>
              <button
                onClick={() => {
                  setTapeChoice(false);
                  setTapeOpen(false);
                  setTimeout(() => {
                    void handleOrder();
                  }, 0);
                }}
                className="w-full rounded-sm border border-border px-4 py-3 text-xs font-semibold uppercase tracking-widest hover:bg-accent"
              >
                {t("cart.noContinueWithoutIt")}
              </button>
            </div>
          </div>
        </div>
      )}
      {photoUpsellOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={t("photo4x6.printing")}
        >
          <div className="w-full max-w-md rounded-sm border border-border bg-card p-6 shadow-2xl">
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              {t("cart.optionalAddOn")}
            </div>
            <h2 className="text-display mt-2 text-3xl leading-tight">{photo4x6.upsellTitle}</h2>
            <p className="mt-3 text-sm text-muted-foreground">{photo4x6.upsellSubtitle}</p>
            {photo4x6.upsellExampleImage && (
              <img
                src={photo4x6.upsellExampleImage}
                alt=""
                className="mt-4 aspect-video w-full rounded-sm border border-border object-cover"
              />
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {photo4x6.packages.slice(0, 2).map((p) => (
                <div
                  key={p.key}
                  className="rounded-sm border border-border bg-background p-3 text-center"
                >
                  <div className="text-display text-2xl">{p.photos}</div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {t("photo4x6.photos")}
                  </div>
                  <div className="mt-1 text-display text-xl">
                    {p.price} {t("egp")}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 space-y-2">
              <button
                onClick={() => {
                  setPhotoUpsellOpen(false);
                  navigate({ to: "/photo-4x6", search: { from: "checkout" } });
                }}
                className="w-full rounded-sm bg-primary px-4 py-3 text-xs font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90"
              >
                {t("photo4x6.addPhotos")}
              </button>
              <button
                onClick={() => {
                  setPhotoUpsellOpen(false);
                  setTimeout(() => {
                    void handleOrder();
                  }, 0);
                }}
                className="w-full rounded-sm border border-border px-4 py-3 text-xs font-semibold uppercase tracking-widest hover:bg-accent"
              >
                {t("cart.continueWithoutIt")}
              </button>
            </div>
          </div>
        </div>
      )}
      {zoomItem && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setZoomItem(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setZoomItem(null)}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-sm bg-background/80 p-2 text-foreground hover:bg-background"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="relative w-full max-w-[520px]" onClick={(e) => e.stopPropagation()}>
            <FramedArtwork
              posterUrl={zoomItem.image}
              title={zoomItem.title}
              frameType={zoomItem.frameType}
              color={zoomItem.color}
              editSettings={zoomItem.editSettings}
            />
            <div className="mt-3 text-center text-sm font-semibold text-white">
              {zoomItem.title}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  textarea = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  textarea?: boolean;
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
