import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  LineChart,
  ShoppingCart,
  Camera,
  Users,
  Star,
  Package,
  Tags,
  Layers,
  Images,
  Frame,
  Home,
  Rocket,
  SplitSquareHorizontal,
  Tag,
  Ticket,
  Megaphone,
  Wallet,
  Activity,
  Settings,
} from "lucide-react";

export type Tab =
  | "dashboard"
  | "analytics"
  | "finance"
  | "promotions"
  | "products"
  | "categories"
  | "orders"
  | "photo-orders"
  | "customers"
  | "reviews"
  | "offers"
  | "sets"
  | "before-after"
  | "landing-pages"
  | "media"
  | "homepage"
  | "mockups"
  | "health"
  | "settings";

export type NavItem = {
  id: Tab;
  label: string;
  icon: LucideIcon;
  keywords?: string[];
};

export type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

// Every tab that existed in the old horizontal-tab-bar admin has exactly one
// home here — nothing was dropped, only regrouped. See NAV_GROUPS_FLAT below
// for the mechanical 1:1 mapping check.
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, keywords: ["home", "summary"] },
      { id: "analytics", label: "Analytics", icon: LineChart, keywords: ["traffic", "visitors", "search"] },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    items: [
      { id: "orders", label: "Orders", icon: ShoppingCart, keywords: ["sales"] },
      { id: "photo-orders", label: "Photo Orders", icon: Camera, keywords: ["4x6", "prints"] },
      { id: "customers", label: "Customers", icon: Users, keywords: ["crm", "segments"] },
      { id: "reviews", label: "Reviews", icon: Star, keywords: ["ratings", "feedback"] },
    ],
  },
  {
    id: "catalog",
    label: "Catalog",
    items: [
      { id: "products", label: "Products", icon: Package, keywords: ["posters", "upload", "bulk"] },
      { id: "categories", label: "Categories", icon: Tags, keywords: ["subcategories"] },
      { id: "sets", label: "Collections / Sets", icon: Layers, keywords: ["bundles"] },
      { id: "media", label: "Media Library", icon: Images, keywords: ["assets", "images", "orphaned"] },
      { id: "mockups", label: "Frame Mockups", icon: Frame, keywords: ["frames", "colors"] },
    ],
  },
  {
    id: "content",
    label: "Content",
    items: [
      { id: "homepage", label: "Homepage", icon: Home, keywords: ["hero", "slider", "highlights"] },
      { id: "landing-pages", label: "Landing Pages", icon: Rocket, keywords: ["audience", "campaign pages"] },
      { id: "before-after", label: "Before / After", icon: SplitSquareHorizontal, keywords: ["comparison"] },
      { id: "offers", label: "Offers", icon: Tag, keywords: ["custom offers", "deals"] },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    items: [
      { id: "promotions", label: "Promotions", icon: Ticket, keywords: ["coupons", "discounts", "codes"] },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    items: [
      { id: "finance", label: "Finance", icon: Wallet, keywords: ["expenses", "profit", "revenue"] },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { id: "health", label: "System Health", icon: Activity, keywords: ["status", "diagnostics"] },
      { id: "settings", label: "Settings", icon: Settings, keywords: ["config", "storefront", "flags"] },
    ],
  },
];

export const NAV_ITEMS_FLAT: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export function findNavItem(tab: Tab): { item: NavItem; group: NavGroup } | null {
  for (const group of NAV_GROUPS) {
    const item = group.items.find((i) => i.id === tab);
    if (item) return { item, group };
  }
  return null;
}

// Marketing channels that aren't connected yet (Phase 4 — Meta/TikTok Ads).
// Shown in the sidebar as a disabled row so the feature isn't hidden, but
// never rendered as a clickable tab with fabricated data behind it.
export const MARKETING_NOT_CONNECTED: { label: string; icon: LucideIcon }[] = [
  { label: "Campaigns", icon: Megaphone },
];
