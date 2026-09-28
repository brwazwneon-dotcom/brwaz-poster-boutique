// @vitest-environment jsdom
//
// Integration-style tests for the draft/publish/history/reset pipeline —
// exercises the REAL saveThemeDraft/publishTheme/resetThemeDraftScope/
// getThemeHistory/restoreThemeVersionToDraft functions against an
// in-memory stand-in for `site_settings` / `site_settings_history`, so
// this is a genuine behavioral test of "Save Draft doesn't touch Live;
// Publish does; Reset Light doesn't touch Dark", not just a claim.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { id: string; key: string; value: unknown; created_at: string };

const settings = new Map<string, unknown>();
const history: Row[] = [];
let nextId = 1;

vi.mock("@/lib/db-admin.functions", () => ({
  setSiteSetting: vi.fn(async ({ data }: { data: { key: string; value: unknown } }) => {
    settings.set(data.key, data.value);
    return { ok: true };
  }),
  setSiteSettingWithHistory: vi.fn(async ({ data }: { data: { key: string; value: unknown } }) => {
    settings.set(data.key, data.value);
    history.unshift({
      id: String(nextId++),
      key: data.key,
      value: data.value,
      created_at: new Date().toISOString(),
    });
    return { ok: true };
  }),
  getSiteSettingHistory: vi.fn(async ({ data }: { data: { key: string; limit?: number } }) => {
    return history
      .filter((h) => h.key === data.key)
      .slice(0, data.limit ?? 20)
      .map((h) => ({ ...h, created_by: null, created_by_email: null }));
  }),
  restoreSiteSettingVersionToDraft: vi.fn(
    async ({ data }: { data: { historyId: string; draftKey: string } }) => {
      const row = history.find((h) => h.id === data.historyId);
      if (!row) throw new Error("Version not found");
      settings.set(data.draftKey, row.value);
      return { ok: true, value: row.value };
    },
  ),
}));

vi.mock("@/lib/db-public.functions", () => ({
  getSiteSettingsPublic: vi.fn(async ({ data }: { data: { keys: string[] } }) => {
    const out: Record<string, unknown> = {};
    for (const key of data.keys) if (settings.has(key)) out[key] = settings.get(key);
    return out;
  }),
}));

import {
  loadDraftThemeSettings,
  loadPublishedThemeSettings,
  saveThemeDraft,
  publishTheme,
  getThemeHistory,
  restoreThemeVersionToDraft,
  resetThemeDraftScope,
  withThemeChanges,
  normalizeThemeSettings,
  DEFAULT_THEME_MODE,
  type WebsiteThemeSettings,
} from "./theme-system";

const EMPTY: WebsiteThemeSettings = {
  mode: DEFAULT_THEME_MODE,
  colors: { light: {}, dark: {} },
  shadows: { light: {}, dark: {} },
  typography: {},
  logos: {},
};

beforeEach(() => {
  settings.clear();
  history.length = 0;
  nextId = 1;
});

describe("Save Draft vs Publish — the live site must never move without an explicit Publish", () => {
  it("saveThemeDraft never changes the published value", async () => {
    const edited = withThemeChanges(EMPTY, {
      colors: { dark: { primary: "#ff0000" } },
      shadows: { dark: { "theme-shadow-md": "0 4px 12px 0 rgba(0,0,0,0.5)" } },
      typography: { fontSizeBasePx: 18 },
      logos: { light: "https://res.cloudinary.com/demo/logo-light.png" },
    });

    await saveThemeDraft(edited);

    const published = await loadPublishedThemeSettings();
    expect(published).toEqual(EMPTY); // untouched — nothing was published yet

    const draft = await loadDraftThemeSettings();
    expect(draft.colors.dark.primary).toBe("#ff0000");
    expect(draft.shadows.dark["theme-shadow-md"]).toBe("0 4px 12px 0 rgba(0,0,0,0.5)");
    expect(draft.typography.fontSizeBasePx).toBe(18);
    expect(draft.logos.light).toBe("https://res.cloudinary.com/demo/logo-light.png");
  });

  it("publishTheme makes every field (colors, shadows, typography, logo) live", async () => {
    const edited = withThemeChanges(EMPTY, {
      mode: "light",
      colors: { light: { background: "#ffffff" } },
      shadows: { light: { "theme-shadow-lg": "0 20px 40px 0 rgba(0,0,0,0.2)" } },
      logos: { dark: "https://res.cloudinary.com/demo/logo-dark.png" },
    });

    await saveThemeDraft(edited);
    await publishTheme(edited);

    const published = await loadPublishedThemeSettings();
    expect(published.mode).toBe("light");
    expect(published.colors.light.background).toBe("#ffffff");
    expect(published.shadows.light["theme-shadow-lg"]).toBe("0 20px 40px 0 rgba(0,0,0,0.2)");
    expect(published.logos.dark).toBe("https://res.cloudinary.com/demo/logo-dark.png");
  });

  it("publishTheme also re-syncs the draft to what's now live, so the next edit starts from it", async () => {
    const edited = withThemeChanges(EMPTY, { colors: { dark: { primary: "#00ff00" } } });
    await publishTheme(edited);
    const draft = await loadDraftThemeSettings();
    expect(draft.colors.dark.primary).toBe("#00ff00");
  });

  it("draft falls back to the published value until a draft has actually been saved", async () => {
    const draftBeforeAnyEdit = await loadDraftThemeSettings();
    expect(draftBeforeAnyEdit).toEqual(EMPTY);
  });
});

describe("resetThemeDraftScope — per-mode isolation", () => {
  async function seedBothModesAndTypography() {
    const seeded = withThemeChanges(EMPTY, {
      colors: {
        light: { background: "#ffffff", primary: "#111111" },
        dark: { background: "#000000", primary: "#eeeeee" },
      },
      shadows: {
        light: { "theme-shadow-sm": "0 1px 2px 0 rgba(0,0,0,0.05)" },
        dark: { "theme-shadow-sm": "0 1px 2px 0 rgba(0,0,0,0.5)" },
      },
      logos: {
        light: "https://res.cloudinary.com/demo/light.png",
        dark: "https://res.cloudinary.com/demo/dark.png",
      },
      typography: { fontSizeBasePx: 18 },
    });
    await saveThemeDraft(seeded);
    return seeded;
  }

  it("Reset Light clears only the light palette/shadows/logo — dark and typography survive", async () => {
    const seeded = await seedBothModesAndTypography();
    const next = await resetThemeDraftScope(seeded, "light");

    expect(next.colors.light).toEqual({});
    expect(next.shadows.light).toEqual({});
    expect(next.logos.light).toBeUndefined();

    expect(next.colors.dark).toEqual({ background: "#000000", primary: "#eeeeee" });
    expect(next.shadows.dark).toEqual({ "theme-shadow-sm": "0 1px 2px 0 rgba(0,0,0,0.5)" });
    expect(next.logos.dark).toBe("https://res.cloudinary.com/demo/dark.png");
    expect(next.typography.fontSizeBasePx).toBe(18);
  });

  it("Reset Dark clears only the dark palette/shadows/logo — light and typography survive", async () => {
    const seeded = await seedBothModesAndTypography();
    const next = await resetThemeDraftScope(seeded, "dark");

    expect(next.colors.dark).toEqual({});
    expect(next.shadows.dark).toEqual({});
    expect(next.logos.dark).toBeUndefined();

    expect(next.colors.light).toEqual({ background: "#ffffff", primary: "#111111" });
    expect(next.shadows.light).toEqual({ "theme-shadow-sm": "0 1px 2px 0 rgba(0,0,0,0.05)" });
    expect(next.logos.light).toBe("https://res.cloudinary.com/demo/light.png");
    expect(next.typography.fontSizeBasePx).toBe(18);
  });

  it("Reset All clears mode, both palettes, both shadows, both logos and typography", async () => {
    const seeded = await seedBothModesAndTypography();
    const next = await resetThemeDraftScope(seeded, "all");
    const { updatedAt: _updatedAt, ...rest } = next;
    expect(rest).toEqual(EMPTY);
  });

  it("resetting a draft scope never deletes publish history", async () => {
    const seeded = await seedBothModesAndTypography();
    await publishTheme(seeded); // one history entry
    await resetThemeDraftScope(seeded, "all"); // draft-only operation
    const rows = await getThemeHistory();
    expect(rows.length).toBe(1); // history survives a draft reset
  });
});

describe("Version history + restore", () => {
  it("keeps every publish as its own history row, newest first", async () => {
    await publishTheme(withThemeChanges(EMPTY, { colors: { dark: { primary: "#111111" } } }));
    await publishTheme(withThemeChanges(EMPTY, { colors: { dark: { primary: "#222222" } } }));
    const rows = await getThemeHistory();
    expect(rows.length).toBe(2);
    const newest = normalizeThemeSettings(rows[0].value);
    const oldest = normalizeThemeSettings(rows[1].value);
    expect(newest.colors.dark.primary).toBe("#222222");
    expect(oldest.colors.dark.primary).toBe("#111111");
  });

  it("restoreThemeVersionToDraft loads a past version into the DRAFT only — publishing is a separate, explicit step", async () => {
    await publishTheme(withThemeChanges(EMPTY, { colors: { dark: { primary: "#111111" } } }));
    await publishTheme(withThemeChanges(EMPTY, { colors: { dark: { primary: "#222222" } } }));

    const rows = await getThemeHistory();
    const oldestId = rows[1].id;
    const restored = await restoreThemeVersionToDraft(oldestId);
    expect(restored.colors.dark.primary).toBe("#111111");

    const draft = await loadDraftThemeSettings();
    expect(draft.colors.dark.primary).toBe("#111111");
    const published = await loadPublishedThemeSettings();
    expect(published.colors.dark.primary).toBe("#222222"); // still the newer, live version
  });
});
