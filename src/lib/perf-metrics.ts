import { logPerfMetricPublic } from "@/lib/db-public.functions";

type PerfMetric = "LCP" | "FCP" | "TTFB" | "CLS" | "INP" | "page_load_ms" | "upload_ms" | "custom";

const recent = new Map<string, number>();
const DEDUPE_MS = 120_000; // 2 min: aggressively dedupe repeat measurements per page

function shouldSkip(key: string) {
  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last < DEDUPE_MS) return true;
  recent.set(key, now);
  if (recent.size > 100) {
    for (const [k, ts] of recent) if (now - ts > DEDUPE_MS) recent.delete(k);
  }
  return false;
}

// Track how many times a given (metric, path) has been recorded in this session
// so we don't keep writing after we already have enough samples.
const sessionCount = new Map<string, number>();
const MAX_PER_METRIC_PATH = 3;

function sessionId() {
  try {
    const k = "brw-perf-sid";
    let s = sessionStorage.getItem(k);
    if (!s) {
      s = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem(k, s);
    }
    return s;
  } catch {
    return null;
  }
}

export function recordPerfMetric(
  metric: PerfMetric,
  valueMs: number,
  meta?: Record<string, unknown>,
) {
  try {
    if (typeof window === "undefined") return;
    if (!Number.isFinite(valueMs) || valueMs < 0) return;
    // Drop obviously bogus outliers (>2 min) — they distort averages and are
    // usually caused by backgrounded tabs, not real user waits.
    if (valueMs > 120_000) return;
    const page_path = window.location.pathname;
    const sessionKey = `${metric}::${page_path}`;
    const seen = sessionCount.get(sessionKey) ?? 0;
    if (seen >= MAX_PER_METRIC_PATH) return;
    const key = `${metric}::${page_path}::${Math.round(valueMs / 200)}`;
    if (shouldSkip(key)) return;
    sessionCount.set(sessionKey, seen + 1);

    void logPerfMetricPublic({
      data: {
        page_path,
        metric,
        value_ms: Math.round(valueMs),
        session_id: sessionId(),
        user_agent: navigator.userAgent,
        metadata: meta ?? {},
      },
    }).then(
      () => {},
      () => {},
    );
  } catch {
    /* ignore */
  }
}

let installed = false;
export function installPerfMonitor() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // Page load timing via Navigation Timing API
  const emitNav = () => {
    try {
      const nav = performance.getEntriesByType("navigation")[0] as
        PerformanceNavigationTiming | undefined;
      if (!nav) return;
      if (nav.responseStart > 0) recordPerfMetric("TTFB", nav.responseStart);
      if (nav.loadEventEnd > 0) recordPerfMetric("page_load_ms", nav.loadEventEnd);
    } catch {
      /* ignore */
    }
  };
  if (document.readyState === "complete") emitNav();
  else window.addEventListener("load", () => setTimeout(emitNav, 500), { once: true });

  // Paint / LCP via PerformanceObserver
  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === "paint" && entry.name === "first-contentful-paint") {
          recordPerfMetric("FCP", entry.startTime);
        }
        if (entry.entryType === "largest-contentful-paint") {
          recordPerfMetric("LCP", entry.startTime);
        }
      }
    });
    po.observe({ type: "paint", buffered: true });
    try {
      po.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      /* older browsers */
    }
  } catch {
    /* PerformanceObserver unsupported */
  }
}
