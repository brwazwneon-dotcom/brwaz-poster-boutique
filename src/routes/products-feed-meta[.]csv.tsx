import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  buildMetaFeedCsv,
  buildMetaRows,
  fetchAllCatalogData,
  parseCatalogConfig,
} from "@/lib/catalog";

export const Route = createFileRoute("/products-feed-meta.csv")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { createClient } = await import("@supabase/supabase-js");
          const supa = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
            { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
          );

          const data = await fetchAllCatalogData(supa);
          const config = parseCatalogConfig(data.config);

          // When nothing is selected yet, default to every eligible product.
          const selected = new Set(config.meta.selected);
          const { rows, issues } = buildMetaRows(data, selected);

          const csv = buildMetaFeedCsv(rows);

          return new Response(csv, {
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Cache-Control": "public, max-age=1800",
              "X-Catalog-Rows": String(rows.length),
              "X-Catalog-Issues": String(issues.length),
            },
          });
        } catch (err) {
          return new Response(`# Catalog feed error: ${String(err)}`, {
            status: 500,
            headers: { "Content-Type": "text/csv; charset=utf-8" },
          });
        }
      },
    },
  },
});
