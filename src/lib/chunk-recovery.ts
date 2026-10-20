// After a new version of the site goes live, a tab that was already open (or a visitor on a
// shaky connection) can ask for a script file that no longer exists or did not arrive. The page
// then shows "This page didn't load". The cure is simply to load the page again, once.

const GUARD_KEY = "brw_chunk_reload_at";
const GUARD_WINDOW_MS = 60_000;

const CHUNK_ERROR =
  /dynamically imported module|importing a module script failed|loading chunk|loading css chunk|failed to fetch dynamically/i;

export function isChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error ?? "");
  return CHUNK_ERROR.test(message);
}

/** Reloads the page unless it already did so in the last minute (never a reload loop). */
export function reloadOnceForChunkError(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(window.sessionStorage.getItem(GUARD_KEY) ?? 0);
    if (Date.now() - last < GUARD_WINDOW_MS) return false;
    window.sessionStorage.setItem(GUARD_KEY, String(Date.now()));
  } catch {
    // Storage blocked: reload at most once per page view instead.
    if ((window as unknown as { __brwChunkReloaded?: boolean }).__brwChunkReloaded) return false;
    (window as unknown as { __brwChunkReloaded?: boolean }).__brwChunkReloaded = true;
  }
  window.location.reload();
  return true;
}

if (typeof window !== "undefined") {
  // Vite fires this when a lazily loaded file cannot be fetched.
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadOnceForChunkError()) event.preventDefault();
  });
}
