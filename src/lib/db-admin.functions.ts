import { createServerFn } from "@tanstack/react-start";
import { sql } from "@/lib/neon.server";
import { requireAdminSessionNeon } from "@/lib/admin-auth-neon.functions";

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9؀-ۿ]+/g, "-")
    .replace(/(^-+)|(-+$)/g, "");
  return base || `item-${Date.now().toString(36)}`;
}

// ---------------------------------------------------------------
// Categories
// ---------------------------------------------------------------
export const listCategoriesAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .handler(async () => {
    return sql()`
      select id, name, name_ar, slug, description, image, hidden, featured,
             sort_order, parent_id, status
      from categories
      order by sort_order asc, name asc
    `;
  });

export const upsertCategory = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as Record<string, unknown>)
  .handler(async ({ data }) => {
    const id = typeof data.id === "string" ? data.id : null;
    const name = String(data.name ?? "").trim();
    if (!name) throw new Error("Category name is required");
    const slug = typeof data.slug === "string" && data.slug.trim() ? slugify(data.slug) : slugify(name);
    const description = typeof data.description === "string" ? data.description : null;
    const image = typeof data.image === "string" ? data.image : null;
    const hidden = Boolean(data.hidden);
    const featured = Boolean(data.featured);
    const sortOrder = Number.isFinite(Number(data.sort_order)) ? Number(data.sort_order) : 0;

    if (id) {
      const rows = await sql()`
        update categories
        set name = ${name}, slug = ${slug}, description = ${description}, image = ${image},
            hidden = ${hidden}, featured = ${featured}, sort_order = ${sortOrder}, updated_at = now()
        where id = ${id}
        returning id
      `;
      return { id: rows[0]?.id ?? id };
    }
    const rows = await sql()`
      insert into categories (name, slug, description, image, hidden, featured, sort_order)
      values (${name}, ${slug}, ${description}, ${image}, ${hidden}, ${featured}, ${sortOrder})
      returning id
    `;
    return { id: (rows[0] as { id: string }).id };
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => (data as { id: string }).id)
  .handler(async ({ data: id }) => {
    await sql()`delete from categories where id = ${id}`;
    return { ok: true };
  });

// ---------------------------------------------------------------
// Posters (products)
// ---------------------------------------------------------------
export const listPostersAdmin = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data as { categoryId?: string } | undefined) ?? {})
  .middleware([requireAdminSessionNeon])
  .handler(async ({ data }) => {
    if (data.categoryId) {
      return sql()`
        select id, title, slug, image_url, category_id, tags, badge, hidden, featured,
               trending, is_best_seller, sales_count, views_count, created_at
        from posters where category_id = ${data.categoryId}
        order by created_at desc
      `;
    }
    return sql()`
      select id, title, slug, image_url, category_id, tags, badge, hidden, featured,
             trending, is_best_seller, sales_count, views_count, created_at
      from posters
      order by created_at desc
      limit 500
    `;
  });

// Customers — derived from orders grouped by phone (no separate table:
// the phone number given at checkout is the only stable customer
// identity this store currently collects).
export const listCustomersAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .handler(async () => {
    return sql()`
      select phone,
             max(customer_name) as customer_name,
             max(governorate) as governorate,
             count(*)::int as order_count,
             coalesce(sum(total_price), 0)::numeric as total_spent,
             max(created_at) as last_order_at
      from orders
      where is_test = false
      group by phone
      order by last_order_at desc
      limit 500
    `;
  });

export const upsertPoster = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as Record<string, unknown>)
  .handler(async ({ data }) => {
    const id = typeof data.id === "string" ? data.id : null;
    const title = String(data.title ?? "").trim();
    if (!title) throw new Error("Product title is required");
    const imageUrl = String(data.image_url ?? "").trim();
    if (!imageUrl) throw new Error("Product image URL is required");
    const slug = typeof data.slug === "string" && data.slug.trim() ? slugify(data.slug) : slugify(title);
    const description = typeof data.description === "string" ? data.description : null;
    const categoryId = typeof data.category_id === "string" && data.category_id ? data.category_id : null;
    const tags = Array.isArray(data.tags) ? (data.tags as string[]) : [];
    const badge = typeof data.badge === "string" && data.badge ? data.badge : null;
    const hidden = Boolean(data.hidden);
    const featured = Boolean(data.featured);
    const trending = Boolean(data.trending);
    const isBestSeller = Boolean(data.is_best_seller);

    if (id) {
      const rows = await sql()`
        update posters
        set title = ${title}, slug = ${slug}, description = ${description}, image_url = ${imageUrl},
            category_id = ${categoryId}, tags = ${tags}, badge = ${badge}, hidden = ${hidden},
            featured = ${featured}, trending = ${trending}, is_best_seller = ${isBestSeller}, updated_at = now()
        where id = ${id}
        returning id
      `;
      return { id: rows[0]?.id ?? id };
    }
    const rows = await sql()`
      insert into posters (title, slug, description, image_url, category_id, tags, badge, hidden, featured, trending, is_best_seller)
      values (${title}, ${slug}, ${description}, ${imageUrl}, ${categoryId}, ${tags}, ${badge}, ${hidden}, ${featured}, ${trending}, ${isBestSeller})
      returning id
    `;
    return { id: (rows[0] as { id: string }).id };
  });

// Applies one or more field changes to many posters at once (the admin
// Upload Studio's bulk-assign toolbar) — one round trip instead of N.
export const bulkUpdatePosters = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator(
    (data: unknown) =>
      data as {
        ids: string[];
        patch: {
          category_id?: string | null;
          badge?: string | null;
          hidden?: boolean;
          trending?: boolean;
          is_best_seller?: boolean;
        };
      },
  )
  .handler(async ({ data }) => {
    if (data.ids.length === 0) return { ok: true, count: 0 };
    const { category_id, badge, hidden, trending, is_best_seller } = data.patch;
    await sql()`
      update posters set
        category_id = coalesce(${category_id === undefined ? null : category_id}::uuid, category_id),
        badge = case when ${badge !== undefined} then ${badge} else badge end,
        hidden = coalesce(${hidden === undefined ? null : hidden}, hidden),
        trending = coalesce(${trending === undefined ? null : trending}, trending),
        is_best_seller = coalesce(${is_best_seller === undefined ? null : is_best_seller}, is_best_seller),
        updated_at = now()
      where id = any(${data.ids})
    `;
    return { ok: true, count: data.ids.length };
  });

export const deletePoster = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => (data as { id: string }).id)
  .handler(async ({ data: id }) => {
    await sql()`delete from posters where id = ${id}`;
    return { ok: true };
  });

// ---------------------------------------------------------------
// Orders
// ---------------------------------------------------------------
export const listOrdersAdmin = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data as { status?: string } | undefined) ?? {})
  .middleware([requireAdminSessionNeon])
  .handler(async ({ data }) => {
    if (data.status) {
      return sql()`
        select id, order_number, customer_name, phone, governorate, address, frame_type,
               frame_color, size, quantity, poster_title, poster_image, total_price, status,
               payment_method, payment_status, created_at
        from orders where status = ${data.status} and is_test = false
        order by created_at desc limit 300
      `;
    }
    return sql()`
      select id, order_number, customer_name, phone, governorate, address, frame_type,
             frame_color, size, quantity, poster_title, poster_image, total_price, status,
             payment_method, payment_status, created_at
      from orders where is_test = false
      order by created_at desc limit 300
    `;
  });

const VALID_ORDER_STATUSES = new Set([
  "new",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
]);

export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as { id: string; status: string })
  .handler(async ({ data }) => {
    if (!VALID_ORDER_STATUSES.has(data.status)) throw new Error("Invalid status");
    await sql()`update orders set status = ${data.status} where id = ${data.id}`;
    return { ok: true };
  });

// ---------------------------------------------------------------
// Photo orders (4x6 printing + general photo printing)
// ---------------------------------------------------------------
export const listPhotoOrdersAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .handler(async () => {
    const [p4x6, photo] = await Promise.all([
      sql()`
        select id, order_number, 'photo_4x6' as kind, customer_name, phone, governorate, address,
               package_key as detail, photo_count as quantity, total_price, status, created_at
        from photo_4x6_orders
        order by created_at desc limit 200
      `,
      sql()`
        select id, order_number, 'photo_printing' as kind, customer_name, phone, governorate, address,
               size as detail, quantity, total_price, status, created_at
        from photo_orders
        order by created_at desc limit 200
      `,
    ]);
    return [...p4x6, ...photo].sort(
      (a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime(),
    );
  });

export const updatePhotoOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as { id: string; kind: "photo_4x6" | "photo_printing"; status: string })
  .handler(async ({ data }) => {
    if (!VALID_ORDER_STATUSES.has(data.status)) throw new Error("Invalid status");
    if (data.kind === "photo_4x6") {
      await sql()`update photo_4x6_orders set status = ${data.status} where id = ${data.id}`;
    } else {
      await sql()`update photo_orders set status = ${data.status} where id = ${data.id}`;
    }
    return { ok: true };
  });

// ---------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------
export const listReviewsAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .handler(async () => {
    return sql()`
      select id, customer_name, governorate, rating, review_text, photo_url, poster_id,
             approved, featured, sort_order, created_at
      from reviews
      order by created_at desc
    `;
  });

export const upsertReview = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as Record<string, unknown>)
  .handler(async ({ data }) => {
    const id = typeof data.id === "string" ? data.id : null;
    const customerName = String(data.customer_name ?? "").trim();
    if (!customerName) throw new Error("Customer name is required");
    const governorate = typeof data.governorate === "string" && data.governorate ? data.governorate : null;
    const rating = Math.min(5, Math.max(1, Math.round(Number(data.rating) || 5)));
    const reviewText = typeof data.review_text === "string" && data.review_text ? data.review_text : null;
    const photoUrl = typeof data.photo_url === "string" && data.photo_url ? data.photo_url : null;
    const posterId = typeof data.poster_id === "string" && data.poster_id ? data.poster_id : null;
    const approved = data.approved === undefined ? true : Boolean(data.approved);
    const featured = Boolean(data.featured);
    const sortOrder = Number.isFinite(Number(data.sort_order)) ? Number(data.sort_order) : 0;

    if (id) {
      const rows = await sql()`
        update reviews
        set customer_name = ${customerName}, governorate = ${governorate}, rating = ${rating},
            review_text = ${reviewText}, photo_url = ${photoUrl}, poster_id = ${posterId},
            approved = ${approved}, featured = ${featured}, sort_order = ${sortOrder}
        where id = ${id}
        returning id
      `;
      return { id: rows[0]?.id ?? id };
    }
    const rows = await sql()`
      insert into reviews (customer_name, governorate, rating, review_text, photo_url, poster_id, approved, featured, sort_order)
      values (${customerName}, ${governorate}, ${rating}, ${reviewText}, ${photoUrl}, ${posterId}, ${approved}, ${featured}, ${sortOrder})
      returning id
    `;
    return { id: (rows[0] as { id: string }).id };
  });

export const deleteReview = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => (data as { id: string }).id)
  .handler(async ({ data: id }) => {
    await sql()`delete from reviews where id = ${id}`;
    return { ok: true };
  });

// ---------------------------------------------------------------
// Site settings (pricing / shipping)
// ---------------------------------------------------------------
export const getAllSiteSettingsAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .handler(async () => {
    return sql()`select key, value from site_settings order by key asc`;
  });

export const setSiteSetting = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as { key: string; value: unknown })
  .handler(async ({ data }) => {
    await sql()`
      insert into site_settings (key, value) values (${data.key}, ${JSON.stringify(data.value)})
      on conflict (key) do update set value = excluded.value, updated_at = now()
    `;
    return { ok: true };
  });

// ---------------------------------------------------------------
// Homepage — highlights (round icon/image shortcut row)
// ---------------------------------------------------------------
export const listHighlightsAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .handler(async () => {
    return sql()`
      select id, key, title, image_url, link, sort_order, enabled
      from highlights
      order by sort_order asc, created_at asc
    `;
  });

export const upsertHighlight = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as Record<string, unknown>)
  .handler(async ({ data }) => {
    const id = typeof data.id === "string" ? data.id : null;
    const key = String(data.key ?? "").trim() || slugify(String(data.title ?? "highlight"));
    const title = String(data.title ?? "").trim();
    if (!title) throw new Error("Title is required");
    const link = String(data.link ?? "").trim();
    if (!link) throw new Error("Link is required");
    const imageUrl = typeof data.image_url === "string" && data.image_url ? data.image_url : null;
    const enabled = data.enabled === undefined ? true : Boolean(data.enabled);
    const sortOrder = Number.isFinite(Number(data.sort_order)) ? Number(data.sort_order) : 0;

    if (id) {
      const rows = await sql()`
        update highlights
        set key = ${key}, title = ${title}, image_url = ${imageUrl}, link = ${link},
            enabled = ${enabled}, sort_order = ${sortOrder}
        where id = ${id}
        returning id
      `;
      return { id: rows[0]?.id ?? id };
    }
    const rows = await sql()`
      insert into highlights (key, title, image_url, link, enabled, sort_order)
      values (${key}, ${title}, ${imageUrl}, ${link}, ${enabled}, ${sortOrder})
      returning id
    `;
    return { id: (rows[0] as { id: string }).id };
  });

export const deleteHighlight = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => (data as { id: string }).id)
  .handler(async ({ data: id }) => {
    await sql()`delete from highlights where id = ${id}`;
    return { ok: true };
  });

// ---------------------------------------------------------------
// Offers — admin-curated bundle deals
// ---------------------------------------------------------------
export const listCustomOffersAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .handler(async () => {
    return sql()`
      select id, title, subtitle, size, count, price, image_url, badge, sort_order, enabled
      from custom_offers
      order by sort_order asc, created_at desc
    `;
  });

export const upsertCustomOffer = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as Record<string, unknown>)
  .handler(async ({ data }) => {
    const id = typeof data.id === "string" ? data.id : null;
    const title = String(data.title ?? "").trim();
    if (!title) throw new Error("Title is required");
    const subtitle = typeof data.subtitle === "string" && data.subtitle ? data.subtitle : null;
    const size = String(data.size ?? "").trim();
    if (!size) throw new Error("Size is required");
    const count = Math.max(1, Math.round(Number(data.count) || 1));
    const price = Number(data.price);
    if (!Number.isFinite(price) || price <= 0) throw new Error("Valid price is required");
    const imageUrl = typeof data.image_url === "string" && data.image_url ? data.image_url : null;
    const badge = typeof data.badge === "string" && data.badge ? data.badge : null;
    const enabled = data.enabled === undefined ? true : Boolean(data.enabled);
    const sortOrder = Number.isFinite(Number(data.sort_order)) ? Number(data.sort_order) : 0;

    if (id) {
      const rows = await sql()`
        update custom_offers
        set title = ${title}, subtitle = ${subtitle}, size = ${size}, count = ${count},
            price = ${price}, image_url = ${imageUrl}, badge = ${badge},
            enabled = ${enabled}, sort_order = ${sortOrder}
        where id = ${id}
        returning id
      `;
      return { id: rows[0]?.id ?? id };
    }
    const rows = await sql()`
      insert into custom_offers (title, subtitle, size, count, price, image_url, badge, enabled, sort_order)
      values (${title}, ${subtitle}, ${size}, ${count}, ${price}, ${imageUrl}, ${badge}, ${enabled}, ${sortOrder})
      returning id
    `;
    return { id: (rows[0] as { id: string }).id };
  });

export const deleteCustomOffer = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => (data as { id: string }).id)
  .handler(async ({ data: id }) => {
    await sql()`delete from custom_offers where id = ${id}`;
    return { ok: true };
  });

// ---------------------------------------------------------------
// Homepage — hero banners
// ---------------------------------------------------------------
export const listHeroBannersAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .handler(async () => {
    return sql()`
      select id, image_url, title, subtitle, button_text, button_link, enabled, sort_order
      from hero_banners
      order by sort_order asc, created_at asc
    `;
  });

export const upsertHeroBanner = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as Record<string, unknown>)
  .handler(async ({ data }) => {
    const id = typeof data.id === "string" ? data.id : null;
    const imageUrl = String(data.image_url ?? "").trim();
    if (!imageUrl) throw new Error("Banner image is required");
    const title = typeof data.title === "string" && data.title ? data.title : null;
    const subtitle = typeof data.subtitle === "string" && data.subtitle ? data.subtitle : null;
    const buttonText = typeof data.button_text === "string" && data.button_text ? data.button_text : null;
    const buttonLink = typeof data.button_link === "string" && data.button_link ? data.button_link : null;
    const enabled = data.enabled === undefined ? true : Boolean(data.enabled);
    const sortOrder = Number.isFinite(Number(data.sort_order)) ? Number(data.sort_order) : 0;

    if (id) {
      const rows = await sql()`
        update hero_banners
        set image_url = ${imageUrl}, title = ${title}, subtitle = ${subtitle},
            button_text = ${buttonText}, button_link = ${buttonLink},
            enabled = ${enabled}, sort_order = ${sortOrder}, updated_at = now()
        where id = ${id}
        returning id
      `;
      return { id: rows[0]?.id ?? id };
    }
    const rows = await sql()`
      insert into hero_banners (image_url, title, subtitle, button_text, button_link, enabled, sort_order)
      values (${imageUrl}, ${title}, ${subtitle}, ${buttonText}, ${buttonLink}, ${enabled}, ${sortOrder})
      returning id
    `;
    return { id: (rows[0] as { id: string }).id };
  });

export const deleteHeroBanner = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => (data as { id: string }).id)
  .handler(async ({ data: id }) => {
    await sql()`delete from hero_banners where id = ${id}`;
    return { ok: true };
  });

// ---------------------------------------------------------------
// System health / error logs
// ---------------------------------------------------------------
export const getSystemHealthAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .handler(async () => {
    const [posters, categories, orders, openErrors] = await Promise.all([
      sql()`select count(*)::int as count from posters`,
      sql()`select count(*)::int as count from categories`,
      sql()`select count(*)::int as count from orders where is_test = false`,
      sql()`select count(*)::int as count from system_logs where status = 'open'`,
    ]);
    return {
      posterCount: (posters[0] as { count: number }).count,
      categoryCount: (categories[0] as { count: number }).count,
      orderCount: (orders[0] as { count: number }).count,
      openErrorCount: (openErrors[0] as { count: number }).count,
    };
  });

export const listErrorLogsAdmin = createServerFn({ method: "GET" })
  .validator((data: unknown) => (data as { status?: string } | undefined) ?? {})
  .middleware([requireAdminSessionNeon])
  .handler(async ({ data }) => {
    if (data.status) {
      return sql()`
        select id, level, source, category, message, stack, url, status, created_at
        from system_logs where status = ${data.status}
        order by created_at desc limit 200
      `;
    }
    return sql()`
      select id, level, source, category, message, stack, url, status, created_at
      from system_logs
      order by created_at desc limit 200
    `;
  });

export const updateErrorLogStatus = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as { id: string; status: "open" | "resolved" })
  .handler(async ({ data }) => {
    await sql()`update system_logs set status = ${data.status} where id = ${data.id}`;
    return { ok: true };
  });
