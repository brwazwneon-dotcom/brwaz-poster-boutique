// Hostname and path edge cases of validProofUrl(): other stores, trailing dots, look-alike and encoded hosts, and every
// path that is not exactly `up/payment-proofs/<uuid>-<file>`.
import { describe, expect, it } from "vitest";
import { PAYMENT_PROOF_FOLDER, validProofUrl } from "./payment-proof-url";

const STORE = "8dx9q2cqnr1j1hpu";
const HOST = `${STORE}.public.blob.vercel-storage.com`;
const UUID = "123e4567-e89b-42d3-a456-426614174000";
const FILE = `${UUID}-payment-proof.jpg`;
const GOOD = `https://${HOST}/up/${PAYMENT_PROOF_FOLDER}/${FILE}`;
const OPTS = { blobHost: HOST };
const CLOUD = "https://res.cloudinary.com/rpif8xoq/image/upload/v1789770367/payment-proofs/abc.jpg";

describe("Blob host", () => {
  it("accepts the shop's own host, and a blobHost option given in upper case", () => {
    expect(validProofUrl(GOOD, OPTS)).toBe(GOOD);
    expect(validProofUrl(GOOD, { blobHost: HOST.toUpperCase() })).toBe(GOOD);
  });

  const refused: Array<[string, string]> = [
    ["a different store", GOOD.replace(STORE, "9zzzzzzzzzzzzzzz")],
    ["a trailing dot after the host", `https://${HOST}./up/${PAYMENT_PROOF_FOLDER}/${FILE}`],
    ["a trailing dot and a port", `https://${HOST}.:443/up/${PAYMENT_PROOF_FOLDER}/${FILE}`],
    [
      "our host as a prefix of another domain",
      `https://${HOST}.attacker.example/up/${PAYMENT_PROOF_FOLDER}/${FILE}`,
    ],
    [
      "our host as the tail of a longer label",
      `https://evil-${HOST}/up/${PAYMENT_PROOF_FOLDER}/${FILE}`,
    ],
    ["a different top-level domain", GOOD.replace("vercel-storage.com", "vercel-storage.co")],
    ["the private-store domain", GOOD.replace(".public.", ".private.")],
    [
      "the bare Blob API host",
      `https://blob.vercel-storage.com/up/${PAYMENT_PROOF_FOLDER}/${FILE}`,
    ],
    ["a sub-domain of our host", `https://x.${HOST}/up/${PAYMENT_PROOF_FOLDER}/${FILE}`],
    [
      "our host used as user-info",
      `https://${HOST}@attacker.example/up/${PAYMENT_PROOF_FOLDER}/${FILE}`,
    ],
    [
      "our host used as the path",
      `https://attacker.example/${HOST}/up/${PAYMENT_PROOF_FOLDER}/${FILE}`,
    ],
    [
      "our host after a query",
      `https://attacker.example/?u=${HOST}/up/${PAYMENT_PROOF_FOLDER}/${FILE}`,
    ],
    [
      "a percent-encoded dot in the host",
      `https://${STORE}%2epublic.blob.vercel-storage.com/up/${PAYMENT_PROOF_FOLDER}/${FILE}`,
    ],
    [
      "a punycode look-alike",
      `https://xn--${STORE}.public.blob.vercel-storage.com/up/${PAYMENT_PROOF_FOLDER}/${FILE}`,
    ],
    [
      "a Cyrillic look-alike letter",
      `https://${STORE}.public.blob.vercel-storаge.com/up/${PAYMENT_PROOF_FOLDER}/${FILE}`,
    ],
    [
      "a full-width look-alike dot",
      `https://${STORE}．public.blob.vercel-storage.com/up/${PAYMENT_PROOF_FOLDER}/${FILE}`,
    ],
    ["an IP address", `https://203.0.113.7/up/${PAYMENT_PROOF_FOLDER}/${FILE}`],
    ["localhost", `https://localhost/up/${PAYMENT_PROOF_FOLDER}/${FILE}`],
    ["an explicit non-default port", `https://${HOST}:8443/up/${PAYMENT_PROOF_FOLDER}/${FILE}`],
    [
      "the default port written out (not canonical)",
      `https://${HOST}:443/up/${PAYMENT_PROOF_FOLDER}/${FILE}`,
    ],
    ["the wrong scheme", GOOD.replace("https://", "http://")],
    ["a scheme-less URL", GOOD.replace("https://", "")],
    ["credentials", GOOD.replace("https://", "https://user:pass@")],
  ];
  it.each(refused)("refuses %s", (_name, url) => {
    expect(validProofUrl(url, OPTS)).toBeNull();
  });

  it("with no blobHost configured nothing on a *.public.blob host is accepted", () => {
    expect(validProofUrl(GOOD, { blobHost: null })).toBeNull();
    expect(validProofUrl(GOOD, { blobHost: "" })).toBeNull();
  });
});

describe("Blob path", () => {
  const P = `/up/${PAYMENT_PROOF_FOLDER}`;
  const refused: Array<[string, string]> = [
    ["a different folder", `/up/posters/${FILE}`],
    ["the old backup prefix without up/", `/${PAYMENT_PROOF_FOLDER}/${FILE}`],
    ["a folder that only starts with the right name", `/up/${PAYMENT_PROOF_FOLDER}-old/${FILE}`],
    ["a folder with a different case", `/up/Payment-Proofs/${FILE}`],
    ["an upper-case up/", `/UP/${PAYMENT_PROOF_FOLDER}/${FILE}`],
    ["a doubled slash at the start", `/${P}/${FILE}`],
    ["a doubled slash inside", `/up//${PAYMENT_PROOF_FOLDER}/${FILE}`],
    ["a doubled slash before the file", `${P}//${FILE}`],
    ["a sub-folder", `${P}/nested/${FILE}`],
    ["a trailing slash", `${P}/${FILE}/`],
    ["no file name", `${P}/`],
    ["no uuid", `${P}/payment-proof.jpg`],
    ["a short uuid", `${P}/123e4567-payment-proof.jpg`],
    ["a uuid without dashes", `${P}/123e4567e89b42d3a456426614174000-payment-proof.jpg`],
    ["an upper-case uuid", `${P}/${UUID.toUpperCase()}-payment-proof.jpg`],
    ["no separator after the uuid", `${P}/${UUID}payment-proof.jpg`],
    ["a dot segment", `/up/./${PAYMENT_PROOF_FOLDER}/${FILE}`],
    ["a parent segment", `/up/x/../${PAYMENT_PROOF_FOLDER}/${FILE}`],
    ["an encoded parent segment", `${P}/%2e%2e/${FILE}`],
    ["an encoded slash in the file name", `${P}/${UUID}-a%2Fb.jpg`],
    ["an encoded space in the file name", `${P}/${UUID}-my%20proof.jpg`],
    ["a raw space in the file name", `${P}/${UUID}-my proof.jpg`],
    ["a path parameter", `${P}/${FILE};x=1`],
    ["a backslash", `${P}\\${FILE}`],
    ["a file name over 120 characters", `${P}/${UUID}-${"a".repeat(121)}`],
  ];
  it.each(refused)("refuses %s", (_name, path) => {
    const url = `https://${HOST}${path}`;
    expect(validProofUrl(url, OPTS)).toBeNull();
  });

  it("refuses a query string or fragment on an otherwise perfect link", () => {
    expect(validProofUrl(`${GOOD}?download=1`, OPTS)).toBeNull();
    expect(validProofUrl(`${GOOD}?`, OPTS)).toBeNull();
    expect(validProofUrl(`${GOOD}#frag`, OPTS)).toBeNull();
    expect(validProofUrl(`${GOOD}#`, OPTS)).toBeNull();
    expect(validProofUrl(`${GOOD}?#`, OPTS)).toBeNull();
    expect(validProofUrl(`${CLOUD}?`, OPTS)).toBeNull();
    expect(validProofUrl(`${CLOUD}#`, OPTS)).toBeNull();
  });

  it("accepts the ordinary shapes the uploader produces", () => {
    for (const ext of ["jpg", "png", "webp", "avif", "gif", "heic", "img"]) {
      const url = `https://${HOST}/up/${PAYMENT_PROOF_FOLDER}/${UUID}-payment-proof.${ext}`;
      expect(validProofUrl(url, OPTS)).toBe(url);
    }
  });
});

describe("historical Cloudinary links", () => {
  it("are accepted with or without a Blob host configured", () => {
    expect(validProofUrl(CLOUD, OPTS)).toBe(CLOUD);
    expect(validProofUrl(CLOUD, { blobHost: null })).toBe(CLOUD);
  });

  const refused: Array<[string, string]> = [
    ["a trailing dot after the host", CLOUD.replace("res.cloudinary.com", "res.cloudinary.com.")],
    [
      "a look-alike host",
      CLOUD.replace("res.cloudinary.com", "res.cloudinary.com.attacker.example"),
    ],
    ["a dash instead of a dot", CLOUD.replace("res.cloudinary.com", "res-cloudinary.com")],
    ["another sub-domain", CLOUD.replace("res.", "api.")],
    ["another cloud name", CLOUD.replace("rpif8xoq", "attackercloud")],
    ["a video upload path", CLOUD.replace("/image/upload/", "/video/upload/")],
    ["a raw upload path", CLOUD.replace("/image/upload/", "/raw/upload/")],
    ["nothing after upload/", "https://res.cloudinary.com/rpif8xoq/image/upload/"],
    ["a parent segment", CLOUD.replace("/payment-proofs/", "/../payment-proofs/")],
    ["the default port written out", CLOUD.replace("res.cloudinary.com", "res.cloudinary.com:443")],
    ["a query string", `${CLOUD}?x=1`],
    ["plain http", CLOUD.replace("https://", "http://")],
  ];
  it.each(refused)("refuses %s", (_name, url) => {
    expect(validProofUrl(url, OPTS)).toBeNull();
  });
});
