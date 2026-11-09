/**
 * Phone notification for every new order, through ntfy (a free app: the owner installs it and subscribes to a secret
 * topic). Server only, best-effort, and it can NEVER hold up or fail an order.
 *
 * What leaves the server: the order number, the total, the governorate and what kind of order it is. No name, no phone
 * number, no address, no photos, because the message passes through an outside service.
 *
 * Switched on by one setting on Vercel, NTFY_TOPIC (a hard-to-guess name, treat it like a password). Without it nothing is
 * sent. Only the production deployment sends: previews and local runs have their own test data and stay silent.
 */

export type OrderKind = "frames" | "photos";

export type OrderPushInput = {
  orderRef: string;
  value: number;
  city?: string;
  kind?: OrderKind;
  numItems?: number;
};

export type OrderPushMessage = { title: string; message: string; tags: string[]; priority: number };

const KIND_LABEL: Record<OrderKind, string> = { frames: "براويز", photos: "طباعة صور" };

/** Keeps free text short and plain, so nothing odd travels in a notification. */
const plain = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, max);

export function buildOrderPushMessage(input: OrderPushInput): OrderPushMessage {
  const ref = plain(input.orderRef, 40);
  const total = Math.round(Number(input.value) || 0);
  const city = plain(input.city, 40);
  const kind = input.kind ? KIND_LABEL[input.kind] : "";
  const items = Math.trunc(Number(input.numItems) || 0);
  const parts = [
    `${total} جنيه`,
    kind && items > 0 ? `${kind} (${items})` : kind,
    city ? `📍 ${city}` : "",
  ].filter(Boolean);
  return {
    title: `🛍️ طلب جديد ${ref}`.trim(),
    message: parts.join(" • "),
    tags: ["shopping_cart"],
    priority: 4,
  };
}

const TOPIC = /^[A-Za-z0-9_-]{8,64}$/;

export type PushEnv = { NTFY_TOPIC?: string; NTFY_SERVER?: string; VERCEL_ENV?: string };

export type PushResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "not_production" | "bad_topic" | "failed" };

/** Sends one notification. Never throws; the reason (never the topic) says why nothing was sent. */
export async function sendOrderPush(
  input: OrderPushInput,
  deps: { env?: PushEnv; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<PushResult> {
  const env = deps.env ?? (process.env as PushEnv);
  const topic = (env.NTFY_TOPIC ?? "").trim();
  if (!topic) return { sent: false, reason: "not_configured" };
  if (env.VERCEL_ENV !== "production") return { sent: false, reason: "not_production" };
  if (!TOPIC.test(topic)) return { sent: false, reason: "bad_topic" };
  const server = /^https:\/\/[\w.-]+(:\d+)?$/.test((env.NTFY_SERVER ?? "").trim())
    ? (env.NTFY_SERVER as string).trim()
    : "https://ntfy.sh";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 3_000);
  try {
    // JSON publishing keeps Arabic text intact (HTTP headers would not).
    const res = await (deps.fetchImpl ?? fetch)(server, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic, ...buildOrderPushMessage(input) }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn("Order push not sent: HTTP", res.status);
      return { sent: false, reason: "failed" };
    }
    return { sent: true };
  } catch (err) {
    console.warn("Order push failed:", err instanceof Error ? err.name : "unknown");
    return { sent: false, reason: "failed" };
  } finally {
    clearTimeout(timer);
  }
}
