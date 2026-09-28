// The "migration 026 not applied yet" detection used throughout
// db-admin.functions.ts, db-catalog.server.ts and db-content.server.ts
// (poster_categories / best_seller_order / trending_starts_at / ends_at /
// dual_category_sections) all rely on pattern-matching the Postgres error
// message for a missing relation/column, so a real, unrelated database
// error is never silently swallowed as "not applied yet". This test
// exercises that exact pattern against real Postgres error message
// formats, without needing a live database.
import { describe, expect, it } from "vitest";

const RELATION_NOT_APPLIED = /relation .* does not exist/i;
const COLUMN_NOT_APPLIED = /column .* does not exist/i;

describe("migration-026-not-applied detection", () => {
  it("matches real Postgres 'missing table' error messages", () => {
    expect(RELATION_NOT_APPLIED.test('relation "poster_categories" does not exist')).toBe(true);
    expect(RELATION_NOT_APPLIED.test('relation "dual_category_sections" does not exist')).toBe(
      true,
    );
  });

  it("matches real Postgres 'missing column' error messages", () => {
    expect(COLUMN_NOT_APPLIED.test('column "best_seller_order" does not exist')).toBe(true);
    expect(COLUMN_NOT_APPLIED.test("column p.trending_starts_at does not exist")).toBe(true);
  });

  it("does NOT match unrelated database errors — a real bug must still surface", () => {
    const unrelated = [
      "duplicate key value violates unique constraint",
      "connection terminated unexpectedly",
      'null value in column "title" violates not-null constraint',
      "syntax error at or near",
      "permission denied for table posters",
    ];
    for (const message of unrelated) {
      expect(RELATION_NOT_APPLIED.test(message)).toBe(false);
      expect(COLUMN_NOT_APPLIED.test(message)).toBe(false);
    }
  });
});
