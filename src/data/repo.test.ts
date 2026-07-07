// Repository integration tests (chunk 2.2) against seeded local D1
// (TESTING.md §3). Seeding goes through the tested sync loader so the data
// arrives exactly the way production data will.
import { env } from "cloudflare:test";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Card } from "./schema.ts";
import { loadNewVersion } from "../sync/load.ts";
import { createRepo, SEARCH_BY_NAME_SQL } from "./repo.ts";

function card(id: string, name: string, variant = "0", overrides: Partial<Card> = {}): Card {
  return {
    cardId: id,
    variant,
    name,
    searchName: name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim(),
    cardType: "Digimon",
    color: "Red",
    level: 6,
    playCost: 12,
    dp: 12000,
    effect: "[On Play] Test.",
    inherited: null,
    setName: "TEST SET",
    rarity: "R",
    imageUrl: `https://example.com/${id}_${variant}.webp`,
    ...overrides,
  };
}

const SEED: Card[] = [
  card("BT14-018", "Goldramon"),
  card("EX3-035", "Goldramon"),
  card("EX3-035", "Goldramon", "P1"),
  card("BT16-014", "Goldramon (X Antibody)"),
  card("BT1-010", "Agumon"),
  card("EX1-066", "Analog Youth", "0", { cardType: "Tamer" }),
  card("EX1-066", "Analog Youth", "P1", { cardType: "Tamer" }),
  card("EX1-066", "Analog Youth", "P2", { cardType: "Tamer" }),
];

const repo = createRepo(env.DB);

async function resetDb(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM cards"),
    env.DB.prepare("UPDATE meta SET value = '0' WHERE key = 'active_version'"),
    env.DB.prepare("DELETE FROM meta WHERE key = 'last_successful_sync'"),
  ]);
}

describe("CardRepo", () => {
  beforeEach(async () => {
    await resetDb();
    await loadNewVersion(env.DB, SEED); // live as version 1
  });
  afterAll(resetDb);

  describe("findPrinting", () => {
    it("returns the base printing by default", async () => {
      const found = await repo.findPrinting("EX1-066");
      expect(found).toMatchObject({ cardId: "EX1-066", variant: "0", name: "Analog Youth" });
    });

    it("returns a specific variant when asked", async () => {
      const found = await repo.findPrinting("EX1-066", "P2");
      expect(found?.imageUrl).toBe("https://example.com/EX1-066_P2.webp");
    });

    it("returns null for unknown ids and unknown variants", async () => {
      await expect(repo.findPrinting("ZZZ-999")).resolves.toBeNull();
      await expect(repo.findPrinting("EX1-066", "P9")).resolves.toBeNull();
    });
  });

  describe("findByValue (card_id|variant tokens)", () => {
    it("resolves a well-formed token to that exact printing", async () => {
      const found = await repo.findByValue("EX3-035|P1");
      expect(found).toMatchObject({ cardId: "EX3-035", variant: "P1" });
    });

    it("returns null for free text and malformed tokens (handler falls back to search)", async () => {
      for (const input of ["goldramon", "EX1-066", "a|b|c", "|", "EX1-066|", "|0", ""]) {
        await expect(repo.findByValue(input)).resolves.toBeNull();
      }
    });

    it("returns null for a well-formed token that matches nothing", async () => {
      await expect(repo.findByValue("ZZZ-999|0")).resolves.toBeNull();
    });
  });

  describe("searchByName", () => {
    it("prefix-matches on the normalized name, one row per card", async () => {
      const found = await repo.searchByName("goldr");
      expect(found.map((c) => c.cardId).sort()).toEqual(["BT14-018", "BT16-014", "EX3-035"]);
      expect(found.every((c) => c.variant === "0")).toBe(true);
    });

    it("normalizes punctuated queries exactly like stored names", async () => {
      const found = await repo.searchByName("Goldramon (X Antibody)");
      expect(found.map((c) => c.cardId)).toEqual(["BT16-014"]);
    });

    it("respects the limit", async () => {
      const found = await repo.searchByName("goldr", 2);
      expect(found).toHaveLength(2);
    });

    it("returns [] for no matches and for queries that normalize to nothing", async () => {
      await expect(repo.searchByName("zzzznotacard")).resolves.toEqual([]);
      await expect(repo.searchByName("()!&")).resolves.toEqual([]);
      // LIKE metacharacters are stripped by normalization, not interpreted:
      // '%' alone must NOT match the whole table.
      await expect(repo.searchByName("%")).resolves.toEqual([]);
    });

    it("does not bleed past the prefix range (adjacent names excluded)", async () => {
      // "golds…" sorts right after every "goldr…" string — a sloppy upper
      // bound would sweep it in.
      await loadNewVersion(env.DB, [...SEED, card("XX9-001", "Goldsmith")]);
      const found = await repo.searchByName("goldr");
      expect(found.some((c) => c.cardId === "XX9-001")).toBe(false);
      // …and the exact-prefix card itself is included, not fenced out.
      expect(found.map((c) => c.cardId)).toContain("BT14-018");
    });

    it("QUERY PLAN PIN: the search narrows on the (version, search_name) index", async () => {
      // The autocomplete hot path must be an index RANGE on search_name —
      // not a filter over every row of the active version. D1 bills row
      // reads: a full-version scan is ~8.4k reads per keystroke and blows
      // the free tier at ~600 autocomplete queries/day (DECISIONS.md
      // 2026-07-06). If this fails, the query shape regressed.
      const { results } = await env.DB.prepare(`EXPLAIN QUERY PLAN ${SEARCH_BY_NAME_SQL}`)
        .bind("goldr", "goldr{", 25)
        .all<{ detail: string }>();
      const cardsStep = results.find((r) => r.detail.includes("idx_cards_search"));
      expect(cardsStep?.detail).toContain("search_name>");
      expect(cardsStep?.detail).toContain("search_name<");
    });
  });

  describe("listPrintings", () => {
    it("returns every variant of a card in variant order", async () => {
      const printings = await repo.listPrintings("EX1-066");
      expect(printings.map((c) => c.variant)).toEqual(["0", "P1", "P2"]);
    });

    it("returns [] for an unknown card", async () => {
      await expect(repo.listPrintings("ZZZ-999")).resolves.toEqual([]);
    });
  });

  describe("countSetCards (/release live tally)", () => {
    // SEED gives EX1-066 (setName "TEST SET") three printings; retag two
    // cards into a bracketed set string like upstream's.
    const tagged = () =>
      loadNewVersion(env.DB, [
        ...SEED.map((c) =>
          c.cardId.startsWith("EX3")
            ? { ...c, setName: "▹THEME BOOSTER DRAGONIC ROAR [EX-03]" }
            : c,
        ),
      ]);

    it("counts distinct cards and total printings for a matcher", async () => {
      await tagged();
      // EX3-035 has a base + P1 printing — one card, two printings.
      await expect(repo.countSetCards(["[EX-03]"])).resolves.toEqual({
        cards: 1,
        printings: 2,
      });
    });

    it("ORs multiple matchers together", async () => {
      await tagged();
      const both = await repo.countSetCards(["[EX-03]", "TEST SET"]);
      expect(both.printings).toBe(SEED.length);
    });

    it("returns zeros for no match and for an empty matcher list (no query)", async () => {
      await expect(repo.countSetCards(["[ZZ-99]"])).resolves.toEqual({ cards: 0, printings: 0 });
      await expect(repo.countSetCards([])).resolves.toEqual({ cards: 0, printings: 0 });
    });

    it("only counts the active version", async () => {
      await env.DB.prepare(
        `INSERT INTO cards (version, card_id, variant, name, search_name, set_name)
         VALUES (99, 'ZZ9-001', '0', 'Staged', 'staged', 'STAGED SET [ZZ-99]')`,
      ).run();
      await expect(repo.countSetCards(["[ZZ-99]"])).resolves.toEqual({ cards: 0, printings: 0 });
    });
  });

  describe("version isolation", () => {
    it("never returns rows from a staged, unpromoted version", async () => {
      // Stage a doppelganger dataset under version 2 without flipping.
      await env.DB.prepare(
        `INSERT INTO cards (version, card_id, variant, name, search_name)
         VALUES (2, 'BT99-001', '0', 'Goldramon Staged', 'goldramon staged')`,
      ).run();

      const search = await repo.searchByName("goldramon");
      expect(search.some((c) => c.cardId === "BT99-001")).toBe(false);
      await expect(repo.findPrinting("BT99-001")).resolves.toBeNull();
      await expect(repo.findByValue("BT99-001|0")).resolves.toBeNull();
      await expect(repo.listPrintings("BT99-001")).resolves.toEqual([]);
    });
  });
});
