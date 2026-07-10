// /card handler unit tests (chunk 2.3): the resolution ladder, exercised
// against an in-memory repo fake — the real repo has its own D1 suite.
import { describe, expect, it } from "vitest";
import type { APIInteractionResponse } from "discord-api-types/v10";
import type { Card } from "../../data/schema.ts";
import type { CardRepo } from "../../data/repo.ts";
import { normalizeSearchName } from "../../data/schema.ts";
import { CARD_EFFECT_ID, CARD_PRINTING_ID } from "../embeds.ts";
import { createCardCommand, createCardComponent } from "./card.ts";
import { createCardAutocomplete } from "../autocomplete.ts";

function card(id: string, name: string, variant = "0", overrides: Partial<Card> = {}): Card {
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
    restriction: null,
    ...overrides,
  };
}

const CARDS = [
  card("BT14-018", "Goldramon"),
  card("EX3-035", "Goldramon"),
  card("EX3-035", "Goldramon", "P1"),
  card("BT16-014", "Goldramon (X Antibody)"),
  card("BT19-078", "ADR-01 Jeri"),
  card("BT1-010", "Agumon"),
  // A real choice-restriction group (4.6.1): the handler resolves the
  // partners' names for the warning line.
  card("BT20-037", "Chaosmon: Valdur Arm", "0", { restriction: "Choice Restriction" }),
  card("BT17-035", "Taomon", "0", { restriction: "Choice Restriction" }),
  card("EX8-037", "Sakuyamon (X Antibody)", "0", { restriction: "Choice Restriction" }),
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
  countSetCards: () => Promise.resolve({ cards: 0, printings: 0 }), // /set-only, unused here
  listRestricted: () => Promise.resolve([]), // /banlist-only, unused here
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

describe("/card choice-restriction line (chunk 4.6.1)", () => {
  const description = (response: APIInteractionResponse): string | undefined =>
    (response as unknown as { data: { embeds: [{ description?: string }] } }).data.embeds[0]
      .description;

  it("names the related cards, resolved via the repo", async () => {
    expect(description(await invoke("BT20-037"))).toBe(
      "⚠️ **Choice restriction** — cannot be in a deck with Taomon (BT17-035) or Sakuyamon (X Antibody) (EX8-037)",
    );
    expect(description(await invoke("EX8-037"))).toBe(
      "⚠️ **Choice restriction** — cannot be in a deck with Chaosmon: Valdur Arm (BT20-037)",
    );
  });

  it("degrades a partner the repo can't find to its bare id", async () => {
    // EX2-007's partner EX7-064 isn't in this fixture — the line renders
    // with the unresolved id rather than failing or lying. listPrintings
    // resolves the card itself; findPrinting (partner lookup) returns null.
    const mother = card("EX2-007", "Mother D-Reaper", "0", { restriction: "Choice Restriction" });
    const withUnknownPartner = createCardCommand({
      ...repo,
      listPrintings: (id) => Promise.resolve(id === "EX2-007" ? [mother] : []),
      findPrinting: () => Promise.resolve(null),
    });
    const response = await withUnknownPartner({
      type: 2,
      data: { name: "card", options: [{ name: "card-name", type: 3, value: "EX2-007" }] },
    } as never);
    expect(description(response)).toBe(
      "⚠️ **Choice restriction** — cannot be in a deck with EX7-064",
    );
  });
});

describe("/card 'Show effect text' button (chunk 4.10)", () => {
  const handleComponent = createCardComponent(repo);
  const click = (custom_id: string) => handleComponent({ type: 3, data: { custom_id } } as never);

  // A card with effect text — the button only appears for these.
  const withEffect = createCardComponent({
    ...repo,
    findPrinting: (id) =>
      Promise.resolve(
        id === "BT1-010"
          ? card("BT1-010", "Agumon", "0", { effect: "[On Play] Draw 1 card." })
          : null,
      ),
  });

  it("looks the card up by the id in the custom_id and returns its effect ephemerally", async () => {
    const response = await withEffect({
      type: 3,
      data: { custom_id: `${CARD_EFFECT_ID}:BT1-010` },
    } as never);
    type F = { name: string; value: string };
    const data = (
      response as unknown as {
        data: { flags: number; embeds: [{ fields: [F, ...F[]] }] };
      }
    ).data;
    expect(data.flags).toBe(64); // MessageFlags.Ephemeral
    expect(data.embeds[0].fields[0].value).toContain("Draw 1 card");
  });

  it("answers with a graceful ephemeral note when the id is no longer in the data", async () => {
    // A stale button (card resynced away) resolves to null — never a throw.
    expect(content(await click(`${CARD_EFFECT_ID}:ZZZ-999`))).toContain("can't find that card");
  });

  it("handles a malformed custom_id (no id segment) without throwing", async () => {
    expect(content(await click(CARD_EFFECT_ID))).toContain("can't find that card");
  });

  it("ignores a different card-namespace action rather than mis-slicing it", async () => {
    // The router hands the whole `card` namespace here; a non-`effect` action
    // (none today, but the namespace is shared) must not be blindly sliced.
    expect(content(await click("card:other:BT1-010"))).toContain("can't find that card");
  });
});

type Btn = { custom_id: string; label: string };
function buttons(response: APIInteractionResponse): Btn[] {
  const rows =
    (response as unknown as { data: { components?: { components: Btn[] }[] } }).data.components ??
    [];
  return rows.flatMap((r) => r.components);
}
const printingButtons = (r: APIInteractionResponse) =>
  buttons(r).filter((b) => b.custom_id.startsWith(`${CARD_PRINTING_ID}:`));

const invokeWith = (options: unknown[]) =>
  handle({ type: 2, data: { name: "card", options } } as never);

describe("/card printing navigation (chunk 4.12)", () => {
  it("adds a single Next button for a 2-printing card (2026-07-10 duplicate-custom_id fix)", async () => {
    // EX3-035 has a base printing and a P1 alt in the fixture. Both wrap
    // directions target the base, so Prev+Next would share one custom_id and
    // Discord would reject the message — one Next button pages the pair.
    const nav = printingButtons(await invoke("EX3-035|P1"));
    expect(nav.map((b) => b.label)).toEqual(["Next ▶"]);
    expect(nav[0]?.custom_id).toBe(`${CARD_PRINTING_ID}:EX3-035:0`);
  });

  it("shows no printing buttons for a single-printing card", async () => {
    expect(printingButtons(await invoke("bt14-018"))).toHaveLength(0);
  });

  it("the alt option jumps straight to that printing", async () => {
    const response = await invokeWith([
      { name: "card-name", type: 3, value: "goldramon" },
      { name: "alt", type: 3, value: "EX3-035|P1" },
    ]);
    expect(embedTitle(response)).toBe("Goldramon — EX3-035 (P1)");
  });

  it("falls back to the card-name when the alt token is malformed", async () => {
    const response = await invokeWith([
      { name: "card-name", type: 3, value: "agumon" },
      { name: "alt", type: 3, value: "not-a-token" },
    ]);
    expect(embedTitle(response)).toBe("Agumon — BT1-010");
  });
});

describe("/card Prev/Next printing pager component (chunk 4.12)", () => {
  const handleComponent = createCardComponent(repo);
  const respType = (r: APIInteractionResponse) => (r as { type: number }).type;
  const flags = (r: APIInteractionResponse) =>
    (r as unknown as { data: { flags?: number } }).data.flags;
  const clickFrom = (custom_id: string, ephemeralSource: boolean) =>
    handleComponent({
      type: 3,
      data: { custom_id },
      message: { flags: ephemeralSource ? 64 : 0 },
    } as never);

  it("from the PUBLIC message: replies with a fresh EPHEMERAL pager (public msg untouched)", async () => {
    const r = await clickFrom(`${CARD_PRINTING_ID}:EX3-035:0`, false);
    expect(respType(r)).toBe(4); // ChannelMessageWithSource, not UpdateMessage
    expect(flags(r)).toBe(64); // ephemeral — no shared-control fighting
    expect(embedTitle(r)).toBe("Goldramon — EX3-035");
  });

  it("from an EPHEMERAL pager: edits it in place (UpdateMessage)", async () => {
    const r = await clickFrom(`${CARD_PRINTING_ID}:EX3-035:1`, true);
    expect(respType(r)).toBe(7); // UpdateMessage
    expect(embedTitle(r)).toBe("Goldramon — EX3-035 (P1)");
  });

  it("wraps/clamps an out-of-range index instead of throwing", async () => {
    // index 99 % 2 printings → 1 (the P1 alt).
    expect(embedTitle(await clickFrom(`${CARD_PRINTING_ID}:EX3-035:99`, false))).toBe(
      "Goldramon — EX3-035 (P1)",
    );
  });

  it("degrades gracefully when the card is gone (resynced away)", async () => {
    expect(content(await clickFrom(`${CARD_PRINTING_ID}:ZZZ-999:0`, false))).toContain(
      "can't find that card",
    );
  });

  it("handles a malformed custom_id (no index segment) without throwing", async () => {
    expect(content(await clickFrom(`${CARD_PRINTING_ID}:EX3-035`, false))).toContain(
      "can't find that card",
    );
  });
});

describe("/card alt option (chunk 4.12)", () => {
  const autocomplete = createCardAutocomplete(repo);
  const altChoices = (cardName: string) =>
    autocomplete({
      type: 4,
      data: {
        name: "card",
        options: [
          { name: "card-name", type: 3, value: cardName },
          { name: "alt", type: 3, focused: true, value: "" },
        ],
      },
    } as never);
  const invokeAlt = (cardName: string, alt: string) =>
    handle({
      type: 2,
      data: {
        name: "card",
        options: [
          { name: "card-name", type: 3, value: cardName },
          { name: "alt", type: 3, value: alt },
        ],
      },
    } as never);

  // TESTING.md §2: "every autocomplete value it hands out must resolve." The
  // alt choices and the /card handler parse the token independently, so prove
  // the formats agree by feeding real choices straight back through /card.
  it("every alt choice value resolves back to that exact printing", async () => {
    const choices = await altChoices("EX3-035|0");
    expect(choices.length).toBeGreaterThan(1);
    for (const choice of choices) {
      const [id, variant] = String(choice.value).split("|");
      const title = embedTitle(await invokeAlt("EX3-035|0", String(choice.value)));
      expect(title).toContain(id!);
      if (variant !== "0") expect(title).toContain(`(${variant})`);
    }
  });

  it("notes the fallback when an alt value can't be matched, instead of dropping it silently (#8)", async () => {
    const response = await invokeAlt("agumon", "not-a-real-token");
    expect(embedTitle(response)).toBe("Agumon — BT1-010"); // fell back to card-name
    expect(content(response)).toContain("couldn't match that printing");
  });

  it("adds no note when the alt option is a clean hit", async () => {
    const response = await invokeAlt("EX3-035|0", "EX3-035|P1");
    expect(embedTitle(response)).toBe("Goldramon — EX3-035 (P1)");
    expect((response as unknown as { data: { content?: string } }).data.content).toBeUndefined();
  });
});

describe("/card D1 query budget (2026-07-10 timeout regression)", () => {
  // The /card critical path must issue exactly ONE D1 read on the common
  // token/id path. Chunk 4.12 briefly made it two (resolve the row, then a
  // separate listPrintings for the Prev/Next nav) — two sequential round-trips
  // to production D1 pushed /card past Discord's 3s limit and it timed out.
  // Counting repo calls proves the single-read profile deterministically.
  function countingRepo() {
    const calls: string[] = [];
    const family = [card("BT14-018", "Goldramon"), card("BT14-018", "Goldramon", "P1")];
    const repo = {
      findPrinting: (id: string, v = "0") => {
        calls.push("findPrinting");
        return Promise.resolve(family.find((c) => c.cardId === id && c.variant === v) ?? null);
      },
      findByValue: (val: string) => {
        calls.push("findByValue");
        const [id, v] = val.split("|");
        return Promise.resolve(family.find((c) => c.cardId === id && c.variant === v) ?? null);
      },
      searchByName: () => {
        calls.push("searchByName");
        return Promise.resolve([family[0]!]);
      },
      listPrintings: (id: string) => {
        calls.push("listPrintings");
        return Promise.resolve(id === "BT14-018" ? family : []);
      },
      listRestricted: () => Promise.resolve([]),
      countSetCards: () => Promise.resolve({ cards: 0, printings: 0 }),
    } as unknown as CardRepo;
    return { repo, calls };
  }
  const run = (repo: CardRepo, value: string) =>
    createCardCommand(repo)({
      type: 2,
      data: { name: "card", options: [{ name: "card-name", type: 3, value }] },
    } as never);

  it("resolves a picked token in a SINGLE D1 round-trip (nav reuses the family)", async () => {
    const { repo, calls } = countingRepo();
    await run(repo, "BT14-018|P1");
    expect(calls).toEqual(["listPrintings"]);
  });

  it("resolves a bare card id in a single D1 round-trip", async () => {
    const { repo, calls } = countingRepo();
    await run(repo, "BT14-018");
    expect(calls).toEqual(["listPrintings"]);
  });
});
