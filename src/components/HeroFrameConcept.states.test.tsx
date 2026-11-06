// @vitest-environment jsdom
// Pictures that are late or fail: the soft placeholder, and a failed frame leaving the picture.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
vi.mock("@/lib/db-public.functions", () => ({
  getHeroShowcasePublic: vi.fn(() => new Promise(() => {})),
}));

import { HeroFrameConcept } from "./HeroFrameConcept";
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

async function renderHero() {
  const i18n = i18next.createInstance();
  await i18n.use(initReactI18next).init({
    lng: "en",
    resources: { en: { translation: en }, ar: { translation: ar } },
    interpolation: { escapeValue: false },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(heroShowcaseQueryOptions.queryKey, { day: "2026-11-05", items: ITEMS });
  window.matchMedia = vi.fn(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <HeroFrameConcept />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => cleanup());

const card = (n: number) => document.querySelector(`.hfc-card--${n}`) as HTMLElement;
const img = (n: number) => card(n).querySelector("img") as HTMLImageElement;

describe("pictures that are late or fail", () => {
  it("every frame starts in the soft placeholder state", async () => {
    await renderHero();
    for (const n of [0, 1, 2, 3]) expect(card(n).getAttribute("data-state")).toBe("loading");
  });

  it("a picture that arrives marks its own frame loaded, and only that one", async () => {
    await renderHero();
    fireEvent.load(img(2));
    expect(card(2).getAttribute("data-state")).toBe("loaded");
    for (const n of [0, 1, 3]) expect(card(n).getAttribute("data-state")).toBe("loading");
  });

  it("a picture that fails marks only its own frame; the other three carry on", async () => {
    await renderHero();
    fireEvent.error(img(3));
    expect(card(3).getAttribute("data-state")).toBe("failed");
    for (const n of [0, 1, 2]) fireEvent.load(img(n));
    expect([0, 1, 2].map((n) => card(n).getAttribute("data-state"))).toEqual([
      "loaded",
      "loaded",
      "loaded",
    ]);
    // the four boxes are all still there: nothing moves, the failed one is only taken out of sight by CSS
    expect(document.querySelectorAll(".hfc-card")).toHaveLength(4);
  });

  it("even the lead frame can fail without taking the others or the text and buttons with it", async () => {
    await renderHero();
    fireEvent.error(img(0));
    expect(card(0).getAttribute("data-state")).toBe("failed");
    expect(screen.getByRole("link", { name: "Explore Designs" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(document.querySelectorAll(".hfc-card img")).toHaveLength(4);
  });

  it("only the lead frame asks for high priority", async () => {
    await renderHero();
    const high = [...document.querySelectorAll(".hfc-card img")].filter(
      (i) => i.getAttribute("fetchpriority") === "high",
    );
    expect(high).toHaveLength(1);
  });
});

describe("the placeholder and the failed frame (CSS)", () => {
  it("the placeholder uses the room's warm tones, not a flat black hole", () => {
    const c = css();
    expect(c).toContain("linear-gradient(145deg, #3b3128 0%, #2b241d 52%, #362d25 100%)");
    expect(c).not.toContain("background: #0b0b0c;\n  box-shadow");
  });

  it("a light band passes over a frame that is still loading, by transform only", () => {
    const c = css();
    expect(c).toContain('.hfc-card[data-state="loading"] .hfc-art::before');
    const start = c.indexOf("@keyframes hfc-sheen");
    const sheen = c.slice(start, c.indexOf("}\n}", start) + 3);
    expect(sheen).toContain("transform: translateX(100%)");
    for (const bad of ["left:", "top:", "width:", "height:", "margin", "opacity:"])
      expect(sheen).not.toContain(bad);
  });

  it("a failed frame leaves the picture instead of showing a broken image", () => {
    expect(css()).toContain('.hfc-card[data-state="failed"] {\n  visibility: hidden;');
  });

  it("the band stands still for reduced motion", () => {
    const c = css();
    const reduced = c.slice(c.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toContain('.hfc-card[data-state="loading"] .hfc-art::before');
    expect(reduced).toContain("animation: none;");
  });
});
