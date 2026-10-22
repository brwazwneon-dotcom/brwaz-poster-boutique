// ownBlobHost(): the store host that payment proofs must live on, taken from the store-id segment of the read-write
// token. The format rule is the one @vercel/blob itself uses (4th `_`-separated segment, nothing else is checked), so
// the secret part must be accepted whatever characters it holds. All tokens below are made up.
import { describe, expect, it } from "vitest";
import { ownBlobHost } from "./blob.server";
import { PAYMENT_PROOF_FOLDER, validProofUrl } from "./payment-proof-url";

const ID = "8dx9q2cqnr1j1hpu";
const HOST = `${ID}.public.blob.vercel-storage.com`;
const tokenWith = (secret: string, id = ID) => `vercel_blob_rw_${id}_${secret}`;
const hostFor = (token: string | undefined) => ownBlobHost({ BLOB_READ_WRITE_TOKEN: token });

describe("ownBlobHost — accepts every secret part the SDK accepts", () => {
  const secrets: Array<[string, string]> = [
    ["letters and digits", "AbC123xyz987QwErTy"],
    ["a dash", "ab-cd-ef-123"],
    ["an underscore", "ab_cd_ef_123"],
    ["several underscores (extra segments)", "p1_p2_p3_p4"],
    ["plus, slash and equals (base64 style)", "ab+cd/ef=="],
    ["everything at once", "Ab-1_c+D/e==x.y~z"],
    ["a very long secret", "a1".repeat(150)],
    ["a one-character secret", "x"],
  ];

  it.each(secrets)("a secret with %s", (_name, secret) => {
    expect(hostFor(tokenWith(secret))).toBe(HOST);
  });

  it("never returns any part of the secret", () => {
    for (const [, secret] of secrets) {
      if (secret.length < 4) continue;
      const host = hostFor(tokenWith(secret));
      expect(host).not.toContain(secret);
      expect(host).toBe(HOST);
    }
  });

  it("lower-cases a mixed-case store id (the Blob API's own host is lower-case)", () => {
    expect(hostFor(tokenWith("secret", "8dX9Q2CQNR1J1hpu"))).toBe(HOST);
  });

  it("ignores whitespace around the token", () => {
    expect(hostFor(`  ${tokenWith("sec-ret_1")}\n`)).toBe(HOST);
  });

  it("a proof on that host is accepted whichever characters the token secret held", () => {
    const proof = `https://${HOST}/up/${PAYMENT_PROOF_FOLDER}/123e4567-e89b-42d3-a456-426614174000-payment-proof.jpg`;
    for (const [, secret] of secrets) {
      expect(validProofUrl(proof, { blobHost: hostFor(tokenWith(secret)) })).toBe(proof);
    }
  });
});

describe("ownBlobHost — refuses (null) anything that is not a usable read-write token", () => {
  const bad: Array<[string, string | undefined]> = [
    ["no token", undefined],
    ["an empty token", ""],
    ["only whitespace", "   "],
    ["a client token (not a read-write token)", `vercel_blob_client_${ID}_c2VjcmV0`],
    ["a read-only style prefix", `vercel_blob_ro_${ID}_secret`],
    ["a wrong prefix", `blob_rw_${ID}_secret`],
    ["a bearer header pasted as the token", `Bearer ${tokenWith("secret")}`],
    ["an empty store id", "vercel_blob_rw__secret"],
    ["no secret part at all", `vercel_blob_rw_${ID}`],
    ["an empty secret part", `vercel_blob_rw_${ID}_`],
    ["a store id with a dash", "vercel_blob_rw_ab-cd_secret"],
    ["a store id with a dot", "vercel_blob_rw_ab.cd_secret"],
    ["a store id with a space", "vercel_blob_rw_ab cd_secret"],
    ["a non-ASCII store id", "vercel_blob_rw_abcdе_secret"],
    ["whitespace inside the secret", tokenWith("sec ret")],
    ["a newline inside the secret", tokenWith("sec\nret")],
    ["a test placeholder", "test-token"],
  ];

  it.each(bad)("%s", (_name, token) => {
    expect(hostFor(token)).toBeNull();
  });

  it("reads process.env when no environment is passed", () => {
    const before = process.env.BLOB_READ_WRITE_TOKEN;
    try {
      process.env.BLOB_READ_WRITE_TOKEN = tokenWith("abc-def_ghi");
      expect(ownBlobHost()).toBe(HOST);
      delete process.env.BLOB_READ_WRITE_TOKEN;
      expect(ownBlobHost()).toBeNull();
    } finally {
      if (before === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
      else process.env.BLOB_READ_WRITE_TOKEN = before;
    }
  });

  it("with no usable token every Blob proof is refused, while a historical Cloudinary proof still passes", () => {
    const blobProof = `https://${HOST}/up/${PAYMENT_PROOF_FOLDER}/123e4567-e89b-42d3-a456-426614174000-payment-proof.jpg`;
    const legacy = "https://res.cloudinary.com/rpif8xoq/image/upload/v1/payment-proofs/old.jpg";
    for (const [, token] of bad) {
      const opts = { blobHost: hostFor(token) };
      expect(validProofUrl(blobProof, opts)).toBeNull();
      expect(validProofUrl(legacy, opts)).toBe(legacy);
    }
  });
});
