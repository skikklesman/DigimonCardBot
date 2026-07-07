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
  upcomingReleasesResponse,
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
  restriction: null,
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
  restriction: null,
};

describe("cardResponse", () => {
  it("renders image-first: title, accent color, image, set footer — no stat fields", () => {
    expect(cardResponse(goldramon)).toMatchSnapshot();
  });

  it("tags the variant in an alt-art title", () => {
    expect(cardResponse(analogYouthP1)).toMatchSnapshot();
  });

  // Chunk 4.6: the restriction warning is the one fact the card image
  // cannot show. Wording per owner call 2026-07-07 (DECISIONS.md).
  const description = (response: unknown): string | undefined =>
    (response as { data: { embeds: [{ description?: string }] } }).data.embeds[0].description;

  it("flags a banned card in the description line", () => {
    expect(cardResponse({ ...goldramon, restriction: "Banned" })).toMatchSnapshot();
  });

  it("flags a restricted card in the description line", () => {
    expect(cardResponse({ ...goldramon, restriction: "Restricted to 1" })).toMatchSnapshot();
  });

  it("flags a choice-restricted card with the generic group wording", () => {
    expect(cardResponse({ ...goldramon, restriction: "Choice Restriction" })).toMatchSnapshot();
  });

  it("shows nothing for unrestricted (null) and 'Not released' cards", () => {
    expect(description(cardResponse(goldramon))).toBeUndefined();
    expect(
      description(cardResponse({ ...goldramon, restriction: "Not released" })),
    ).toBeUndefined();
  });

  it("surfaces an unrecognized future restriction value raw rather than hiding it", () => {
    expect(description(cardResponse({ ...goldramon, restriction: "Quantum Banned" }))).toBe(
      "⚠️ **Quantum Banned**",
    );
  });

  it("degrades to a title-only embed when image and set name are missing", () => {
    const bare = cardResponse({ ...goldramon, imageUrl: null, setName: null });
    const embed = (
      bare as unknown as {
        data: { embeds: [{ title: string; image?: unknown; footer?: unknown }] };
      }
    ).data.embeds[0];
    expect(embed.title).toBe("Goldramon — BT14-018");
    expect(embed.image).toBeUndefined();
    expect(embed.footer).toBeUndefined();
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

describe("upcomingReleasesResponse", () => {
  const NOW = new Date("2026-07-07T12:00:00Z");
  const sets: ReleaseSet[] = [
    { code: "BT-25", name: "Dual Revolution", product: "Booster", releasedEN: "2026-05-22" },
    { code: "LM-09", name: "Distancia Cero", product: "Limited Card Pack", releasedEN: "2026-11" },
    { code: "BT-26", name: "Timeless Bonds", product: "Booster", releasedEN: "2026-09-04" },
    { code: "LM-08", name: "Final Crest", product: "Limited Card Pack", releasedEN: "2026-08" },
  ];

  const description = (response: unknown): string =>
    (response as { data: { embeds: [{ description: string }] } }).data.embeds[0].description;

  it("lists only future sets, soonest first, mixing day and month precision", () => {
    expect(upcomingReleasesResponse(sets, NOW)).toMatchSnapshot();
  });

  it("counts a set releasing today as upcoming", () => {
    const today = {
      code: "EX-99",
      name: "Today Set",
      product: "Booster",
      releasedEN: "2026-07-07",
    };
    expect(description(upcomingReleasesResponse([today], NOW))).toContain("Today Set");
  });

  it("keeps a month-only announcement listed through its whole month", () => {
    const thisMonth = {
      code: "EX-98",
      name: "This Month",
      product: "Booster",
      releasedEN: "2026-07",
    };
    expect(description(upcomingReleasesResponse([thisMonth], NOW))).toContain("This Month");
  });

  it("excludes released sets and yesterday's dates", () => {
    const yesterday = {
      code: "EX-97",
      name: "Yesterday",
      product: "Booster",
      releasedEN: "2026-07-06",
    };
    const text = description(upcomingReleasesResponse([...sets, yesterday], NOW));
    expect(text).not.toContain("Dual Revolution");
    expect(text).not.toContain("Yesterday");
  });

  it("answers gracefully when nothing is upcoming", () => {
    expect(upcomingReleasesResponse([], NOW)).toMatchSnapshot();
  });
});
