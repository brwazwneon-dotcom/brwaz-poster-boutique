import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The in-memory index must be loaded with ONE query and reused: that is what removes the
// per-keystroke database work. The database is mocked here (no real I/O).
const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/neon.server", () => ({
  // db-catalog.server calls sql()(text) for the index load
  sql: () => (text: string) => db.query(text),
}));

import { fetchSearchPostersFromDb, resetSearchIndexCacheForTests } from "./db-catalog.server";

const row = (id: string, title: string, cat: string, parent: string | null = null) => ({
  id,
  title,
  image_url: `https://img.test/${id}.jpg`,
  category_id: `c-${cat}`,
  category_slug: cat.toLowerCase(),
  category_name: cat,
  category_name_ar: null,
  parent_name: parent,
  parent_name_ar: null,
  tags: null,
  badge: null,
  views_count: 0,
});
const ROWS = [
  row("1", "SPIDER (1)", "MARVEL"),
  row("2", "SPIDER MAN (2)", "MARVEL"),
  row("3", "JOKER (1)", "JOKER", "MOVIES"),
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
  resetSearchIndexCacheForTests();
  db.query.mockReset().mockResolvedValue(ROWS);
});
afterEach(() => vi.useRealTimers());

describe("search server: one cached index, not a query per search", () => {
  it("six keystroke-style searches cost ONE database query", async () => {
    for (const q of ["sp", "spi", "spid", "spide", "spider", "spider man"]) {
      await fetchSearchPostersFromDb(q, 8);
    }
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it("concurrent searches share the single in-flight load", async () => {
    const all = await Promise.all(
      Array.from({ length: 12 }, () => fetchSearchPostersFromDb("joker", 8)),
    );
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(all.every((r) => r[0].title === "JOKER (1)")).toBe(true);
  });

  it("empty and too-short queries never touch the database", async () => {
    expect(await fetchSearchPostersFromDb("", 8)).toEqual([]);
    expect(await fetchSearchPostersFromDb("s", 8)).toEqual([]);
    expect(await fetchSearchPostersFromDb("  !  ", 8)).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("after 30 seconds the old index answers INSTANTLY while ONE background refresh runs", async () => {
    await fetchSearchPostersFromDb("spider", 8);
    vi.setSystemTime(Date.now() + 29_000);
    await fetchSearchPostersFromDb("spider", 8);
    expect(db.query).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 2_000);
    db.query.mockResolvedValue([row("9", "THOR (1)", "MARVEL")]);
    // stale answer (no THOR yet), refresh started in the background — and shared by concurrent searches
    const stale = await fetchSearchPostersFromDb("thor", 8);
    await Promise.all([fetchSearchPostersFromDb("thor", 8), fetchSearchPostersFromDb("thor", 8)]);
    expect(stale).toEqual([]);
    expect(db.query).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5);
    const fresh = await fetchSearchPostersFromDb("thor", 8);
    expect(fresh[0].title).toBe("THOR (1)");
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it("an index older than 5 minutes is not served: the request waits for the refresh", async () => {
    await fetchSearchPostersFromDb("spider", 8);
    vi.setSystemTime(Date.now() + 6 * 60_000);
    db.query.mockResolvedValue([row("9", "THOR (1)", "MARVEL")]);
    const hits = await fetchSearchPostersFromDb("thor", 8);
    expect(hits[0].title).toBe("THOR (1)");
  });

  it("if a refresh fails, the last good index keeps answering (no error page)", async () => {
    await fetchSearchPostersFromDb("spider", 8);
    vi.setSystemTime(Date.now() + 40_000);
    db.query.mockRejectedValue(new Error("db down"));
    const hits = await fetchSearchPostersFromDb("spider", 8);
    expect(hits.length).toBeGreaterThan(0);
  });

  it("the very first load failing surfaces the error (nothing stale to serve)", async () => {
    db.query.mockRejectedValue(new Error("db down"));
    await expect(fetchSearchPostersFromDb("spider", 8)).rejects.toThrow("db down");
    // and the next attempt retries instead of caching the failure
    db.query.mockResolvedValue(ROWS);
    expect((await fetchSearchPostersFromDb("spider", 8)).length).toBeGreaterThan(0);
  });

  it("the index query only reads visible posters with valid images and respects show_in_search; the user text is never in SQL", async () => {
    await fetchSearchPostersFromDb("spider'; drop table posters;--", 8);
    const text = String(db.query.mock.calls[0][0]);
    expect(text).toContain("p.hidden = false");
    expect(text).toContain("migration_status in ('not_applicable', 'migrated')");
    expect(text).toContain("show_in_search");
    expect(text).not.toContain("drop table");
    expect(text).not.toMatch(/spider/i);
  });

  it("limits are enforced on the server too", async () => {
    db.query.mockResolvedValue(
      Array.from({ length: 300 }, (_, i) => row(String(i), `SPIDER (${i})`, "MARVEL")),
    );
    expect((await fetchSearchPostersFromDb("spider", 100000)).length).toBeLessThanOrEqual(120);
    expect((await fetchSearchPostersFromDb("spider", 8)).length).toBe(8);
  });
});
