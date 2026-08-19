import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled backup endpoint. Called by pg_cron with the anon apikey header.
 * Body: { type: "daily" | "weekly" | "monthly" }
 *
 * NOTE: /api/public/* bypasses auth at the edge; we verify the caller by
 * requiring the project's publishable/anon key in the `apikey` header.
 */
export const Route = createFileRoute("/api/public/hooks/backup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Authenticate the caller with a server-only shared secret. The
        // Supabase publishable/anon key must NOT be used here because it is
        // shipped in the client bundle and could be used to trigger
        // expensive backup jobs.
        const provided = request.headers.get("x-backup-secret") ?? "";
        const expected = process.env.BACKUP_WEBHOOK_SECRET ?? "";
        const ok =
          !!expected &&
          provided.length === expected.length &&
          (() => {
            let diff = 0;
            for (let i = 0; i < expected.length; i++) {
              diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
            }
            return diff === 0;
          })();
        if (!ok) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: { type?: string } = {};
        try {
          body = (await request.json()) as { type?: string };
        } catch {
          body = {};
        }
        const type = (
          ["daily", "weekly", "monthly"].includes(body.type ?? "") ? body.type : "daily"
        ) as "daily" | "weekly" | "monthly";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { buildSnapshot, encryptJson, uploadBackupBlob } =
          await import("@/lib/backups.server");
        const { pruneBackupsCore } = await import("@/lib/backups.functions");

        const { data: row, error: insertErr } = await supabaseAdmin
          .from("backups")
          .insert({
            backup_type: type,
            status: "running",
            triggered_by: "cron",
            created_by_email: "system@cron",
          })
          .select("id")
          .single();
        if (insertErr || !row) {
          return Response.json(
            { ok: false, error: insertErr?.message || "insert failed" },
            { status: 500 },
          );
        }
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

          // Retention prune (best-effort; failures don't fail the backup)
          try {
            await pruneBackupsCore();
          } catch {
            /* ignore */
          }

          return Response.json({ ok: true, id, path, size: blob.byteLength });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await supabaseAdmin
            .from("backups")
            .update({
              status: "failed",
              error_message: message,
              completed_at: new Date().toISOString(),
            })
            .eq("id", id);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
