// /card handler unit tests (chunk 2.3): the resolution ladder, exercised
// against an in-memory repo fake — the real repo has its own D1 suite.
import { describe, expect, it } from "vitest";
import type { APIInteractionResponse } from "discord-api-types/v10";
import type { Card } from "../../data/schema.ts";
import type { CardRepo } from "../../data/repo.ts";
import { normalizeSearchName } from "../../data/schema.ts";
import { createCardCommand } from "./card.ts";

function card(id: string, name: string, variant = "0"): Card {
  return {
    cardId: id,
    variant,
    name,
    searchName: normalizeSearchName(name),
    cardType: "Digimon",
    color: "Red",
    level: 6,
    playCost: 12,
    dp: 12000,
    effect: null,
    inherited: null,
    setName: "TEST",
    rarity: "R",
    imageUrl: null,
  };
}

const CARDS = [
  card("BT14-018", "Goldramon"),
  card("EX3-035", "Goldramon"),
  card("EX3-035", "Goldramon", "P1"),
  card("BT16-014", "Goldramon (X Antibody)"),
  card("BT19-078", "ADR-01 Jeri"),
  card("BT1-010", "Agumon"),
];

// In-memory CardRepo with the same semantics as the D1 one.
const repo: CardRepo = {
  findPrinting: (id, variant = "0") =>
    Promise.resolve(CARDS.find((c) => c.cardId === id && c.variant === variant) ?? null),
  findByValue(value) {
    const [id, variant] = value.split("|");
    if (!id || !variant || value.split("|").length !== 2) return Promise.resolve(null);
    return this.findPrinting(id, variant);
  },
  searchByName: (query) => {
    const prefix = normalizeSearchName(query);
    if (prefix === "") return Promise.resolve([]);
    return Promise.resolve(
      CARDS.filter((c) => c.variant === "0" && c.searchName.startsWith(prefix)),
    );
  },
  listPrintings: (id) => Promise.resolve(CARDS.filter((c) => c.cardId === id)),
  countSetCards: () => Promise.resolve({ cards: 0, printings: 0 }), // /release-only, unused here
};

const handle = createCardCommand(repo);

const invoke = (value?: string) =>
  handle({
    type: 2,
    data: {
      name: "card",
      options: value === undefined ? [] : [{ name: "card-name", type: 3, value }],
    },
  } as never);

function content(response: APIInteractionResponse): string {
  return (response as unknown as { data: { content: string } }).data.content;
}

function embedTitle(response: APIInteractionResponse): string {
  return (response as unknown as { data: { embeds: [{ title: string }] } }).data.embeds[0].title;
}

describe("/card resolution ladder", () => {
  it("resolves a picked autocomplete token to that exact printing", async () => {
    expect(embedTitle(await invoke("EX3-035|P1"))).toBe("Goldramon — EX3-035 (P1)");
  });

  it("tells the user when a token has gone stale instead of guessing", async () => {
    expect(content(await invoke("ZZZ-999|P7"))).toContain("No cards found");
  });

  it("resolves a card id, case-insensitively", async () => {
    expect(embedTitle(await invoke("bt14-018"))).toBe("Goldramon — BT14-018");
  });

  it("falls back to name search when an id-shaped value is really a name prefix", async () => {
    // "ADR-01" matches the id pattern but no card has that id — it's the
    // start of the name "ADR-01 Jeri" (HANDOFF §6.4 edge case).
    expect(embedTitle(await invoke("ADR-01"))).toBe("ADR-01 Jeri — BT19-078");
  });

  it("returns the card directly on a single name match", async () => {
    expect(embedTitle(await invoke("agumon"))).toBe("Agumon — BT1-010");
  });

  it("disambiguates multiple name matches with their ids", async () => {
    const text = content(await invoke("goldramon"));
    expect(text).toContain("BT14-018");
    expect(text).toContain("EX3-035");
    expect(text).toContain("BT16-014");
  });

  it("answers a miss with the friendly not-found message", async () => {
    expect(content(await invoke("zzzznotacard"))).toContain("No cards found");
  });

  it("guards against a missing option (synthetic payloads only)", async () => {
    expect(content(await invoke())).toContain("provide a card name");
  });
});
