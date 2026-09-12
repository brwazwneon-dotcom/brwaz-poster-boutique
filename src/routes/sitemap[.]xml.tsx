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
          const { sql } = await import("@/lib/neon.server");
          const categories = await sql()`
            select slug, updated_at from categories where slug is not null limit 500
          `;
          for (const c of categories as Array<{ slug: string; updated_at: string | null }>) {
            if (!c?.slug) continue;
            entries.push({
              path: `/category/${c.slug}`,
              changefreq: "weekly",
              priority: "0.8",
              lastmod: c.updated_at ? new Date(c.updated_at).toISOString() : undefined,
            });
          }

          // Posters get their own permanent URL via the /poster/$slug route.
          // Paginate in batches of 1000 rather than a single query — a
          // catalog in the hundreds/thousands of posters would otherwise
          // silently truncate the sitemap.
          let from = 0;
          const pageSize = 1000;
          for (;;) {
            const posterPage = await sql()(
              `select slug, updated_at from posters
               where hidden = false and slug is not null
               order by created_at desc offset $1 limit $2`,
              [from, pageSize],
            );
            if (!posterPage || posterPage.length === 0) break;
            for (const p of posterPage as Array<{ slug: string; updated_at: string | null }>) {
              if (!p?.slug) continue;
              entries.push({
                path: `/poster/${p.slug}`,
                changefreq: "weekly",
                priority: "0.7",
                lastmod: p.updated_at ? new Date(p.updated_at).toISOString() : undefined,
              });
            }
            if (posterPage.length < pageSize) break;
            from += pageSize;
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
