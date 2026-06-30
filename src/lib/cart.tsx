import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { FrameColorId, FrameTypeId, SizeId } from "./poster-options";
import type { EditSettings } from "./poster-edit";
import { trackEvent } from "./meta-pixel";

export type BundlePoster = { posterId: string; title: string; image: string };

export type CartItem = {
  id: string; // unique line id
  posterId: string;
  title: string;
  image: string;
  categoryId: string | null;
  categoryName: string;
  frameType: FrameTypeId;
  size: SizeId;
  color: FrameColorId;
  price: number;
  qty: number;
  bundle?: {
    key: "bundle-6-20x30" | "bundle-4-30x40";
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const value = useMemo<CartCtx>(
    () => ({
      items,
      add: (item) =>
        setItems((prev) => {
          try {
            trackEvent("AddToCart", {
              content_ids: item.bundle
                ? item.bundle.posters.map((p) => p.posterId)
                : [item.posterId],
              content_name: item.title,
              content_type: "product",
              content_category: item.categoryName,
              value: item.price,
              currency: "EGP",
            });
          } catch { /* noop */ }
          return [
          ...prev,
          { ...item, id: crypto.randomUUID(), qty: 1 },
          ];
        }),
      remove: (id) => setItems((prev) => prev.filter((i) => i.id !== id)),
      setQty: (id, qty) =>
        setItems((prev) =>
          prev.map((i) => (i.id === id ? { ...i, qty: Math.max(1, qty) } : i)),
        ),
      clear: () => setItems([]),
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