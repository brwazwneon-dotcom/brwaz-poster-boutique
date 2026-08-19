// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const previewServerShimPlugin = () => ({
  name: "preview-server-shim",
  apply: "build" as const,
  closeBundle() {
    // Write _headers for local preview parity with production asset caching.
    const writeHeaders = (dir: string) => {
      const p = resolve(dir, "_headers");
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(
        p,
        [
          "/",
          "  cache-control: no-cache, no-store, must-revalidate",
          "",
          "/sw.js",
          "  cache-control: no-cache, no-store, must-revalidate",
          "",
          "/*.html",
          "  cache-control: no-cache, no-store, must-revalidate",
          "",
          "/assets/*",
          "  cache-control: public, max-age=31536000, immutable",
          "",
        ].join("\n"),
      );
    };
    writeHeaders(resolve("dist"));

    // Vite preview serves from dist, while TanStack/Nitro emits public assets
    // under .output/public. Mirror them so local production preview loads JS/CSS.
    const outputPublicDir = resolve(".output/public");
    const previewPublicDir = resolve("dist");
    if (existsSync(outputPublicDir)) {
      mkdirSync(previewPublicDir, { recursive: true });
      for (const entry of readdirSync(outputPublicDir)) {
        cpSync(resolve(outputPublicDir, entry), resolve(previewPublicDir, entry), {
          recursive: true,
          force: true,
        });
      }
    }

    const previewServerEntry = resolve("dist/server/server.js");

    mkdirSync(dirname(previewServerEntry), { recursive: true });
    writeFileSync(
      previewServerEntry,
      [
        'import { readFile, stat } from "node:fs/promises";',
        'import { extname, resolve } from "node:path";',
        'import { fileURLToPath } from "node:url";',
        'import server from "../../.output/server/index.mjs";',
        "",
        'const publicRoot = fileURLToPath(new URL("../", import.meta.url));',
        "const contentTypes = {",
        '  ".css": "text/css; charset=utf-8",',
        '  ".js": "application/javascript; charset=utf-8",',
        '  ".mjs": "application/javascript; charset=utf-8",',
        '  ".json": "application/json; charset=utf-8",',
        '  ".webmanifest": "application/manifest+json; charset=utf-8",',
        '  ".txt": "text/plain; charset=utf-8",',
        '  ".html": "text/html; charset=utf-8",',
        '  ".png": "image/png",',
        '  ".jpg": "image/jpeg",',
        '  ".jpeg": "image/jpeg",',
        '  ".webp": "image/webp",',
        '  ".svg": "image/svg+xml",',
        '  ".woff": "font/woff",',
        '  ".woff2": "font/woff2",',
        "};",
        "",
        "async function serveStatic(request) {",
        '  if (request.method !== "GET" && request.method !== "HEAD") return null;',
        "  const url = new URL(request.url);",
        "  let pathname;",
        "  try {",
        "    pathname = decodeURIComponent(url.pathname);",
        "  } catch {",
        "    return null;",
        "  }",
        '  if (pathname.includes("\\0")) return null;',
        "  const filePath = resolve(publicRoot, `.${pathname}`);",
        "  if (!filePath.startsWith(publicRoot)) return null;",
        "  const fileStat = await stat(filePath).catch(() => null);",
        "  if (!fileStat?.isFile()) return null;",
        '  const contentType = contentTypes[extname(filePath).toLowerCase()] || "application/octet-stream";',
        "  const headers = {",
        '    "content-type": contentType,',
        '    "cache-control": pathname.startsWith("/assets/") && (pathname.endsWith(".js") || pathname.endsWith(".css") || pathname.endsWith(".mjs"))',
        '      ? "public, max-age=31536000, immutable"',
        '      : "no-cache, no-store, must-revalidate",',
        "  };",
        '  return new Response(request.method === "HEAD" ? null : await readFile(filePath), { headers });',
        "}",
        "",
        "export default {",
        "  ...server,",
        "  async fetch(request, env, context) {",
        "    const staticResponse = await serveStatic(request);",
        "    if (staticResponse) return staticResponse;",
        "    const mutableRequest = new Request(request.url, {",
        "      method: request.method,",
        "      headers: request.headers,",
        "      body:",
        '        request.method === "GET" || request.method === "HEAD"',
        "          ? undefined",
        "          : request.body,",
        '      duplex: "half",',
        "    });",
        "",
        "    return server.fetch(mutableRequest, env ?? {}, context);",
        "  },",
        "};",
        "",
      ].join("\n"),
    );
  },
});

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  nitro: {
    ...(process.env.NITRO_PRESET ? { preset: process.env.NITRO_PRESET } : {}),
  },
  vite: {
    plugins: [previewServerShimPlugin()],
    build: {
      cssCodeSplit: true,
      modulePreload: { polyfill: false },
    },
    define: {
      __BUILD_ID__: JSON.stringify(
        process.env.VERCEL_GIT_COMMIT_SHA ||
          process.env.BUILD_ID ||
          `brwaz-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`,
      ),
    },
  },
});
