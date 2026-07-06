// /alt handler unit tests (chunk 3.2) against an in-memory repo fake.
import { describe, expect, it } from "vitest";
import type { APIInteractionResponse } from "discord-api-types/v10";
import type { CardRepo } from "../../data/repo";
import type { Card } from "../../data/schema";
import { normalizeSearchName } from "../../data/schema";
import { createAltCommand } from "./alt";

function card(id: string, name: string, variant = "0"): Card {
  return {
    cardId: id,
    variant,
    name,
    searchName: normalizeSearchName(name),
    cardType: "Tamer",
    color: "White",
    level: null,
    playCost: 2,
    dp: null,
    effect: null,
    inherited: null,
    setName: variant === "0" ? "EX-01" : `ALT SET ${variant}`,
    rarity: "R",
    imageUrl: `https://example.com/${id}_${variant}.webp`,
  };
}

const CARDS = [
  card("EX1-066", "Analog Youth"),
  card("EX1-066", "Analog Youth", "P1"),
  card("EX1-066", "Analog Youth", "P2"),
  card("BT1-010", "Agumon"),
  card("BT14-018", "Goldramon"),
  card("EX3-035", "Goldramon"),
];

const repo: CardRepo = {
  findPrinting: (id, variant = "0") =>
    Promise.resolve(CARDS.find((c) => c.cardId === id && c.variant === variant) ?? null),
  findByValue(value) {
    const parts = value.split("|");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return Promise.resolve(null);
    return this.findPrinting(parts[0], parts[1]);
  },
  searchByName: (query) => {
    const prefix = normalizeSearchName(query);
    if (prefix === "") return Promise.resolve([]);
    return Promise.resolve(
      CARDS.filter((c) => c.variant === "0" && c.searchName.startsWith(prefix)),
    );
  },
  listPrintings: (id) => Promise.resolve(CARDS.filter((c) => c.cardId === id)),
};

const handle = createAltCommand(repo);

const invoke = (value: string) =>
  handle({
    type: 2,
    data: { name: "alt", options: [{ name: "card-name", type: 3, value }] },
  } as never);

type Loose = { data: { content?: string; embeds?: Array<{ title: string }>; flags?: number } };
const loose = (r: APIInteractionResponse) => (r as unknown as Loose).data;

describe("/alt", () => {
  it("shows the full printing gallery for a card with alt-arts", async () => {
    const data = loose(await invoke("analog youth"));
    expect(data.content).toContain("3 printings");
    expect(data.embeds?.map((e) => e.title)).toEqual([
      "Analog Youth — EX1-066 · base printing",
      "Analog Youth — EX1-066 · alt-art P1",
      "Analog Youth — EX1-066 · alt-art P2",
    ]);
  });

  it("resolves a picked alt-art token to the whole family", async () => {
    const data = loose(await invoke("EX1-066|P2"));
    expect(data.embeds).toHaveLength(3);
  });

  it("tells the user when a card has no alt-arts (ephemeral)", async () => {
    const data = loose(await invoke("agumon"));
    expect(data.content).toContain("no alt-art printings");
    expect(data.flags).toBe(64);
  });

  it("disambiguates multi-match names like /card does", async () => {
    const data = loose(await invoke("goldramon"));
    expect(data.content).toContain("Found 2 cards");
  });

  it("answers a miss with the friendly not-found", async () => {
    const data = loose(await invoke("zzzznotacard"));
    expect(data.content).toContain("No cards found");
  });
});
