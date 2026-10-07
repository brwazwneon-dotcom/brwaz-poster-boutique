/** Delivery-field draft so a refresh / accidental navigation never loses typed data.
 *  Stored only on the customer's own device; payment data and screenshots are never stored. */
const KEY = "brw_checkout_draft_v1";
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

export type CheckoutDraft = { name: string; phone: string; governorate: string; address: string };

export function readCheckoutDraft(): CheckoutDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<CheckoutDraft> & { at?: number };
    if (!d.at || Date.now() - d.at > MAX_AGE_MS) return null;
    return {
      name: String(d.name ?? "").slice(0, 120),
      phone: String(d.phone ?? "")
        .replace(/\D/g, "")
        .slice(0, 11),
      governorate: String(d.governorate ?? "").slice(0, 80),
      address: String(d.address ?? "").slice(0, 500),
    };
  } catch {
    return null;
  }
}

export function writeCheckoutDraft(d: CheckoutDraft) {
  try {
    if (!d.name && !d.phone && !d.governorate && !d.address) {
      localStorage.removeItem(KEY);
      return;
    }
    localStorage.setItem(KEY, JSON.stringify({ ...d, at: Date.now() }));
  } catch {
    /* storage unavailable: ignore */
  }
}

export function clearCheckoutDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
