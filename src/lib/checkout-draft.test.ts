// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { clearCheckoutDraft, readCheckoutDraft, writeCheckoutDraft } from "./checkout-draft";

describe("checkout draft", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips delivery fields", () => {
    writeCheckoutDraft({
      name: "Ahmed",
      phone: "01012345678",
      governorate: "Giza",
      address: "St 1",
    });
    expect(readCheckoutDraft()).toEqual({
      name: "Ahmed",
      phone: "01012345678",
      governorate: "Giza",
      address: "St 1",
    });
  });

  it("sanitises the phone and ignores expired or corrupt drafts", () => {
    localStorage.setItem(
      "brw_checkout_draft_v1",
      JSON.stringify({ phone: "0101-234 5678x", at: Date.now() }),
    );
    expect(readCheckoutDraft()?.phone).toBe("01012345678");
    localStorage.setItem(
      "brw_checkout_draft_v1",
      JSON.stringify({ phone: "0101", at: Date.now() - 8 * 86400000 }),
    );
    expect(readCheckoutDraft()).toBeNull();
    localStorage.setItem("brw_checkout_draft_v1", "{not json");
    expect(readCheckoutDraft()).toBeNull();
  });

  it("clears, and an all-empty draft removes the key", () => {
    writeCheckoutDraft({ name: "A", phone: "", governorate: "", address: "" });
    clearCheckoutDraft();
    expect(readCheckoutDraft()).toBeNull();
    writeCheckoutDraft({ name: "A", phone: "", governorate: "", address: "" });
    writeCheckoutDraft({ name: "", phone: "", governorate: "", address: "" });
    expect(localStorage.getItem("brw_checkout_draft_v1")).toBeNull();
  });
});
