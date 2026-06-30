import { supabase } from "@/integrations/supabase/client";
import { logPosterEvent, markUniqueView } from "@/lib/analytics";

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
  logPosterEvent(posterId, "view");
  if (markUniqueView(posterId)) {
    void supabase.rpc("increment_poster_unique_views", { p_id: posterId });
    logPosterEvent(posterId, "unique_view");
  }
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

/** Bump cart-add counts for one or more posters and log events. */
export function trackPosterCartAdd(posterIds: string[], qty = 1): void {
  const clean = Array.from(new Set(posterIds.filter(Boolean)));
  if (clean.length === 0) return;
  void supabase.rpc("increment_poster_cart_adds", {
    p_ids: clean,
    p_qty: Math.max(1, Math.floor(qty || 1)),
  });
  for (const id of clean) logPosterEvent(id, "cart_add");
}

/** Record seconds a visitor spent viewing a poster (debounced). */
export function trackPosterViewDuration(posterId: string, seconds: number): void {
  if (!posterId || !seconds || seconds < 1) return;
  void supabase.rpc("add_poster_view_seconds", {
    p_id: posterId,
    p_seconds: Math.max(1, Math.round(seconds)),
  });
}