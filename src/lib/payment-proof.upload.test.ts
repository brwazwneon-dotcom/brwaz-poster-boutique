// @vitest-environment jsdom
// uploadPaymentProof() must put the screenshot in the folder the server later accepts proofs from.
import { beforeEach, describe, expect, it, vi } from "vitest";

const upload = vi.hoisted(() => vi.fn());
vi.mock("@/lib/image-upload.functions", () => ({ uploadCustomerPhoto: upload }));

import { uploadPaymentProof } from "./payment-proof";
import { PAYMENT_PROOF_FOLDER, validProofUrl } from "./payment-proof-url";

const HOST = "8dx9q2cqnr1j1hpu.public.blob.vercel-storage.com";

beforeEach(() => {
  upload.mockReset();
});

describe("uploadPaymentProof", () => {
  it("uploads into PAYMENT_PROOF_FOLDER (and that folder is the one the validator expects)", async () => {
    // Echo the Blob API: the returned URL is https://<store host>/up/<folder>/<uuid>-<file name sent>.
    upload.mockImplementation(async ({ data }: { data: { folder: string; filename: string } }) => ({
      url: `https://${HOST}/up/${data.folder}/123e4567-e89b-42d3-a456-426614174000-${data.filename}`,
    }));

    const url = await uploadPaymentProof(new File(["x"], "screenshot.png", { type: "image/png" }));

    expect(upload).toHaveBeenCalledTimes(1);
    const sent = upload.mock.calls[0][0].data as {
      dataUrl: string;
      filename: string;
      folder: string;
    };
    expect(sent.folder).toBe(PAYMENT_PROOF_FOLDER);
    expect(sent.folder).toBe("payment-proofs");
    expect(sent.filename).toBe("payment-proof.jpg");
    expect(sent.dataUrl.startsWith("data:image/")).toBe(true);
    // The contract that matters: whatever the uploader returns for this call is accepted as a proof.
    expect(validProofUrl(url, { blobHost: HOST })).toBe(url);
  });

  it("a folder other than the proof folder would not be accepted (guards against the two drifting apart)", () => {
    const wrong = `https://${HOST}/up/customer-uploads/123e4567-e89b-42d3-a456-426614174000-payment-proof.jpg`;
    expect(validProofUrl(wrong, { blobHost: HOST })).toBeNull();
  });
});
