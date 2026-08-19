import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "./meta-pixel";
import { logPosterEvent } from "./analytics";

type Ctx = {
  ids: Set<string>;
  count: number;
  has: (posterId: string) => boolean;
  toggle: (posterId: string) => Promise<void> | void;
  remove: (posterId: string) => Promise<void> | void;
  clear: () => void;
};

const STORAGE_KEY = "brwazwneon_wishlist_v1";
const WishlistCtx = createContext<Ctx | null>(null);

function readLocal(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeLocal(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const merged = useRef(false);

  // Initial hydrate from localStorage
  useEffect(() => {
    setIds(new Set(readLocal()));
  }, []);

  // Track auth
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user.id ?? null);
      if (!session) merged.current = false;
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // When user signs in: merge local → DB and load DB ids.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        if (!merged.current) {
          const local = readLocal();
          if (local.length) {
            await supabase.from("wishlists").upsert(
              local.map((poster_id) => ({ user_id: userId, poster_id })),
              { onConflict: "user_id,poster_id", ignoreDuplicates: true },
            );
          }
          merged.current = true;
        }
        const { data } = await supabase.from("wishlists").select("poster_id").eq("user_id", userId);
        if (cancelled) return;
        const remote = new Set((data ?? []).map((r) => r.poster_id as string));
        setIds(remote);
        writeLocal([...remote]);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const persist = useCallback((next: Set<string>) => {
    setIds(next);
    writeLocal([...next]);
  }, []);

  const toggle = useCallback(
    async (posterId: string) => {
      const next = new Set(ids);
      const adding = !next.has(posterId);
      if (adding) next.add(posterId);
      else next.delete(posterId);
      persist(next);
      if (adding) {
        try {
          trackEvent("AddToWishlist", {
            content_ids: [posterId],
            content_type: "product",
            currency: "EGP",
          });
        } catch {
          /* noop */
        }
        try {
          logPosterEvent(posterId, "wishlist_add");
        } catch {
          /* noop */
        }
      }
      if (userId) {
        try {
          if (adding) {
            await supabase
              .from("wishlists")
              .upsert(
                { user_id: userId, poster_id: posterId },
                { onConflict: "user_id,poster_id", ignoreDuplicates: true },
              );
          } else {
            await supabase
              .from("wishlists")
              .delete()
              .eq("user_id", userId)
              .eq("poster_id", posterId);
          }
        } catch {
          /* keep optimistic state */
        }
      }
    },
    [ids, persist, userId],
  );

  const remove = useCallback(
    async (posterId: string) => {
      if (!ids.has(posterId)) return;
      await toggle(posterId);
    },
    [ids, toggle],
  );

  const clear = useCallback(() => persist(new Set()), [persist]);

  const value = useMemo<Ctx>(
    () => ({
      ids,
      count: ids.size,
      has: (id) => ids.has(id),
      toggle,
      remove,
      clear,
    }),
    [ids, toggle, remove, clear],
  );

  return <WishlistCtx.Provider value={value}>{children}</WishlistCtx.Provider>;
}

export function useWishlist() {
  const ctx = useContext(WishlistCtx);
  if (!ctx) throw new Error("useWishlist outside WishlistProvider");
  return ctx;
}
