// Input fuzzing for the request path (chunk 4.5, TESTING.md §2). The router is
// total by contract; this proves that contract holds when hostile option
// VALUES reach the real handlers — the layer the type-level router tests don't
// exercise. Every malformed payload and every nasty card-name string must
// resolve to a valid interaction response, never throw, never reject.
import { describe, expect, it } from "vitest";
import type { APIInteractionResponse } from "discord-api-types/v10";
import { route } from "./router.ts";
import { buildRegistry } from "../index.ts";
import type { CardRepo } from "../data/repo.ts";
import {
  HOSTILE_STRINGS,
  MALFORMED_AUTOCOMPLETE,
  MALFORMED_COMMANDS,
  MALFORMED_COMPONENTS,
  MALFORMED_TOPLEVEL,
} from "../../test/fixtures/fuzz-inputs.ts";

// A repo that never throws and never matches: the fuzz target is the input
// path, not the data — every lookup cleanly returns "nothing here".
const fakeRepo: CardRepo = {
  findPrinting: async () => null,
  findByValue: async () => null,
  searchByName: async () => [],
  listPrintings: async () => [],
  listRestricted: async () => [],
  countSetCards: async () => ({ cards: 0, printings: 0 }),
};

// Drive the REAL production registry (not a hand-built subset) so every wired
// command is fuzzed automatically — this is what would have caught the
// /keyword + /set `.trim()` hole (chunk 4.5 finding #4).
const registry = buildRegistry(fakeRepo);

/** A response is well-formed enough if it carries a numeric interaction type. */
function expectValidResponse(response: APIInteractionResponse): void {
  expect(response).toBeTruthy();
  expect(typeof (response as { type: unknown }).type).toBe("number");
}

describe("fuzz — malformed interaction payloads never throw", () => {
  it.each(MALFORMED_TOPLEVEL.map((p, i) => [i, p] as const))(
    "top-level shape #%i resolves to a valid response",
    async (_i, payload) => {
      expectValidResponse(await route(payload, registry));
    },
  );

  it.each(MALFORMED_COMMANDS.map((p, i) => [i, p] as const))(
    "malformed command #%i resolves to a valid response",
    async (_i, payload) => {
      expectValidResponse(await route(payload, registry));
    },
  );

  it.each(MALFORMED_COMPONENTS.map((p, i) => [i, p] as const))(
    "malformed component #%i resolves to a valid response",
    async (_i, payload) => {
      expectValidResponse(await route(payload, registry));
    },
  );

  it.each(MALFORMED_AUTOCOMPLETE.map((p, i) => [i, p] as const))(
    "malformed autocomplete #%i resolves to a valid response",
    async (_i, payload) => {
      const res = await route(payload, registry);
      expectValidResponse(res);
      // Autocomplete must always answer with a (possibly empty) choice list.
      expect((res as { data?: { choices?: unknown[] } }).data?.choices).toBeInstanceOf(Array);
    },
  );
});

describe("fuzz — hostile option values reach the handlers safely", () => {
  const cardCommand = (value: string) => ({
    type: 2,
    data: { name: "card", options: [{ name: "card-name", type: 3, value }] },
  });
  // The 4.12 alt option — its value flows into repo.findByValue on the /card
  // command path; card-name is a fixed sibling so the alt path is what's fuzzed.
  const cardWithAlt = (alt: unknown) => ({
    type: 2,
    data: {
      name: "card",
      options: [
        { name: "card-name", type: 3, value: "goldramon" },
        { name: "alt", type: 3, value: alt },
      ],
    },
  });
  const cardAutocomplete = (value: string) => ({
    type: 4,
    data: { name: "card", options: [{ name: "card-name", type: 3, focused: true, value }] },
  });
  // The 4.12 alt-focused autocomplete: alt is focused, card-name is the sibling
  // it reads cross-option — both sides are attacker-controlled.
  const altAutocomplete = (cardName: unknown, alt: unknown) => ({
    type: 4,
    data: {
      name: "card",
      options: [
        { name: "card-name", type: 3, value: cardName },
        { name: "alt", type: 3, focused: true, value: alt },
      ],
    },
  });
  const optionCommand = (name: string, optionName: string, value: unknown) => ({
    type: 2,
    data: { name, options: [{ name: optionName, type: 3, value }] },
  });
  const expectChoiceArray = (res: APIInteractionResponse) => {
    expectValidResponse(res);
    expect((res as { data?: { choices?: unknown[] } }).data?.choices).toBeInstanceOf(Array);
  };

  it.each(HOSTILE_STRINGS.map((s, i) => [i, s] as const))(
    "/card with hostile card-name #%i resolves to a valid response",
    async (_i, value) => {
      expectValidResponse(await route(cardCommand(value), registry));
    },
  );

  it.each(HOSTILE_STRINGS.map((s, i) => [i, s] as const))(
    "/card with hostile alt value #%i resolves to a valid response (into findByValue)",
    async (_i, value) => {
      expectValidResponse(await route(cardWithAlt(value), registry));
    },
  );

  it.each(HOSTILE_STRINGS.map((s, i) => [i, s] as const))(
    "/keyword with hostile value #%i resolves to a valid response",
    async (_i, value) => {
      expectValidResponse(await route(optionCommand("keyword", "term", value), registry));
    },
  );

  it.each(HOSTILE_STRINGS.map((s, i) => [i, s] as const))(
    "/set with hostile value #%i resolves to a valid response",
    async (_i, value) => {
      expectValidResponse(await route(optionCommand("set", "set", value), registry));
    },
  );

  it("a non-string option value never throws (the shared guarded extractor)", async () => {
    expectValidResponse(await route(optionCommand("keyword", "term", 42), registry));
    expectValidResponse(await route(optionCommand("set", "set", 42), registry));
    expectValidResponse(await route(cardWithAlt(42), registry));
  });

  it.each(HOSTILE_STRINGS.map((s, i) => [i, s] as const))(
    "/card card-name autocomplete with hostile value #%i answers with a choice array",
    async (_i, value) => {
      expectChoiceArray(await route(cardAutocomplete(value), registry));
    },
  );

  it.each(HOSTILE_STRINGS.map((s, i) => [i, s] as const))(
    "/card alt autocomplete with hostile alt value #%i answers with a choice array",
    async (_i, value) => {
      expectChoiceArray(await route(altAutocomplete("goldramon", value), registry));
    },
  );

  it.each(HOSTILE_STRINGS.map((s, i) => [i, s] as const))(
    "/card alt autocomplete with hostile sibling card-name #%i answers with a choice array",
    async (_i, value) => {
      expectChoiceArray(await route(altAutocomplete(value, ""), registry));
    },
  );

  it("alt autocomplete tolerates non-string values on either option", async () => {
    expectChoiceArray(await route(altAutocomplete(42, 42), registry));
  });
});
