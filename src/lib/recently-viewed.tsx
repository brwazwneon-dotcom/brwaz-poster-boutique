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
        (x): x is RecentPoster =>
          !!x && typeof x.id === "string" && typeof x.title === "string",
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
  const [userId, setUserId] = useState<string | null>(null);
  const hydrated = useRef(false);

  // Hydrate from localStorage once.
  useEffect(() => {
    setItems(readLocal());
  }, []);

  // Track auth.
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user.id ?? null);
      if (!session) hydrated.current = false;
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // On sign-in: merge local → DB, then hydrate from DB (one query).
  useEffect(() => {
    if (!userId || hydrated.current) return;
    let cancelled = false;
    (async () => {
      try {
        const local = readLocal();
        if (local.length) {
          await supabase.from("recently_viewed").upsert(
            local.map((p) => ({
              user_id: userId,
              poster_id: p.id,
              viewed_at: new Date(p.viewed_at).toISOString(),
            })),
            { onConflict: "user_id,poster_id" },
          );
        }
        const { data } = await supabase
          .from("recently_viewed")
          .select(
            "poster_id,viewed_at,posters!inner(id,title,image_url,category_id,categories(slug,name))",
          )
          .eq("user_id", userId)
          .order("viewed_at", { ascending: false })
          .limit(MAX);
        if (cancelled) return;
        const rows = (data ?? []) as unknown as Array<{
          poster_id: string;
          viewed_at: string;
          posters: {
            id: string;
            title: string;
            image_url: string;
            category_id: string | null;
            categories: { slug: string; name: string } | null;
          };
        }>;
        const merged: RecentPoster[] = rows
          .filter((r) => r.posters)
          .map((r) => ({
            id: r.posters.id,
            title: r.posters.title,
            image_url: r.posters.image_url,
            category_id: r.posters.category_id,
            category_slug: r.posters.categories?.slug ?? null,
            category_name: r.posters.categories?.name ?? null,
            viewed_at: new Date(r.viewed_at).getTime(),
          }));
        hydrated.current = true;
        setItems(merged);
        writeLocal(merged);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const record = useCallback(
    (p: Omit<RecentPoster, "viewed_at">) => {
      const entry: RecentPoster = { ...p, viewed_at: Date.now() };
      setItems((prev) => {
        const next = [entry, ...prev.filter((x) => x.id !== p.id)].slice(0, MAX);
        writeLocal(next);
        return next;
      });
      if (userId) {
        // Async, fire-and-forget; never blocks UI.
        supabase
          .from("recently_viewed")
          .upsert(
            {
              user_id: userId,
              poster_id: p.id,
              viewed_at: new Date(entry.viewed_at).toISOString(),
            },
            { onConflict: "user_id,poster_id" },
          )
          .then(() => undefined);
      }
    },
    [userId],
  );

  const clear = useCallback(() => {
    setItems([]);
    writeLocal([]);
    if (userId) {
      supabase
        .from("recently_viewed")
        .delete()
        .eq("user_id", userId)
        .then(() => undefined);
    }
  }, [userId]);

  const value = useMemo<Ctx>(() => ({ items, record, clear }), [items, record, clear]);
  return <RecentCtx.Provider value={value}>{children}</RecentCtx.Provider>;
}

export function useRecentlyViewed() {
  const ctx = useContext(RecentCtx);
  if (!ctx) throw new Error("useRecentlyViewed outside RecentlyViewedProvider");
  return ctx;
}