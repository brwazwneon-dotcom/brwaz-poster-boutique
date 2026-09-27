// Server-side order → Meta Purchase, kept apart from the server functions so the
// rules are testable:
//  - the Purchase VALUE comes from the STORED order (price-guarded total_price),
//    never from the browser;
//  - the event id is deterministic (purchase_<order number>);
//  - a test order never produces one;
//  - nothing here can fail an order: errors are swallowed and logged as a reason
//    only (never the payload, token or customer data).
import { sql } from "@/lib/neon.server";
import { buildPurchasePayload, isCatalogId, type PurchasePayload } from "@/lib/meta-events";
import { afterResponse, type AfterResponseMode } from "@/lib/after-response.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StoredOrderRow = {
  order_number: string;
  total_price: string | number;
  quantity: number;
  is_test: boolean;
};

/**
 * The product ids the browser says are in the order, kept only if they are real
 * poster ids (nothing else about them is trusted or needed: the Purchase value
 * comes from the stored order). Never throws — a failure just means the
 * Purchase carries no content ids.
 */
export async function validatedPurchaseItems(
  raw: unknown,
): Promise<Array<{ id: string; quantity: number }>> {
  try {
    if (!Array.isArray(raw)) return [];
    const wanted = new Map<string, number>();
    for (const it of raw.slice(0, 50)) {
      const id = (it as { id?: unknown })?.id;
      const qty = Math.trunc(Number((it as { quantity?: unknown })?.quantity));
      if (!isCatalogId(id) || !UUID_RE.test(id) || !Number.isFinite(qty) || qty < 1 || qty > 999)
        continue;
      wanted.set(id, (wanted.get(id) ?? 0) + qty);
    }
    if (wanted.size === 0) return [];
    const found = (await sql()`
      select id from posters where id = any(${[...wanted.keys()]}::uuid[])
    `) as Array<{ id: string }>;
    return found.map((r) => ({ id: r.id, quantity: wanted.get(r.id) ?? 1 }));
  } catch {
    return [];
  }
}

/** Purchase for a framed-poster checkout (one or more stored order rows). */
export async function buildOrderPurchase(args: {
  stored: readonly StoredOrderRow[];
  metaItems?: unknown;
}): Promise<PurchasePayload | null> {
  try {
    if (args.stored.length === 0 || args.stored.some((o) => o.is_test)) return null;
    return buildPurchasePayload({
      orderRef: args.stored[0].order_number,
      storedTotals: args.stored.map((o) => Number(o.total_price)),
      items: await validatedPurchaseItems(args.metaItems),
      fallbackNumItems: args.stored.reduce((s, o) => s + (Number(o.quantity) || 0), 0),
    });
  } catch (err) {
    console.warn("purchase payload not built", err instanceof Error ? err.message : "unknown");
    return null;
  }
}

/**
 * Purchase for a photo-print order, from the server-computed total. Photo orders
 * are their own orders (own order number), so each gets its own deterministic
 * event id; a combined poster + photo checkout therefore sends two Purchase
 * events whose values add up to what was charged. `testMode` can only SUPPRESS.
 */
export function buildPhotoPurchase(args: {
  testMode?: boolean;
  orderNumber: string;
  totalPrice: number;
  photoCount: number;
}): PurchasePayload | null {
  if (args.testMode) return null;
  return buildPurchasePayload({
    orderRef: args.orderNumber,
    storedTotals: [args.totalPrice],
    fallbackNumItems: args.photoCount,
    contentCategory: "Photo Printing",
  });
}

/**
 * Sends the server-side TikTok CompletePayment (same order, same deterministic
 * event id as the browser pixel). Independent of the Meta send: a failure or
 * timeout in one never affects the other, and neither can affect the order.
 */
export async function sendTikTokPurchaseSafely(
  args: {
    purchase: PurchasePayload;
    tracking?: Record<string, unknown>;
    guestSessionId?: string | null;
    phone?: string;
    facts?: { ctx: { ip?: string; ua?: string }; production: boolean };
  },
  opts: { retries?: number; timeoutMs?: number } = {},
): Promise<void> {
  try {
    const { sendTikTokPurchase } = await import("@/lib/tiktok-events.server");
    const r = await sendTikTokPurchase(args, opts);
    // Reasons only — never the payload, the token or customer data.
    if (
      !r.ok ||
      (r.skipped && r.reason !== "events_api_disabled" && r.reason !== "non_production_host")
    )
      console.warn("TikTok CompletePayment not sent:", r.reason ?? r.error ?? r.status);
  } catch (err) {
    console.warn("TikTok CompletePayment failed:", err instanceof Error ? err.message : "unknown");
  }
}

/** Sends the server-side Purchase; never throws, time-boxed (see meta-capi.server.ts). */
export async function sendPurchaseSafely(
  args: {
    purchase: PurchasePayload;
    tracking?: Record<string, unknown>;
    guestSessionId?: string | null;
    phone?: string;
    city?: string;
    facts?: { ctx: { ip?: string; ua?: string }; production: boolean };
  },
  opts: { retries?: number; timeoutMs?: number } = {},
): Promise<void> {
  try {
    const { sendPurchaseToMeta } = await import("@/lib/meta-capi.server");
    const r = await sendPurchaseToMeta(args, opts);
    // Reasons only — never the payload, the token or customer data.
    if (!r.ok || (r.skipped && r.reason !== "capi_disabled" && r.reason !== "non_production_host"))
      console.warn("Meta Purchase not sent:", r.reason ?? r.error ?? r.status);
  } catch (err) {
    console.warn("Meta Purchase failed:", err instanceof Error ? err.message : "unknown");
  }
}

/**
 * Everything that follows a stored order and is about advertising, run so that it
 * can NEVER hold up the customer's response (see after-response.server.ts):
 *  - remember the ad context for the later "OrderConfirmed" event;
 *  - send the server-side Purchase (same event id as the browser Pixel).
 *
 * The request facts (client IP / user agent, the production-host decision) are
 * captured HERE, while the request is still in scope — work that runs after the
 * response cannot read the request. When the work is safely deferred the send may
 * retry once: a retry re-sends the identical payload, so Meta deduplicates it by
 * event_id. When it can only run bounded inside the request, it does not retry.
 * Never throws.
 */
export async function trackNewOrders(args: {
  orderIds: string[];
  orderRef: string;
  purchase: PurchasePayload | null;
  tracking?: Record<string, unknown>;
  guestSessionId?: string | null;
  phone?: string;
  city?: string;
}): Promise<AfterResponseMode | "skipped"> {
  try {
    if (args.orderIds.length === 0 && !args.purchase) return "skipped";
    const { captureRequestFacts, buildAdTracking } = await import("@/lib/meta-capi.server");
    const facts = await captureRequestFacts();
    return await afterResponse(async ({ deferred }) => {
      await Promise.allSettled([
        (async () => {
          if (args.orderIds.length === 0) return;
          try {
            const adTracking = await buildAdTracking(args.tracking, args.orderRef, facts.ctx);
            await sql()`
              update orders set ad_tracking = ${JSON.stringify(adTracking)}::jsonb
              where id = any(${args.orderIds})
            `;
          } catch (err) {
            console.warn("ad_tracking not saved", err instanceof Error ? err.message : "unknown");
          }
        })(),
        args.purchase
          ? sendPurchaseSafely(
              {
                purchase: args.purchase,
                tracking: args.tracking,
                guestSessionId: args.guestSessionId,
                phone: args.phone,
                city: args.city,
                facts,
              },
              deferred ? { retries: 1, timeoutMs: 3_000 } : { retries: 0, timeoutMs: 2_500 },
            )
          : Promise.resolve(),
        args.purchase
          ? sendTikTokPurchaseSafely(
              {
                purchase: args.purchase,
                tracking: args.tracking,
                guestSessionId: args.guestSessionId,
                phone: args.phone,
                facts,
              },
              deferred ? { retries: 1, timeoutMs: 3_000 } : { retries: 0, timeoutMs: 2_500 },
            )
          : Promise.resolve(),
      ]);
    });
  } catch (err) {
    console.warn("order tracking not scheduled", err instanceof Error ? err.message : "unknown");
    return "skipped";
  }
}
