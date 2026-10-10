import { describe, expect, it } from "vitest";
import { motionAllowed, shippingProgress } from "./motion";

const base = { prefersReducedMotion: false, emergencyFastMode: false, safeMode: false, search: "" };

describe("motionAllowed", () => {
  it("is on by default", () => {
    expect(motionAllowed(base)).toBe(true);
  });
  it("turns off for reduced motion, emergency fast mode, safe mode or ?motion=off", () => {
    expect(motionAllowed({ ...base, prefersReducedMotion: true })).toBe(false);
    expect(motionAllowed({ ...base, emergencyFastMode: true })).toBe(false);
    expect(motionAllowed({ ...base, safeMode: true })).toBe(false);
    expect(motionAllowed({ ...base, search: "?motion=off" })).toBe(false);
    expect(motionAllowed({ ...base, search: "?a=1&motion=off" })).toBe(false);
  });
  it("ignores other query strings", () => {
    expect(motionAllowed({ ...base, search: "?motion=on" })).toBe(true);
    expect(motionAllowed({ ...base, search: "?q=joker" })).toBe(true);
  });
});

describe("shippingProgress", () => {
  it("shows how much is left to free shipping", () => {
    expect(shippingProgress(600, 1600)).toEqual({
      fraction: 0.375,
      remaining: 1000,
      unlocked: false,
    });
  });
  it("unlocks at and above the threshold, capped at 100%", () => {
    expect(shippingProgress(1600, 1600)).toEqual({ fraction: 1, remaining: 0, unlocked: true });
    expect(shippingProgress(2500, 1600)).toEqual({ fraction: 1, remaining: 0, unlocked: true });
  });
  it("copes with an empty cart and a missing threshold", () => {
    expect(shippingProgress(0, 1600).fraction).toBe(0);
    expect(shippingProgress(Number.NaN, 1600).remaining).toBe(1600);
    expect(shippingProgress(100, 0).unlocked).toBe(true);
  });
});
