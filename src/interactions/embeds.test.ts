// Embed builder snapshot tests (TESTING.md §2): pure functions, so the
// snapshots ARE the response contract — review diffs like API changes.
import { describe, expect, it } from "vitest";
import type { Card } from "../data/schema.ts";
import {
  altGalleryResponse,
  cardResponse,
  disambiguationResponse,
  notFoundResponse,
} from "./embeds.ts";

const goldramon: Card = {
  cardId: "BT14-018",
  variant: "0",
  name: "Goldramon",
  searchName: "goldramon",
  cardType: "Digimon",
  color: "Red/Yellow",
  level: 6,
  playCost: 12,
  dp: 12000,
  effect: "[On Play] [When Digivolving] Play 1 [Amon of Crimson Flame] Token.",
  inherited: "＜Security A. +1＞",
  setName: "BOOSTER BLAST ACE [BT-14]",
  rarity: "R",
  imageUrl: "https://example.com/BT14-018.webp",
};

const analogYouthP1: Card = {
  cardId: "EX1-066",
  variant: "P1",
  name: "Analog Youth",
  searchName: "analog youth",
  cardType: "Tamer",
  color: "White",
  level: null,
  playCost: 2,
  dp: null,
  effect: "[On Play] Reveal the top 3 cards of your deck.",
  inherited: "[Security] Play this card without paying the cost.",
  setName: "EX-01: Theme Booster Classic Collection",
  rarity: "R",
  imageUrl: "https://example.com/EX1-066_P1.webp",
};

describe("cardResponse", () => {
  it("renders a full Digimon card", () => {
    expect(cardResponse(goldramon)).toMatchSnapshot();
  });

  it("renders an alt-art Tamer, skipping null stats and tagging the variant", () => {
    expect(cardResponse(analogYouthP1)).toMatchSnapshot();
  });

  it("truncates an over-limit effect at Discord's 1024-char field cap", () => {
    const longEffect = "x".repeat(3000);
    const response = cardResponse({ ...goldramon, effect: longEffect });
    const fields = (
      response as unknown as { data: { embeds: [{ fields: { name: string; value: string }[] }] } }
    ).data.embeds[0].fields;
    const effect = fields.find((f) => f.name === "Effect");
    expect(effect?.value.length).toBe(1024);
    expect(effect?.value.endsWith("…")).toBe(true);
  });
});

describe("disambiguationResponse", () => {
  it("lists matches ephemerally with IDs to retry with", () => {
    expect(
      disambiguationResponse("goldramon", [
        goldramon,
        { ...goldramon, cardId: "EX3-035", setName: "EX-03" },
        { ...goldramon, cardId: "BT16-014", name: "Goldramon (X Antibody)" },
      ]),
    ).toMatchSnapshot();
  });

  it("caps the list and counts the remainder", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      ...goldramon,
      cardId: `BT${i}-001`,
    }));
    const response = disambiguationResponse("goldramon", many);
    const content = (response as { data: { content: string } }).data.content;
    expect(content).toContain("…and 4 more.");
  });

  it("neutralizes markdown and mention characters in the echoed query", () => {
    const response = disambiguationResponse("**@everyone** `boom`", [goldramon, analogYouthP1]);
    const content = (response as { data: { content: string } }).data.content;
    expect(content).not.toContain("@everyone");
    expect(content).not.toContain("`boom`");
  });
});

describe("altGalleryResponse", () => {
  it("renders one image-first embed per printing", () => {
    expect(
      altGalleryResponse([
        { ...analogYouthP1, variant: "0", imageUrl: "https://example.com/EX1-066.webp" },
        analogYouthP1,
        { ...analogYouthP1, variant: "P2", imageUrl: "https://example.com/EX1-066_P2.webp" },
      ]),
    ).toMatchSnapshot();
  });

  it("caps at Discord's 10-embed limit and says so", () => {
    const many = Array.from({ length: 13 }, (_, i) => ({
      ...analogYouthP1,
      variant: `P${i}`,
    }));
    const response = altGalleryResponse(many);
    const data = (response as unknown as { data: { content: string; embeds: unknown[] } }).data;
    expect(data.embeds).toHaveLength(10);
    expect(data.content).toContain("showing 10 of 13");
  });
});

describe("notFoundResponse", () => {
  it("is friendly, ephemeral, and suggests next steps", () => {
    expect(notFoundResponse("zzzznotacard")).toMatchSnapshot();
  });
});
