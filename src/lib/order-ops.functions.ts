// Neon-backed replacement for the Supabase-only order_timeline/order_notes
// reads+writes that used to live in src/lib/order-management.ts (see
// neon/migrations/020_order_confirmation_and_timeline.sql). That file's
// pure logic — types, TIMELINE_STAGES, validateOrder, WHATSAPP_TEMPLATES,
// buildWhatsAppTemplate, waLink, QUICK_NOTES — has no Supabase dependency
// and is reused as-is from the admin UI; only the data-access functions
// below are new.
import { createServerFn } from "@tanstack/react-start";
import { sql } from "@/lib/neon.server";
import { requireAdminSessionNeon } from "@/lib/admin-auth-neon.functions";
import type { Json } from "@/lib/db-catalog.server";

export type OrderTimelineEvent = {
  id: string;
  order_id: string;
  stage: string;
  status: string;
  actor: string | null;
  note: string | null;
  meta: Record<string, Json>;
  created_at: string;
};

export type OrderNote = {
  id: string;
  order_id: string;
  text: string;
  pinned: boolean;
  author: string | null;
  created_at: string;
  updated_at: string;
};

const NOTIF_LAST_SEEN_KEY = "admin_notifications_last_seen_at";

async function currentAdminEmail(client: ReturnType<typeof sql>, adminId: string): Promise<string> {
  const rows = await client`select email from admin_users where id = ${adminId}`;
  return (rows[0] as { email?: string } | undefined)?.email ?? "admin";
}

async function logTimelineInternal(
  client: ReturnType<typeof sql>,
  orderId: string,
  stage: string,
  opts: { status?: string; actor?: string; note?: string; meta?: Record<string, Json> } = {},
) {
  await client`
    insert into order_timeline (order_id, stage, status, actor, note, meta)
    values (
      ${orderId}, ${stage}, ${opts.status ?? "completed"}, ${opts.actor ?? "admin"},
      ${opts.note ?? null}, ${JSON.stringify(opts.meta ?? {})}
    )
  `;
}

// ---------------------------------------------------------------
// Notification bell — recent orders + an unread count, no separate
// notifications table (same "read a real column" philosophy as
// getAlertsAdmin). Unread = created after the admin's last-seen marker,
// stored in site_settings since this business has exactly one admin
// account (see neon/schema.sql's admin_users comment).
// ---------------------------------------------------------------
export type OrderNotification = {
  id: string;
  order_number: string | null;
  customer_name: string;
  total_price: number;
  poster_title: string | null;
  status: string;
  created_at: string;
};

export const getOrderNotificationsAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .handler(async () => {
    const client = sql();
    const [rows, lastSeenRows] = await Promise.all([
      client`
        select id, order_number, customer_name, total_price, poster_title, status, created_at
        from orders
        where is_test = false
        order by created_at desc
        limit 20
      `,
      client`select value from site_settings where key = ${NOTIF_LAST_SEEN_KEY}`,
    ]);
    const lastSeenAt = (lastSeenRows[0] as { value?: string } | undefined)?.value ?? null;
    const unreadCount = lastSeenAt
      ? (rows as OrderNotification[]).filter((r) => new Date(r.created_at) > new Date(lastSeenAt))
          .length
      : rows.length;
    return { notifications: rows as OrderNotification[], unreadCount };
  });

export const markOrderNotificationsSeenAdmin = createServerFn({ method: "POST" }).handler(
  async () => {
    await sql()`
    insert into site_settings (key, value) values (${NOTIF_LAST_SEEN_KEY}, ${JSON.stringify(new Date().toISOString())})
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
    return { ok: true };
  },
);

// ---------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------
export const getOrderTimelineAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as { orderId: string })
  .handler(async ({ data }) => {
    const rows = await sql()`
      select id, order_id, stage, status, actor, note, meta, created_at
      from order_timeline where order_id = ${data.orderId}
      order by created_at asc
    `;
    return rows as OrderTimelineEvent[];
  });

export const logOrderEventAdmin = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator(
    (data: unknown) =>
      data as {
        orderId: string;
        stage: string;
        status?: string;
        note?: string;
        meta?: Record<string, Json>;
      },
  )
  .handler(async ({ data }) => {
    await logTimelineInternal(sql(), data.orderId, data.stage, data);
    return { ok: true };
  });

// ---------------------------------------------------------------
// Internal notes
// ---------------------------------------------------------------
export const getOrderNotesAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as { orderId: string })
  .handler(async ({ data }) => {
    const rows = await sql()`
      select id, order_id, text, pinned, author, created_at, updated_at
      from order_notes where order_id = ${data.orderId}
      order by pinned desc, created_at desc
    `;
    return rows as OrderNote[];
  });

export const addOrderNoteAdmin = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as { orderId: string; text: string })
  .handler(async ({ data, context }) => {
    const client = sql();
    const author = await currentAdminEmail(client, context.adminId);
    await client`insert into order_notes (order_id, text, author) values (${data.orderId}, ${data.text}, ${author})`;
    await logTimelineInternal(client, data.orderId, "note_added", {
      note: data.text.slice(0, 120),
      actor: author,
    });
    return { ok: true };
  });

export const updateOrderNoteAdmin = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator(
    (data: unknown) => data as { id: string; orderId: string; text?: string; pinned?: boolean },
  )
  .handler(async ({ data }) => {
    const client = sql();
    if (data.text !== undefined) {
      await client`update order_notes set text = ${data.text}, updated_at = now() where id = ${data.id}`;
    }
    if (data.pinned !== undefined) {
      await client`update order_notes set pinned = ${data.pinned}, updated_at = now() where id = ${data.id}`;
    }
    await logTimelineInternal(client, data.orderId, "note_updated");
    return { ok: true };
  });

export const deleteOrderNoteAdmin = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as { id: string; orderId: string })
  .handler(async ({ data }) => {
    const client = sql();
    await client`delete from order_notes where id = ${data.id}`;
    await logTimelineInternal(client, data.orderId, "note_deleted");
    return { ok: true };
  });

// ---------------------------------------------------------------
// WhatsApp confirmation tracking
// ---------------------------------------------------------------
export const VALID_CONFIRMATION_STATUSES = new Set([
  "not_sent",
  "prepared",
  "sent",
  "customer_confirmed",
  "customer_rejected",
  "waiting_for_response",
]);

export const updateOrderConfirmationAdmin = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator(
    (data: unknown) =>
      data as { id: string; confirmation_status: string; whatsapp_message?: string },
  )
  .handler(async ({ data, context }) => {
    if (!VALID_CONFIRMATION_STATUSES.has(data.confirmation_status)) {
      throw new Error("Invalid confirmation status");
    }
    const client = sql();
    const isConfirmed = data.confirmation_status === "customer_confirmed";
    const actor = await currentAdminEmail(client, context.adminId);

    if (isConfirmed) {
      await client`
        update orders set
          confirmation_status = ${data.confirmation_status},
          whatsapp_message = coalesce(${data.whatsapp_message ?? null}, whatsapp_message),
          confirmed_at = now(),
          confirmed_by = ${actor}
        where id = ${data.id}
      `;
    } else {
      await client`
        update orders set
          confirmation_status = ${data.confirmation_status},
          whatsapp_message = coalesce(${data.whatsapp_message ?? null}, whatsapp_message)
        where id = ${data.id}
      `;
    }

    const stageByStatus: Record<string, string> = {
      prepared: "whatsapp_message_prepared",
      sent: "whatsapp_confirmation_sent",
      customer_confirmed: "order_confirmed",
      customer_rejected: "customer_rejected",
      waiting_for_response: "waiting_for_response",
    };
    const stage = stageByStatus[data.confirmation_status];
    if (stage) await logTimelineInternal(client, data.id, stage, { actor });

    return { ok: true };
  });
