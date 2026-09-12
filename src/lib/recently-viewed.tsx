import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type RecentPoster = {
  id: string;
  title: string;
  image_url: string;
  category_id: string | null;
  category_slug: string | null;
  category_name: string | null;
  viewed_at: number;
};

type Ctx = {
  items: RecentPoster[];
  record: (p: Omit<RecentPoster, "viewed_at">) => void;
  clear: () => void;
};

const STORAGE_KEY = "brwazwneon_recently_viewed_v1";
const MAX = 20;
const RecentCtx = createContext<Ctx | null>(null);

function readLocal(): RecentPoster[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (x): x is RecentPoster => !!x && typeof x.id === "string" && typeof x.title === "string",
      )
      .slice(0, MAX);
  } catch {
    return [];
  }
}

function writeLocal(items: RecentPoster[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX)));
  } catch {
    /* ignore */
  }
}

export function RecentlyViewedProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<RecentPoster[]>([]);

  // Hydrate from localStorage once. There's no customer auth system
  // (only the single Neon-backed admin account), so this is local-only
  // per browser — no cross-device sync.
  useEffect(() => {
    setItems(readLocal());
  }, []);

  const record = useCallback((p: Omit<RecentPoster, "viewed_at">) => {
    const entry: RecentPoster = { ...p, viewed_at: Date.now() };
    setItems((prev) => {
      const next = [entry, ...prev.filter((x) => x.id !== p.id)].slice(0, MAX);
      writeLocal(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    writeLocal([]);
  }, []);

  const value = useMemo<Ctx>(() => ({ items, record, clear }), [items, record, clear]);
  return <RecentCtx.Provider value={value}>{children}</RecentCtx.Provider>;
}

export function useRecentlyViewed() {
  const ctx = useContext(RecentCtx);
  if (!ctx) throw new Error("useRecentlyViewed outside RecentlyViewedProvider");
  return ctx;
}
