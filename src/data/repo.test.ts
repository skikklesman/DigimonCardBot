// Repository integration tests (chunk 2.2) against seeded local D1
// (TESTING.md §3). Seeding goes through the tested sync loader so the data
// arrives exactly the way production data will.
import { env } from "cloudflare:test";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Card } from "./schema";
import { loadNewVersion } from "../sync/load";
import { createRepo } from "./repo";

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
