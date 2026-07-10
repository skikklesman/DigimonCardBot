// Autocomplete handler unit tests (chunk 3.1): choice construction against
// an in-memory repo fake. The full type-4 round-trip lives in index.test.ts.
import { describe, expect, it } from "vitest";
import type { CardRepo } from "../data/repo.ts";
import type { Card } from "../data/schema.ts";
import { normalizeSearchName } from "../data/schema.ts";
import { createCardAutocomplete } from "./autocomplete.ts";

function card(id: string, name: string): Card {
  return {
    cardId: id,
    variant: "0",
    name,
    searchName: normalizeSearchName(name),
    cardType: "Digimon",
    color: "Red",
    level: 6,
    playCost: 12,
    dp: 12000,
    effect: null,
    inherited: null,
    setName: "BOOSTER BLAST ACE [BT-14]",
    rarity: "R",
    imageUrl: null,
    restriction: null,
  };
}

// Ordered the way the real repo orders: by search_name, then card_id.
const CARDS = [
  card("BT14-018", "Goldramon"),
  card("EX3-035", "Goldramon"),
  card("BT16-014", "Goldramon (X Antibody)"),
];

const repo = {
  searchByName: (query: string, limit = 25) => {
    const prefix = normalizeSearchName(query);
    if (prefix === "") return Promise.resolve([]);
    return Promise.resolve(CARDS.filter((c) => c.searchName.startsWith(prefix)).slice(0, limit));
  },
} as CardRepo;

const handle = createCardAutocomplete(repo);

const invoke = (typed?: string) =>
  handle({
    type: 4,
    data: {
      name: "card",
      options:
        typed === undefined ? [] : [{ name: "card-name", type: 3, value: typed, focused: true }],
    },
  } as never);

describe("/card autocomplete", () => {
  it("builds Name (CARD-ID) labels with card_id|variant values", async () => {
    await expect(invoke("goldr")).resolves.toEqual([
      { name: "Goldramon (BT14-018)", value: "BT14-018|0" },
      { name: "Goldramon (EX3-035)", value: "EX3-035|0" },
      { name: "Goldramon (X Antibody) (BT16-014)", value: "BT16-014|0" },
    ]);
  });

  it("keeps exact full-name matches ahead of extensions (repo ordering)", async () => {
    const choices = await invoke("goldramon");
    expect(choices[0]?.name).toBe("Goldramon (BT14-018)");
    expect(choices.at(-1)?.name).toContain("X Antibody");
  });

  it("returns no choices before the user has typed anything", async () => {
    await expect(invoke("")).resolves.toEqual([]);
    await expect(invoke("   ")).resolves.toEqual([]);
    await expect(invoke(undefined)).resolves.toEqual([]);
  });

  it("caps labels at Discord's 100-char limit", async () => {
    const longName = "X".repeat(120);
    const longRepo = {
      searchByName: () => Promise.resolve([card("BT1-001", longName)]),
    } as unknown as CardRepo;
    const [choice] = await createCardAutocomplete(longRepo)(
      (await Promise.resolve({
        type: 4,
        data: {
          name: "card",
          options: [{ name: "card-name", type: 3, value: "x", focused: true }],
        },
      })) as never,
    );
    expect(choice?.name).toHaveLength(100);
  });
});

describe("/card alt-option autocomplete (chunk 4.12)", () => {
  // EX3-035 has a base printing and a P1 alt; the alt option offers both.
  const printings = [
    { ...card("EX3-035", "Goldramon"), setName: "BOOSTER 3" },
    { ...card("EX3-035", "Goldramon"), variant: "P1", setName: "EX-03" },
  ];
  const altRepo = {
    findByValue: (value: string) => {
      const [id, variant] = value.split("|");
      if (!id || !variant) return Promise.resolve(null);
      return Promise.resolve(
        printings.find((p) => p.cardId === id && p.variant === variant) ?? null,
      );
    },
    findPrinting: (id: string, variant = "0") =>
      Promise.resolve(printings.find((p) => p.cardId === id && p.variant === variant) ?? null),
    searchByName: (query: string) => {
      const prefix = normalizeSearchName(query);
      return Promise.resolve(
        prefix === "" ? [] : CARDS.filter((c) => c.searchName.startsWith(prefix)),
      );
    },
    listPrintings: (id: string) => Promise.resolve(printings.filter((p) => p.cardId === id)),
  } as unknown as CardRepo;

  const altHandle = createCardAutocomplete(altRepo);
  const altInvoke = (cardName: string) =>
    altHandle({
      type: 4,
      data: {
        name: "card",
        options: [
          { name: "card-name", type: 3, value: cardName },
          { name: "alt", type: 3, value: "", focused: true },
        ],
      },
    } as never);

  it("offers the picked card's printings when card-name resolves to one card", async () => {
    const choices = await altInvoke("EX3-035|0"); // a resolved autocomplete token
    expect(choices.map((c) => c.value)).toEqual(["EX3-035|0", "EX3-035|P1"]);
    expect(choices[0]?.name).toContain("Base printing");
    expect(choices[1]?.name).toContain("Alt-art P1");
  });

  it("offers nothing while card-name is still ambiguous (pick the card first)", async () => {
    // "goldramon" matches three cards → no single card to expand.
    await expect(altInvoke("goldramon")).resolves.toEqual([]);
  });

  it("offers nothing when card-name is empty", async () => {
    await expect(altInvoke("")).resolves.toEqual([]);
  });
});
