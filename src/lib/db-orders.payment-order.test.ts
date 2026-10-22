// STATIC check — it reads the SOURCE TEXT of db-orders.functions.ts. It does NOT run the handlers and does not prove how
// they behave: the build plugin turns server functions into RPC stubs, so they cannot be called from a unit test. What
// is proven at run time lives in order-payment.server.test.ts (the guards themselves, with a counting fake database).
// What this file pins is the WIRING: in each handler, nothing that can read the database may happen before the payment
// guard. "Can read the database" is judged conservatively: ANY `await`, and ANY call other than the few harmless
// ones below, before the guard fails the test — so a helper such as computePhotoPrintHintSubtotal(), fetchServerPricing()
// or a future one is caught by name-agnostic rules, not only by looking for `sql()` / `client`.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync(new URL("./db-orders.functions.ts", import.meta.url), "utf8");

// Calls that may legitimately precede the guard: the argument checks (`if`, Array.isArray, new Error, regex .test).
const HARMLESS_CALLS = new Set(["if", "isArray", "Error", "test"]);

function stripNoise(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');
}

/** Everything in the handler of `fnName` that comes before `guardCall` (null when either is missing). */
export function beforeGuard(source: string, fnName: string, guardCall: string): string | null {
  const start = source.indexOf(`export const ${fnName}`);
  if (start === -1) return null;
  const handler = /\.handler\(async \(\{[^}]*\}\) => \{/.exec(source.slice(start));
  if (!handler) return null;
  const bodyStart = start + handler.index + handler[0].length;
  const guard = source.indexOf(guardCall, bodyStart);
  if (guard === -1) return null;
  // The guard's own `await` (e.g. `const m = await guardPhotoOrderPayment(data)`) belongs to the guard, not to what
  // runs before it.
  return source.slice(bodyStart, guard).replace(/\bawait\s*$/, "");
}

/** Why `before` is not allowed to precede the guard: each `await` and each non-harmless call is a violation. */
export function violationsBeforeGuard(before: string): string[] {
  const code = stripNoise(before);
  const found: string[] = [];
  if (/\bawait\b/.test(code)) found.push("await");
  for (const m of code.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (!HARMLESS_CALLS.has(m[1])) found.push(`call:${m[1]}`);
  }
  return found;
}

describe("the checker itself (synthetic handlers)", () => {
  const ok = `
    const rawRows = input?.rows;
    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      throw new Error("At least one order row is required (really)");
    }
    if (!/^01\\d{9}$/.test(data.phone)) throw new Error("Invalid phone number");
    // a comment that mentions fetchServerPricing() and await sql() must not count
    `;

  it("accepts only argument checks before the guard", () => {
    expect(violationsBeforeGuard(ok)).toEqual([]);
  });

  it.each([
    [
      "an awaited helper",
      "const h = await computePhotoPrintHintSubtotal(input.hint);",
      ["await", "call:computePhotoPrintHintSubtotal"],
    ],
    [
      "a pricing read",
      "const p = await fetchServerPricing();",
      ["await", "call:fetchServerPricing"],
    ],
    ["the database client", "const client = sql();", ["call:sql"]],
    [
      "a synchronous helper that could read",
      "const rows2 = loadSomething(rawRows);",
      ["call:loadSomething"],
    ],
    [
      "a settings read",
      "const s = await fetchSiteSettingsFromDb(['x']);",
      ["await", "call:fetchSiteSettingsFromDb"],
    ],
    ["a tagged query", "const r = await client`select 1`;", ["await"]],
    ["an arrow helper", "const x = await (async () => 1)();", ["await"]],
  ])("rejects %s", (_name, snippet, expected) => {
    const v = violationsBeforeGuard(`${ok}\n${snippet}\n`);
    for (const e of expected) expect(v).toContain(e);
  });

  it("finds the handler body and the guard in a sample file", () => {
    const sample = `export const f = createServerFn({ method: "POST" })\n  .handler(async ({ data: input }) => {\n  if (!input) throw new Error("x");\n  guardIt(input);\n  await later();\n});`;
    expect(beforeGuard(sample, "f", "guardIt(")).toContain("if (!input)");
    expect(violationsBeforeGuard(beforeGuard(sample, "f", "guardIt(") as string)).toEqual([]);
    expect(beforeGuard(sample, "f", "missing(")).toBeNull();
    // the guard's own `await` is not counted against what runs before it
    const awaited = `export const g = createServerFn({ method: "POST" })\n  .handler(async ({ data }) => {\n  if (!data) throw new Error("x");\n  const m: string = await guardIt(data);\n});`;
    expect(violationsBeforeGuard(beforeGuard(awaited, "g", "guardIt(") as string)).toEqual([]);
    // ...but an await of something else right before it is
    const other = `export const h = createServerFn({ method: "POST" })\n  .handler(async ({ data }) => {\n  await somethingElse(data);\n  guardIt(data);\n});`;
    expect(violationsBeforeGuard(beforeGuard(other, "h", "guardIt(") as string)).toContain("await");
    expect(beforeGuard(sample, "nope", "guardIt(")).toBeNull();
  });
});

describe("db-orders.functions.ts — wiring of the payment guard (source text only)", () => {
  it("createOrderRows: only argument checks run before guardCheckoutPayment(rows)", () => {
    const before = beforeGuard(src, "createOrderRows", "guardCheckoutPayment(rows)");
    expect(before, "guardCheckoutPayment(rows) is called inside createOrderRows").not.toBeNull();
    expect(violationsBeforeGuard(before as string)).toEqual([]);
  });

  it("createPhoto4x6Order: only argument checks run before guardPhotoOrderPayment(data)", () => {
    const before = beforeGuard(src, "createPhoto4x6Order", "guardPhotoOrderPayment(data)");
    expect(
      before,
      "guardPhotoOrderPayment(data) is called inside createPhoto4x6Order",
    ).not.toBeNull();
    expect(violationsBeforeGuard(before as string)).toEqual([]);
  });

  it("the guard result is awaited for photo orders and not awaited (synchronous) for frame orders", () => {
    expect(src).toMatch(/await guardPhotoOrderPayment\(data\)/);
    expect(src).not.toMatch(/await guardCheckoutPayment\(/);
  });

  it("the stored proof always goes through the validator, and no host check is left in this file", () => {
    expect(src).toContain("proofForStorage(r.payment_screenshot)");
    expect(src).not.toMatch(/res\.cloudinary\.com/i);
    expect(src).not.toMatch(/\$\{r\.payment_screenshot\}/); // never inserted raw
  });
});
