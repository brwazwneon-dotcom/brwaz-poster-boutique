import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

// Daily scheduled backup (see vercel.json). Vercel Cron calls this with
// `Authorization: Bearer $CRON_SECRET`. Without CRON_SECRET configured the route
// refuses to run, and even with it the job does nothing until an admin turns
// "Scheduled backups" on in Admin > System > Backup & Recovery.
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/cron-backup")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!process.env.CRON_SECRET) {
          return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
        }
        if (!authorized(request)) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        try {
          const { runScheduled } = await import("@/lib/backup-center.server");
          return Response.json({ ok: true, result: await runScheduled() });
        } catch {
          return Response.json({ ok: false, error: "failed" }, { status: 500 });
        }
      },
    },
  },
});
