import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pub = (f: string) => join(__dirname, "../../public", f);
const png = (f: string) => {
  const b = readFileSync(pub(f));
  expect(b.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), bytes: b.length };
};

describe("brand icons use the logo (not the letter B)", () => {
  const expected: Record<string, number> = {
    "favicon-32.png": 32,
    "icon-192.png": 192,
    "icon-512.png": 512,
    "icon-maskable-512.png": 512,
    "apple-touch-icon.png": 180,
  };

  for (const [file, size] of Object.entries(expected)) {
    it(`${file} is ${size}×${size}`, () => {
      const { width, height } = png(file);
      expect({ width, height }).toEqual({ width: size, height: size });
    });
  }

  it("the logo icons carry real artwork (the old 'B' icon was ~2 KB at 512px)", () => {
    expect(png("icon-512.png").bytes).toBeGreaterThan(30_000);
    expect(png("icon-192.png").bytes).toBeGreaterThan(8_000);
  });

  it("favicon.ico exists with 16/32/48 sizes (push notifications and browsers request /favicon.ico)", () => {
    const b = readFileSync(pub("favicon.ico"));
    expect(b.readUInt16LE(0)).toBe(0); // reserved
    expect(b.readUInt16LE(2)).toBe(1); // ICO
    const n = b.readUInt16LE(4);
    const sizes = Array.from({ length: n }, (_, i) => b[6 + i * 16] || 256).sort((a, c) => a - c);
    expect(sizes).toEqual([16, 32, 48]);
  });

  it("the web manifest and notifications point at files that exist", () => {
    const manifest = JSON.parse(readFileSync(pub("manifest.webmanifest"), "utf8"));
    for (const icon of manifest.icons as { src: string }[]) {
      const file = new URL(icon.src).pathname.slice(1);
      expect(() => readFileSync(pub(file))).not.toThrow();
    }
    expect(() => readFileSync(pub("favicon.ico"))).not.toThrow();
  });
});
