import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ownBlobHost, putDataUrl } from "./blob.server";
import {
  PAYMENT_PROOF_FOLDER,
  PaymentValidationError,
  assertRowsPayable,
  isNonCashMethod,
  isPaymentMethod,
  paymentErrorCode,
  paymentErrorKey,
  validProofUrl,
} from "./payment-proof-url";

const STORE = "8dx9q2cqnr1j1hpu";
const HOST = `${STORE}.public.blob.vercel-storage.com`;
const UUID = "123e4567-e89b-42d3-a456-426614174000";
const GOOD_BLOB = `https://${HOST}/up/${PAYMENT_PROOF_FOLDER}/${UUID}-payment-proof.jpg`;
const GOOD_LEGACY =
  "https://res.cloudinary.com/rpif8xoq/image/upload/v1789770367/payment-proofs/abc-proof.jpg";
const OPTS = { blobHost: HOST };

describe("validProofUrl — links we accept", () => {
  it("accepts a proof stored in this shop's Blob store", () => {
    expect(validProofUrl(GOOD_BLOB, OPTS)).toBe(GOOD_BLOB);
  });

  it("accepts a historical proof on the old Cloudinary account", () => {
    expect(validProofUrl(GOOD_LEGACY, OPTS)).toBe(GOOD_LEGACY);
    expect(validProofUrl(GOOD_LEGACY, { blobHost: null })).toBe(GOOD_LEGACY);
  });
});

describe("validProofUrl — links we refuse", () => {
  const refused: Array<[string, unknown]> = [
    ["javascript: link", "javascript:alert(1)"],
    ["data: link", "data:image/png;base64,AAAA"],
    ["plain http", GOOD_BLOB.replace("https:", "http:")],
    ["protocol-relative", `//${HOST}/up/${PAYMENT_PROOF_FOLDER}/${UUID}-payment-proof.jpg`],
    ["another Blob store", GOOD_BLOB.replace(STORE, "othersstore123456")],
    [
      "lookalike: our host as a sub-domain of another site",
      `https://${HOST}.evil.com/up/${PAYMENT_PROOF_FOLDER}/${UUID}-p.jpg`,
    ],
    [
      "lookalike: our host inside the path",
      `https://evil.com/${HOST}/up/${PAYMENT_PROOF_FOLDER}/${UUID}-p.jpg`,
    ],
    [
      "lookalike: our host as user-info",
      `https://${HOST}@evil.com/up/${PAYMENT_PROOF_FOLDER}/${UUID}-p.jpg`,
    ],
    [
      "lookalike: suffix only (any store)",
      `https://evil.public.blob.vercel-storage.com/up/${PAYMENT_PROOF_FOLDER}/${UUID}-p.jpg`,
    ],
    [
      "lookalike: dash-joined host",
      `https://${STORE}-public.blob.vercel-storage.com/up/${PAYMENT_PROOF_FOLDER}/${UUID}-p.jpg`,
    ],
    [
      "Cloudinary lookalike host",
      GOOD_LEGACY.replace("res.cloudinary.com", "res.cloudinary.com.evil.com"),
    ],
    [
      "Cloudinary lookalike host (dash)",
      GOOD_LEGACY.replace("res.cloudinary.com", "res-cloudinary.com"),
    ],
    ["Cloudinary: another cloud name", GOOD_LEGACY.replace("rpif8xoq", "attackercloud")],
    [
      "Cloudinary: not an image upload path",
      GOOD_LEGACY.replace("/image/upload/", "/video/upload/"),
    ],
    ["credentials in the URL", GOOD_BLOB.replace("https://", "https://user:pw@")],
    ["explicit port", GOOD_BLOB.replace(HOST, `${HOST}:8443`)],
    ["query string", `${GOOD_BLOB}?x=1`],
    ["fragment", `${GOOD_BLOB}#x`],
    ["path outside the proof folder", `https://${HOST}/up/posters/${UUID}-payment-proof.jpg`],
    ["old backup prefix", `https://${HOST}/posters/${UUID}-payment-proof.jpg`],
    ["no uuid prefix", `https://${HOST}/up/${PAYMENT_PROOF_FOLDER}/payment-proof.jpg`],
    ["nested folder", `https://${HOST}/up/${PAYMENT_PROOF_FOLDER}/x/${UUID}-payment-proof.jpg`],
    [
      "path traversal",
      `https://${HOST}/up/${PAYMENT_PROOF_FOLDER}/../posters/${UUID}-payment-proof.jpg`,
    ],
    ["encoded slash", `https://${HOST}/up/${PAYMENT_PROOF_FOLDER}/${UUID}-a%2Fb.jpg`],
    ["upper-case host (not canonical)", GOOD_BLOB.replace(HOST, HOST.toUpperCase())],
    ["leading space", ` ${GOOD_BLOB}`],
    ["trailing space", `${GOOD_BLOB} `],
    ["embedded newline", `${GOOD_BLOB}\n`],
    ["quote characters", `${GOOD_BLOB}"onerror="x`],
    ["empty string", ""],
    ["not a URL", "payment-proof.jpg"],
    ["over-long", `https://${HOST}/up/${PAYMENT_PROOF_FOLDER}/${UUID}-${"a".repeat(600)}.jpg`],
  ];
  it.each(refused)("refuses %s", (_name, value) => {
    expect(validProofUrl(value, OPTS)).toBeNull();
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["number", 42],
    ["object", { url: GOOD_BLOB }],
    ["array", [GOOD_BLOB]],
    ["boolean", true],
  ])("refuses a non-text value: %s", (_name, value) => {
    expect(validProofUrl(value, OPTS)).toBeNull();
  });

  it("refuses every Blob link when the store host is unknown (fail closed)", () => {
    expect(validProofUrl(GOOD_BLOB, { blobHost: null })).toBeNull();
  });
});

describe("payment methods", () => {
  it("knows the three methods and treats everything but COD as non-cash", () => {
    for (const m of ["cod", "instapay", "vodafone_cash"]) expect(isPaymentMethod(m)).toBe(true);
    for (const m of ["", "COD", "bank", "paypal", null, undefined, 1])
      expect(isPaymentMethod(m)).toBe(false);
    expect(isNonCashMethod("cod")).toBe(false);
    expect(isNonCashMethod("instapay")).toBe(true);
    expect(isNonCashMethod("vodafone_cash")).toBe(true);
  });
});

describe("assertRowsPayable", () => {
  const cod = (extra = {}) => ({ payment_method: "cod", payment_screenshot: null, ...extra });
  const insta = (proof: unknown) => ({ payment_method: "instapay", payment_screenshot: proof });
  const codeOf = (rows: unknown[]) => {
    try {
      assertRowsPayable(rows as never, OPTS);
      return null;
    } catch (e) {
      expect(e).toBeInstanceOf(PaymentValidationError);
      return (e as PaymentValidationError).code;
    }
  };

  it("COD needs no proof (one row or several)", () => {
    expect(assertRowsPayable([cod()], OPTS)).toBe("cod");
    expect(assertRowsPayable([cod(), cod()], OPTS)).toBe("cod");
  });

  it("COD ignores a stray proof field", () => {
    expect(assertRowsPayable([cod({ payment_screenshot: "junk" })], OPTS)).toBe("cod");
  });

  it("InstaPay with a valid proof passes, for Blob and for legacy Cloudinary", () => {
    expect(assertRowsPayable([insta(GOOD_BLOB), insta(GOOD_BLOB)], OPTS)).toBe("instapay");
    expect(assertRowsPayable([insta(GOOD_LEGACY)], OPTS)).toBe("instapay");
  });

  it("Vodafone Cash needs a proof as well", () => {
    expect(codeOf([{ payment_method: "vodafone_cash", payment_screenshot: null }])).toBe(
      "payment_proof_required",
    );
    expect(
      assertRowsPayable([{ payment_method: "vodafone_cash", payment_screenshot: GOOD_BLOB }], OPTS),
    ).toBe("vodafone_cash");
  });

  it.each([
    ["missing", null],
    ["undefined", undefined],
    ["empty", ""],
    ["junk text", "my-screenshot.png"],
    ["javascript: link", "javascript:alert(1)"],
    ["lookalike host", `https://${HOST}.evil.com/up/${PAYMENT_PROOF_FOLDER}/${UUID}-p.jpg`],
    ["wrong folder", `https://${HOST}/up/posters/${UUID}-p.jpg`],
    ["not text", 123],
  ])("InstaPay with a proof that is %s is refused", (_n, proof) => {
    expect(codeOf([insta(proof)])).toBe("payment_proof_required");
  });

  it("InstaPay where ONE row lacks a proof is refused (e.g. the tape line)", () => {
    expect(codeOf([insta(GOOD_BLOB), insta(null)])).toBe("payment_proof_required");
    expect(codeOf([insta(null), insta(GOOD_BLOB)])).toBe("payment_proof_required");
  });

  it("mixed COD / InstaPay rows are refused whatever their proofs are", () => {
    expect(codeOf([cod(), insta(GOOD_BLOB)])).toBe("payment_method_mixed");
    expect(codeOf([insta(GOOD_BLOB), cod()])).toBe("payment_method_mixed");
    expect(codeOf([cod(), insta(null)])).toBe("payment_method_mixed");
  });

  it.each([["bank"], [""], [null], [undefined], [5]])("an unknown method (%s) is refused", (m) => {
    expect(codeOf([{ payment_method: m, payment_screenshot: GOOD_BLOB }])).toBe(
      "payment_method_invalid",
    );
  });

  it("no rows is refused", () => {
    expect(codeOf([])).toBe("payment_method_invalid");
  });
});

describe("payment error messages (shared by server and checkout screens)", () => {
  it("carries a code the browser can recognise after the error crossed the server-function boundary", () => {
    const serverSide = new PaymentValidationError("payment_proof_required");
    const asReceived = new Error(serverSide.message); // the browser only gets a plain Error with the same message
    expect(paymentErrorCode(asReceived)).toBe("payment_proof_required");
    expect(paymentErrorKey(asReceived)).toBe("cart.paymentProofRequired");
  });

  it("maps every code to a translation key", () => {
    expect(paymentErrorKey(new PaymentValidationError("payment_method_invalid"))).toBe(
      "cart.paymentMethodInvalid",
    );
    expect(paymentErrorKey(new PaymentValidationError("payment_method_mixed"))).toBe(
      "cart.paymentMethodInvalid",
    );
    expect(
      paymentErrorKey(new PaymentValidationError("photo_electronic_payment_unavailable")),
    ).toBe("cart.photoOnlyCodOnly");
  });

  it("does not claim other errors", () => {
    for (const e of [
      new Error("db down"),
      "[x] nope",
      null,
      undefined,
      { message: "[payment_proof_required]" },
    ]) {
      expect(paymentErrorKey(e)).toBeNull();
    }
    expect(
      paymentErrorCode(new Error("Checkout failed at: orders_insert [payment_proof_required]")),
    ).toBeNull();
  });
});

describe("contract with the real upload (blob.server.ts)", () => {
  const fetchMock = vi.fn();
  const ONE_PIXEL_JPEG =
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

  beforeEach(() => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", `vercel_blob_rw_${STORE}_notARealSecret0123456789`);
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    // Behave like the Blob API: the returned public URL is https://<store-host>/<pathname that was PUT>.
    fetchMock.mockImplementation(async (target: string) => ({
      ok: true,
      json: async () => ({
        url: `https://${STORE}.public.blob.vercel-storage.com${new URL(target).pathname}`,
      }),
    }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("derives the store host from the public store-id part of the token only", () => {
    expect(ownBlobHost()).toBe(HOST);
    expect(ownBlobHost({ BLOB_READ_WRITE_TOKEN: "test-token" })).toBeNull();
    expect(ownBlobHost({ BLOB_READ_WRITE_TOKEN: "" })).toBeNull();
    expect(ownBlobHost({})).toBeNull();
    expect(ownBlobHost({ BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_Ab12Cd_secret" })).toBe(
      "ab12cd.public.blob.vercel-storage.com",
    );
  });

  it("the URL produced by uploading a payment proof is accepted by the validator", async () => {
    // Exactly what uploadPaymentProof() sends: folder PAYMENT_PROOF_FOLDER, filename "payment-proof.jpg", JPEG data.
    const url = await putDataUrl(
      ONE_PIXEL_JPEG,
      PAYMENT_PROOF_FOLDER,
      "payment-proof.jpg",
      1024 * 1024,
    );
    expect(url).toMatch(
      new RegExp(`^https://${HOST}/up/${PAYMENT_PROOF_FOLDER}/[0-9a-f-]{36}-payment-proof\\.jpg$`),
    );
    expect(validProofUrl(url, { blobHost: ownBlobHost() })).toBe(url);
    expect(
      assertRowsPayable([{ payment_method: "instapay", payment_screenshot: url }], {
        blobHost: ownBlobHost(),
      }),
    ).toBe("instapay");
  });

  it("an upload into any other folder is NOT accepted as a proof", async () => {
    const url = await putDataUrl(ONE_PIXEL_JPEG, "posters", "payment-proof.jpg", 1024 * 1024);
    expect(validProofUrl(url, { blobHost: ownBlobHost() })).toBeNull();
  });
});
