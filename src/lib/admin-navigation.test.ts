import { describe, expect, it } from "vitest";
import { ADMIN_TABS, NAVIGATION_GROUPS, isAdminTab, getGroupForTab } from "./admin-navigation";

describe("Admin Navigation Registry", () => {
  it("includes the Advertising Catalog tab ('catalog')", () => {
    expect(ADMIN_TABS).toContain("catalog");
  });

  it("places Advertising Catalog in the Marketing group", () => {
    expect(getGroupForTab("catalog")).toBe("marketing");
  });

  it("does not duplicate any tab across multiple groups", () => {
    const seen = new Set<string>();
    for (const tabs of Object.values(NAVIGATION_GROUPS)) {
      for (const tab of tabs as readonly string[]) {
        expect(seen.has(tab)).toBe(false);
        seen.add(tab);
      }
    }
  });

  it("includes all core admin features", () => {
    for (const required of [
      "orders",
      "customers",
      "categories",
      "offers",
      "system-health",
      "campaign-report",
      "social-proof",
      "hero-banners",
      "photo-4x6",
      "photo-printing-media",
      "post-order",
      "notifications",
      "backups",
      "settings",
      "ai-settings",
    ]) {
      expect(ADMIN_TABS).toContain(required);
    }
  });

  it("isAdminTab accepts valid tabs and rejects invalid ones", () => {
    expect(isAdminTab("catalog")).toBe(true);
    expect(isAdminTab("not-a-real-tab")).toBe(false);
  });
});

describe("Advertising Catalog route mapping", () => {
  it("maps the catalog tab to Advertising Catalogs i18n label", () => {
    // The i18n dictionary maps 'tab.catalog' -> 'Advertising Catalogs'
    // We verify the route key exists; translation is verified in admin-i18n tests.
    expect(ADMIN_TABS).toContain("catalog");
    expect(getGroupForTab("catalog")).toBe("marketing");
  });
});
