// The checkout shows translated payment messages. Every message the code can ask for must exist in BOTH languages,
// otherwise the customer would see a raw key such as "cart.paymentProofRequired".
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ar from "./locales/ar.json";
import en from "./locales/en.json";
import { PAYMENT_ERROR_CODES, PaymentValidationError, paymentErrorKey } from "./payment-proof-url";

const lookup = (tree: unknown, path: string): unknown =>
  path
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree);
const text = (tree: unknown, path: string): string => {
  const v = lookup(tree, path);
  return typeof v === "string" ? v : "";
};
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("translation keys used by the payment checkout", () => {
  const keys = PAYMENT_ERROR_CODES.map((code) => ({
    code,
    key: paymentErrorKey(new PaymentValidationError(code)),
  }));

  it("every payment error code maps to a translation key", () => {
    expect(keys.length).toBeGreaterThanOrEqual(4);
    for (const { code, key } of keys) expect(key, code).toMatch(/^cart\.[A-Za-z]+$/);
  });

  it.each([
    ["ar", ar],
    ["en", en],
  ])("every payment error message exists in %s", (_lang, tree) => {
    for (const { code, key } of keys) {
      expect(text(tree, key as string).length, `${code} -> ${key}`).toBeGreaterThan(15);
    }
  });

  it.each([
    ["ar", ar],
    ["en", en],
  ])("the file-type, hint and proof messages exist in %s and do not mention PDF", (_lang, tree) => {
    for (const key of [
      "cart.onlyJpgPngWebp",
      "cart.screenshotHint",
      "cart.uploadPaymentScreenshot",
      "cart.maxFileSize",
    ]) {
      const value = text(tree, key);
      expect(value.length, key).toBeGreaterThan(5);
      expect(value, key).not.toMatch(/pdf/i);
    }
  });

  it.each([
    ["ar", ar],
    ["en", en],
  ])("the old PDF-mentioning key is gone from %s", (_lang, tree) => {
    expect(lookup(tree, "cart.onlyJpgPngWebpPdf")).toBeUndefined();
  });

  it("the two languages carry the same payment keys", () => {
    for (const key of [
      "cart.paymentProofRequired",
      "cart.paymentMethodInvalid",
      "cart.photoOnlyCodOnly",
      "cart.onlyJpgPngWebp",
    ]) {
      expect(typeof lookup(ar, key), `ar ${key}`).toBe("string");
      expect(typeof lookup(en, key), `en ${key}`).toBe("string");
    }
  });
});

describe("the screens use exactly those keys (static read of the source)", () => {
  const cart = read("../routes/cart.tsx");
  const photo = read("../routes/photo-printing.tsx");

  it("the cart refers only to translation keys that exist, and no longer to the PDF key", () => {
    expect(cart).not.toContain("onlyJpgPngWebpPdf");
    for (const m of cart.matchAll(
      /\bt\("(cart\.(?:onlyJpgPngWebp|photoOnlyCodOnly|paymentProofRequired|paymentMethodInvalid))"\)/g,
    )) {
      expect(text(ar, m[1]), `ar ${m[1]}`).not.toBe("");
      expect(text(en, m[1]), `en ${m[1]}`).not.toBe("");
    }
    expect(cart).toContain('t("cart.onlyJpgPngWebp")');
    expect(cart).toContain('t("cart.photoOnlyCodOnly")');
  });

  it("the cart and the photo page translate payment errors through paymentErrorKey", () => {
    expect(cart).toContain("paymentErrorKey(");
    expect(photo).toContain("paymentErrorKey(");
    expect(photo).toContain('t("cart.photoOnlyCodOnly")');
  });

  it("the cart no longer offers PDF for the payment screenshot", () => {
    expect(cart).not.toMatch(/application\/pdf/);
  });
});
