import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED_TRIGGERS = ["manual", "daily", "weekly", "monthly", "safety", "emergency"] as const;
type BackupType = (typeof ALLOWED_TRIGGERS)[number];

const RESTORE_SCOPES = ["settings", "pricing", "homepage", "categories", "reviews", "orders", "posters", "all"] as const;
type RestoreScope = (typeof RESTORE_SCOPES)[number];

async function assertAdmin(supabase: ReturnType<typeof requireSupabaseAuth> extends { context: { supabase: infer S } } ? S : unknown, userId: string) {
  const { data, error } = await (supabase as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: boolean | null; error: { message: string } | null }> }).rpc(
    "has_role",
    { _user_id: userId, _role: "admin" },
  );
  if (error || !data) throw new Error("Forbidden");
}

/** Create a new backup (records row, snapshots + encrypts + uploads). */
export const createBackupServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { type?: BackupType; note?: string }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const type: BackupType = ALLOWED_TRIGGERS.includes(data.type as BackupType)
      ? (data.type as BackupType)
      : "manual";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildSnapshot, encryptJson, uploadBackupBlob } = await import("./backups.server");

    const email = (context.claims as { email?: string })?.email ?? null;
    const { data: row, error: insertErr } = await supabaseAdmin
      .from("backups")
      .insert({
        backup_type: type,
        status: "running",
        created_by: context.userId,
        created_by_email: email,
        triggered_by: type === "manual" ? "admin" : "system",
      })
      .select("id")
      .single();
    if (insertErr || !row) throw new Error(insertErr?.message || "Backup init failed");
    const id = row.id as string;

    try {
      const snapshot = await buildSnapshot();
      const { blob, checksum } = await encryptJson(snapshot);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const path = `${type}/${timestamp}-${id}.json.enc`;
      await uploadBackupBlob(path, blob);

      const counts: Record<string, number> = {};
      for (const [k, v] of Object.entries(snapshot.data)) counts[k] = (v as unknown[]).length;

      await supabaseAdmin
        .from("backups")
        .update({
          status: "completed",
          storage_path: path,
          size_bytes: blob.byteLength,
          checksum,
          table_counts: counts,
          storage_manifest: snapshot.storage_manifest,
          completed_at: new Date().toISOString(),
        })
        .eq("id", id);

      return { ok: true, id, path, size: blob.byteLength };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabaseAdmin
        .from("backups")
        .update({ status: "failed", error_message: message, completed_at: new Date().toISOString() })
        .eq("id", id);
      throw err;
    }
  });

/** Signed download URL for an encrypted backup. */
export const getBackupDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { signBackupUrl } = await import("./backups.server");
    const { data: b, error } = await supabaseAdmin
      .from("backups")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !b?.storage_path) throw new Error("Backup not found");
    const url = await signBackupUrl(b.storage_path, 600);
    return { url };
  });

/** Delete a backup row + its blob. */
export const deleteBackupServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { deleteBackupBlob } = await import("./backups.server");
    const { data: b } = await supabaseAdmin
      .from("backups")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (b?.storage_path) await deleteBackupBlob(b.storage_path);
    await supabaseAdmin.from("backups").delete().eq("id", data.id);
    return { ok: true };
  });

const RESTORE_MAP: Record<Exclude<RestoreScope, "all">, string[]> = {
  settings: ["site_settings"],
  pricing: ["site_settings"],
  homepage: ["site_settings", "hero_banners", "slider_images", "highlights", "best_sellers", "sets"],
  categories: ["categories"],
  reviews: ["reviews"],
  orders: ["orders", "photo_orders", "custom_design_orders"],
  posters: ["posters", "poster_images"],
};

/** Restore selected scope from a backup. Creates a safety backup first. */
export const restoreBackupServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; scope: RestoreScope; confirm: string }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.confirm !== "RESTORE") throw new Error("Confirmation phrase required");
    if (!RESTORE_SCOPES.includes(data.scope)) throw new Error("Invalid scope");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      buildSnapshot,
      encryptJson,
      uploadBackupBlob,
      downloadBackupBlob,
      decryptJson,
    } = await import("./backups.server");

    // 1) Safety backup
    const email = (context.claims as { email?: string })?.email ?? null;
    const { data: safetyRow } = await supabaseAdmin
      .from("backups")
      .insert({
        backup_type: "safety",
        status: "running",
        created_by: context.userId,
        created_by_email: email,
        triggered_by: "pre-restore",
      })
      .select("id")
      .single();
    if (safetyRow) {
      try {
        const snap = await buildSnapshot();
        const { blob, checksum } = await encryptJson(snap);
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const path = `safety/${timestamp}-${safetyRow.id}.json.enc`;
        await uploadBackupBlob(path, blob);
        await supabaseAdmin
          .from("backups")
          .update({
            status: "completed",
            storage_path: path,
            size_bytes: blob.byteLength,
            checksum,
            completed_at: new Date().toISOString(),
          })
          .eq("id", safetyRow.id);
      } catch (err) {
        await supabaseAdmin
          .from("backups")
          .update({
            status: "failed",
            error_message: err instanceof Error ? err.message : String(err),
            completed_at: new Date().toISOString(),
          })
          .eq("id", safetyRow.id);
        throw new Error("Safety backup failed; restore aborted.");
      }
    }

    // 2) Load target backup
    const { data: b, error: bErr } = await supabaseAdmin
      .from("backups")
      .select("storage_path,status")
      .eq("id", data.id)
      .maybeSingle();
    if (bErr || !b?.storage_path || b.status !== "completed")
      throw new Error("Backup not available for restore");
    const buf = await downloadBackupBlob(b.storage_path);
    const snapshot = await decryptJson<{ data: Record<string, unknown[]> }>(buf);

    // 3) Determine tables to restore
    const tables =
      data.scope === "all"
        ? Object.keys(snapshot.data)
        : RESTORE_MAP[data.scope as Exclude<RestoreScope, "all">];

    const results: Record<string, { restored: number; error?: string }> = {};
    for (const table of tables) {
      const rows = snapshot.data[table] ?? [];
      try {
        // Upsert by id when present; falls back to insert.
        const { error } = await supabaseAdmin
          .from(table)
          .upsert(rows as never, { onConflict: "id" });
        if (error) throw error;
        results[table] = { restored: rows.length };
      } catch (err) {
        results[table] = {
          restored: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    return { ok: true, safety_backup_id: safetyRow?.id ?? null, results };
  });

/** Emergency restore: uses latest healthy backup, homepage+settings scope. */
export const emergencyRestoreServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: latest } = await supabaseAdmin
      .from("backups")
      .select("id")
      .eq("status", "completed")
      .neq("backup_type", "safety")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!latest?.id) throw new Error("No healthy backup available");
    // Reuse the restore path directly instead of the RPC stub (server-to-server).
    // Delegate: call the handler internally via HTTP is unnecessary — just do it inline.
    // For simplicity we set scope=homepage which covers settings + all homepage config.
    const stub = restoreBackupServer as unknown as (args: {
      data: { id: string; scope: RestoreScope; confirm: string };
    }) => Promise<unknown>;
    return await stub({ data: { id: latest.id, scope: "homepage", confirm: "RESTORE" } });
  });

/** Prune old backups per retention policy: 30 daily, 12 weekly, 12 monthly. */
export const pruneBackupsServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    return await pruneBackupsCore();
  });

export async function pruneBackupsCore(): Promise<{ deleted: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { deleteBackupBlob } = await import("./backups.server");
  const RETENTION: Record<string, number> = { daily: 30, weekly: 12, monthly: 12, safety: 5 };
  let deleted = 0;
  for (const [type, keep] of Object.entries(RETENTION)) {
    const { data: rows } = await supabaseAdmin
      .from("backups")
      .select("id,storage_path,created_at")
      .eq("backup_type", type)
      .order("created_at", { ascending: false });
    if (!rows || rows.length <= keep) continue;
    const toDelete = rows.slice(keep);
    for (const r of toDelete) {
      if (r.storage_path) {
        try {
          await deleteBackupBlob(r.storage_path);
        } catch {
          /* ignore blob errors */
        }
      }
      await supabaseAdmin.from("backups").delete().eq("id", r.id);
      deleted += 1;
    }
  }
  return { deleted };
}