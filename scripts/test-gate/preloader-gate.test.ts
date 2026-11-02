// The gate's own decision logic: every way a run can be wrong must fail, only a complete clean run passes.
import { describe, expect, it } from "vitest";
import { evaluate, REQUIRED_TESTS } from "./preloader-gate.mjs";

const req = [
  { path: "src/a.test.ts", minTests: 2 },
  { path: "src/b.test.tsx", minTests: 3 },
];
const tests = (n: number, status = "passed") => Array.from({ length: n }, () => ({ status }));
const file = (p: string, n: number, status = "passed") => ({ name: "C:\\repo\\" + p.split("/").join("\\"), status, assertionResults: tests(n) });
const good = () => ({
  success: true,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0,
  testResults: [file("src/a.test.ts", 2), file("src/b.test.tsx", 3)],
});
const run = (json: unknown, exit = 0) => evaluate(typeof json === "string" || json === null ? (json as string | null) : JSON.stringify(json), exit, req);

describe("preloader test gate decision", () => {
  it("passes a complete clean run (Windows or POSIX paths)", () => {
    expect(run(good()).ok).toBe(true);
    const posix = good();
    posix.testResults = [
      { ...file("src/a.test.ts", 2), name: "/repo/src/a.test.ts" },
      { ...file("src/b.test.tsx", 3), name: "/repo/src/b.test.tsx" },
    ];
    expect(run(posix).ok).toBe(true);
  });

  it("fails when either required file is missing from the results", () => {
    for (const drop of [0, 1]) {
      const j = good();
      j.testResults.splice(drop, 1);
      const v = run(j);
      expect(v.ok).toBe(false);
      expect(v.code).toBe(2);
    }
  });

  it("fails when a required file appears twice", () => {
    const j = good();
    j.testResults.push(file("src/a.test.ts", 2));
    expect(run(j).code).toBe(2);
  });

  it("does not match a file whose name only ends the same way", () => {
    const j = good();
    j.testResults[0] = { ...file("src/a.test.ts", 2), name: "C:\\repo\\src\\other-a.test.ts" };
    expect(run(j).code).toBe(2);
  });

  it("fails on a Vitest process failure, whatever the JSON says", () => {
    expect(run(good(), 1).code).toBe(10);
    expect(run(good(), 11).code).toBe(10);
  });

  it("fails on missing, empty, truncated or wrongly shaped JSON", () => {
    expect(run(null).code).toBe(3);
    expect(run("").code).toBe(3);
    expect(run('{"testResults":[').code).toBe(3);
    expect(run({}).code).toBe(3);
    expect(run([]).code).toBe(3);
    expect(run("null").code).toBe(3);
    expect(run({ ...good(), testResults: "nope" }).code).toBe(3);
  });

  it("fails on skipped tests, todo tests and failed tests", () => {
    for (const key of ["numPendingTests", "numTodoTests", "numFailedTests"] as const) {
      const j = { ...good(), [key]: 1 };
      expect(run(j).code).toBe(4);
    }
    const skipped = good();
    skipped.testResults[1].assertionResults = [...tests(2), { status: "skipped" }];
    expect(run(skipped).code).toBe(4);
    expect(run({ ...good(), success: false }).code).toBe(4);
    const failedFile = good();
    failedFile.testResults[0].status = "failed";
    expect(run(failedFile).code).toBe(4);
  });

  it("fails when a file runs fewer tests than its minimum (and when it has none)", () => {
    const fewer = good();
    fewer.testResults[1].assertionResults = tests(2);
    expect(run(fewer).code).toBe(5);
    const none = good();
    none.testResults[0].assertionResults = [];
    expect(run(none).code).toBe(5);
  });

  it("allows more tests than the minimum", () => {
    const j = good();
    j.testResults[0].assertionResults = tests(9);
    expect(run(j).ok).toBe(true);
  });

  it("requires the two preloader test files with positive minimums", () => {
    expect(REQUIRED_TESTS.map((t) => t.path).sort()).toEqual(["src/components/AppPreloader.test.tsx", "src/lib/hydration-ready.test.ts"]);
    for (const t of REQUIRED_TESTS) expect(t.minTests).toBeGreaterThan(0);
  });
});
