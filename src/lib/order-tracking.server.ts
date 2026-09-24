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

/** Sends the server-side Purchase; never throws, time-boxed (see meta-capi.server.ts). */
export async function sendPurchaseSafely(args: {
  purchase: PurchasePayload;
  tracking?: Record<string, unknown>;
  guestSessionId?: string | null;
  phone?: string;
  city?: string;
}): Promise<void> {
  try {
    const { sendPurchaseToMeta } = await import("@/lib/meta-capi.server");
    const r = await sendPurchaseToMeta(args);
    // Reasons only — never the payload, the token or customer data.
    if (!r.ok || (r.skipped && r.reason !== "capi_disabled" && r.reason !== "non_production_host"))
      console.warn("Meta Purchase not sent:", r.reason ?? r.error ?? r.status);
  } catch (err) {
    console.warn("Meta Purchase failed:", err instanceof Error ? err.message : "unknown");
  }
}
