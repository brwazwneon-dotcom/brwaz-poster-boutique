import { useState } from "react";
import { adminLogout } from "@/lib/admin-auth-neon.functions";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin/layout/AdminSidebar";
import { AdminTopbar } from "@/components/admin/layout/AdminTopbar";
import { AdminCommandPalette } from "@/components/admin/layout/AdminCommandPalette";
import { AdminThemeProvider } from "@/components/admin/layout/AdminThemeProvider";
import type { Tab } from "@/components/admin/layout/nav-config";
import { DashboardTab } from "./DashboardTab";
import { AnalyticsTab } from "./AnalyticsTab";
import { FinanceTab } from "./FinanceTab";
import { PromotionsTab } from "./PromotionsTab";
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

export function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("dashboard");
  // Tabs mount lazily on first visit but never unmount again — switching
  // away and back (e.g. to double-check a category while reviewing the
  // upload queue) used to wipe all in-progress local state, most painfully
  // the Products upload queue, since a bare `{tab === "x" && <XTab/>}`
  // destroys and recreates the component on every switch.
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(new Set(["dashboard"]));
  const [commandOpen, setCommandOpen] = useState(false);
  const switchTab = (t: Tab) => {
    setTab(t);
    setVisitedTabs((prev) => (prev.has(t) ? prev : new Set(prev).add(t)));
  };

  const logout = async () => {
    await adminLogout();
    onLogout();
  };

  return (
    <AdminThemeProvider>
      <SidebarProvider>
        <AdminSidebar activeTab={tab} onNavigate={switchTab} />
        <SidebarInset>
          <AdminTopbar
            activeTab={tab}
            onOpenCommandPalette={() => setCommandOpen(true)}
            onSignOut={logout}
          />
          <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
            {visitedTabs.has("dashboard") && <div hidden={tab !== "dashboard"}><DashboardTab /></div>}
            {visitedTabs.has("analytics") && <div hidden={tab !== "analytics"}><AnalyticsTab /></div>}
            {visitedTabs.has("finance") && <div hidden={tab !== "finance"}><FinanceTab /></div>}
            {visitedTabs.has("orders") && <div hidden={tab !== "orders"}><OrdersTab /></div>}
            {visitedTabs.has("photo-orders") && <div hidden={tab !== "photo-orders"}><PhotoOrdersTab /></div>}
            {visitedTabs.has("products") && <div hidden={tab !== "products"}><ProductsTab /></div>}
            {visitedTabs.has("categories") && <div hidden={tab !== "categories"}><CategoriesTab /></div>}
            {visitedTabs.has("customers") && <div hidden={tab !== "customers"}><CustomersTab /></div>}
            {visitedTabs.has("reviews") && <div hidden={tab !== "reviews"}><ReviewsTab /></div>}
            {visitedTabs.has("offers") && <div hidden={tab !== "offers"}><CustomOffersTab /></div>}
            {visitedTabs.has("promotions") && <div hidden={tab !== "promotions"}><PromotionsTab /></div>}
            {visitedTabs.has("sets") && <div hidden={tab !== "sets"}><SetsTab /></div>}
            {visitedTabs.has("before-after") && <div hidden={tab !== "before-after"}><BeforeAfterTab /></div>}
            {visitedTabs.has("landing-pages") && <div hidden={tab !== "landing-pages"}><LandingPagesTab /></div>}
            {visitedTabs.has("media") && <div hidden={tab !== "media"}><MediaLibraryTab /></div>}
            {visitedTabs.has("homepage") && <div hidden={tab !== "homepage"}><HomepageTab /></div>}
            {visitedTabs.has("mockups") && <div hidden={tab !== "mockups"}><FrameMockupsTab /></div>}
            {visitedTabs.has("health") && <div hidden={tab !== "health"}><SystemHealthTab /></div>}
            {visitedTabs.has("settings") && <div hidden={tab !== "settings"}><SettingsTab /></div>}
          </div>
        </SidebarInset>
        <AdminCommandPalette
          open={commandOpen}
          onOpenChange={setCommandOpen}
          onNavigate={switchTab}
          onSignOut={logout}
        />
      </SidebarProvider>
    </AdminThemeProvider>
  );
}
