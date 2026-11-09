import { sql } from "@/lib/neon.server";
import { cleanAudience } from "@/lib/order-attribution";

type Run = (orderId: string, audienceJson: string) => Promise<unknown>;

const writeToDatabase: Run = (orderId, audienceJson) =>
  sql()`update photo_4x6_orders set audience = ${audienceJson}::jsonb where id = ${orderId}`;

/**
 * Remembers which audience (youth / album) a photo order came from.
 *
 * Best-effort and run AFTER the order is saved: a missing column (migration 030 not applied yet) or any other database
 * error only means no audience is stored, never a lost or failed order. Only the two known audience values are ever
 * written; anything else the browser sent is dropped. Returns whether something was stored.
 */
export async function storePhotoAudience(
  orderId: string,
  raw: unknown,
  run: Run = writeToDatabase,
): Promise<boolean> {
  const audience = cleanAudience(raw);
  if (!audience) return false;
  try {
    await run(orderId, JSON.stringify(audience));
    return true;
  } catch (e) {
    console.warn("photo order audience not stored:", e instanceof Error ? e.message : e);
    return false;
  }
}
