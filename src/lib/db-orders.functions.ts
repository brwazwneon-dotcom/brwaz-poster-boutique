import { createServerFn } from "@tanstack/react-start";
import { sql } from "@/lib/neon.server";
import { fetchSiteSettingsFromDb } from "@/lib/db-catalog.server";

export type OrderRowInput = {
  guest_session_id: string | null;
  customer_name: string;
  phone: string;
  governorate: string;
  address: string;
  frame_type: string;
  frame_color: string;
  size: string;
  quantity: number;
  selected_poster: string | null;
  poster_title: string;
  poster_image: string;
  notes: string | null;
  subtotal: number;
  packaging_fee: number;
  shipping_cost: number;
  total_price: number;
  status: string;
  payment_method: string;
  payment_status: string;
  payment_screenshot: string | null;
  is_test: boolean;
  // Attribution — captured once on a landing-page visit and persisted
  // client-side (src/lib/landing-pages.ts's getAudienceAttribution), since
  // by checkout time the original ?utm_* query string is long gone from
  // the current URL. Absent for direct/organic traffic that never passed
  // through a landing page.
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
};

// Public — checkout is anonymous, same as before. Runs entirely
// server-side now (previously a direct client insert into Supabase),
// so the price-guard trigger is the last line of defense, not the only
// one: this function itself never trusts anything about total_price
// beyond passing it through to the same guarded insert.
export const createOrderRows = createServerFn({ method: "POST" })
  .validator((data: unknown) => (data as { rows: OrderRowInput[] }).rows)
  .handler(async ({ data: rows }) => {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("At least one order row is required");
    }
    if (rows.length > 20) {
      throw new Error("Too many items in one checkout");
    }

    const client = sql();

    // One checkout = one customer, even across multiple cart-item rows.
    // Insert-or-update by phone (the only stable identity collected at
    // checkout) — atomic via ON CONFLICT, so concurrent checkouts from the
    // same repeat customer can't race into two rows. Never touches
    // tags/notes (admin-authored) or source (first-touch only, set once).
    const first = rows[0];
    const [{ id: customerId }] = await client`
      insert into customers (phone, name, address, governorate, source)
      values (${first.phone}, ${first.customer_name}, ${first.address}, ${first.governorate}, ${first.utm_source ?? null})
      on conflict (phone) do update
      set name = excluded.name, address = excluded.address, governorate = excluded.governorate, updated_at = now()
      returning id
    `;

    const results = (await client.transaction(
      rows.map(
        (r) => client`
          insert into orders (
            guest_session_id, customer_id, customer_name, phone, governorate, address,
            frame_type, frame_color, size, quantity, selected_poster,
            poster_title, poster_image, notes, subtotal, packaging_fee,
            shipping_cost, total_price, status, payment_method,
            payment_status, payment_screenshot, is_test,
            utm_source, utm_medium, utm_campaign
          ) values (
            ${r.guest_session_id}, ${customerId}, ${r.customer_name}, ${r.phone}, ${r.governorate}, ${r.address},
            ${r.frame_type}, ${r.frame_color}, ${r.size}, ${r.quantity}, ${r.selected_poster},
            ${r.poster_title}, ${r.poster_image}, ${r.notes}, ${r.subtotal}, ${r.packaging_fee},
            ${r.shipping_cost}, ${r.total_price}, ${r.status}, ${r.payment_method},
            ${r.payment_status}, ${r.payment_screenshot}, ${r.is_test},
            ${r.utm_source ?? null}, ${r.utm_medium ?? null}, ${r.utm_campaign ?? null}
          )
          returning id, order_number
        `,
      ),
    )) as Array<Array<{ id: string; order_number: string }>>;

    return { ok: true as const, orders: results.map((r) => r[0]) };
  });

function computeShippingServer(subtotal: number, fee: number, freeThreshold: number): number {
  return subtotal >= freeThreshold ? 0 : fee;
}

type Photo4x6PackageInput = { key: string; photos: number; price: number; label: string };

// Server always recomputes the price from the admin-configured package —
// the client sends only which package was chosen, never what it costs.
// Same principle as guard_order_price() on the `orders` table, applied
// here as authoritative computation instead of a post-hoc guard, since
// there's no separate catalog table to check a submitted price against.
export const createPhoto4x6Order = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        customer_name: string;
        phone: string;
        governorate: string;
        address: string;
        package_key: string;
        notes: string | null;
        original_paths: string[];
        enhanced_paths: string[];
        suit_paths: string[];
        selected_versions: Record<string, string>;
      },
  )
  .handler(async ({ data }) => {
    if (data.original_paths.length === 0) throw new Error("At least one photo is required");
    if (data.original_paths.length > 50) throw new Error("Too many photos in one order");
    if (!/^01\d{9}$/.test(data.phone)) throw new Error("Invalid phone number");

    const settings = await fetchSiteSettingsFromDb([
      "photo_4x6_config",
      "shipping_fee",
      "free_shipping_threshold",
    ]);
    const config = settings.photo_4x6_config as { packages?: Photo4x6PackageInput[] } | null;
    const pkg = config?.packages?.find((p) => p.key === data.package_key);
    if (!pkg) throw new Error("Invalid package selected");
    if (data.original_paths.length !== pkg.photos) {
      throw new Error(`This package requires exactly ${pkg.photos} photos`);
    }
    const fee = Number(settings.shipping_fee) || 89;
    const freeThreshold = Number(settings.free_shipping_threshold) || 1600;
    const shipping = computeShippingServer(pkg.price, fee, freeThreshold);
    const totalPrice = pkg.price + shipping;

    const rows = await sql()`
      insert into photo_4x6_orders (
        customer_name, phone, governorate, address, package_key, photo_count,
        total_price, notes, original_paths, enhanced_paths, suit_paths, selected_versions
      ) values (
        ${data.customer_name}, ${data.phone}, ${data.governorate}, ${data.address},
        ${data.package_key}, ${pkg.photos}, ${totalPrice}, ${data.notes},
        ${data.original_paths}, ${data.enhanced_paths}, ${data.suit_paths},
        ${JSON.stringify(data.selected_versions)}
      )
      returning id, order_number
    `;
    return { ok: true as const, order: rows[0] as { id: string; order_number: string }, totalPrice };
  });

const PHOTO_SIZE_SETTING_KEY: Record<string, string> = {
  "10x15": "photo_10x15",
  "13x18": "photo_13x18",
  "15x20": "photo_15x20",
};

export const createPhotoOrder = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        customer_name: string;
        phone: string;
        governorate: string;
        address: string;
        size_id: "10x15" | "13x18" | "15x20";
        size_label: string;
        quantity: number;
        photo_urls: string[];
      },
  )
  .handler(async ({ data }) => {
    if (data.photo_urls.length < 20) throw new Error("Minimum order is 20 photos");
    if (data.photo_urls.length !== data.quantity) throw new Error("Photo count mismatch");
    if (!/^01\d{9}$/.test(data.phone)) throw new Error("Invalid phone number");
    const settingKey = PHOTO_SIZE_SETTING_KEY[data.size_id];
    if (!settingKey) throw new Error("Invalid size");

    const settings = await fetchSiteSettingsFromDb([
      settingKey,
      "shipping_fee",
      "free_shipping_threshold",
    ]);
    const unitPrice = Number(settings[settingKey]);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new Error("Pricing unavailable");
    const fee = Number(settings.shipping_fee) || 89;
    const freeThreshold = Number(settings.free_shipping_threshold) || 1600;
    const subtotal = unitPrice * data.quantity;
    const shipping = computeShippingServer(subtotal, fee, freeThreshold);
    const totalPrice = subtotal + shipping;

    const rows = await sql()`
      insert into photo_orders (
        customer_name, phone, governorate, address, size, quantity,
        unit_price, total_price, shipping_cost, photo_urls
      ) values (
        ${data.customer_name}, ${data.phone}, ${data.governorate}, ${data.address},
        ${data.size_label}, ${data.quantity}, ${unitPrice}, ${totalPrice}, ${shipping},
        ${data.photo_urls}
      )
      returning id, order_number
    `;
    return { ok: true as const, order: rows[0] as { id: string; order_number: string }, totalPrice };
  });

export type TrackedOrder = {
  order_number: string;
  kind: "order" | "photo_4x6" | "photo_printing";
  status: string;
  total_price: number;
  created_at: string;
  item_label: string;
};

// Public, but deliberately requires BOTH the exact order number AND the
// phone number used at checkout — looking up by phone alone would let
// anyone who knows a customer's number browse their whole order history.
export const trackOrderPublic = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { orderNumber: string; phone: string })
  .handler(async ({ data }) => {
    const orderNumber = String(data.orderNumber ?? "").trim();
    const phone = String(data.phone ?? "").trim();
    if (!orderNumber || !phone) return null;

    const client = sql();
    const [orders, p4x6, photo] = await Promise.all([
      client`
        select order_number, status, total_price, created_at, poster_title as item_label
        from orders
        where order_number = ${orderNumber} and phone = ${phone}
        limit 1
      `,
      client`
        select order_number, status, total_price, created_at, package_key as item_label
        from photo_4x6_orders
        where order_number = ${orderNumber} and phone = ${phone}
        limit 1
      `,
      client`
        select order_number, status, total_price, created_at, size as item_label
        from photo_orders
        where order_number = ${orderNumber} and phone = ${phone}
        limit 1
      `,
    ]);

    if (orders[0]) return { ...orders[0], kind: "order" } as TrackedOrder;
    if (p4x6[0]) return { ...p4x6[0], kind: "photo_4x6" } as TrackedOrder;
    if (photo[0]) return { ...photo[0], kind: "photo_printing" } as TrackedOrder;
    return null;
  });
