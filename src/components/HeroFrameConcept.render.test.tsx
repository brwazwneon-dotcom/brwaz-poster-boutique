// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider, initReactI18next } from "react-i18next";
import i18next from "i18next";
import en from "@/lib/locales/en.json";
import ar from "@/lib/locales/ar.json";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
// The component only needs the query's key and options; the server function behind it is never called here.
vi.mock("@/lib/db-public.functions", () => ({
  getHeroShowcasePublic: vi.fn(() => new Promise(() => {})),
  getSiteSettingsPublic: vi.fn(() => new Promise(() => {})), // the offer badge reads the pricing; never answered here
}));

import { HeroFrameConcept } from "./HeroFrameConcept";
import { HERO_LEAD_SIZES, HERO_POSTER } from "@/lib/hero-concept";
import { heroShowcaseQueryOptions } from "@/lib/hero-showcase";
import { PRICING_DEFAULTS } from "@/lib/use-settings";
import type { ShowcaseItem } from "@/lib/hero-showcase-core";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = () =>
  fs
    .readFileSync(path.join(SRC, "components/hero-frame-concept.css"), "utf8")
    .replace(/\r\n/g, "\n");

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ITEMS: ShowcaseItem[] = [1, 2, 3, 4].map((n) => ({
  id: uuid(n),
  title: `Best Seller ${n}`,
  image: `https://img.example/p/${uuid(n)}-1000.webp`,
  small: `https://img.example/p/${uuid(n)}-480.webp`,
}));

async function renderIn(
  lang: "en" | "ar",
  items: ShowcaseItem[] | null = ITEMS,
  bundlePrice: number | null = null, // null = the pricing has not arrived yet
) {
  const i18n = i18next.createInstance();
  await i18n.use(initReactI18next).init({
    lng: lang,
    fallbackLng: "en",
    resources: { en: { translation: en }, ar: { translation: ar } },
    interpolation: { escapeValue: false },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // null = the list has not arrived yet (the query stays pending)
  if (items) client.setQueryData(heroShowcaseQueryOptions.queryKey, { day: "2026-11-05", items });
  if (bundlePrice !== null)
    client.setQueryData(["pricing"], {
      ...PRICING_DEFAULTS,
      offers: { ...PRICING_DEFAULTS.offers, bundle4_30x40: bundlePrice },
    });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <HeroFrameConcept />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

function mockMatchMedia(matches: { fine: boolean; reduced: boolean }) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? matches.reduced : matches.fine,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => mockMatchMedia({ fine: true, reduced: false }));
afterEach(() => cleanup());

describe("copy and buttons (unchanged by the gallery)", () => {
  it("English: the requested label, title, description and buttons", async () => {
    await renderIn("en");
    expect(screen.getByText("PREMIUM WALL ART")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "More Than a Poster. It's Your Identity.",
    );
    expect(
      screen.getByText(
        "Choose the art that reflects your personality and make every wall tell your story.",
      ),
    ).toBeTruthy();
    const primary = screen.getByRole("link", { name: "Explore Designs" });
    const secondary = screen.getByRole("link", { name: "Customize Your Frame" });
    expect(primary.getAttribute("href")).toBe("/trending");
    expect(secondary.getAttribute("href")).toBe("/custom-design");
  });

  it("Arabic: the requested title, description and buttons", async () => {
    await renderIn("ar");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "مش مجرد صورة على الحيطة... دي شخصيتك.",
    );
    expect(screen.getByText("اختار التصميم اللي يشبهك، وخلي كل حائط يحكي حكايتك.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "اكتشف التصاميم" }).getAttribute("href")).toBe(
      "/trending",
    );
    expect(screen.getByRole("link", { name: "صمّم بروازك" }).getAttribute("href")).toBe(
      "/custom-design",
    );
  });

  it("the buttons do not wait for the pictures or for the list: they are there while it is pending", async () => {
    await renderIn("en", null);
    expect(screen.getByRole("link", { name: "Explore Designs" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Customize Your Frame" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });

  it("text and buttons are real HTML elements, not part of the pictures", async () => {
    await renderIn("en");
    expect(screen.getByRole("heading", { level: 1 }).tagName).toBe("H1");
    // four product pictures, plus the main frame's copy of the first one
    expect(document.querySelectorAll(".hfc-card:not(.hfc-card--m) img")).toHaveLength(4);
    expect(document.querySelectorAll("img")).toHaveLength(5);
  });

  it("the section is labelled by its heading", async () => {
    await renderIn("en");
    const section = document.querySelector("section[data-hero-concept]");
    expect(section?.getAttribute("aria-labelledby")).toBe("hero-concept-title");
    expect(document.getElementById("hero-concept-title")?.tagName).toBe("H1");
  });
});

describe("layout does not depend on the language", () => {
  // The server renders one language and the page may switch after hydration: if the columns mirrored with the
  // language, the whole gallery would jump across the screen (a large layout shift). The columns are pinned instead.
  it("pins the columns (dir=ltr) and lets only the text follow the language", async () => {
    await renderIn("ar");
    const grid = document.querySelector(
      "section[data-hero-concept] .container-page > div",
    ) as HTMLElement;
    expect(grid.getAttribute("dir")).toBe("ltr");
    expect(document.querySelector(".hfc-copy")?.getAttribute("dir")).toBe("rtl");
    expect(document.querySelector(".hfc-cta")?.getAttribute("dir")).toBe("rtl");
    cleanup();
    await renderIn("en");
    const gridEn = document.querySelector(
      "section[data-hero-concept] .container-page > div",
    ) as HTMLElement;
    expect(gridEn.getAttribute("dir")).toBe("ltr");
    expect(document.querySelector(".hfc-copy")?.getAttribute("dir")).toBe("ltr");
  });

  it("the pinned grid is not the .container-page itself (the site forces direction: rtl on that class)", () => {
    const site = fs.readFileSync(path.join(SRC, "styles.css"), "utf8");
    expect(site).toMatch(/\[dir="rtl"\] \.container-page\s*\{\s*direction:\s*rtl/);
    const source = fs.readFileSync(path.join(SRC, "components/HeroFrameConcept.tsx"), "utf8");
    expect(source).not.toMatch(/dir="ltr"\s+className="container-page/);
    expect(source).toMatch(/<div className="container-page">\s*<div\s+dir="ltr"/);
  });

  it("the stylesheet does not mirror the room or the frames with the document direction", () => {
    expect(css()).not.toContain("html[dir");
  });

  it("the description keeps room for two lines, so a late font or a re-wrap moves nothing", () => {
    const source = fs.readFileSync(path.join(SRC, "components/HeroFrameConcept.tsx"), "utf8");
    expect(source).toMatch(/mt-3 min-h-14 max-w-md[^"]*sm:min-h-16/);
  });
});

describe("the four frames", () => {
  it("shows four frames, the lead first, each with its own product picture", async () => {
    await renderIn("en");
    const cards = [...document.querySelectorAll(".hfc-gallery .hfc-card:not(.hfc-card--m)")];
    expect(cards).toHaveLength(4);
    expect(cards.map((c) => c.getAttribute("data-slot"))).toEqual(["0", "1", "2", "3"]);
    const imgs = cards.map((c) => c.querySelector("img") as HTMLImageElement);
    expect(imgs.map((i) => i.alt)).toEqual(ITEMS.map((i) => i.title));
    expect(imgs.map((i) => i.getAttribute("src"))).toEqual(ITEMS.map((i) => i.image));
    expect(document.querySelector(".hfc-gallery")?.getAttribute("data-count")).toBe("4");
  });

  it("the main frame loads first and at high priority; the four are low priority and never lazy", async () => {
    await renderIn("en");
    const main = document.querySelector(".hfc-card--m img") as HTMLImageElement;
    expect(main.getAttribute("fetchpriority")).toBe("high");
    const imgs = [
      ...document.querySelectorAll(".hfc-card:not(.hfc-card--m) img"),
    ] as HTMLImageElement[];
    for (const img of imgs) expect(img.getAttribute("fetchpriority")).toBe("low");
    for (const img of [main, ...imgs]) {
      expect(img.getAttribute("loading")).toBe("eager");
      expect(img.getAttribute("width")).toBe("1000");
      expect(img.getAttribute("height")).toBe("1500");
    }
  });

  it("the single-frame fallback keeps its picture at high priority (there is no main frame then)", async () => {
    await renderIn("en", []);
    expect(document.querySelector(".hfc-card--m")).toBeNull();
    expect(document.querySelector(".hfc-card--0 img")?.getAttribute("fetchpriority")).toBe("high");
  });

  it("the main frame shows the first Best Seller again: decorative, same file, no second download", async () => {
    await renderIn("en");
    const main = document.querySelector(".hfc-card--m") as HTMLElement;
    expect(main.getAttribute("aria-hidden")).toBe("true");
    const mainImg = main.querySelector("img") as HTMLImageElement;
    const first = document.querySelector(".hfc-card--0 img") as HTMLImageElement;
    expect(mainImg.alt).toBe("");
    expect(mainImg.getAttribute("src")).toBe(first.getAttribute("src"));
    expect(mainImg.getAttribute("srcset")).toBe(first.getAttribute("srcset"));
    expect(mainImg.getAttribute("sizes")).toBe(first.getAttribute("sizes")); // same candidate, so one fetch
  });

  it("every picture offers the 480 and the 1000 file, with sizes that match the frame", async () => {
    await renderIn("en");
    const imgs = [...document.querySelectorAll(".hfc-card img")] as HTMLImageElement[];
    for (const [i, img] of imgs.entries()) {
      expect(img.getAttribute("srcset")).toContain("-480.webp 480w");
      expect(img.getAttribute("srcset")).toContain("-1000.webp 1000w");
      expect(img.getAttribute("sizes")).toBeTruthy();
      if (i === 0) expect(img.getAttribute("sizes")).toBe(HERO_LEAD_SIZES);
    }
  });

  it("two brass lamps hang on a rail on the wall, not on a frame (so they never swing)", async () => {
    await renderIn("en");
    expect(document.querySelectorAll(".hfc-lamps")).toHaveLength(1);
    expect(document.querySelectorAll(".hfc-lamps .hfc-lamp")).toHaveLength(2);
    expect(document.querySelector(".hfc-card .hfc-lamps")).toBeNull();
    expect(document.querySelector(".hfc-hang .hfc-lamps")).toBeNull();
    expect(document.querySelectorAll(".hfc-light")).toHaveLength(0);
  });

  it("no lamps and no main frame when there is only the single fallback frame", async () => {
    await renderIn("en", []);
    expect(document.querySelector(".hfc-lamps")).toBeNull();
    expect(document.querySelector(".hfc-card--m")).toBeNull();
  });

  it("holds the gallery's box before the list arrives (no layout change when it does)", async () => {
    await renderIn("en", null);
    const gallery = document.querySelector(".hfc-gallery");
    expect(gallery?.getAttribute("data-count")).toBe("4");
    expect(document.querySelectorAll(".hfc-card")).toHaveLength(0);
  });

  it("with an empty Best Sellers list the approved single poster is shown, not invented products", async () => {
    await renderIn("en", []);
    const imgs = [...document.querySelectorAll(".hfc-card img")] as HTMLImageElement[];
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute("src")).toContain(HERO_POSTER.id);
    expect(document.querySelector(".hfc-gallery")?.getAttribute("data-count")).toBe("1");
    expect(imgs[0].alt).toBe("A framed Porsche art print hanging on a living-room wall");
  });

  it("fills its frame without stretching (cover inside a 2:3 opening)", () => {
    expect(css()).toMatch(/\.hfc-art img\s*{[^}]*object-fit:\s*cover/);
    expect(css()).toMatch(/\.hfc-card\s*{[^}]*aspect-ratio:\s*2\s*\/\s*3/);
  });
});

describe("the gallery's geometry (CSS)", () => {
  const numbers = (block: string) =>
    Object.fromEntries([...block.matchAll(/--(x|y|w):\s*([\d.]+);/g)].map((m) => [m[1], +m[2]]));
  const blocks = (source: string, name: string) =>
    [...source.matchAll(new RegExp(`\\.hfc-card--${name}\\s*\\{([^}]*)\\}`, "g"))].map((m) => m[1]);

  it("reserves the gallery's box by width and aspect ratio, before any picture", () => {
    const c = css();
    expect(c).toMatch(/\.hfc-gallery\s*{[^}]*container-type:\s*inline-size/);
    expect(c).toMatch(/\.hfc-gallery\s*{[^}]*aspect-ratio:\s*1\s*\/\s*var\(--ar\)/);
  });

  // Frames are placed in cqw (a share of the gallery's width), and heights follow from the 2:3 ratio.
  const layouts: Array<[string, number]> = [
    ["phones", 0.94],
    ["wide", 1.08],
  ];
  for (const [name, ar] of layouts) {
    it(`${name}: all four frames sit inside the box and do not cover each other's pictures`, () => {
      const c = css();
      const wide = c.slice(c.indexOf("@media (min-width: 640px)"), c.indexOf("/* only one frame"));
      const source = name === "phones" ? c.slice(0, c.indexOf("@media (min-width: 640px)")) : wide;
      const boxes = [0, 1, 2, 3].map((n) => {
        const merged = Object.assign({}, ...blocks(source, String(n)).map(numbers));
        return { n, x: merged.x, y: merged.y, w: merged.w, h: merged.w * 1.5 };
      });
      for (const b of boxes) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(100);
        expect(b.y + b.h).toBeLessThanOrEqual(100 * ar);
      }
      // every small frame is big enough to tell what is in it: about 29% of the gallery on phones (~108 px)
      for (const b of boxes.slice(1))
        expect(b.w).toBeGreaterThanOrEqual(name === "phones" ? 29 : 24);
      // the four frames are the SAME size
      expect(new Set(boxes.map((b) => b.w)).size).toBe(1);
      // the main frame they come out of is bigger than each of them, sits inside the box, and in the middle of it
      const main = Object.assign({}, ...blocks(source, "m").map(numbers));
      expect(main.w).toBeGreaterThan(boxes[0].w);
      expect(main.x).toBeGreaterThanOrEqual(0);
      expect(main.x + main.w).toBeLessThanOrEqual(100);
      expect(main.y).toBeGreaterThanOrEqual(0);
      expect(main.y + main.w * 1.5).toBeLessThanOrEqual(100 * ar);
      expect(Math.abs(main.x + main.w / 2 - 50)).toBeLessThanOrEqual(1);
      expect(Math.abs(main.y + (main.w * 1.5) / 2 - (100 * ar) / 2)).toBeLessThanOrEqual(1);
      // each frame starts back in the middle of the box: --ox/--oy are the distance from its final centre to it
      for (const b of boxes) {
        const block = Object.assign(
          {},
          ...blocks(source, String(b.n)).map((s) =>
            Object.fromEntries(
              [...s.matchAll(/--(ox|oy):\s*(-?[\d.]+);/g)].map((m) => [m[1], +m[2]]),
            ),
          ),
        );
        expect(b.x + b.w / 2 + block.ox).toBeCloseTo(50, 1);
        expect(b.y + b.h / 2 + block.oy).toBeCloseTo((100 * ar) / 2, 1);
      }
      // overlap between any two frames stays small (a few percent of the smaller one at most)
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
          const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
          const smaller = Math.min(a.w * a.h, b.w * b.h);
          expect((ox * oy) / smaller).toBeLessThan(name === "phones" ? 0.01 : 0.08);
        }
      }
    });
  }
});

describe("phones: buttons and the floating WhatsApp button", () => {
  it("the buttons stop short of the floating button on phones and use the full row from 640px up", () => {
    const source = fs.readFileSync(path.join(SRC, "components/HeroFrameConcept.tsx"), "utf8");
    expect(source).toContain(
      "hfc-cta flex flex-col gap-3 pe-[3.75rem] sm:flex-row sm:flex-wrap sm:pe-0",
    );
  });

  it("the gallery is a little wider than the text column on phones, never wider than the screen", () => {
    const c = css();
    expect(c).toContain("width: min(calc(100% + 1.5rem), 460px);");
    expect(c).toContain("margin-inline: -0.75rem;");
    // centred again from 640px up
    expect(c.slice(c.indexOf("@media (min-width: 640px)"))).toContain("margin-inline: auto;");
  });
});

describe("the motion (CSS)", () => {
  const keyframes = (name: string) => {
    const m = css().match(new RegExp(`@keyframes ${name}\\s*\\{[\\s\\S]*?\\n\\}\\n`));
    return m ? m[0] : "";
  };

  it("the main frame is painted at once (no fade-in: it is the first picture the page shows), holds, then closes", () => {
    const k = keyframes("hfc-main");
    expect(k).toMatch(/0%,\s*33%\s*\{[^}]*opacity:\s*1/); // visible from the very first frame, and it holds there
    expect(k).toMatch(/100%\s*\{[^}]*opacity:\s*0/); // then it closes behind the four
  });

  it("four frames come out of it, growing as they travel to their places, each later than the last", () => {
    const k = keyframes("hfc-pop");
    expect(k).toContain("scale(0.3)");
    expect(k).toContain("var(--ox)");
    expect(k).toContain("var(--oy)");
    expect(k).toMatch(/0%\s*\{[^}]*opacity:\s*0/);
    // they end where they stay: full opacity, their own rotation
    expect(k).toMatch(/100%\s*\{[^}]*transform:\s*rotate\(var\(--r\)\)[^}]*opacity:\s*1/);
    const c = css();
    const rule = c.match(
      /\.hfc\[data-play\] \.hfc-gallery:not\(\[data-count="1"\]\) \.hfc-card:not\(\.hfc-card--m\) \{([^}]*)\}/,
    )?.[1];
    expect(rule).toMatch(/hfc-pop 0\.95s[^;]*both/);
    const delay = rule?.match(/animation-delay:\s*calc\(([\d.]+)s \+ var\(--i\) \* ([\d.]+)s\)/);
    const start = parseFloat(delay?.[1] ?? "NaN");
    const step = parseFloat(delay?.[2] ?? "NaN");
    expect(start).toBeGreaterThan(0.5); // the main frame is seen for a moment first
    expect(step).toBeGreaterThan(0);
    // frame n has --i: n, so each one starts later than the one before
    for (const n of [0, 1, 2, 3])
      expect(c.match(new RegExp(`\\.hfc-card--${n}\\s*\\{[^}]*--i:\\s*${n};`))).toBeTruthy();
    // all four are in their places within about two seconds
    expect(start + 3 * step + 0.95).toBeLessThanOrEqual(2.6);
  });

  it("each frame then hangs from its nail and swings, a little less every time, until it hangs still", () => {
    const k = keyframes("hfc-swing");
    const angles = [...k.matchAll(/rotate\((-?[\d.]+)deg\)/g)].map((m) => Math.abs(+m[1]));
    expect(angles.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < angles.length; i++) expect(angles[i]).toBeLessThan(angles[i - 1]);
    expect(angles[angles.length - 1]).toBe(0);
    // it swings from the top edge, like a frame on a nail, and now and then gives a small nudge
    expect(css()).toMatch(/\.hfc-hang\s*\{[^}]*transform-origin:\s*50% 0/);
    expect(css()).toMatch(/hfc-nudge 11s[^;]*infinite/);
    const nudge = [...keyframes("hfc-nudge").matchAll(/rotate\((-?[\d.]+)deg\)/g)].map(
      (m) => +m[1],
    );
    expect(Math.max(...nudge.map(Math.abs))).toBeLessThanOrEqual(2); // small
  });

  it("animates transform and opacity only (nothing that makes the page reflow)", () => {
    for (const name of ["hfc-main", "hfc-pop", "hfc-swing", "hfc-nudge", "hfc-lamp-on", "hfc-in"]) {
      const k = keyframes(name);
      expect(k, name).toMatch(/transform|opacity/);
      expect(k, name).not.toMatch(
        /\b(left|top|right|bottom|width|height|margin|padding|inset)\s*:/,
      );
    }
    expect(keyframes("hfc-in")).not.toContain("opacity");
  });

  it("the entrance waits for the visitor (data-play) and has a CSS-only clock if JavaScript never runs", () => {
    const c = css();
    // before data-play: the real animations are paused, the last animation in each list (the clock) runs
    expect(c).toMatch(/hfc-card--m \{[^}]*animation-play-state:\s*paused,\s*running/);
    expect(c).toMatch(/\.hfc-hang \{[^}]*animation-play-state:\s*paused,\s*paused,\s*running/);
    // after data-play: the same animations without the clock
    expect(c).toContain(".hfc[data-play] .hfc-gallery");
    expect(c).toMatch(/hfc-final-card 1ms linear 12s forwards/);
    for (const name of ["hfc-final-main", "hfc-final-card", "hfc-final-hang", "hfc-final-lamp"])
      expect(c).toContain(`@keyframes ${name}`);
  });

  it("uses no animation or 3D library", () => {
    const source = fs.readFileSync(path.join(SRC, "components/HeroFrameConcept.tsx"), "utf8");
    expect(source).not.toMatch(/from "(framer-motion|gsap|three|@react-three|motion)/);
  });

  it("reduced motion: the four frames hang still in their places, the main frame is not shown, no animation, no parallax transition", () => {
    const reduced = css().slice(css().indexOf("@media (prefers-reduced-motion: reduce)"));
    for (const selector of [
      ".hfc-copy",
      ".hfc-cta",
      ".hfc-card",
      ".hfc-hang",
      ".hfc-lamp::after",
      '.hfc-gallery:not([data-count="1"]) .hfc-card--m',
      '.hfc-gallery:not([data-count="1"]) .hfc-card:not(.hfc-card--m)',
    ]) {
      expect(reduced).toContain(selector);
    }
    // !important, because the animation rules above are more specific
    expect(reduced).toMatch(/animation:\s*none\s*!important/);
    expect(reduced).toMatch(/\.hfc-card--m\s*\{[^}]*display:\s*none/);
    expect(reduced).toMatch(/\.hfc-card\s*\{[^}]*translate:\s*none/);
    // and in that case the frames' base style is the final place: visible, in their own rotation
    expect(css()).toMatch(/\.hfc-card\s*{[^}]*transform:\s*rotate\(var\(--r, 0deg\)\)/);
    expect(css()).not.toMatch(/\.hfc-card\s*{[^}]*opacity:\s*0/);
  });
});

describe("the small label above the heading is readable on the dark wall", () => {
  it("is brass, set in the stylesheet, not the dark primary colour (English and Arabic)", async () => {
    for (const lang of ["en", "ar"] as const) {
      await renderIn(lang);
      const label = screen.getByText("PREMIUM WALL ART");
      expect(label.className).toContain("hfc-label");
      expect(label.className).not.toMatch(/primary/);
      const rule = label.querySelector(".hfc-label__rule") as HTMLElement;
      expect(rule.className).not.toMatch(/primary/);
      cleanup();
    }
    expect(css()).toMatch(/\.hfc-label\s*\{[^}]*color:\s*#f0c987/);
    expect(css()).toMatch(/\.hfc-label__rule\s*\{[^}]*background:\s*rgb\(233 184 114/);
  });
});

describe("the offer badge (4 frames 30×40)", () => {
  const badge = () => document.querySelector("[data-hero-offer]") as HTMLAnchorElement | null;

  it("English: shows the bundle price from the settings and leads to the offers page", async () => {
    await renderIn("en", ITEMS, 890);
    expect(badge()?.getAttribute("href")).toBe("/offers");
    expect(badge()?.textContent).toBe("4 frames 30×40 for 890 EGP only");
  });

  it("Arabic: the same offer in Egyptian Arabic", async () => {
    await renderIn("ar", ITEMS, 890);
    expect(badge()?.textContent).toBe("4 براويز 30×40 بـ 890 جنيه فقط");
  });

  it("the price is the admin's setting, not a number typed in the code", async () => {
    await renderIn("en", ITEMS, 950);
    expect(badge()?.textContent).toContain("950 EGP");
    expect(badge()?.textContent).not.toContain("890");
    const source = fs.readFileSync(path.join(SRC, "components/HeroFrameConcept.tsx"), "utf8");
    expect(source).not.toMatch(/\b890\b/);
    expect(source).toContain("pricing.offers.bundle4_30x40");
  });

  it("a thousand separator for bigger prices", async () => {
    await renderIn("en", ITEMS, 1290);
    expect(badge()?.textContent).toContain("1,290 EGP");
  });

  it("does not show a built-in default as if it were the price: no badge until the pricing has arrived", async () => {
    await renderIn("en"); // pricing still pending
    expect(badge()).toBeNull();
  });

  it("no badge for a price that is missing or zero", async () => {
    await renderIn("en", ITEMS, 0);
    expect(badge()).toBeNull();
  });

  it("its place is reserved from the start, so nothing moves when it appears", async () => {
    await renderIn("en"); // no badge yet, the slot is there
    const slot = document.querySelector(".hfc-offer-slot") as HTMLElement;
    expect(slot).toBeTruthy();
    expect(slot.className).toMatch(/\bmin-h-10\b/);
    expect(slot.closest(".hfc-copy")).toBeTruthy();
    cleanup();
    await renderIn("en", ITEMS, 890);
    expect(document.querySelector(".hfc-offer-slot [data-hero-offer]")).toBeTruthy();
    // the badge itself is as tall as the slot it fills
    expect(badge()?.className).toMatch(/\bmin-h-10\b/);
  });

  it("the price and the icon are readable on the dark wall: a brass colour set in the stylesheet, not the dark primary colour", async () => {
    await renderIn("en", ITEMS, 890);
    expect(badge()?.className).toContain("hfc-offer");
    expect(badge()?.className).not.toMatch(/primary/);
    expect(badge()?.querySelector(".hfc-offer__price")?.textContent).toBe("890 EGP");
    expect(badge()?.querySelector(".hfc-offer__price")?.className).not.toMatch(/primary/);
    expect(badge()?.querySelector(".hfc-offer__icon")).toBeTruthy();
    expect(css()).toMatch(/\.hfc-offer__icon,\s*\.hfc-offer__price\s*\{[^}]*color:\s*#f0c987/);
    expect(css()).toMatch(/\.hfc-offer\s*\{[^}]*border-color:\s*rgb\(233 184 114/);
  });

  it("the buttons and the heading are still there with the badge", async () => {
    await renderIn("en", ITEMS, 890);
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Explore Designs" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Customize Your Frame" })).toBeTruthy();
  });
});

describe("the entrance plays every time the page is shown (data-play)", () => {
  const section = () => document.querySelector("section[data-hero-concept]") as HTMLElement;
  const setVisibility = (state: "visible" | "hidden") =>
    Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  afterEach(() => {
    document.querySelectorAll(".brwz-preloader").forEach((n) => n.remove());
    setVisibility("visible");
  });

  it("server HTML has no data-play (the animations are paused), and it is set as soon as the page is shown", async () => {
    await renderIn("en");
    // jsdom has no preloader overlay, so the entrance starts at once
    await waitFor(() => expect(section().getAttribute("data-play")).toBe("1"));
  });

  it("waits behind the preloader overlay (which covers the page on every full load) and starts when it is gone", async () => {
    const overlay = document.createElement("div");
    overlay.className = "brwz-preloader";
    document.body.appendChild(overlay);
    await renderIn("en");
    await new Promise((r) => setTimeout(r, 200));
    expect(section().hasAttribute("data-play")).toBe(false);
    overlay.remove();
    await waitFor(() => expect(section().getAttribute("data-play")).toBe("1"));
  });

  it("never waits forever for the overlay: it plays anyway after a short limit", async () => {
    const overlay = document.createElement("div");
    overlay.className = "brwz-preloader";
    document.body.appendChild(overlay);
    await renderIn("en");
    expect(section().hasAttribute("data-play")).toBe(false);
    await waitFor(() => expect(section().getAttribute("data-play")).toBe("1"), { timeout: 4000 });
  }, 10_000);

  it("does not play in a background tab; it plays when the tab becomes visible", async () => {
    setVisibility("hidden");
    await renderIn("en");
    await new Promise((r) => setTimeout(r, 200));
    expect(section().hasAttribute("data-play")).toBe(false);
    setVisibility("visible");
    await waitFor(() => expect(section().getAttribute("data-play")).toBe("1"));
  });

  it("plays the whole entrance again when the browser brings the page back from its back/forward cache", async () => {
    await renderIn("en");
    await waitFor(() => expect(section().getAttribute("data-play")).toBe("1"));
    const before = document.querySelector(".hfc-gallery");
    act(() => {
      window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    });
    // a new gallery element (so every CSS animation starts from the beginning) and the entrance is on again
    await waitFor(() => expect(document.querySelector(".hfc-gallery")).not.toBe(before));
    await waitFor(() => expect(section().getAttribute("data-play")).toBe("1"));
  });

  it("an ordinary page show (not from the cache) does not restart it", async () => {
    await renderIn("en");
    await waitFor(() => expect(section().getAttribute("data-play")).toBe("1"));
    const before = document.querySelector(".hfc-gallery");
    act(() => {
      window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: false }));
    });
    expect(document.querySelector(".hfc-gallery")).toBe(before);
  });

  it("a visitor who has been here before gets it too: nothing is stored or remembered", () => {
    const source = fs.readFileSync(path.join(SRC, "components/HeroFrameConcept.tsx"), "utf8");
    expect(source).not.toMatch(/localStorage|sessionStorage|document\.cookie|indexedDB/);
  });
});

describe("mouse", () => {
  const moveOver = (stage: HTMLElement, x: number, y: number) => {
    stage.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 400, height: 600, right: 400, bottom: 600 }) as DOMRect;
    fireEvent.pointerMove(stage, { clientX: x, clientY: y, pointerType: "mouse" });
  };
  const root = () => document.querySelector("section[data-hero-concept]") as HTMLElement;
  const stage = () => document.querySelector(".hfc-stage") as HTMLElement;

  it("a mouse tilts the gallery very lightly and leaving puts it back", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    await renderIn("en");
    moveOver(stage(), 400, 0);
    expect(root().style.getPropertyValue("--hfc-ry")).toBe("3deg");
    expect(root().style.getPropertyValue("--hfc-rx")).toBe("2deg");
    expect(root().style.getPropertyValue("--hfc-gx")).toBe("1");
    fireEvent.pointerLeave(stage());
    expect(root().style.getPropertyValue("--hfc-ry")).toBe("0deg");
    expect(root().style.getPropertyValue("--hfc-gx")).toBe("0");
    vi.restoreAllMocks();
  });

  it("does nothing for touch or pen pointers", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    await renderIn("en");
    stage().getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 400, height: 600, right: 400, bottom: 600 }) as DOMRect;
    fireEvent.pointerMove(stage(), { clientX: 400, clientY: 0, pointerType: "touch" });
    expect(root().style.getPropertyValue("--hfc-ry")).toBe("");
    vi.restoreAllMocks();
  });

  it("is off when the visitor asked for reduced motion", async () => {
    mockMatchMedia({ fine: true, reduced: true });
    await renderIn("en");
    moveOver(stage(), 400, 0);
    expect(root().style.getPropertyValue("--hfc-ry")).toBe("");
  });

  it("is off on a device without a fine pointer", async () => {
    mockMatchMedia({ fine: false, reduced: false });
    await renderIn("en");
    moveOver(stage(), 400, 0);
    expect(root().style.getPropertyValue("--hfc-ry")).toBe("");
  });
});

describe("source", () => {
  it("hard-codes no visible text", () => {
    const source = fs.readFileSync(path.join(SRC, "components/HeroFrameConcept.tsx"), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    expect(code).not.toMatch(/(?<![\w$>])<\/?[A-Za-z][^<>]*[^=/]>\s*[^<>{}\s][^<>{}]*</);
    for (const key of ["label", "title", "description", "primaryCta", "secondaryCta", "frameAlt"]) {
      expect(code).toContain(`heroConcept.${key}`);
    }
  });

  it("both languages have exactly the same hero keys", () => {
    expect(Object.keys(ar.heroConcept).sort()).toEqual(Object.keys(en.heroConcept).sort());
    for (const v of [...Object.values(en.heroConcept), ...Object.values(ar.heroConcept)]) {
      expect(v.trim()).not.toBe("");
    }
  });

  it("the hero reads its products from the shared Best Sellers selection, not from sample data", () => {
    const source = fs.readFileSync(path.join(SRC, "components/HeroFrameConcept.tsx"), "utf8");
    expect(source).toContain("heroShowcaseQueryOptions");
    expect(source).not.toMatch(/sample-reviews|buildSample/);
  });
});
