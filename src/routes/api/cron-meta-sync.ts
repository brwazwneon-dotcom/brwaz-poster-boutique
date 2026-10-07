import { createFileRoute } from "@tanstack/react-router";

// Daily Meta Ads freshness sync (see vercel.json). Vercel Cron calls this with
// `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET the route refuses to run.
// All logic lives in src/lib/cron-meta-sync.server.ts and reuses the existing sync function.
export const Route = createFileRoute("/api/cron-meta-sync")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { runMetaCronSync } = await import("@/lib/cron-meta-sync.server");
        return runMetaCronSync(request);
      },
    },
  },
});
