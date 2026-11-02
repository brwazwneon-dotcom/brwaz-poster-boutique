// Targeted test gate for the preloader. Run it with `npm run test:gate`.
//
// Why it exists: `vitest run <file> <file>` treats its arguments as filters, so it exits 0 when ONE of the files is missing and also when
// tests are skipped. This gate runs the same files with Vitest's JSON reporter and then fails unless:
//   - Vitest itself exited 0,
//   - the JSON result file exists, parses and has a `testResults` array,
//   - every required test file appears exactly once, passed, and holds at least its minimum number of tests,
//   - no test failed, was skipped or is a todo.
// It is a command a person runs. It does NOT stop a deployment by itself: deploys are manual (`vercel deploy`), so running it is a
// separate step of the pre-deploy checklist.
//
// When a test is added or removed on purpose, update MIN_TESTS below (a lower bound, so adding tests needs no change).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** required test files (repo-relative, forward slashes) and the fewest tests each must run */
export const REQUIRED_TESTS = [
  { path: "src/lib/hydration-ready.test.ts", minTests: 12 },
  { path: "src/components/AppPreloader.test.tsx", minTests: 16 },
];

const norm = (s) => String(s).split("\\").join("/");

/**
 * Judge a parsed Vitest JSON result. `raw` is the file's text (or null when it does not exist).
 * Returns { ok, code, message }; `code` is a distinct non-zero number per failure kind.
 */
export function evaluate(raw, vitestExit, required = REQUIRED_TESTS) {
  const fail = (code, message) => ({ ok: false, code, message });
  if (vitestExit !== 0) return fail(10, `vitest exited with ${vitestExit}`);
  if (raw === null || raw === undefined) return fail(3, "no JSON result file");
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail(3, "JSON result is empty or malformed");
  }
  if (!json || typeof json !== "object" || !Array.isArray(json.testResults)) {
    return fail(3, "JSON result has no testResults array");
  }
  if (json.success !== true) return fail(4, "vitest reported success=false");
  for (const key of ["numFailedTests", "numPendingTests", "numTodoTests"]) {
    if (json[key] !== 0) return fail(4, `${key} is ${json[key]} (expected 0)`);
  }
  for (const { path: file, minTests } of required) {
    const hits = json.testResults.filter((r) => norm(r?.name).endsWith("/" + file));
    if (hits.length !== 1) return fail(2, `required test file seen ${hits.length} times (expected 1): ${file}`);
    const result = hits[0];
    const tests = Array.isArray(result.assertionResults) ? result.assertionResults : [];
    if (result.status !== "passed") return fail(4, `${file} has status ${result.status}`);
    if (tests.length < minTests) return fail(5, `${file} ran ${tests.length} tests, expected at least ${minTests}`);
    const bad = tests.filter((t) => t?.status !== "passed");
    if (bad.length) return fail(4, `${file}: ${bad.length} test(s) not passed`);
  }
  const total = required.reduce((n, { path: file }) => n + json.testResults.find((r) => norm(r.name).endsWith("/" + file)).assertionResults.length, 0);
  return { ok: true, code: 0, message: `gate passed: ${required.length} required files, ${total} tests, 0 skipped, 0 todo` };
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const out = path.join(tmpdir(), "brwazwneon-preloader-gate.json");
  rmSync(out, { force: true }); // never read a result left by an earlier run
  const vitestBin = path.join(path.dirname(createRequire(import.meta.url).resolve("vitest/package.json")), "vitest.mjs");
  const run = spawnSync(
    process.execPath,
    [vitestBin, "run", ...REQUIRED_TESTS.map((t) => t.path), "--reporter=json", `--outputFile=${out}`],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  );
  const exit = run.status === null ? 11 : run.status; // killed by a signal / failed to start
  const verdict = evaluate(existsSync(out) ? readFileSync(out, "utf8") : null, exit);
  (verdict.ok ? console.log : console.error)(verdict.ok ? verdict.message : `GATE FAILED: ${verdict.message}`);
  rmSync(out, { force: true });
  process.exit(verdict.code);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
