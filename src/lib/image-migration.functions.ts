import { createServerFn } from "@tanstack/react-start";
import { sql } from "@/lib/neon.server";
import { requireAdminSessionNeon } from "@/lib/admin-auth-neon.functions";
import { cloudinary } from "@/lib/cloudinary.server";

// Moves poster/hero-banner images off the suspended Vercel Blob store
// (public.blob.vercel-storage.com) onto Cloudinary, tracked per-row via the
// migration_status columns from neon/migrations/021_image_migration_tracking.sql.
// Every attempt is idempotent and resumable: state lives entirely in the DB
// (migration_status/migration_error/migration_attempted_at), so a batch call
// can be interrupted (browser closed, function timeout) and simply picks up
// wherever it left off on the next call — there is no in-memory job queue to
// lose. Confirmed before building this: the Blob store's metadata API
// (list/head) still works, but the actual bytes are unreachable (403) via
// the public CDN domain regardless of auth — so most rows here are expected
// to land on 'broken', not 'migrated'. That is a real, final outcome, not a
// bug in this code.

const DEAD_DOMAIN = "blob.vercel-storage.com";
type Table = "posters" | "hero_banners" | "slider_images";
const TABLES: Table[] = ["posters", "hero_banners", "slider_images"];

type MigrationCounts = {
  not_applicable: number;
  pending: number;
  migrated: number;
  failed: number;
  broken_source: number;
};

export type MigrationStatusSummary = {
  posters: MigrationCounts;
  hero_banners: MigrationCounts;
  slider_images: MigrationCounts;
  total: MigrationCounts;
  paused: boolean;
};

const EMPTY_COUNTS = (): MigrationCounts => ({
  not_applicable: 0,
  pending: 0,
  migrated: 0,
  failed: 0,
  broken_source: 0,
});

export const getImageMigrationStatusAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .handler(async (): Promise<MigrationStatusSummary> => {
    const client = sql();
    const [posterRows, bannerRows, sliderRows, pausedSetting] = await Promise.all([
      client`select migration_status, count(*)::int as n from posters group by migration_status`,
      client`select migration_status, count(*)::int as n from hero_banners group by migration_status`,
      client`select migration_status, count(*)::int as n from slider_images group by migration_status`,
      client`select value from site_settings where key = 'image_migration_paused'`,
    ]);

    const posters = EMPTY_COUNTS();
    for (const r of posterRows as { migration_status: string; n: number }[]) {
      posters[r.migration_status as keyof MigrationCounts] = r.n;
    }
    const heroBanners = EMPTY_COUNTS();
    for (const r of bannerRows as { migration_status: string; n: number }[]) {
      heroBanners[r.migration_status as keyof MigrationCounts] = r.n;
    }
    const sliderImages = EMPTY_COUNTS();
    for (const r of sliderRows as { migration_status: string; n: number }[]) {
      sliderImages[r.migration_status as keyof MigrationCounts] = r.n;
    }
    const total = EMPTY_COUNTS();
    for (const key of Object.keys(total) as (keyof MigrationCounts)[]) {
      total[key] = posters[key] + heroBanners[key] + sliderImages[key];
    }

    return {
      posters,
      hero_banners: heroBanners,
      slider_images: sliderImages,
      total,
      paused: pausedSetting[0]?.value === true,
    };
  });

export const setImageMigrationPausedAdmin = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => (data as { paused: boolean }).paused)
  .handler(async ({ data: paused }) => {
    await sql()`
      insert into site_settings (key, value) values ('image_migration_paused', ${JSON.stringify(paused)})
      on conflict (key) do update set value = excluded.value, updated_at = now()
    `;
    return { ok: true };
  });

export const retryFailedImageMigrationAdmin = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => (data as { includeBroken?: boolean } | undefined) ?? {})
  .handler(async ({ data }) => {
    const statuses = data.includeBroken ? ["failed", "broken_source"] : ["failed"];
    const client = sql();
    for (const table of TABLES) {
      await client(
        `update ${table} set migration_status = 'pending', migration_error = null
         where migration_status = any($1)`,
        [statuses],
      );
    }
    return { ok: true };
  });

type MigrationRow = {
  id: string;
  image_url: string;
  legacy_image_url: string | null;
};

async function migrateOneRow(
  table: Table,
  row: MigrationRow,
  urlCache: Map<string, string>,
): Promise<{ status: "migrated" | "failed" | "broken_source"; error?: string; newUrl?: string }> {
  const sourceUrl = row.legacy_image_url ?? row.image_url;

  const cached = urlCache.get(sourceUrl);
  if (cached) return { status: "migrated", newUrl: cached };

  try {
    const publicId = `${table}/migrated-${row.id}`;
    const result = await cloudinary.uploader.upload(sourceUrl, {
      public_id: publicId,
      resource_type: "image",
      overwrite: true,
    });
    urlCache.set(sourceUrl, result.secure_url);
    return { status: "migrated", newUrl: result.secure_url };
  } catch (err) {
    // Cloudinary's Node SDK throws a plain { message, name, http_code }
    // object, not a real Error instance, so `instanceof Error` is always
    // false here and String(err) on that plain object gave "[object
    // Object]" — silently swallowing the real upstream reason (and with
    // it, the 403/404 text isPermanent below needs to see).
    const message =
      err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : String(err);
    // Cloudinary's fetch-by-URL wraps the upstream failure — a permanent
    // 403/404 from the dead Blob domain means "confirmed unrecoverable",
    // not "try again later". Anything else (timeout, rate limit) is worth
    // retrying, so it stays 'pending'-eligible via 'failed'.
    const isPermanent = /\b(403|404|Forbidden|Not Found)\b/i.test(message);
    return { status: isPermanent ? "broken_source" : "failed", error: message.slice(0, 500) };
  }
}

export const runImageMigrationBatchAdmin = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => (data as { batchSize?: number } | undefined) ?? {})
  .handler(async ({ data }) => {
    const batchSize = Math.min(Math.max(data.batchSize ?? 8, 1), 25);
    const client = sql();

    const pausedSetting =
      await client`select value from site_settings where key = 'image_migration_paused'`;
    if (pausedSetting[0]?.value === true) {
      return { paused: true, processed: 0, migrated: 0, failed: 0, broken: 0 };
    }

    const urlCache = new Map<string, string>();
    let migrated = 0;
    let failed = 0;
    let brokenSource = 0;
    let processed = 0;

    for (const table of TABLES) {
      // legacy_image_url is only ever populated when there's a known dead
      // source worth an automated retry (see the fix-up in
      // fix_broken_status-style backfills). A row with it null but
      // migration_status='pending' was reset straight to the placeholder
      // with no recoverable source at all (e.g. after the Vercel Blob
      // incident's full reset) — there is nothing for this batch job to
      // fetch, so it must wait for a real upload through the normal
      // product-edit form instead (see upsertPoster's own migration_status
      // handling), not get "migrated" into a Cloudinary copy of the SVG
      // placeholder.
      const rows = (await client(
        `select id, image_url, legacy_image_url from ${table}
         where migration_status in ('pending', 'failed') and legacy_image_url is not null
         order by migration_attempted_at nulls first, created_at asc
         limit $1`,
        [batchSize],
      )) as MigrationRow[];

      for (const row of rows) {
        const result = await migrateOneRow(table, row, urlCache);
        processed += 1;

        if (result.status === "migrated" && result.newUrl) {
          migrated += 1;
          await client(
            `update ${table}
             set image_url = $1,
                 legacy_image_url = coalesce(legacy_image_url, $2),
                 migration_status = 'migrated',
                 migration_error = null,
                 migration_attempted_at = now()
             where id = $3`,
            [result.newUrl, row.image_url, row.id],
          );
        } else {
          if (result.status === "broken_source") brokenSource += 1;
          else failed += 1;
          // Always preserve the original URL, not just on the migrated
          // path — a broken_source/failed row must still be traceable
          // back to what it used to point at (required_action in the
          // manifest export reads this).
          await client(
            `update ${table}
             set migration_status = $1,
                 migration_error = $2,
                 migration_attempted_at = now(),
                 legacy_image_url = coalesce(legacy_image_url, image_url)
             where id = $3`,
            [result.status, result.error ?? null, row.id],
          );
        }
      }
    }

    return { paused: false, processed, migrated, failed, broken: brokenSource };
  });

export const verifyMigratedImagesAdmin = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => (data as { batchSize?: number } | undefined) ?? {})
  .handler(async ({ data }) => {
    const batchSize = Math.min(Math.max(data.batchSize ?? 15, 1), 50);
    const client = sql();
    let verified = 0;
    let reFailed = 0;

    for (const table of TABLES) {
      const rows = (await client(
        `select id, image_url from ${table}
         where migration_status = 'migrated' and migration_verified_at is null
         order by migration_attempted_at asc
         limit $1`,
        [batchSize],
      )) as { id: string; image_url: string }[];

      for (const row of rows) {
        try {
          const res = await fetch(row.image_url, { method: "HEAD" });
          const contentType = res.headers.get("content-type") ?? "";
          if (res.ok && contentType.startsWith("image/")) {
            verified += 1;
            await client(`update ${table} set migration_verified_at = now() where id = $1`, [
              row.id,
            ]);
          } else {
            reFailed += 1;
            await client(
              `update ${table} set migration_status = 'failed',
               migration_error = $1 where id = $2`,
              [
                `Verification failed: HTTP ${res.status}, content-type ${contentType || "unknown"}`,
                row.id,
              ],
            );
          }
        } catch (err) {
          reFailed += 1;
          const message = err instanceof Error ? err.message : String(err);
          await client(
            `update ${table} set migration_status = 'failed', migration_error = $1 where id = $2`,
            [`Verification error: ${message.slice(0, 300)}`, row.id],
          );
        }
      }
    }

    return { verified, reFailed };
  });

// Only meaningful for rows the migration never got to touch — always
// excludes the dead domain by construction, so it can't regress a URL that
// was already fixed.
export function isDeadBlobUrl(url: string | null | undefined): boolean {
  return Boolean(url && url.includes(DEAD_DOMAIN));
}

export type BrokenImageManifestRow = {
  product_id: string;
  product_name: string;
  category: string | null;
  subcategory: string | null;
  old_image_url: string | null;
  migration_status: string;
  required_action: string;
  table: Table;
};

const REQUIRED_ACTION: Record<string, string> = {
  broken_source: "Re-upload the original image file",
  failed: "Retry migration (transient error, not confirmed unrecoverable)",
  pending: "Awaiting migration attempt",
};

// Everything the admin needs to act on without touching the DB directly —
// backs both the CSV/JSON manifest export and the "Recover broken images"
// list, so the two never drift out of sync with each other.
export const listBrokenImagesAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .handler(async (): Promise<BrokenImageManifestRow[]> => {
    const client = sql();
    const [posterRows, bannerRows, sliderRows] = await Promise.all([
      client`
        select
          p.id as product_id,
          p.title as product_name,
          coalesce(parent_cat.name, cat.name) as category,
          case when parent_cat.id is not null then cat.name else null end as subcategory,
          coalesce(p.legacy_image_url, p.image_url) as old_image_url,
          p.migration_status,
          'posters' as table
        from posters p
        left join categories cat on cat.id = p.category_id
        left join categories parent_cat on parent_cat.id = cat.parent_id
        where p.migration_status in ('broken_source', 'failed', 'pending')
        order by p.title asc
      `,
      client`
        select id as product_id, coalesce(title, 'Hero banner') as product_name,
               'Hero Banner' as category, null as subcategory,
               coalesce(legacy_image_url, image_url) as old_image_url, migration_status,
               'hero_banners' as table
        from hero_banners
        where migration_status in ('broken_source', 'failed', 'pending')
      `,
      client`
        select id as product_id, coalesce(title, 'Homepage slider image') as product_name,
               'Homepage Slider' as category, null as subcategory,
               coalesce(legacy_image_url, image_url) as old_image_url, migration_status,
               'slider_images' as table
        from slider_images
        where migration_status in ('broken_source', 'failed', 'pending')
      `,
    ]);
    const rows = [...posterRows, ...bannerRows, ...sliderRows] as Omit<
      BrokenImageManifestRow,
      "required_action"
    >[];
    return rows.map((r) => ({
      ...r,
      required_action: REQUIRED_ACTION[r.migration_status] ?? "Review",
    }));
  });

type RecoveryUpload = {
  productId: string;
  dataUrl: string;
  filename: string;
  table: Table;
};

// The "bulk import when originals are provided" pipeline: takes exactly
// the files the admin has just picked for specific broken products (never
// auto-matched — a wrong auto-match would silently show the wrong poster
// under the wrong product) and commits all of them in one batch, each
// through the same Cloudinary path every other upload in this app uses.
export const bulkRecoverImagesAdmin = createServerFn({ method: "POST" })
  .middleware([requireAdminSessionNeon])
  .validator((data: unknown) => (data as { uploads: RecoveryUpload[] }).uploads)
  .handler(async ({ data: uploads }) => {
    const client = sql();
    let succeeded = 0;
    let failed = 0;
    const errors: { productId: string; error: string }[] = [];

    for (const upload of uploads) {
      const match = /^data:([^;]+);base64,(.+)$/.exec(upload.dataUrl);
      if (!match) {
        failed += 1;
        errors.push({ productId: upload.productId, error: "Invalid image data" });
        continue;
      }
      const buffer = Buffer.from(match[2], "base64");
      if (buffer.length > 10 * 1024 * 1024) {
        failed += 1;
        errors.push({ productId: upload.productId, error: "Image exceeds 10MB" });
        continue;
      }
      try {
        const table = upload.table ?? "posters";
        const safeName = upload.filename.replace(/[^a-zA-Z0-9.\-_]/g, "_").replace(/\.[^.]+$/, "");
        const publicId = `posters/recovered-${upload.productId}-${safeName}`;
        const result = await cloudinary.uploader.upload(upload.dataUrl, {
          public_id: publicId,
          resource_type: "image",
          overwrite: true,
        });
        // hero_banners/slider_images get disabled the moment they're
        // confirmed broken (see the homepage-hero fix) so the storefront
        // never shows a dead placeholder slide -- re-enable once a real
        // replacement lands, or the upload would silently stay invisible.
        const enabledClause = table === "posters" ? "" : ", enabled = true";
        await client(
          `update ${table}
           set image_url = $1,
               legacy_image_url = coalesce(legacy_image_url, image_url),
               migration_status = 'migrated',
               migration_error = null,
               migration_attempted_at = now()${enabledClause}
           where id = $2`,
          [result.secure_url, upload.productId],
        );
        succeeded += 1;
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ productId: upload.productId, error: message.slice(0, 300) });
      }
    }

    return { succeeded, failed, errors };
  });
