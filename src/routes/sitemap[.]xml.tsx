import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "https://brwazwneon.com";

interface Entry {
  path: string;
  changefreq?: string;
  priority?: string;
  lastmod?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const staticEntries: Entry[] = [
          { path: "/", changefreq: "daily", priority: "1.0" },
          { path: "/offers", changefreq: "weekly", priority: "0.9" },
          { path: "/sets", changefreq: "weekly", priority: "0.8" },
          { path: "/best-sellers", changefreq: "weekly", priority: "0.8" },
          { path: "/trending", changefreq: "daily", priority: "0.8" },
          { path: "/custom-design", changefreq: "monthly", priority: "0.7" },
          { path: "/photo-printing", changefreq: "monthly", priority: "0.7" },
          { path: "/photo-4x6", changefreq: "monthly", priority: "0.7" },
          { path: "/search", changefreq: "monthly", priority: "0.5" },
        ];

        const entries: Entry[] = [...staticEntries];

        try {
          const { createClient } = await import("@supabase/supabase-js");
          const supa = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
            { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
          );
          const { data } = await supa.from("categories").select("slug,updated_at").limit(500);
          for (const c of data ?? []) {
            if (!c?.slug) continue;
            entries.push({
              path: `/category/${c.slug}`,
              changefreq: "weekly",
              priority: "0.8",
              lastmod: c.updated_at ? new Date(c.updated_at).toISOString() : undefined,
            });
          }
        } catch {
          /* ignore — still ship static entries */
        }

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" },
        });
      },
    },
  },
});
