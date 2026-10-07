import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  DEFAULT_STOREFRONT_CONTENT,
  faqAnswer,
  normalizeStorefrontContent,
} from "./storefront-content";

describe("FAQ: PVC frame vs Wooden Portrait", () => {
  const id = "frame-vs-wooden";

  it("is a default FAQ item with an English and Arabic question and answer", () => {
    const item = DEFAULT_STOREFRONT_CONTENT.faq.items.find((i) => i.id === id);
    expect(item?.enabled).toBe(true);
    expect(item?.en).toMatch(/PVC Frame and the Wooden Portrait/);
    expect(item?.ar).toContain("الوودن بورتريه");
    const a = faqAnswer(id);
    expect(a.en).toMatch(/acrylic/i);
    expect(a.en).toMatch(/Spanish/i);
    expect(a.en).toMatch(/no frame/i);
    expect(a.ar).toContain("أكريليك");
    expect(a.ar).toContain("الإسباني");
    expect(a.ar).toContain("بدون فريم");
  });

  it("still appears when the admin already saved FAQ content without it", () => {
    const saved = {
      faq: { items: [{ id: "cod", enabled: true, en: "COD?", ar: "دفع؟" }] },
    };
    const items = normalizeStorefrontContent(saved).faq.items;
    expect(items.some((i) => i.id === id && i.enabled)).toBe(true);
    expect(items[0].id).toBe("cod"); // admin ordering is kept
  });

  it("an admin who disabled it keeps it disabled", () => {
    const saved = { faq: { items: [{ id, enabled: false, en: "", ar: "" }] } };
    expect(normalizeStorefrontContent(saved).faq.items.find((i) => i.id === id)?.enabled).toBe(
      false,
    );
  });
});
