// The server-side payment rules (order-payment.server.ts): framed-poster checkout, stored proof, and the photo order
// gate (photo-only InstaPay / Vodafone Cash is temporarily off). The database is a fake: what matters is how often, and
// whether at all, it is touched.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/neon.server", () => ({
  sql: () => {
    throw new Error("the real database must never be used in this test");
  },
}));

import {
  guardCheckoutPayment,
  guardPhotoOrderPayment,
  proofForStorage,
} from "./order-payment.server";
import { PaymentValidationError, type PaymentErrorCode } from "./payment-proof-url";

const STORE = "8dx9q2cqnr1j1hpu";
const UUID = "123e4567-e89b-42d3-a456-426614174000";
const PROOF = `https://${STORE}.public.blob.vercel-storage.com/up/payment-proofs/${UUID}-payment-proof.jpg`;
const LEGACY = "https://res.cloudinary.com/rpif8xoq/image/upload/v1/payment-proofs/old.jpg";

beforeEach(() => {
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", `vercel_blob_rw_${STORE}_notARealSecret0123456789`);
});

const row = (method: string, proof: unknown = null) => ({
  payment_method: method,
  payment_screenshot: proof,
});
const codeOf = (fn: () => unknown): PaymentErrorCode | null => {
  try {
    fn();
    return null;
  } catch (e) {
    expect(e).toBeInstanceOf(PaymentValidationError);
    return (e as PaymentValidationError).code;
  }
};

describe("guardCheckoutPayment (framed-poster checkout)", () => {
  it("COD passes without a proof", () => {
    expect(guardCheckoutPayment([row("cod")])).toBe("cod");
    expect(guardCheckoutPayment([row("cod"), row("cod")])).toBe("cod");
  });

  it("InstaPay passes with a Blob proof from this store, or a historical Cloudinary proof", () => {
    expect(guardCheckoutPayment([row("instapay", PROOF), row("instapay", PROOF)])).toBe("instapay");
    expect(guardCheckoutPayment([row("instapay", LEGACY)])).toBe("instapay");
  });

  it("InstaPay / Vodafone Cash without a valid proof is refused", () => {
    expect(codeOf(() => guardCheckoutPayment([row("instapay")]))).toBe("payment_proof_required");
    expect(codeOf(() => guardCheckoutPayment([row("vodafone_cash", "x")]))).toBe(
      "payment_proof_required",
    );
    expect(codeOf(() => guardCheckoutPayment([row("instapay", PROOF), row("instapay")]))).toBe(
      "payment_proof_required",
    );
  });

  it("mixed methods and unknown methods are refused", () => {
    expect(codeOf(() => guardCheckoutPayment([row("cod"), row("instapay", PROOF)]))).toBe(
      "payment_method_mixed",
    );
    expect(codeOf(() => guardCheckoutPayment([row("bank", PROOF)]))).toBe("payment_method_invalid");
  });

  it("with no Blob store configured a Blob proof is refused, Cloudinary history still passes", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    expect(codeOf(() => guardCheckoutPayment([row("instapay", PROOF)]))).toBe(
      "payment_proof_required",
    );
    expect(guardCheckoutPayment([row("instapay", LEGACY)])).toBe("instapay");
  });
});

describe("proofForStorage", () => {
  it("keeps a valid proof and turns everything else into null", () => {
    expect(proofForStorage(PROOF)).toBe(PROOF);
    expect(proofForStorage(LEGACY)).toBe(LEGACY);
    for (const bad of [
      "javascript:alert(1)",
      "",
      null,
      undefined,
      3,
      `${PROOF}?x=1`,
      PROOF.replace(STORE, "other"),
    ]) {
      expect(proofForStorage(bad)).toBeNull();
    }
  });
});

describe("guardPhotoOrderPayment (photo orders)", () => {
  const phone = "01000000000";
  const fakeDb = (rows: unknown[]) => {
    const calls: Array<{ text: string; vals: unknown[] }> = [];
    const run = (strings: TemplateStringsArray, ...vals: unknown[]) => {
      calls.push({ text: strings.join("?"), vals });
      return Promise.resolve(rows);
    };
    return { run, calls };
  };

  it("cash on delivery (sent or not sent) passes with no database access", async () => {
    const db = fakeDb([]);
    expect(await guardPhotoOrderPayment({ payment_method: "cod", phone }, db.run)).toBe("cod");
    expect(await guardPhotoOrderPayment({ phone }, db.run)).toBe("cod");
    expect(db.calls).toHaveLength(0);
  });

  it.each([["instapay"], ["vodafone_cash"]])(
    "%s on a photo-only order is refused without touching the database",
    async (method) => {
      for (const shipping_with_frames of [undefined, false, "true", 1]) {
        const db = fakeDb([{ one: 1 }]); // even if a proofed order existed, the flag decides
        await expect(
          guardPhotoOrderPayment({ payment_method: method, shipping_with_frames, phone }, db.run),
        ).rejects.toMatchObject({ code: "photo_electronic_payment_unavailable" });
        expect(db.calls).toHaveLength(0);
      }
    },
  );

  it("an unknown method is refused (it is no longer turned into COD), without database access", async () => {
    const db = fakeDb([]);
    for (const m of ["bank", "", "COD", 5, false]) {
      await expect(
        guardPhotoOrderPayment({ payment_method: m, phone }, db.run),
      ).rejects.toMatchObject({ code: "payment_method_invalid" });
    }
    expect(db.calls).toHaveLength(0);
  });

  it("InstaPay with framed posters needs a stored order with a proof from this phone, same method, last 15 min", async () => {
    const none = fakeDb([]);
    await expect(
      guardPhotoOrderPayment(
        { payment_method: "instapay", shipping_with_frames: true, phone },
        none.run,
      ),
    ).rejects.toMatchObject({ code: "payment_proof_required" });
    expect(none.calls).toHaveLength(1);
    expect(none.calls[0].text).toMatch(/select 1 from orders/);
    expect(none.calls[0].text).not.toMatch(/\b(insert|update|delete)\b/i);
    expect(none.calls[0].text).toMatch(/payment_screenshot is not null/);
    expect(none.calls[0].text).toMatch(/interval '15 minutes'/);
    expect(none.calls[0].vals).toEqual([phone, "instapay"]);

    const found = fakeDb([{ one: 1 }]);
    expect(
      await guardPhotoOrderPayment(
        { payment_method: "instapay", shipping_with_frames: true, phone },
        found.run,
      ),
    ).toBe("instapay");
    expect(found.calls).toHaveLength(1);
  });
});

describe("guardPhotoOrderPayment — a method that was not sent", () => {
  it("treats undefined and null as cash on delivery (the previous behaviour for 'not sent')", async () => {
    const run = () => Promise.resolve([]);
    expect(
      await guardPhotoOrderPayment({ payment_method: undefined, phone: "01000000000" }, run),
    ).toBe("cod");
    expect(await guardPhotoOrderPayment({ payment_method: null, phone: "01000000000" }, run)).toBe(
      "cod",
    );
  });
});

describe("guardPhotoOrderPayment — the database client is not even created for a refusal or for COD", () => {
  // The neon mock at the top of this file throws if sql() is ever called, so these calls pass no `run`.
  const phone = "01000000000";
  it("COD, a photo-only electronic payment and an unknown method never reach sql()", async () => {
    expect(await guardPhotoOrderPayment({ phone })).toBe("cod");
    await expect(
      guardPhotoOrderPayment({ payment_method: "instapay", phone }),
    ).rejects.toMatchObject({ code: "photo_electronic_payment_unavailable" });
    await expect(guardPhotoOrderPayment({ payment_method: "bank", phone })).rejects.toMatchObject({
      code: "payment_method_invalid",
    });
  });

  it("only the framed-poster case creates the client (and would then run exactly one read)", async () => {
    await expect(
      guardPhotoOrderPayment({ payment_method: "instapay", shipping_with_frames: true, phone }),
    ).rejects.toThrow("the real database must never be used");
  });
});
