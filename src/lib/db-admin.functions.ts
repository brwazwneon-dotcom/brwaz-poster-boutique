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

    if (id) {
      const rows = await sql()`
        update posters
        set title = ${title}, slug = ${slug}, description = ${description}, image_url = ${imageUrl},
            category_id = ${categoryId}, tags = ${tags}, badge = ${badge}, hidden = ${hidden},
            featured = ${featured}, trending = ${trending}, updated_at = now()
        where id = ${id}
        returning id
      `;
      return { id: rows[0]?.id ?? id };
    }
    const rows = await sql()`
      insert into posters (title, slug, description, image_url, category_id, tags, badge, hidden, featured, trending)
      values (${title}, ${slug}, ${description}, ${imageUrl}, ${categoryId}, ${tags}, ${badge}, ${hidden}, ${featured}, ${trending})
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
        };
      },
  )
  .handler(async ({ data }) => {
    if (data.ids.length === 0) return { ok: true, count: 0 };
    const { category_id, badge, hidden, trending } = data.patch;
    await sql()`
      update posters set
        category_id = coalesce(${category_id === undefined ? null : category_id}::uuid, category_id),
        badge = case when ${badge !== undefined} then ${badge} else badge end,
        hidden = coalesce(${hidden === undefined ? null : hidden}, hidden),
        trending = coalesce(${trending === undefined ? null : trending}, trending),
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
