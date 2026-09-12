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
             sort_order, parent_id, status, show_in_header, show_in_collections
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
    const nameAr = typeof data.name_ar === "string" && data.name_ar ? data.name_ar : null;
    const description = typeof data.description === "string" ? data.description : null;
    const image = typeof data.image === "string" ? data.image : null;
    const hidden = Boolean(data.hidden);
    const featured = Boolean(data.featured);
    const sortOrder = Number.isFinite(Number(data.sort_order)) ? Number(data.sort_order) : 0;
    const showInHeader = data.show_in_header === undefined ? true : Boolean(data.show_in_header);
    const showInCollections =
      data.show_in_collections === undefined ? true : Boolean(data.show_in_collections);
    const parentId =
      typeof data.parent_id === "string" && data.parent_id && data.parent_id !== id
        ? data.parent_id
        : null;

    if (id) {
      const rows = await sql()`
        update categories
        set name = ${name}, name_ar = ${nameAr}, slug = ${slug}, description = ${description},
            image = ${image}, hidden = ${hidden}, featured = ${featured}, sort_order = ${sortOrder},
            show_in_header = ${showInHeader}, show_in_collections = ${showInCollections},
            parent_id = ${parentId}, updated_at = now()
        where id = ${id}
        returning id
      `;
      return { id: rows[0]?.id ?? id };
    }
    const rows = await sql()`
      insert into categories (
        name, name_ar, slug, description, image, hidden, featured, sort_order,
        show_in_header, show_in_collections, parent_id
      )
      values (
        ${name}, ${nameAr}, ${slug}, ${description}, ${image}, ${hidden}, ${featured}, ${sortOrder},
        ${showInHeader}, ${showInCollections}, ${parentId}
      )
      returning id
    `;
    return { id: (rows[0] as { id: string }).id };
  });

// Look up a category by exact name (case-insensitive), optionally scoped to
// a parent — used by the upload flow to resolve/auto-create AI-suggested
// categories and subcategories without duplicating existing ones.
export const findOrCreateCategory = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as { name: string; parentId: string | null })
  .handler(async ({ data }) => {
    const name = String(data.name ?? "").trim();
    if (!name) throw new Error("Category name is required");
    const parentId = data.parentId ?? null;

    const existing = parentId
      ? await sql()`
          select id from categories
          where lower(name) = lower(${name}) and parent_id = ${parentId}
          limit 1
        `
      : await sql()`
          select id from categories
          where lower(name) = lower(${name}) and parent_id is null
          limit 1
        `;
    if (existing[0]) return { id: (existing[0] as { id: string }).id, created: false };

    const slug = slugify(name);
    const rows = await sql()`
      insert into categories (name, slug, parent_id, hidden, show_in_header, show_in_collections)
      values (${name}, ${slug}, ${parentId}, false, ${parentId === null}, ${parentId === null})
      returning id
    `;
    return { id: (rows[0] as { id: string }).id, created: true };
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
        select id, title, slug, description, image_url, category_id, tags, badge, hidden, featured,
               trending, is_best_seller, sales_count, views_count, created_at,
               seo_title, seo_description, alt_text
        from posters where category_id = ${data.categoryId}
        order by created_at desc
      `;
    }
    return sql()`
      select id, title, slug, description, image_url, category_id, tags, badge, hidden, featured,
             trending, is_best_seller, sales_count, views_count, created_at,
             seo_title, seo_description, alt_text
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
    const seoTitle = typeof data.seo_title === "string" && data.seo_title ? data.seo_title : null;
    const seoDescription =
      typeof data.seo_description === "string" && data.seo_description ? data.seo_description : null;
    const altText = typeof data.alt_text === "string" && data.alt_text ? data.alt_text : null;

    if (id) {
      const rows = await sql()`
        update posters
        set title = ${title}, slug = ${slug}, description = ${description}, image_url = ${imageUrl},
            category_id = ${categoryId}, tags = ${tags}, badge = ${badge}, hidden = ${hidden},
            featured = ${featured}, trending = ${trending}, is_best_seller = ${isBestSeller},
            seo_title = ${seoTitle}, seo_description = ${seoDescription}, alt_text = ${altText},
            updated_at = now()
        where id = ${id}
        returning id
      `;
      return { id: rows[0]?.id ?? id };
    }
    const rows = await sql()`
      insert into posters (
        title, slug, description, image_url, category_id, tags, badge, hidden, featured,
        trending, is_best_seller, seo_title, seo_description, alt_text
      )
      values (
        ${title}, ${slug}, ${description}, ${imageUrl}, ${categoryId}, ${tags}, ${badge}, ${hidden},
        ${featured}, ${trending}, ${isBestSeller}, ${seoTitle}, ${seoDescription}, ${altText}
      )
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
               payment_method, payment_status, payment_screenshot, payment_reference, notes,
               created_at
        from orders where status = ${data.status} and is_test = false
        order by created_at desc limit 300
      `;
    }
    return sql()`
      select id, order_number, customer_name, phone, governorate, address, frame_type,
             frame_color, size, quantity, poster_title, poster_image, total_price, status,
             payment_method, payment_status, payment_screenshot, payment_reference, notes,
             created_at
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
               package_key as detail, photo_count as quantity, total_price, status, created_at,
               original_paths, enhanced_paths, suit_paths, selected_versions
        from photo_4x6_orders
        order by created_at desc limit 200
      `,
      sql()`
        select id, order_number, 'photo_printing' as kind, customer_name, phone, governorate, address,
               size as detail, quantity, total_price, status, created_at, photo_urls
        from photo_orders
        order by created_at desc limit 200
      `,
    ]);

    // Both tables store customer photos differently (photo_4x6_orders has
    // separate original/enhanced/suit arrays + a per-photo selection map;
    // photo_orders is just a flat url array) — resolve both into one
    // uniform `photos: string[]` here so the admin UI doesn't need to know
    // about either table's shape.
    type BaseRow = {
      id: string;
      order_number: string | null;
      kind: "photo_4x6" | "photo_printing";
      customer_name: string;
      phone: string;
      governorate: string;
      address: string;
      detail: string;
      quantity: number;
      total_price: number;
      status: string;
      created_at: string;
    };

    const p4x6Rows = (
      p4x6 as Array<
        BaseRow & {
          original_paths: string[];
          enhanced_paths: string[];
          suit_paths: string[];
          selected_versions: Record<string, string> | null;
        }
      >
    ).map((row) => {
      const versions = row.selected_versions ?? {};
      const photos = row.original_paths.map((original, i) => {
        const choice = versions[String(i)];
        if (choice === "enhanced" && row.enhanced_paths[i]) return row.enhanced_paths[i];
        if (choice === "suit" && row.suit_paths[i]) return row.suit_paths[i];
        return original;
      });
      const base: BaseRow = row;
      return { ...base, photos };
    });

    const photoRows = (photo as Array<BaseRow & { photo_urls: string[] }>).map((row) => {
      const { photo_urls, ...base } = row;
      return { ...base, photos: photo_urls };
    });

    return [...p4x6Rows, ...photoRows].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
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
// Sets — curated frame-set bundles (own table, NOT linked to posters —
// a set's cart line item must never carry a real-looking posters.id,
// see the "set-" prefix used client-side to keep selected_poster null).
// ---------------------------------------------------------------
export const listSetsAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .handler(async () => {
    return sql()`
      select id, name, description, image_url, frames_count, price, old_price,
             enabled, featured, sort_order
      from sets
      order by sort_order asc, created_at desc
    `;
  });

export const upsertSet = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as Record<string, unknown>)
  .handler(async ({ data }) => {
    const id = typeof data.id === "string" ? data.id : null;
    const name = String(data.name ?? "").trim();
    if (!name) throw new Error("Set name is required");
    const description = typeof data.description === "string" && data.description ? data.description : null;
    const imageUrl = typeof data.image_url === "string" && data.image_url ? data.image_url : null;
    const framesCount = Math.max(1, Math.round(Number(data.frames_count) || 1));
    const price = Number(data.price);
    if (!Number.isFinite(price) || price <= 0) throw new Error("Valid price is required");
    const oldPrice =
      data.old_price !== undefined && data.old_price !== null && data.old_price !== ""
        ? Number(data.old_price)
        : null;
    const enabled = data.enabled === undefined ? true : Boolean(data.enabled);
    const featured = Boolean(data.featured);
    const sortOrder = Number.isFinite(Number(data.sort_order)) ? Number(data.sort_order) : 0;

    if (id) {
      const rows = await sql()`
        update sets
        set name = ${name}, description = ${description}, image_url = ${imageUrl},
            frames_count = ${framesCount}, price = ${price}, old_price = ${oldPrice},
            enabled = ${enabled}, featured = ${featured}, sort_order = ${sortOrder}
        where id = ${id}
        returning id
      `;
      return { id: rows[0]?.id ?? id };
    }
    const rows = await sql()`
      insert into sets (name, description, image_url, frames_count, price, old_price, enabled, featured, sort_order)
      values (${name}, ${description}, ${imageUrl}, ${framesCount}, ${price}, ${oldPrice}, ${enabled}, ${featured}, ${sortOrder})
      returning id
    `;
    return { id: (rows[0] as { id: string }).id };
  });

export const deleteSet = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => (data as { id: string }).id)
  .handler(async ({ data: id }) => {
    await sql()`delete from sets where id = ${id}`;
    return { ok: true };
  });

// ---------------------------------------------------------------
// Before / After showcase pairs
// ---------------------------------------------------------------
export const listBeforeAfterAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .handler(async () => {
    return sql()`
      select id, title, description, before_url, after_url, location, sort_order, active
      from before_after
      order by location asc, sort_order asc, created_at desc
    `;
  });

export const upsertBeforeAfter = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as Record<string, unknown>)
  .handler(async ({ data }) => {
    const id = typeof data.id === "string" ? data.id : null;
    const beforeUrl = typeof data.before_url === "string" ? data.before_url.trim() : "";
    const afterUrl = typeof data.after_url === "string" ? data.after_url.trim() : "";
    if (!beforeUrl || !afterUrl) throw new Error("Both before and after images are required");
    const location =
      typeof data.location === "string" && data.location.trim() ? data.location.trim() : "homepage";
    const title = typeof data.title === "string" && data.title ? data.title : null;
    const description = typeof data.description === "string" && data.description ? data.description : null;
    const active = data.active === undefined ? true : Boolean(data.active);
    const sortOrder = Number.isFinite(Number(data.sort_order)) ? Number(data.sort_order) : 0;

    if (id) {
      const rows = await sql()`
        update before_after
        set title = ${title}, description = ${description}, before_url = ${beforeUrl},
            after_url = ${afterUrl}, location = ${location}, active = ${active}, sort_order = ${sortOrder}
        where id = ${id}
        returning id
      `;
      return { id: rows[0]?.id ?? id };
    }
    const rows = await sql()`
      insert into before_after (title, description, before_url, after_url, location, active, sort_order)
      values (${title}, ${description}, ${beforeUrl}, ${afterUrl}, ${location}, ${active}, ${sortOrder})
      returning id
    `;
    return { id: (rows[0] as { id: string }).id };
  });

export const deleteBeforeAfter = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => (data as { id: string }).id)
  .handler(async ({ data: id }) => {
    await sql()`delete from before_after where id = ${id}`;
    return { ok: true };
  });

// ---------------------------------------------------------------
// Poster Images — extra angle photos per product
// ---------------------------------------------------------------
export const listPosterImagesAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => (data as { posterId: string }).posterId)
  .handler(async ({ data: posterId }) => {
    return sql()`
      select id, poster_id, image_url, label, kind, sort_order, is_default
      from poster_images
      where poster_id = ${posterId}
      order by sort_order asc, created_at asc
    `;
  });

export const upsertPosterImage = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as Record<string, unknown>)
  .handler(async ({ data }) => {
    const id = typeof data.id === "string" ? data.id : null;
    const posterId = typeof data.poster_id === "string" ? data.poster_id : "";
    if (!posterId) throw new Error("poster_id is required");
    const imageUrl = typeof data.image_url === "string" ? data.image_url.trim() : "";
    if (!imageUrl) throw new Error("image_url is required");
    const label = typeof data.label === "string" && data.label ? data.label : null;
    const kind = typeof data.kind === "string" && data.kind ? data.kind : null;
    const sortOrder = Number.isFinite(Number(data.sort_order)) ? Number(data.sort_order) : 0;
    const isDefault = Boolean(data.is_default);

    if (id) {
      const rows = await sql()`
        update poster_images
        set image_url = ${imageUrl}, label = ${label}, kind = ${kind},
            sort_order = ${sortOrder}, is_default = ${isDefault}
        where id = ${id}
        returning id
      `;
      return { id: rows[0]?.id ?? id };
    }
    const rows = await sql()`
      insert into poster_images (poster_id, image_url, label, kind, sort_order, is_default)
      values (${posterId}, ${imageUrl}, ${label}, ${kind}, ${sortOrder}, ${isDefault})
      returning id
    `;
    return { id: (rows[0] as { id: string }).id };
  });

export const deletePosterImage = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => (data as { id: string }).id)
  .handler(async ({ data: id }) => {
    await sql()`delete from poster_images where id = ${id}`;
    return { ok: true };
  });

// Cheap URL-only listing across all poster gallery images — used by the
// Media Library's orphan-detection cross-reference (it needs every
// image_url a product's gallery references, not just its main image_url).
export const listAllPosterImageUrlsAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .handler(async () => {
    return sql()`select image_url from poster_images`;
  });

// ---------------------------------------------------------------
// Landing Pages — ad campaign destinations (/landing/$audience)
// ---------------------------------------------------------------
export const listLandingPagesAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .handler(async () => {
    return sql()`select * from landing_pages order by audience_key asc`;
  });

export const upsertLandingPage = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as Record<string, unknown>)
  .handler(async ({ data }) => {
    const audienceKey = String(data.audience_key ?? "").trim();
    if (!audienceKey) throw new Error("audience_key is required");
    const visible = Boolean(data.visible);
    const titleAr = typeof data.title_ar === "string" && data.title_ar ? data.title_ar : null;
    const titleEn = typeof data.title_en === "string" && data.title_en ? data.title_en : null;
    const subtitleAr = typeof data.subtitle_ar === "string" && data.subtitle_ar ? data.subtitle_ar : null;
    const subtitleEn = typeof data.subtitle_en === "string" && data.subtitle_en ? data.subtitle_en : null;
    const heroImage = typeof data.hero_image === "string" && data.hero_image ? data.hero_image : null;
    const whatsappMessage =
      typeof data.whatsapp_message === "string" && data.whatsapp_message ? data.whatsapp_message : null;
    const ctaText = typeof data.cta_text === "string" && data.cta_text ? data.cta_text : null;
    const sourceCategoryId =
      typeof data.source_category_id === "string" && data.source_category_id
        ? data.source_category_id
        : null;
    const displayMode = ["manual", "category", "smart_mix"].includes(String(data.display_mode))
      ? (data.display_mode as string)
      : "smart_mix";
    const posterLimit = Math.max(1, Math.min(200, Number(data.poster_limit) || 24));
    const manualPosterIds = Array.isArray(data.manual_poster_ids)
      ? (data.manual_poster_ids as unknown[]).filter((v): v is string => typeof v === "string" && v.trim() !== "")
      : [];
    const seoTitle = typeof data.seo_title === "string" && data.seo_title ? data.seo_title : null;
    const metaDescription =
      typeof data.meta_description === "string" && data.meta_description ? data.meta_description : null;

    const rows = await sql()`
      insert into landing_pages (
        audience_key, visible, title_ar, title_en, subtitle_ar, subtitle_en, hero_image,
        whatsapp_message, cta_text, source_category_id, display_mode, poster_limit,
        manual_poster_ids, seo_title, meta_description
      )
      values (
        ${audienceKey}, ${visible}, ${titleAr}, ${titleEn}, ${subtitleAr}, ${subtitleEn}, ${heroImage},
        ${whatsappMessage}, ${ctaText}, ${sourceCategoryId}, ${displayMode}, ${posterLimit},
        ${manualPosterIds}, ${seoTitle}, ${metaDescription}
      )
      on conflict (audience_key) do update
      set visible = excluded.visible, title_ar = excluded.title_ar, title_en = excluded.title_en,
          subtitle_ar = excluded.subtitle_ar, subtitle_en = excluded.subtitle_en,
          hero_image = excluded.hero_image, whatsapp_message = excluded.whatsapp_message,
          cta_text = excluded.cta_text, source_category_id = excluded.source_category_id,
          display_mode = excluded.display_mode, poster_limit = excluded.poster_limit,
          manual_poster_ids = excluded.manual_poster_ids, seo_title = excluded.seo_title,
          meta_description = excluded.meta_description, updated_at = now()
      returning id
    `;
    return { id: (rows[0] as { id: string }).id };
  });

export const deleteLandingPage = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => (data as { id: string }).id)
  .handler(async ({ data: id }) => {
    await sql()`delete from landing_pages where id = ${id}`;
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
// Homepage — full-width slider (separate section from hero banners)
// ---------------------------------------------------------------
export const listSliderImagesAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .handler(async () => {
    return sql()`
      select id, image_url, title, link_url, sort_order, enabled
      from slider_images
      order by sort_order asc, created_at asc
    `;
  });

export const upsertSliderImage = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => data as Record<string, unknown>)
  .handler(async ({ data }) => {
    const id = typeof data.id === "string" ? data.id : null;
    const imageUrl = String(data.image_url ?? "").trim();
    if (!imageUrl) throw new Error("Slide image is required");
    const title = typeof data.title === "string" && data.title ? data.title : null;
    const linkUrl = typeof data.link_url === "string" && data.link_url ? data.link_url : null;
    const enabled = data.enabled === undefined ? true : Boolean(data.enabled);
    const sortOrder = Number.isFinite(Number(data.sort_order)) ? Number(data.sort_order) : 0;

    if (id) {
      const rows = await sql()`
        update slider_images
        set image_url = ${imageUrl}, title = ${title}, link_url = ${linkUrl},
            enabled = ${enabled}, sort_order = ${sortOrder}
        where id = ${id}
        returning id
      `;
      return { id: rows[0]?.id ?? id };
    }
    const rows = await sql()`
      insert into slider_images (image_url, title, link_url, enabled, sort_order)
      values (${imageUrl}, ${title}, ${linkUrl}, ${enabled}, ${sortOrder})
      returning id
    `;
    return { id: (rows[0] as { id: string }).id };
  });

export const deleteSliderImage = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => (data as { id: string }).id)
  .handler(async ({ data: id }) => {
    await sql()`delete from slider_images where id = ${id}`;
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

// ---------------------------------------------------------------
// AI (Gemini) key rotation status — for the bulk-upload AI assist.
// Note: counters live in the serverless function's memory, so they
// reset on cold start; this is a rough live view, not persisted history.
// ---------------------------------------------------------------
export const getGeminiKeysStatusAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .handler(async () => {
    const { getGeminiKeysStatus } = await import("@/lib/gemini.server");
    return getGeminiKeysStatus();
  });
