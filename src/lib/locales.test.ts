import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ar from "./locales/ar.json";
import en from "./locales/en.json";

function flat(d: Record<string, unknown>, p = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(d)) {
    if (v && typeof v === "object")
      Object.assign(out, flat(v as Record<string, unknown>, `${p}${k}.`));
    else out[`${p}${k}`] = String(v);
  }
  return out;
}
const fa = flat(ar);
const fe = flat(en);

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "admin" || name === "ui") continue; // admin has its own dictionary (admin-i18n)
      sourceFiles(p, acc);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) && !name.startsWith("admin"))
      acc.push(p);
  }
  return acc;
}

describe("storefront locales", () => {
  it("every t('section.key') without an inline default exists in both ar and en", () => {
    const missing = new Set<string>();
    for (const f of sourceFiles("src")) {
      const s = readFileSync(f, "utf8");
      for (const m of s.matchAll(/\bt\(\s*["']([A-Za-z0-9_.-]+)["']\s*(,\s*(["'`{])?)?/g)) {
        const key = m[1];
        const hasDefault = !!m[3] && "\"'`".includes(m[3]);
        if (!key.includes(".") || hasDefault || /^(shell|appearance)\./.test(key)) continue;
        if (!(key in fa) || !(key in fe)) missing.add(key);
      }
    }
    expect([...missing].sort()).toEqual([]);
  });

  it("uses i18next {{placeholders}}, never single-brace {placeholders} (they render literally)", () => {
    const bad = (m: Record<string, string>) =>
      Object.entries(m)
        .filter(([, v]) => /(?<!\{)\{\w+\}(?!\})/.test(v))
        .map(([k]) => k);
    expect(bad(fa)).toEqual([]);
    expect(bad(fe)).toEqual([]);
  });

  it("ar and en use the same placeholder names for shared keys", () => {
    const names = (v: string) =>
      [...v.matchAll(/\{\{(\w+)\}\}/g)]
        .map((m) => m[1])
        .sort()
        .join(",");
    const diff = Object.keys(fe).filter((k) => k in fa && names(fe[k]) !== names(fa[k]));
    expect(diff).toEqual([]);
  });
});
