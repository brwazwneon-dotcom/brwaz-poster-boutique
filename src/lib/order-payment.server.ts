// Server-side payment rules of the checkout, kept out of the server-function files so they can be tested directly.
// Everything here runs BEFORE the order functions touch the database for writing; a refusal throws a
// PaymentValidationError and nothing has been stored.
import { sql } from "@/lib/neon.server";
import { ownBlobHost } from "@/lib/blob.server";
import {
  PaymentValidationError,
  assertRowsPayable,
  isNonCashMethod,
  isPaymentMethod,
  validProofUrl,
  type PaymentMethod,
  type PaymentRow,
} from "@/lib/payment-proof-url";

/** Framed-poster checkout (`createOrderRows`): synchronous and database-free by design. */
export function guardCheckoutPayment(rows: readonly PaymentRow[]): PaymentMethod {
  return assertRowsPayable(rows, { blobHost: ownBlobHost() });
}

/** The proof URL as it may be stored on an order row, or null. A valid link does not prove the money arrived. */
export function proofForStorage(url: unknown): string | null {
  return validProofUrl(url, { blobHost: ownBlobHost() });
}

type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => PromiseLike<unknown[]>;

/**
 * Photo order (`createPhoto4x6Order`). No payment method sent = cash on delivery (as before); an unknown method is
 * refused instead of being quietly turned into COD.
 *
 * TEMPORARY: a photo order has nowhere to keep a payment proof (photo_4x6_orders has no such column), so a photo-only
 * order can only be paid cash on delivery. InstaPay / Vodafone Cash is accepted only when the order rides along with a
 * framed-poster checkout (`shipping_with_frames`) for which an order WITH a stored proof exists, created in the last
 * 15 minutes by the same phone number with the same payment method. That check is the only database access here, and
 * it is a read; nothing is touched when the order is refused outright (photo-only, unknown method).
 *
 * KNOWN LIMITS — this is a stop-gap, not a link between the two orders:
 *  - the match is phone + method + "has some proof" + a 15-minute window. It does not know WHICH frame order the
 *    photo order belongs to, so a household sharing a number can be mismatched, and one proofed frame order satisfies
 *    any number of photo orders placed within the window;
 *  - orders flagged is_test and orders an admin has since cancelled are still counted;
 *  - the proof is only a link to an image we stored; it does not show that the transfer arrived;
 *  - it grants nothing beyond what `shipping_with_frames` already did (it only adds the proof requirement).
 * Identifiers that already exist, and why none is used here: `orders.guest_session_id` is the browser's own random
 * visitor id (localStorage, "anon" when storage is blocked); it is sent with the frame rows but not with the photo
 * order, it cannot be stored on photo_4x6_orders without a migration, and a client-chosen value adds no security. The
 * order numbers that createOrderRows already returns to the browser could be sent back with the photo order and checked
 * here (`order_number = any(...) and phone = ... and payment_screenshot is not null`), which would name the exact
 * frame order; that changes the public request shape of createPhoto4x6Order and the cart, so it is left for a
 * separate, tested step. Until then do NOT read a successful check as proof that the two orders belong together.
 */
export async function guardPhotoOrderPayment(
  input: { payment_method?: unknown; shipping_with_frames?: unknown; phone: string },
  run?: SqlTag,
): Promise<PaymentMethod> {
  const method = input.payment_method ?? "cod";
  if (!isPaymentMethod(method)) throw new PaymentValidationError("payment_method_invalid");
  if (!isNonCashMethod(method)) return method;
  if (input.shipping_with_frames !== true) {
    throw new PaymentValidationError("photo_electronic_payment_unavailable");
  }
  // The database client is only created here, after every refusal that needs no database.
  const query = run ?? (sql() as unknown as SqlTag);
  const proofed = await query`
    select 1 from orders
    where phone = ${input.phone} and payment_method = ${method}
      and payment_screenshot is not null and created_at > now() - interval '15 minutes'
    limit 1
  `;
  if (proofed.length === 0) throw new PaymentValidationError("payment_proof_required");
  return method;
}
