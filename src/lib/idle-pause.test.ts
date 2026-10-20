// @vitest-environment jsdom
import { focusManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_IDLE_EVENT, installAdminIdlePause, isAdminIdle } from "./idle-pause";

describe("admin idle pause", () => {
  let stop: () => void;
  beforeEach(() => {
    vi.useFakeTimers();
    stop = installAdminIdlePause(60_000);
  });
  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it("pauses polling after the idle time and resumes on the first interaction", () => {
    const seen: boolean[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent<{ idle: boolean }>).detail.idle);
    window.addEventListener(ADMIN_IDLE_EVENT, listener);

    expect(isAdminIdle()).toBe(false);
    vi.advanceTimersByTime(59_000);
    expect(isAdminIdle()).toBe(false);
    vi.advanceTimersByTime(2_000);
    expect(isAdminIdle()).toBe(true);
    expect(focusManager.isFocused()).toBe(false);

    window.dispatchEvent(new Event("pointerdown"));
    expect(isAdminIdle()).toBe(false);
    expect(seen).toEqual([true, false]);
    window.removeEventListener(ADMIN_IDLE_EVENT, listener);
  });

  it("activity keeps resetting the countdown", () => {
    vi.advanceTimersByTime(50_000);
    window.dispatchEvent(new Event("keydown"));
    vi.advanceTimersByTime(50_000);
    expect(isAdminIdle()).toBe(false);
    vi.advanceTimersByTime(11_000);
    expect(isAdminIdle()).toBe(true);
  });
});
