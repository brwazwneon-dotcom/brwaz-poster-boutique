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
// Notification bell — recent CHECKOUTS (not raw order rows) + an unread
// count, no separate notifications table (same "read a real column"
// philosophy as getAlertsAdmin). A checkout that adds N frames (picked
// individually or via one of the multi-frame offers) still submits N
// `orders` rows in one go — see createOrderRows, which inserts them all
// inside a single client.transaction(). Postgres evaluates now() once
// per transaction, so every row from the same checkout gets the exact
// same created_at — that, plus the shared customer_id, is what groups
// them back into one notification instead of N separate ones.
// Unread = group created after the admin's last-seen marker, stored in
// site_settings since this business has exactly one admin account (see
// neon/schema.sql's admin_users comment).
// ---------------------------------------------------------------
export type OrderNotification = {
  id: string; // one representative order id from the group — resolve the rest via getOrderGroupAdmin
  orderNumbers: string[];
  customerName: string;
  totalPrice: number;
  itemCount: number;
  posterTitles: string[];
  status: string;
  createdAt: string;
};

export const getOrderNotificationsAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .handler(async () => {
    const client = sql();
    const [rows, lastSeenRows] = await Promise.all([
      client`
        select
          (array_agg(id))[1] as id,
          array_agg(order_number) as order_numbers,
          max(customer_name) as customer_name,
          sum(total_price)::numeric as total_price,
          count(*)::int as item_count,
          array_agg(poster_title) as poster_titles,
          max(status) as status,
          created_at
        from orders
        where is_test = false
        group by customer_id, created_at
        order by created_at desc
        limit 20
      `,
      client`select value from site_settings where key = ${NOTIF_LAST_SEEN_KEY}`,
    ]);
    const notifications: OrderNotification[] = (
      rows as Array<{
        id: string;
        order_numbers: (string | null)[];
        customer_name: string;
        total_price: string;
        item_count: number;
        poster_titles: (string | null)[];
        status: string;
        created_at: string;
      }>
    ).map((r) => ({
      id: r.id,
      orderNumbers: r.order_numbers.filter((n): n is string => !!n),
      customerName: r.customer_name,
      totalPrice: Number(r.total_price),
      itemCount: r.item_count,
      posterTitles: r.poster_titles.filter((t): t is string => !!t),
      status: r.status,
      createdAt: r.created_at,
    }));
    const lastSeenAt = (lastSeenRows[0] as { value?: string } | undefined)?.value ?? null;
    const unreadCount = lastSeenAt
      ? notifications.filter((r) => new Date(r.createdAt) > new Date(lastSeenAt)).length
      : notifications.length;
    return { notifications, unreadCount };
  });

// ---------------------------------------------------------------
// Order groups — every `orders` row from the same checkout (same
// customer_id + created_at, see getOrderNotificationsAdmin's comment).
// Powers the details drawer showing all N frames of one order together,
// and a single WhatsApp confirmation covering the whole checkout instead
// of one per item.
// ---------------------------------------------------------------
export const getOrderGroupAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as { orderId: string })
  .handler(async ({ data }) => {
    const client = sql();
    const anchor = await client`
      select customer_id, created_at from orders where id = ${data.orderId}
    `;
    if (anchor.length === 0) throw new Error("Order not found");
    const { customer_id, created_at } = anchor[0] as {
      customer_id: string | null;
      created_at: string;
    };
    const rows = customer_id
      ? await client`
          select id, order_number, customer_name, phone, governorate, address, frame_type,
                 frame_color, size, quantity, poster_title, poster_image, total_price, status,
                 payment_method, payment_status, payment_screenshot, payment_reference, notes,
                 confirmation_status, whatsapp_message, confirmed_at, confirmed_by, created_at
          from orders where customer_id = ${customer_id} and created_at = ${created_at}
          order by poster_title
        `
      : await client`
          select id, order_number, customer_name, phone, governorate, address, frame_type,
                 frame_color, size, quantity, poster_title, poster_image, total_price, status,
                 payment_method, payment_status, payment_screenshot, payment_reference, notes,
                 confirmation_status, whatsapp_message, confirmed_at, confirmed_by, created_at
          from orders where id = ${data.orderId}
        `;
    return rows;
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

// `ids` covers every order row in the checkout group (see
// getOrderGroupAdmin) — one WhatsApp confirmation applies to the whole
// order (all frames), not just the one row that happened to be clicked.
export const updateOrderConfirmationAdmin = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator(
    (data: unknown) =>
      data as { ids: string[]; confirmation_status: string; whatsapp_message?: string },
  )
  .handler(async ({ data, context }) => {
    if (!VALID_CONFIRMATION_STATUSES.has(data.confirmation_status)) {
      throw new Error("Invalid confirmation status");
    }
    if (!data.ids.length) throw new Error("No orders to update");
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
        where id = any(${data.ids})
      `;
    } else {
      await client`
        update orders set
          confirmation_status = ${data.confirmation_status},
          whatsapp_message = coalesce(${data.whatsapp_message ?? null}, whatsapp_message)
        where id = any(${data.ids})
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
    // Logged once against the group's primary order, not once per item —
    // it's one conversation with the customer, not N.
    if (stage) await logTimelineInternal(client, data.ids[0], stage, { actor });

    return { ok: true };
  });
