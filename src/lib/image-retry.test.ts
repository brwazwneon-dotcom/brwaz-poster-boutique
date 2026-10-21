// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installImageRetry } from "./image-retry";

let uninstall: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  uninstall = installImageRetry(document, window);
});
afterEach(() => {
  uninstall();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

function brokenImg(attrs: Record<string, string> = { src: "https://img.example.com/a.webp" }) {
  const img = document.createElement("img");
  for (const [k, v] of Object.entries(attrs)) img.setAttribute(k, v);
  document.body.appendChild(img);
  // jsdom never loads images: it reports complete with zero width, i.e. "broken".
  Object.defineProperty(img, "complete", { value: true });
  Object.defineProperty(img, "naturalWidth", { value: 0 });
  return img;
}
const fail = (img: HTMLImageElement) => img.dispatchEvent(new Event("error"));

describe("installImageRetry", () => {
  it("re-requests a failed image after a delay, a limited number of times", () => {
    const img = brokenImg();
    const spy = vi.spyOn(img, "setAttribute");
    fail(img);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1600);
    expect(spy).toHaveBeenCalledWith("src", "https://img.example.com/a.webp");
    fail(img);
    vi.advanceTimersByTime(4100);
    fail(img);
    vi.advanceTimersByTime(9100);
    fail(img);
    vi.advanceTimersByTime(60_000);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("re-sets srcset too so a <picture>/responsive image is fetched again", () => {
    const img = brokenImg({
      src: "https://img.example.com/a.webp",
      srcset: "https://img.example.com/a-480.webp 480w",
    });
    const spy = vi.spyOn(img, "setAttribute");
    fail(img);
    vi.advanceTimersByTime(1600);
    expect(spy).toHaveBeenCalledWith("srcset", "https://img.example.com/a-480.webp 480w");
  });

  it("leaves data: images and SafeImage's own images alone", () => {
    const data = brokenImg({ src: "data:image/svg+xml;utf8,x" });
    const own = brokenImg({ src: "https://img.example.com/b.webp", "data-img-retry": "own" });
    const s1 = vi.spyOn(data, "setAttribute");
    const s2 = vi.spyOn(own, "setAttribute");
    fail(data);
    fail(own);
    vi.advanceTimersByTime(20_000);
    expect(s1).not.toHaveBeenCalled();
    expect(s2).not.toHaveBeenCalled();
  });

  it("retries every broken image when the connection comes back", () => {
    const img = brokenImg();
    const spy = vi.spyOn(img, "setAttribute");
    window.dispatchEvent(new Event("online"));
    expect(spy).toHaveBeenCalledWith("src", "https://img.example.com/a.webp");
  });
});
