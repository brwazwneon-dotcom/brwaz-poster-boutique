// @vitest-environment jsdom
/** A poster image that fails (dropped connection) is retried before the empty placeholder is accepted. */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { SafeImage } from "./SafeImage";
import { IMAGE_FALLBACK } from "@/lib/storage-url";

const URL_A = "https://images.example.com/p/1-480.webp";

let root: Root;
let container: HTMLElement;

beforeEach(async () => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<SafeImage src={URL_A} alt="x" />);
    await vi.advanceTimersByTimeAsync(200);
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const img = () => container.querySelector("img") as HTMLImageElement | null;
const fail = async () => {
  await act(async () => {
    img()!.dispatchEvent(new Event("error"));
  });
};

describe("SafeImage retries", () => {
  it("keeps the real URL and loads a fresh <img> after a failure", async () => {
    const first = img()!;
    expect(first.getAttribute("src")).toBe(URL_A);
    await fail();
    // waiting to retry: no placeholder yet
    expect(img()?.getAttribute("src")).toBe(URL_A);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    const second = img()!;
    expect(second.getAttribute("src")).toBe(URL_A);
    expect(second).not.toBe(first);
  });

  it("shows the placeholder only after every retry failed", async () => {
    await fail();
    for (const wait of [1600, 4100, 9100]) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(wait);
      });
      expect(img()?.getAttribute("src")).toBe(URL_A);
      await fail();
    }
    expect(img()?.getAttribute("src")).toBe(IMAGE_FALLBACK);
  });
});
