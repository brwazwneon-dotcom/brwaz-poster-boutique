// Payment-proof rules shared by the checkout (browser) and the order functions (server). Pure: no server-only imports.
//
// A proof is the customer's InstaPay / Vodafone Cash screenshot, uploaded before the order is created and saved on the
// order for the admin to look at. A *valid link* only means "this is a picture we stored for this purpose"; it does NOT
// prove the money arrived. The admin still has to check the transfer.

/** Folder (under `up/`) that proof screenshots are uploaded to. Used by the uploader and by the validator below. */
export const PAYMENT_PROOF_FOLDER = "payment-proofs";

export const PAYMENT_METHODS = ["cod", "instapay", "vodafone_cash"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (PAYMENT_METHODS as readonly string[]).includes(value);
}

/** Every method except cash on delivery moves money before delivery and therefore needs a proof. */
export function isNonCashMethod(method: PaymentMethod): boolean {
  return method !== "cod";
}

// The old Cloudinary account (disabled 2026-10-20). Proofs saved before the move still point there, so they stay
// acceptable; nothing new is uploaded there.
const LEGACY_CLOUDINARY_HOST = "res.cloudinary.com";
const LEGACY_CLOUDINARY_CLOUDS: readonly string[] = ["rpif8xoq"];
const LEGACY_CLOUDINARY_PATH = /^\/([a-z0-9_-]+)\/image\/upload\/[A-Za-z0-9_\-./]+$/;

// `up/<folder>/<uuid>-<filename>` — exactly what putDataUrl() (blob.server.ts) builds.
const BLOB_PATH = new RegExp(
  `^/up/${PAYMENT_PROOF_FOLDER}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]{1,120}$`,
);

export type ProofOptions = {
  /**
   * The exact host of this shop's Vercel Blob store (`<storeId>.public.blob.vercel-storage.com`), see ownBlobHost().
   * When it is null no Blob link is accepted (fail closed); legacy Cloudinary links are still accepted.
   */
  blobHost: string | null;
};

/**
 * The proof URL when it is one we issued, otherwise null. Strict on purpose: https only, exact hostname (so
 * `evil.com/x.public.blob.vercel-storage.com`, `x.public.blob.vercel-storage.com.evil.com` and other stores are
 * refused), no credentials/port/query/fragment, exact folder, and the string must already be in canonical form.
 */
export function validProofUrl(url: unknown, opts: ProofOptions): string | null {
  if (typeof url !== "string" || url.length === 0 || url.length > 500) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.href !== url) return null;
  if (parsed.protocol !== "https:") return null;
  // `?` / `#` are refused on the raw text too: `new URL()` keeps an EMPTY query or fragment in `href` while reporting
  // `search` / `hash` as "", so "…/x.jpg?" would otherwise slip through the checks below.
  if (url.includes("?") || url.includes("#")) return null;
  if (parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash)
    return null;

  if (opts.blobHost && parsed.hostname === opts.blobHost.toLowerCase()) {
    return BLOB_PATH.test(parsed.pathname) ? url : null;
  }
  if (parsed.hostname === LEGACY_CLOUDINARY_HOST) {
    const m = LEGACY_CLOUDINARY_PATH.exec(parsed.pathname);
    return m && LEGACY_CLOUDINARY_CLOUDS.includes(m[1]) ? url : null;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Errors. The server throws Error("[code] English text"); server-function errors reach the browser as plain Errors, so
// the browser recognises them by the code in brackets and shows its own translated message (paymentErrorKey()).
// ---------------------------------------------------------------------------------------------------------------------

export const PAYMENT_ERROR_CODES = [
  "payment_proof_required",
  "payment_method_invalid",
  "payment_method_mixed",
  "photo_electronic_payment_unavailable",
] as const;
export type PaymentErrorCode = (typeof PAYMENT_ERROR_CODES)[number];

const ENGLISH: Record<PaymentErrorCode, string> = {
  payment_proof_required:
    "A payment screenshot is required for InstaPay / Vodafone Cash orders. Upload it and try again, or choose cash on delivery.",
  payment_method_invalid: "This payment method is not available.",
  payment_method_mixed: "All items of one order must use the same payment method.",
  photo_electronic_payment_unavailable:
    "Electronic payment is temporarily unavailable for photo-only orders. Please choose cash on delivery.",
};

const I18N_KEY: Record<PaymentErrorCode, string> = {
  payment_proof_required: "cart.paymentProofRequired",
  payment_method_invalid: "cart.paymentMethodInvalid",
  payment_method_mixed: "cart.paymentMethodInvalid",
  photo_electronic_payment_unavailable: "cart.photoOnlyCodOnly",
};

export class PaymentValidationError extends Error {
  readonly code: PaymentErrorCode;
  constructor(code: PaymentErrorCode) {
    super(`[${code}] ${ENGLISH[code]}`);
    this.name = "PaymentValidationError";
    this.code = code;
  }
}

const CODE_IN_MESSAGE = new RegExp(`^\\[(${PAYMENT_ERROR_CODES.join("|")})\\]`);

/** The payment error code carried by an error that came back from the server, or null for any other error. */
export function paymentErrorCode(error: unknown): PaymentErrorCode | null {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const m = CODE_IN_MESSAGE.exec(message.trim());
  return m ? (m[1] as PaymentErrorCode) : null;
}

/** Translation key for the customer-facing message of a payment error, or null for any other error. */
export function paymentErrorKey(error: unknown): string | null {
  const code = paymentErrorCode(error);
  return code ? I18N_KEY[code] : null;
}

export type PaymentRow = { payment_method?: unknown; payment_screenshot?: unknown };

/**
 * Checks the payment side of the rows of ONE checkout and throws a PaymentValidationError when it is not acceptable:
 *  - every row must carry a known payment method, and all rows the same one;
 *  - a non-cash method needs a valid proof link on every row.
 * Pure and synchronous on purpose: callers run it before any database access, so a refused order writes nothing.
 */
export function assertRowsPayable(rows: readonly PaymentRow[], opts: ProofOptions): PaymentMethod {
  let method: PaymentMethod | null = null;
  for (const row of rows) {
    if (!isPaymentMethod(row.payment_method))
      throw new PaymentValidationError("payment_method_invalid");
    if (method !== null && row.payment_method !== method) {
      throw new PaymentValidationError("payment_method_mixed");
    }
    method = row.payment_method;
    if (
      isNonCashMethod(row.payment_method) &&
      validProofUrl(row.payment_screenshot, opts) === null
    ) {
      throw new PaymentValidationError("payment_proof_required");
    }
  }
  if (method === null) throw new PaymentValidationError("payment_method_invalid");
  return method;
}
