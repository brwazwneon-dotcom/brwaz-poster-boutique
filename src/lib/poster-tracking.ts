import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "brw-viewed-posters";

function viewedThisSession(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveViewed(set: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(Array.from(set)));
  } catch {
    /* ignore */
  }
}

/** Bump a poster's view count at most once per browser session. */
export function trackPosterView(posterId: string): void {
  if (!posterId) return;
  const viewed = viewedThisSession();
  if (viewed.has(posterId)) return;
  viewed.add(posterId);
  saveViewed(viewed);
  // Fire and forget — never block UI on analytics.
  supabase.rpc("increment_poster_views", { p_id: posterId }).then(
    () => {},
    () => {
      // Roll back so a retry can happen next session if it failed.
      viewed.delete(posterId);
      saveViewed(viewed);
    },
  );
}

/** Increment sales/purchase count after a real order is placed. */
export async function trackPosterSales(posterIds: string[], qty: number): Promise<void> {
  const clean = Array.from(new Set(posterIds.filter(Boolean)));
  if (clean.length === 0) return;
  await supabase.rpc("increment_poster_sales", {
    p_ids: clean,
    p_qty: Math.max(1, Math.floor(qty || 1)),
  });
}