// Guarded PWA registration. Only runs in production on real deploys.
// Never registers in an iframe embed, dev, or when ?sw=off is set.
//
// Includes build-ID mismatch detection: if the HTML page belongs to a
// different deployment than the JavaScript bundle, the app unregisters
// stale service workers, clears BRWAZWNEON caches, and reloads once
// from the network. This automatically migrates existing Chrome/Edge
// users to a new deployment without manual cache clearing.

const SW_PATH = "/sw.js";

async function unregisterAppSw() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      const url =
        reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || "";
      if (url.endsWith(SW_PATH)) {
        await reg.unregister();
      }
    }
  } catch {
    /* ignore */
  }
}

async function clearAppCaches() {
  if (typeof caches === "undefined") return;
  try {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(
          (key) =>
            key.startsWith("brwazwneon-") || key.startsWith("brw-app-shell-") || key.startsWith("workbox-"),
        )
        .map((key) => caches.delete(key)),
    );
  } catch {
    /* ignore */
  }
}

/** Detect if the HTML document and the JS application belong to different builds */
function checkBuildIdMismatch(): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") return false;
  const htmlBuildId = document.documentElement.dataset.buildId;
  const jsBuildId = window.__BRWAZ_BUILD_ID__;
  if (!htmlBuildId || !jsBuildId) return false;
  return htmlBuildId !== jsBuildId;
}

let mismatchReloaded = false;

export async function registerPwa(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const inIframe = window.self !== window.top;
  const killSwitch = new URLSearchParams(window.location.search).get("sw") === "off";
  const isProd = import.meta.env.PROD;

  // Preview/dev environments: unregister any SW and bail
  if (!isProd || inIframe || killSwitch) {
    await unregisterAppSw();
    return;
  }

  // Build ID mismatch detection — run once per session
  if (!mismatchReloaded && checkBuildIdMismatch()) {
    mismatchReloaded = true;
    console.log("[brwaz] Build ID mismatch detected — clearing caches and reloading");
    await unregisterAppSw();
    await clearAppCaches();
    window.location.reload();
    return;
  }

  try {
    let refreshing = false;
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController) return;
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    const registration = await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          worker.postMessage({ type: "SKIP_WAITING" });
        }
      });
    });
    await registration.update();
  } catch (err) {
    console.warn("[pwa] registration failed", err);
  }
}
