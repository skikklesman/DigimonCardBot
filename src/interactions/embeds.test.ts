// Embed builder snapshot tests (TESTING.md §2): pure functions, so the
// snapshots ARE the response contract — review diffs like API changes.
import { describe, expect, it } from "vitest";
import type { Card } from "../data/schema.ts";
import {
  altGalleryResponse,
  cardResponse,
  disambiguationResponse,
  notFoundResponse,
  releaseResponse,
} from "./embeds.ts";
import type { ReleaseSet } from "../data/releases.ts";

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

describe("releaseResponse", () => {
  const blastAce: ReleaseSet = {
    code: "BT-14",
    name: "Blast Ace",
    product: "Booster",
    releasedEN: "2023-11-17",
  };
  const NOW = new Date("2026-07-06T12:00:00Z");

  it("renders a released set with its live tally", () => {
    expect(releaseResponse(blastAce, { cards: 104, printings: 118 }, NOW)).toMatchSnapshot();
  });

  it("renders an upcoming set: future phrasing, no cards yet", () => {
    const upcoming: ReleaseSet = {
      code: "BT-26",
      name: "Timeless Bonds",
      product: "Booster",
      releasedEN: "2026-09-04",
    };
    expect(releaseResponse(upcoming, { cards: 0, printings: 0 }, NOW)).toMatchSnapshot();
  });

  it("renders a month-precision announcement date", () => {
    const announced: ReleaseSet = {
      code: "LM-09",
      name: "Distancia Cero",
      product: "Limited Card Pack",
      releasedEN: "2026-11",
    };
    expect(releaseResponse(announced, { cards: 0, printings: 0 }, NOW)).toMatchSnapshot();
  });

  it("omits the tally entirely when counts are unavailable (null)", () => {
    const data = (
      releaseResponse(blastAce, null, NOW) as unknown as {
        data: { embeds: Array<{ fields: Array<{ name: string }> }> };
      }
    ).data;
    expect(data.embeds[0]?.fields.map((f) => f.name)).toEqual(["Product", "English release"]);
  });
});
