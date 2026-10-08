import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "../..");
const rootRoute = readFileSync(join(root, "src/routes/__root.tsx"), "utf8");

/** Width/height of a baseline or progressive JPEG (reads the SOF marker). */
function jpegSize(buf: Buffer) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new Error("bad jpeg");
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  throw new Error("no SOF marker");
}

describe("link preview (WhatsApp / Facebook / X) shows the brand logo, not the letter B", () => {
  it("og:image and twitter:image point at the 1200×630 logo image", () => {
    expect(rootRoute).toMatch(/property: "og:image", content: `\$\{SITE_URL\}\/og-image\.jpg`/);
    expect(rootRoute).toMatch(/name: "twitter:image", content: `\$\{SITE_URL\}\/og-image\.jpg`/);
    expect(rootRoute).toMatch(/name: "twitter:card", content: "summary_large_image"/);
    expect(rootRoute).toContain('"og:image:width", content: "1200"');
    expect(rootRoute).toContain('"og:image:height", content: "630"');
  });

  it("the old square 'B' icon is no longer used as a preview image", () => {
    expect(rootRoute).not.toMatch(
      /(og:image|twitter:image)["'`,\s]+content: `\$\{SITE_URL\}\/icon-512\.png`/,
    );
    expect(rootRoute).toContain("logo: `${SITE_URL}/assets/brwazwneon-logo.png`");
  });

  it("public/og-image.jpg is 1200×630 and small enough for WhatsApp (<300 KB)", () => {
    const file = join(root, "public/og-image.jpg");
    const { width, height } = jpegSize(readFileSync(file));
    expect({ width, height }).toEqual({ width: 1200, height: 630 });
    expect(statSync(file).size).toBeLessThan(300 * 1024);
  });
});
