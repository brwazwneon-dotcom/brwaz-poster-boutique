// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

import { HeroFrameConcept } from "./HeroFrameConcept";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function renderIn(lang: "en" | "ar") {
  const i18n = i18next.createInstance();
  await i18n.use(initReactI18next).init({
    lng: lang,
    fallbackLng: "en",
    resources: { en: { translation: en }, ar: { translation: ar } },
    interpolation: { escapeValue: false },
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <HeroFrameConcept />
    </I18nextProvider>,
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

describe("copy and buttons", () => {
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

  it("text and buttons are real HTML elements, not part of the picture", async () => {
    await renderIn("en");
    expect(screen.getByRole("heading", { level: 1 }).tagName).toBe("H1");
    expect(document.querySelectorAll("img")).toHaveLength(1);
  });

  it("the section is labelled by its heading", async () => {
    await renderIn("en");
    const section = document.querySelector("section[data-hero-concept]");
    expect(section?.getAttribute("aria-labelledby")).toBe("hero-concept-title");
    expect(document.getElementById("hero-concept-title")?.tagName).toBe("H1");
  });
});

describe("layout does not depend on the language", () => {
  // The server renders Arabic and the page switches language after hydration: if the columns mirrored with the
  // language, the whole frame would jump across the screen (a large layout shift). The columns are pinned instead.
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

  it("the stylesheet does not mirror the room or the frame with the document direction", () => {
    const css = fs.readFileSync(path.join(SRC, "components/hero-frame-concept.css"), "utf8");
    expect(css).not.toContain("html[dir");
  });
});

describe("the hero picture", () => {
  it("is loaded eagerly at high priority, never lazily, with explicit dimensions", async () => {
    await renderIn("en");
    const img = screen.getByRole("img");
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("fetchpriority")).toBe("high");
    expect(img.getAttribute("width")).toBe("1000");
    expect(img.getAttribute("height")).toBe("1500");
    expect(img.getAttribute("srcset")).toContain("-480.webp 480w");
    expect(img.getAttribute("srcset")).toContain("-1000.webp 1000w");
    expect(img.getAttribute("sizes")).toBeTruthy();
    expect(img.getAttribute("loading")).not.toBe("lazy");
  });

  it("has a translated description", async () => {
    await renderIn("en");
    expect(screen.getByRole("img").getAttribute("alt")).toBe(
      "A framed Porsche art print hanging on a living-room wall",
    );
    cleanup();
    await renderIn("ar");
    expect(screen.getByRole("img").getAttribute("alt")).toBe(
      "لوحة بورش مؤطرة معلّقة على حائط غرفة معيشة",
    );
  });

  it("fills its frame without stretching (cover inside a 2:3 opening)", () => {
    const css = fs.readFileSync(path.join(SRC, "components/hero-frame-concept.css"), "utf8");
    expect(css).toMatch(/\.hfc-art img\s*{[^}]*object-fit:\s*cover/);
    expect(css).toMatch(/\.hfc-hang\s*{[^}]*aspect-ratio:\s*2\s*\/\s*3/);
  });
});

describe("motion", () => {
  const moveOver = (stage: HTMLElement, x: number, y: number) => {
    stage.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 400, height: 600, right: 400, bottom: 600 }) as DOMRect;
    fireEvent.pointerMove(stage, { clientX: x, clientY: y, pointerType: "mouse" });
  };
  const root = () => document.querySelector("section[data-hero-concept]") as HTMLElement;
  const stage = () => document.querySelector(".hfc-stage") as HTMLElement;

  it("a mouse tilts the frame a little and leaving puts it back", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    await renderIn("en");
    moveOver(stage(), 400, 0);
    expect(root().style.getPropertyValue("--hfc-ry")).toBe("5deg");
    expect(root().style.getPropertyValue("--hfc-rx")).toBe("3deg");
    fireEvent.pointerLeave(stage());
    expect(root().style.getPropertyValue("--hfc-ry")).toBe("0deg");
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

  it("the stylesheet switches the entrance animation off for reduced motion", () => {
    const css = fs.readFileSync(path.join(SRC, "components/hero-frame-concept.css"), "utf8");
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.hfc-enter[\s\S]*animation:\s*none/);
  });

  it("the entrance uses transform only, so the picture paints at once (no opacity animation)", () => {
    // Normalised: a Windows checkout turns the file's line endings into CRLF.
    const css = fs
      .readFileSync(path.join(SRC, "components/hero-frame-concept.css"), "utf8")
      .replace(/\r\n/g, "\n");
    const keyframes = [...css.matchAll(/@keyframes[\s\S]*?\n}\n/g)].map((m) => m[0]).join("\n");
    expect(keyframes).toContain("transform");
    expect(keyframes).not.toContain("opacity");
  });
});

describe("source", () => {
  it("hard-codes no visible text and no animation or 3D library", () => {
    const source = fs.readFileSync(path.join(SRC, "components/HeroFrameConcept.tsx"), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    expect(code).not.toMatch(/(?<![\w$>])<\/?[A-Za-z][^<>]*[^=/]>\s*[^<>{}\s][^<>{}]*</);
    expect(code).not.toMatch(/from "(framer-motion|gsap|three|@react-three|motion)/);
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
});
