// Integration tests for chunk 1.1: the migrated D1 schema (HANDOFF §5)
// running in the real local D1 via the Workers vitest pool. Migrations are
// applied by test/setup/apply-migrations.ts before this file runs.
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

describe("D1 schema (migration 0001)", () => {
  // The v0.18 Workers pool has no per-test isolated storage: tests in a file
  // share one local D1. Reset the cards table so tests stay order-independent.
  // (Fine here — this is test cleanup on local D1, not the HANDOFF §8 live-data
  // anti-pattern.)
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM cards").run();
  });

  it("seeds meta.active_version at 0", async () => {
    const row = await env.DB.prepare("SELECT value FROM meta WHERE key = 'active_version'").first<{
      value: string;
    }>();
    expect(row?.value).toBe("0");
  });

  it("starts with an empty cards table", async () => {
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM cards").first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it("has the search index on (version, search_name)", async () => {
    const row = await env.DB.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_cards_search'",
    ).first<{ sql: string }>();
    expect(row?.sql).toContain("cards(version, search_name)");
  });

  it("enforces (version, card_id, variant) as the primary key", async () => {
    const insert = env.DB.prepare(
      "INSERT INTO cards (version, card_id, variant, name, search_name) VALUES (?, ?, ?, ?, ?)",
    );
    await insert.bind(1, "EX1-066", "0", "Goldramon", "goldramon").run();
    // Same printing under the same version → rejected.
    await expect(insert.bind(1, "EX1-066", "0", "Goldramon", "goldramon").run()).rejects.toThrow(
      /UNIQUE|PRIMARY/i,
    );
    // Same printing under the NEXT version → allowed. This coexistence is
    // what the version-pointer sync design depends on (HANDOFF §5).
    await expect(
      insert.bind(2, "EX1-066", "0", "Goldramon", "goldramon").run(),
    ).resolves.toBeTruthy();
  });

  it("keeps not-yet-promoted versions invisible to active-version reads", async () => {
    // Simulate a sync mid-load: rows exist under version 1, but the pointer
    // still says 0. The canonical read query must return nothing.
    await env.DB.prepare(
      "INSERT INTO cards (version, card_id, variant, name, search_name) VALUES (1, 'EX1-066', '0', 'Goldramon', 'goldramon')",
    ).run();
    const { results } = await env.DB.prepare(
      `SELECT * FROM cards
       WHERE version = (SELECT value FROM meta WHERE key = 'active_version')
         AND search_name LIKE ?`,
    )
      .bind("goldr%")
      .all();
    expect(results).toEqual([]);
  });
});
