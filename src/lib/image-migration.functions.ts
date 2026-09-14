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
type Table = "posters" | "hero_banners";
const TABLES: Table[] = ["posters", "hero_banners"];

type MigrationCounts = {
  not_applicable: number;
  pending: number;
  migrated: number;
  failed: number;
  broken: number;
};

export type MigrationStatusSummary = {
  posters: MigrationCounts;
  hero_banners: MigrationCounts;
  total: MigrationCounts;
  paused: boolean;
};

const EMPTY_COUNTS = (): MigrationCounts => ({
  not_applicable: 0,
  pending: 0,
  migrated: 0,
  failed: 0,
  broken: 0,
});

export const getImageMigrationStatusAdmin = createServerFn({ method: "GET" })
  .middleware([requireAdminSessionNeon])
  .handler(async (): Promise<MigrationStatusSummary> => {
    const client = sql();
    const [posterRows, bannerRows, pausedSetting] = await Promise.all([
      client`select migration_status, count(*)::int as n from posters group by migration_status`,
      client`select migration_status, count(*)::int as n from hero_banners group by migration_status`,
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
    const total = EMPTY_COUNTS();
    for (const key of Object.keys(total) as (keyof MigrationCounts)[]) {
      total[key] = posters[key] + heroBanners[key];
    }

    return {
      posters,
      hero_banners: heroBanners,
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
    const statuses = data.includeBroken ? ["failed", "broken"] : ["failed"];
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
): Promise<{ status: "migrated" | "failed" | "broken"; error?: string; newUrl?: string }> {
  const sourceUrl = row.legacy_image_url ?? row.image_url;

  const cached = urlCache.get(sourceUrl);
  if (cached) return { status: "migrated", newUrl: cached };

  try {
    const publicId = `posters/migrated-${row.id}`;
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
    return { status: isPermanent ? "broken" : "failed", error: message.slice(0, 500) };
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
    let broken = 0;
    let processed = 0;

    for (const table of TABLES) {
      const rows = (await client(
        `select id, image_url, legacy_image_url from ${table}
         where migration_status in ('pending', 'failed')
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
          if (result.status === "broken") broken += 1;
          else failed += 1;
          await client(
            `update ${table}
             set migration_status = $1,
                 migration_error = $2,
                 migration_attempted_at = now()
             where id = $3`,
            [result.status, result.error ?? null, row.id],
          );
        }
      }
    }

    return { paused: false, processed, migrated, failed, broken };
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
