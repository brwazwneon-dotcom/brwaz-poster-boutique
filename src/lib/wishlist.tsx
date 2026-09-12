import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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

  // Initial hydrate from localStorage. There's no customer auth system
  // (only the single Neon-backed admin account), so the wishlist is
  // local-only per browser — no cross-device sync.
  useEffect(() => {
    setIds(new Set(readLocal()));
  }, []);

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
    },
    [ids, persist],
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
