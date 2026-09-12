/**
 * Lightweight, non-blocking client-side error logger.
 * Writes to `system_logs` via a public server function, surfaced in the
 * admin System Health tab.
 *
 * All calls are best-effort: failures never throw and never block the UI.
 */
import { logClientErrorPublic } from "@/lib/db-public.functions";

type Level = "info" | "warning" | "error" | "critical";

export type LogInput = {
  level?: Level;
  source?: string;
  category?: string;
  message: string;
  stack?: string;
  url?: string;
  metadata?: Record<string, unknown>;
};

// Simple in-memory dedupe so a bursty error doesn't spam the log table.
const recent = new Map<string, number>();
const DEDUPE_MS = 30_000;

function shouldSkip(key: string) {
  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last < DEDUPE_MS) return true;
  recent.set(key, now);
  // trim
  if (recent.size > 100) {
    for (const [k, ts] of recent) {
      if (now - ts > DEDUPE_MS) recent.delete(k);
    }
  }
  return false;
}

export function logSystemEvent(input: LogInput): void {
  try {
    const key = `${input.level ?? "error"}::${input.category ?? ""}::${input.message.slice(0, 120)}`;
    if (shouldSkip(key)) return;

    const payload = {
      level: input.level ?? "error",
      source: input.source ?? "client",
      category: input.category ?? undefined,
      message: input.message.slice(0, 1000),
      stack: input.stack?.slice(0, 4000) ?? undefined,
      url: input.url ?? (typeof window !== "undefined" ? window.location.href : undefined),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      metadata: input.metadata ?? {},
    };

    // Fire and forget; ignore rejection.
    void logClientErrorPublic({ data: payload }).then(
      () => {},
      () => {},
    );
  } catch {
    /* noop */
  }
}

/** Install global handlers once (called from the app root). */
let installed = false;
export function installGlobalErrorLogging() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    // Ignore benign resource load errors (Image / Script tags) — SmartImage handles those.
    if (event.target && (event.target as HTMLElement).tagName) return;
    logSystemEvent({
      level: "error",
      source: "window.error",
      category: "website_error",
      message: event.message || "Unhandled error",
      stack: event.error?.stack,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Unhandled rejection";
    logSystemEvent({
      level: "error",
      source: "unhandledrejection",
      category: "website_error",
      message,
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}
