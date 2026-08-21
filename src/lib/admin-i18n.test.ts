import { describe, expect, it } from "vitest";
import { tabLabel } from "./admin-i18n";

describe("Admin i18n — Advertising Catalog label", () => {
  const enT = (key: string, fallback?: string) => {
    const dict: Record<string, string> = {
      "tab.catalog": "Advertising Catalogs",
      "tab.system-health": "System Health",
    };
    return dict[key] ?? fallback ?? key;
  };

  const arT = (key: string, fallback?: string) => {
    const dict: Record<string, string> = {
      "tab.catalog": "كتالوج الإعلانات",
      "tab.system-health": "صحة النظام",
    };
    return dict[key] ?? fallback ?? key;
  };

  it("labels the catalog tab as 'Advertising Catalogs' in English", () => {
    expect(tabLabel(enT, "catalog")).toBe("Advertising Catalogs");
  });

  it("labels the catalog tab as 'كتالوج الإعلانات' in Arabic", () => {
    expect(tabLabel(arT, "catalog")).toBe("كتالوج الإعلانات");
  });

  it("keeps System Health labels intact", () => {
    expect(tabLabel(enT, "system-health")).toBe("System Health");
    expect(tabLabel(arT, "system-health")).toBe("صحة النظام");
  });
});
