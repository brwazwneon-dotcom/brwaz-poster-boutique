// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
}));

import { HeroFrameConcept } from "./HeroFrameConcept";
import { HERO_LEAD_SIZES, HERO_POSTER } from "@/lib/hero-concept";
import { heroShowcaseQueryOptions } from "@/lib/hero-showcase";
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

async function renderIn(lang: "en" | "ar", items: ShowcaseItem[] | null = ITEMS) {
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
    expect(document.querySelectorAll("img")).toHaveLength(4);
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
    const cards = [...document.querySelectorAll(".hfc-gallery .hfc-card")];
    expect(cards).toHaveLength(4);
    expect(cards.map((c) => c.getAttribute("data-slot"))).toEqual(["0", "1", "2", "3"]);
    const imgs = cards.map((c) => c.querySelector("img") as HTMLImageElement);
    expect(imgs.map((i) => i.alt)).toEqual(ITEMS.map((i) => i.title));
    expect(imgs.map((i) => i.getAttribute("src"))).toEqual(ITEMS.map((i) => i.image));
    expect(document.querySelector(".hfc-gallery")?.getAttribute("data-count")).toBe("4");
  });

  it("the lead loads first and at high priority; the others are low priority and never lazy", async () => {
    await renderIn("en");
    const imgs = [...document.querySelectorAll(".hfc-card img")] as HTMLImageElement[];
    expect(imgs[0].getAttribute("fetchpriority")).toBe("high");
    for (const img of imgs.slice(1)) expect(img.getAttribute("fetchpriority")).toBe("low");
    for (const img of imgs) {
      expect(img.getAttribute("loading")).toBe("eager");
      expect(img.getAttribute("width")).toBe("1000");
      expect(img.getAttribute("height")).toBe("1500");
    }
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

  it("only the lead frame has the picture light", async () => {
    await renderIn("en");
    expect(document.querySelectorAll(".hfc-light")).toHaveLength(1);
    expect(document.querySelector(".hfc-card--0 .hfc-light")).toBeTruthy();
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
      // the lead is the largest
      expect(boxes[0].w).toBeGreaterThan(Math.max(boxes[1].w, boxes[2].w, boxes[3].w));
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

  it("one large frame first, in the middle, then it settles", () => {
    const k = keyframes("hfc-lead");
    expect(k).toContain("scale(1.16)");
    expect(k).toMatch(/0%,\s*38%/); // it holds in the middle for a moment before it moves
    expect(k).toContain("transform: rotate(var(--r))"); // the end: its own place
  });

  it("three more come out from behind it, growing as they travel, each later than the last", () => {
    const k = keyframes("hfc-emerge");
    expect(k).toContain("scale(0.5)");
    expect(k).toContain("opacity: 0");
    expect(k).toContain("var(--fx)");
    const c = css();
    const delay = (n: number) =>
      parseFloat(
        c.match(
          new RegExp(
            `\\[data-count="1"\\]\\)\\s*\\.hfc-card--${n}\\s*\\{\\s*animation-delay:\\s*([\\d.]+)s`,
          ),
        )?.[1] ?? "NaN",
      );
    expect(delay(1)).toBeGreaterThan(0);
    expect(delay(2)).toBeGreaterThan(delay(1));
    expect(delay(3)).toBeGreaterThan(delay(2));
    // the whole sequence is over in about two seconds
    expect(delay(3) + 1).toBeLessThanOrEqual(2.5);
  });

  it("animates transform and opacity only (nothing that makes the page reflow), the lead with transform alone", () => {
    const lead = keyframes("hfc-lead");
    const emerge = keyframes("hfc-emerge");
    const single = keyframes("hfc-in");
    expect(lead).not.toContain("opacity"); // the lead paints at once
    expect(single).not.toContain("opacity");
    for (const k of [lead, emerge, single]) {
      expect(k).toContain("transform");
      expect(k).not.toMatch(/\b(left|top|right|bottom|width|height|margin|padding|inset)\s*:/);
    }
    // the frames end where they stay: full opacity, their own rotation
    expect(emerge).toMatch(/100%\s*\{[^}]*opacity:\s*1/);
    expect(css()).toMatch(/hfc-emerge 1s[^;]*both/);
  });

  it("uses no animation or 3D library", () => {
    const source = fs.readFileSync(path.join(SRC, "components/HeroFrameConcept.tsx"), "utf8");
    expect(source).not.toMatch(/from "(framer-motion|gsap|three|@react-three|motion)/);
  });

  it("reduced motion: the four frames are simply there, no animation, no parallax transition", () => {
    const reduced = css().slice(css().indexOf("@media (prefers-reduced-motion: reduce)"));
    for (const card of [
      ".hfc-copy",
      ".hfc-cta",
      ".hfc-card",
      '.hfc-gallery:not([data-count="1"]) .hfc-card--0',
      '.hfc-gallery:not([data-count="1"]) .hfc-card--1',
      '.hfc-gallery:not([data-count="1"]) .hfc-card--2',
      '.hfc-gallery:not([data-count="1"]) .hfc-card--3',
    ]) {
      expect(reduced).toContain(card);
    }
    expect(reduced).toMatch(/animation:\s*none/);
    expect(reduced).toMatch(/\.hfc-card\s*\{[^}]*translate:\s*none/);
    // and in that case the frames' base style is the final place: visible, in their own rotation
    expect(css()).toMatch(/\.hfc-card\s*{[^}]*transform:\s*rotate\(var\(--r, 0deg\)\)/);
    expect(css()).not.toMatch(/\.hfc-card\s*{[^}]*opacity:\s*0/);
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
