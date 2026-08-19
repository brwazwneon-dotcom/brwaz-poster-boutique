import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { FrameColorId, FrameTypeId, SizeId } from "./poster-options";
import type { EditSettings } from "./poster-edit";
import { trackEvent, trackCustom } from "./meta-pixel";
import { trackPosterCartAdd } from "./poster-tracking";
import { track as behavior } from "./behavior";

export type BundlePoster = { posterId: string; title: string; image: string };

export type CartItem = {
  id: string; // unique line id
  posterId: string;
  title: string;
  image: string;
  customImagePath?: string;
  customImageMeta?: {
    originalFilename: string;
    originalMimeType: string;
    originalWidth: number;
    originalHeight: number;
    originalFileSize: number;
  };
  categoryId: string | null;
  categoryName: string;
  frameType: FrameTypeId;
  size: SizeId;
  color: FrameColorId;
  price: number;
  qty: number;
  bundle?: {
    key: string;
    label: string;
    posters: BundlePoster[];
  };
  editSettings?: EditSettings;
};

type CartCtx = {
  items: CartItem[];
  add: (item: Omit<CartItem, "id" | "qty">) => void;
  remove: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  update: (
    id: string,
    patch: Partial<Pick<CartItem, "size" | "color" | "frameType" | "price">>,
  ) => void;
  clear: () => void;
  total: number;
  count: number;
};

const Ctx = createContext<CartCtx | null>(null);
const STORAGE_KEY = "brwazwneon_cart_v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const persist = (next: CartItem[]) => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    }
    return next;
  };

  const readStored = (): CartItem[] | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch {
      return null;
    }
  };

  const value = useMemo<CartCtx>(
    () => ({
      items,
      add: (item) => {
        try {
          trackEvent("AddToCart", {
            content_ids: item.bundle ? item.bundle.posters.map((p) => p.posterId) : [item.posterId],
            content_name: item.title,
            content_type: "product",
            content_category: item.categoryName,
            value: item.price,
            currency: "EGP",
          });
        } catch {
          /* noop */
        }
        try {
          const ids = item.bundle
            ? item.bundle.posters.map((p) => p.posterId)
            : item.posterId
              ? [item.posterId]
              : [];
          if (ids.length) trackPosterCartAdd(ids, 1);
        } catch {
          /* noop */
        }
        try {
          const ids = item.bundle
            ? item.bundle.posters.map((p) => p.posterId)
            : item.posterId
              ? [item.posterId]
              : [];
          ids.forEach((pid) =>
            behavior.cart(
              pid,
              {
                categoryId: item.categoryId,
                size: item.size,
                frameType: item.frameType,
              },
              true,
              1,
            ),
          );
        } catch {
          /* noop */
        }
        const base = readStored() ?? items;
        const next = persist([...base, { ...item, id: crypto.randomUUID(), qty: 1 }]);
        console.info("[cart-debug] add", {
          title: item.title,
          posterId: item.posterId,
          previousCount: base.length,
          nextCount: next.length,
          customImagePath: item.customImagePath ? "[path/url]" : null,
        });
        setItems(next);
      },
      remove: (id) =>
        setItems((prev) => {
          const item = prev.find((i) => i.id === id);
          try {
            if (item) {
              const ids = item.bundle
                ? item.bundle.posters.map((p) => p.posterId)
                : item.posterId
                  ? [item.posterId]
                  : [];
              ids.forEach((pid) =>
                behavior.cart(
                  pid,
                  {
                    categoryId: item.categoryId,
                    size: item.size,
                    frameType: item.frameType,
                  },
                  false,
                  item.qty,
                ),
              );
              try {
                trackCustom("RemoveFromCart", {
                  content_ids: ids,
                  content_name: item.title,
                  content_type: "product",
                  content_category: item.categoryName,
                  value: item.price * item.qty,
                  currency: "EGP",
                  quantity: item.qty,
                });
              } catch {
                /* noop */
              }
            }
          } catch {
            /* noop */
          }
          return persist(prev.filter((i) => i.id !== id));
        }),
      setQty: (id, qty) =>
        setItems((prev) => {
          const next = prev.map((i) => (i.id === id ? { ...i, qty: Math.max(1, qty) } : i));
          const changed = next.find((i) => i.id === id);
          if (changed) {
            try {
              trackCustom("CartUpdated", {
                content_ids: changed.bundle
                  ? changed.bundle.posters.map((p) => p.posterId)
                  : [changed.posterId],
                content_name: changed.title,
                content_type: "product",
                value: changed.price * changed.qty,
                currency: "EGP",
                quantity: changed.qty,
              });
            } catch {
              /* noop */
            }
          }
          return persist(next);
        }),
      update: (id, patch) =>
        setItems((prev) => persist(prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))),
      clear: () => setItems(persist([])),
      total: items.reduce((s, i) => s + i.price * i.qty, 0),
      count: items.reduce((s, i) => s + i.qty, 0),
    }),
    [items],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCart outside CartProvider");
  return ctx;
}
