// Native Vite config — replaces the former @lovable.dev/vite-tanstack-config
// wrapper (removed 2026-09-12 as part of the Lovable decoupling pass).
//
// The wrapper's sandbox-only behavior (HMR gate, dev-server bridge, asset
// proxy, build error diagnostics) never activated outside Lovable's own
// sandbox (it gated on LOVABLE_SANDBOX / DEV_SERVER__PROJECT_PATH env vars,
// which are never set in this project's real dev/build/deploy environment),
// so dropping it changes nothing about how this app actually builds or runs.
// What's kept below (tailwindcss, tsconfig-paths, tanstackStart, nitro,
// react plugin, lightningcss CSS transform, the "@" alias, dedupe/optimizeDeps,
// dev server host/port, watch debounce) mirrors exactly what the wrapper did
// in a non-sandbox environment.
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defineConfig, loadEnv, mergeConfig, type PluginOption } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

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

// awaitWriteFinish debounce to avoid double-firing HMR while files are still
// being written (kept from the previous config — it's a general dev-server
// robustness tweak, not Lovable-specific).
function withWatchDebounce(config: Parameters<typeof mergeConfig>[0]) {
  return mergeConfig(config, {
    server: {
      watch: {
        awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 100 },
      },
    },
  });
}

export default defineConfig(async ({ command, mode }) => {
  const internalPlugins: PluginOption[] = [];

  if (mode === "development") {
    const { devtools } = await import("@tanstack/devtools-vite");
    internalPlugins.push(
      devtools({
        logging: false,
        eventBusConfig: { enabled: false },
        enhancedLogs: { enabled: false },
        consolePiping: { enabled: false },
        removeDevtoolsOnBuild: false,
        injectSource: { enabled: true },
      }),
    );
  }

  internalPlugins.push(tailwindcss());
  internalPlugins.push(tsConfigPaths({ projects: ["./tsconfig.json"] }));

  internalPlugins.push(
    tanstackStart({
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
      // Redirect TanStack Start's bundled server entry to src/server.ts
      // (our SSR error wrapper). nitro/vite builds from this.
      server: { entry: "server" },
    }),
  );

  if (command === "build") {
    const { nitro } = await import("nitro/vite");
    internalPlugins.push(
      nitro({
        defaultPreset: "cloudflare-module",
        ...(process.env.NITRO_PRESET ? { preset: process.env.NITRO_PRESET } : {}),
      }),
    );
  }

  internalPlugins.push(viteReact());
  internalPlugins.push(previewServerShimPlugin());

  const envDefine: Record<string, string> = {};
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), "VITE_"))) {
    envDefine[`import.meta.env.${key}`] = JSON.stringify(value);
  }
  envDefine.__BUILD_ID__ = JSON.stringify(
    process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.BUILD_ID ||
      `brwaz-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`,
  );

  const isDevBuild = command === "build" && mode === "development";

  const config = {
    define: envDefine,
    ...(isDevBuild
      ? {
          environments: { client: { define: { "process.env.NODE_ENV": JSON.stringify("development") } } },
          esbuild: { keepNames: true },
        }
      : {}),
    // Match the build's CSS pipeline in dev: Vite uses PostCSS in dev and only
    // runs Lightning CSS at build by default, so build-time-only transforms
    // (e.g. collapsing a hand-written `-webkit-backdrop-filter` to the
    // prefixed form Chrome ignores) would break the built output while the
    // dev preview looks fine. Running Lightning CSS in both keeps them in sync.
    css: { transformer: "lightningcss" as const },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    // Dep re-optimization rotates the optimized-dep hash and 504s tabs holding
    // the old one; pre-bundle the always-present client deps + tolerate stale
    // requests. React core only — including @tanstack/react-start would pull
    // its node:async_hooks server entry into the client bundle and crash hydration.
    optimizeDeps: {
      include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"],
      ignoreOutdatedRequests: true,
    },
    server: { host: "::" as const, port: 8080 },
    plugins: internalPlugins,
    build: {
      cssCodeSplit: true,
      modulePreload: { polyfill: false },
    },
  };

  return withWatchDebounce(config);
});
