// Integration tests for the versioned load + atomic flip (chunk 1.5),
// against the real local D1 (TESTING.md §3): happy path, idempotent re-run,
// mid-load failure leaving the live version untouched, and version GC.
import { env } from "cloudflare:test";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Card } from "../data/schema.ts";
import { getActiveVersion, getLiveCardCount, loadNewVersion } from "./load.ts";

function card(id: string, variant = "0", overrides: Partial<Card> = {}): Card {
  return {
    cardId: id,
    variant,
    name: `Card ${id}`,
    searchName: `card ${id.toLowerCase()}`,
    cardType: "Digimon",
    color: "Red",
    level: 3,
    playCost: 3,
    dp: 2000,
    effect: "[On Play] Test effect.",
    inherited: null,
    setName: "TEST SET",
    rarity: "C",
    imageUrl: `https://example.com/${id}.webp`,
    ...overrides,
  };
}

const batch = (n: number) => Array.from({ length: n }, (_, i) => card(`BT1-${100 + i}`));

/** The canonical read every lookup will use: filtered on the live pointer. */
async function servedCardIds(): Promise<string[]> {
  const { results } = await env.DB.prepare(
    `SELECT card_id FROM cards
     WHERE version = (SELECT value FROM meta WHERE key = 'active_version')
     ORDER BY card_id`,
  ).all<{ card_id: string }>();
  return results.map((r) => r.card_id);
}

async function resetDb(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM cards"),
    env.DB.prepare("UPDATE meta SET value = '0' WHERE key = 'active_version'"),
    env.DB.prepare("DELETE FROM meta WHERE key = 'last_successful_sync'"),
  ]);
}

describe("loadNewVersion", () => {
  beforeEach(resetDb);
  // Leave the DB exactly as the migration seeded it, whatever file runs next.
  afterAll(resetDb);

  it("first sync: loads under version 1, flips the pointer, records the sync time", async () => {
    const now = new Date("2026-07-05T12:00:00Z");
    const result = await loadNewVersion(env.DB, batch(12), { now });

    expect(result).toEqual({ version: 1, loaded: 12, duplicatesCollapsed: 0 });
    await expect(getActiveVersion(env.DB)).resolves.toBe(1);
    await expect(getLiveCardCount(env.DB)).resolves.toBe(12);
    await expect(servedCardIds()).resolves.toHaveLength(12);

    const sync = await env.DB.prepare(
      "SELECT value FROM meta WHERE key = 'last_successful_sync'",
    ).first<{ value: string }>();
    expect(sync?.value).toBe("2026-07-05T12:00:00.000Z");
  });

  it("stores variants as separate rows of the same card", async () => {
    await loadNewVersion(env.DB, [card("EX1-066"), card("EX1-066", "P1"), card("EX1-066", "P2")]);
    const { results } = await env.DB.prepare(
      `SELECT variant FROM cards
       WHERE version = (SELECT value FROM meta WHERE key = 'active_version')
         AND card_id = 'EX1-066' ORDER BY variant`,
    ).all<{ variant: string }>();
    expect(results.map((r) => r.variant)).toEqual(["0", "P1", "P2"]);
  });

  it("re-running the sync converges: next version, identical served dataset", async () => {
    const cards = batch(10);
    await loadNewVersion(env.DB, cards);
    const firstServed = await servedCardIds();

    const second = await loadNewVersion(env.DB, cards);
    expect(second.version).toBe(2);
    await expect(getActiveVersion(env.DB)).resolves.toBe(2);
    await expect(servedCardIds()).resolves.toEqual(firstServed);
  });

  it("collapses duplicate (card_id, variant) keys instead of failing the upsert", async () => {
    const twice = [card("BT1-100"), card("BT1-100"), card("BT1-101")];
    const result = await loadNewVersion(env.DB, twice);
    expect(result).toMatchObject({ loaded: 2, duplicatesCollapsed: 1 });
    await expect(servedCardIds()).resolves.toEqual(["BT1-100", "BT1-101"]);
  });

  it("refuses an empty batch outright", async () => {
    await expect(loadNewVersion(env.DB, [])).rejects.toThrow(/empty batch/);
  });

  it("CORE PROMISE: a mid-load failure leaves the live version fully served and the pointer unmoved", async () => {
    await loadNewVersion(env.DB, batch(8)); // live dataset, version 1
    const before = await servedCardIds();

    // 10 good cards + a NOT NULL violation at the end; tiny chunks (4 rows
    // per db.batch call) force earlier batches to commit before the failure.
    const poisoned = [...batch(10), card("BT9-999", "0", { name: null as unknown as string })];
    await expect(
      loadNewVersion(env.DB, poisoned, { rowsPerStatement: 2, statementsPerBatch: 2 }),
    ).rejects.toThrow();

    // The failed attempt DID stage rows under version 2 …
    const staged = await env.DB.prepare("SELECT COUNT(*) AS n FROM cards WHERE version = 2").first<{
      n: number;
    }>();
    expect(staged?.n).toBeGreaterThan(0);
    // … but readers see none of it: pointer unmoved, old dataset intact.
    await expect(getActiveVersion(env.DB)).resolves.toBe(1);
    await expect(servedCardIds()).resolves.toEqual(before);

    // A corrected retry succeeds: staging leftovers are cleared first, so
    // the count verification stays exact (idempotent re-run, Defense 3).
    const retry = await loadNewVersion(env.DB, batch(10), {
      rowsPerStatement: 2,
      statementsPerBatch: 2,
    });
    expect(retry).toMatchObject({ version: 2, loaded: 10 });
    await expect(servedCardIds()).resolves.toHaveLength(10);
  });

  it("GC keeps exactly the active and prior versions after repeated syncs", async () => {
    await loadNewVersion(env.DB, batch(5));
    await loadNewVersion(env.DB, batch(6));
    await loadNewVersion(env.DB, batch(7));

    const { results } = await env.DB.prepare(
      "SELECT DISTINCT version FROM cards ORDER BY version",
    ).all<{ version: number }>();
    expect(results.map((r) => r.version)).toEqual([2, 3]);
    await expect(getActiveVersion(env.DB)).resolves.toBe(3);
    // rollback insurance: the prior version is complete, not a remnant
    const prior = await env.DB.prepare("SELECT COUNT(*) AS n FROM cards WHERE version = 2").first<{
      n: number;
    }>();
    expect(prior?.n).toBe(6);
  });
});
