// Embed builder snapshot tests (TESTING.md §2): pure functions, so the
// snapshots ARE the response contract — review diffs like API changes.
import { describe, expect, it } from "vitest";
import { MessageFlags } from "discord-api-types/v10";
import type { Card } from "../data/schema.ts";
import {
  altGalleryResponse,
  banlistResponse,
  cardEffectResponse,
  cardResponse,
  CARD_EFFECT_ID,
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

  it("names the related cards for a mapped choice-restricted card (4.6.1)", () => {
    // The handler resolves partner names and passes them in; the builder
    // renders `Name (ID)`, matching /banlist's format.
    expect(
      cardResponse(
        {
          ...goldramon,
          cardId: "BT20-037",
          name: "Chaosmon: Valdur Arm",
          restriction: "Choice Restriction",
        },
        new Map([
          ["BT17-035", "Taomon"],
          ["EX8-037", "Sakuyamon (X Antibody)"],
        ]),
      ),
    ).toMatchSnapshot();
  });

  it("degrades an unresolved related card to its bare id", () => {
    // No name map at all (or a partner missing from it) → ids still show.
    expect(
      description(
        cardResponse({ ...goldramon, cardId: "EX2-007", restriction: "Choice Restriction" }),
      ),
    ).toBe("⚠️ **Choice restriction** — cannot be in a deck with EX7-064");
    expect(
      description(
        cardResponse(
          {
            ...goldramon,
            cardId: "BT20-037",
            name: "Chaosmon: Valdur Arm",
            restriction: "Choice Restriction",
          },
          new Map([["BT17-035", "Taomon"]]), // EX8-037 unresolved
        ),
      ),
    ).toBe("⚠️ **Choice restriction** — cannot be in a deck with Taomon (BT17-035) or EX8-037");
  });

  it("falls back to generic wording for a choice-restricted card the map doesn't know", () => {
    // goldramon's BT14-018 is not in CHOICE_PARTNERS — a stale map must
    // degrade to less info, never to a wrong pairing.
    expect(description(cardResponse({ ...goldramon, restriction: "Choice Restriction" }))).toBe(
      "⚠️ **Choice restriction** — decks may include only one card from its restriction group",
    );
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

  // Chunk 4.10: the effect text stays off the public image-first embed, but a
  // single button lets a viewer pull it up ephemerally.
  const components = (response: unknown) =>
    (
      response as {
        data: { components?: [{ components: [{ custom_id: string; label: string }] }] };
      }
    ).data.components;

  it("attaches a 'Show effect text' button when the card has effect/inherited text", () => {
    const button = components(cardResponse(goldramon))?.[0].components[0];
    expect(button?.label).toBe("Show effect text");
    expect(button?.custom_id).toBe(`${CARD_EFFECT_ID}:BT14-018`);
  });

  it("omits components entirely when the card has neither effect nor inherited", () => {
    expect(
      components(cardResponse({ ...goldramon, effect: null, inherited: null })),
    ).toBeUndefined();
  });
});

describe("cardEffectResponse", () => {
  type F = { name: string; value: string };
  const flags = (response: unknown): number | undefined =>
    (response as { data: { flags?: number } }).data.flags;
  const fields = (response: unknown) =>
    (response as { data: { embeds: [{ fields: [F, ...F[]] }] } }).data.embeds[0].fields;

  it("is ephemeral and carries the Effect and Inherited/Security fields", () => {
    const response = cardEffectResponse(goldramon);
    expect(flags(response)).toBe(MessageFlags.Ephemeral);
    expect(fields(response).map((f) => f.name)).toEqual(["Effect", "Inherited / Security"]);
    expect(fields(response)[0].value).toContain("Amon of Crimson Flame");
  });

  it("includes only the fields the card actually has", () => {
    expect(
      fields(cardEffectResponse({ ...goldramon, inherited: null })).map((f) => f.name),
    ).toEqual(["Effect"]);
    expect(fields(cardEffectResponse({ ...goldramon, effect: null })).map((f) => f.name)).toEqual([
      "Inherited / Security",
    ]);
  });

  it("truncates an over-limit effect to Discord's 1024 field cap", () => {
    const long = cardEffectResponse({ ...goldramon, effect: "x".repeat(2000) });
    expect(fields(long)[0].value.length).toBeLessThanOrEqual(1024);
    expect(fields(long)[0].value.endsWith("…")).toBe(true);
  });

  it("degrades to an ephemeral note, not an empty embed, when there's no text", () => {
    const response = cardEffectResponse({ ...goldramon, effect: null, inherited: null });
    expect(flags(response)).toBe(MessageFlags.Ephemeral);
    expect((response as { data: { content?: string } }).data.content).toContain("no effect text");
  });
});

describe("banlistResponse", () => {
  // Chunk 4.7. A restricted(-ish) card, minimal fields — /banlist only
  // reads name, cardId, and restriction.
  const restricted = (cardId: string, name: string, restriction: string): Card => ({
    ...goldramon,
    cardId,
    name,
    restriction,
  });

  const description = (response: unknown): string =>
    (response as { data: { embeds: [{ description: string }] } }).data.embeds[0].description;

  it("groups the list into Banned / Restricted / Choice sections, related cards named", () => {
    // Repo order: sorted by card id; sections re-group across it. The
    // choice cards are the real five (production names, 2026-07-07), so
    // this snapshot shows partner ids resolving to `Name (ID)` from the
    // list itself.
    expect(
      banlistResponse([
        restricted("BT17-035", "Taomon", "Choice Restriction"),
        restricted("BT2-089", "Argomon", "Restricted to 1"),
        restricted("BT2-090", "Matt Ishida", "Banned"),
        restricted("BT20-037", "Chaosmon: Valdur Arm", "Choice Restriction"),
        restricted("EX2-007", "Mother D-Reaper", "Choice Restriction"),
        restricted("EX7-064", "Shoto Kazama", "Choice Restriction"),
        restricted("EX8-037", "Sakuyamon (X Antibody)", "Choice Restriction"),
      ]),
    ).toMatchSnapshot();
  });

  it("degrades a partner id missing from the list to the bare id", () => {
    // BT20-037's partners (BT17-035, EX8-037) are absent here — the line
    // must still render, ids unresolved rather than wrong.
    const text = description(
      banlistResponse([restricted("BT20-037", "Chaosmon: Valdur Arm", "Choice Restriction")]),
    );
    expect(text).toContain("• **Chaosmon: Valdur Arm** `BT20-037` — with BT17-035 or EX8-037");
  });

  it("is public and titled with the official-page link", () => {
    const response = banlistResponse([
      restricted("BT2-090", "Matt Ishida", "Banned"),
    ]) as unknown as {
      data: { embeds: [{ title: string; url: string }]; flags?: number };
    };
    expect(response.data.flags).toBeUndefined();
    expect(response.data.embeds[0].title).toBe("Banned & Restricted Cards");
    expect(response.data.embeds[0].url).toContain("en.digimoncard.com/rule/restriction_card");
  });

  it("omits empty sections", () => {
    const text = description(banlistResponse([restricted("BT2-090", "Matt Ishida", "Banned")]));
    expect(text).toContain("**Banned**");
    expect(text).not.toContain("Restricted to 1");
    expect(text).not.toContain("Choice restriction");
  });

  it("degrades a choice card the partner map doesn't know to a bare line", () => {
    const text = description(
      banlistResponse([restricted("ZZ9-001", "Unmapped Choice", "Choice Restriction")]),
    );
    expect(text).toContain("• **Unmapped Choice** `ZZ9-001`");
    expect(text).not.toContain("— with");
    // The section subtitle still explains the rule generically.
    expect(text).toContain("cannot include the related cards");
  });

  it("surfaces an unknown future status as its own raw section", () => {
    expect(
      banlistResponse([restricted("BT9-099", "Quantum Digimon", "Quantum Banned")]),
    ).toMatchSnapshot();
  });

  it("answers gracefully when nothing is restricted", () => {
    expect(banlistResponse([])).toMatchSnapshot();
  });

  it("truncates whole lines under the 4096 cap with a pointer to the official page", () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      restricted(`XX${i}-001`, `Very Long Card Name Number ${i} With Padding`, "Restricted to 1"),
    );
    const text = description(banlistResponse(many));
    expect(text.length).toBeLessThanOrEqual(4096);
    expect(text).toContain("…list truncated");
    // Never cut mid-line: every card line present is complete.
    const lastCardLine = text
      .split("\n")
      .filter((l) => l.startsWith("•"))
      .pop();
    expect(lastCardLine).toMatch(/`XX\d+-001`$/);
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
