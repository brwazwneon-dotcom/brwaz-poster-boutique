import { useState } from "react";
import { adminLogout } from "@/lib/admin-auth-neon.functions";
import { DashboardTab } from "./DashboardTab";
import { OrdersTab } from "./OrdersTab";
import { PhotoOrdersTab } from "./PhotoOrdersTab";
import { ProductsTab } from "./ProductsTab";
import { CategoriesTab } from "./CategoriesTab";
import { CustomersTab } from "./CustomersTab";
import { ReviewsTab } from "./ReviewsTab";
import { CustomOffersTab } from "./CustomOffersTab";
import { SetsTab } from "./SetsTab";
import { BeforeAfterTab } from "./BeforeAfterTab";
import { LandingPagesTab } from "./LandingPagesTab";
import { MediaLibraryTab } from "./MediaLibraryTab";
import { HomepageTab } from "./HomepageTab";
import { FrameMockupsTab } from "./FrameMockupsTab";
import { SystemHealthTab } from "./SystemHealthTab";
import { SettingsTab } from "./SettingsTab";

type Tab =
  | "dashboard"
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

export function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("dashboard");
  // Tabs mount lazily on first visit but never unmount again — switching
  // away and back (e.g. to double-check a category while reviewing the
  // upload queue) used to wipe all in-progress local state, most painfully
  // the Products upload queue, since a bare `{tab === "x" && <XTab/>}`
  // destroys and recreates the component on every switch.
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(new Set(["dashboard"]));
  const switchTab = (t: Tab) => {
    setTab(t);
    setVisitedTabs((prev) => (prev.has(t) ? prev : new Set(prev).add(t)));
  };

  const logout = async () => {
    await adminLogout();
    onLogout();
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "orders", label: "Orders" },
    { id: "photo-orders", label: "Photo Orders" },
    { id: "products", label: "Products" },
    { id: "categories", label: "Categories" },
    { id: "customers", label: "Customers" },
    { id: "reviews", label: "Reviews" },
    { id: "offers", label: "Offers" },
    { id: "sets", label: "Sets" },
    { id: "before-after", label: "Before / After" },
    { id: "landing-pages", label: "Landing Pages" },
    { id: "media", label: "Media Library" },
    { id: "homepage", label: "Homepage" },
    { id: "mockups", label: "Frame Mockups" },
    { id: "health", label: "System Health" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <h1 className="text-display text-xl">BRWAZWNEON Admin</h1>
          <button onClick={logout} className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
            Sign out
          </button>
        </div>
        <div className="mx-auto flex max-w-6xl gap-1 px-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => switchTab(t.id)}
              className={`border-b-2 px-4 py-2.5 text-xs uppercase tracking-widest transition ${
                tab === t.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-8">
        {visitedTabs.has("dashboard") && <div hidden={tab !== "dashboard"}><DashboardTab /></div>}
        {visitedTabs.has("orders") && <div hidden={tab !== "orders"}><OrdersTab /></div>}
        {visitedTabs.has("photo-orders") && <div hidden={tab !== "photo-orders"}><PhotoOrdersTab /></div>}
        {visitedTabs.has("products") && <div hidden={tab !== "products"}><ProductsTab /></div>}
        {visitedTabs.has("categories") && <div hidden={tab !== "categories"}><CategoriesTab /></div>}
        {visitedTabs.has("customers") && <div hidden={tab !== "customers"}><CustomersTab /></div>}
        {visitedTabs.has("reviews") && <div hidden={tab !== "reviews"}><ReviewsTab /></div>}
        {visitedTabs.has("offers") && <div hidden={tab !== "offers"}><CustomOffersTab /></div>}
        {visitedTabs.has("sets") && <div hidden={tab !== "sets"}><SetsTab /></div>}
        {visitedTabs.has("before-after") && <div hidden={tab !== "before-after"}><BeforeAfterTab /></div>}
        {visitedTabs.has("landing-pages") && <div hidden={tab !== "landing-pages"}><LandingPagesTab /></div>}
        {visitedTabs.has("media") && <div hidden={tab !== "media"}><MediaLibraryTab /></div>}
        {visitedTabs.has("homepage") && <div hidden={tab !== "homepage"}><HomepageTab /></div>}
        {visitedTabs.has("mockups") && <div hidden={tab !== "mockups"}><FrameMockupsTab /></div>}
        {visitedTabs.has("health") && <div hidden={tab !== "health"}><SystemHealthTab /></div>}
        {visitedTabs.has("settings") && <div hidden={tab !== "settings"}><SettingsTab /></div>}
      </div>
    </div>
  );
}
