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

describe("fuzz — hostile card-name values reach the handlers safely", () => {
  const cardCommand = (value: string) => ({
    type: 2,
    data: { name: "card", options: [{ name: "card-name", type: 3, value }] },
  });
  const altCommand = (value: string) => ({
    type: 2,
    data: { name: "alt", options: [{ name: "card-name", type: 3, value }] },
  });
  const cardAutocomplete = (value: string) => ({
    type: 4,
    data: { name: "card", options: [{ name: "card-name", type: 3, focused: true, value }] },
  });

  it.each(HOSTILE_STRINGS.map((s, i) => [i, s] as const))(
    "/card with hostile value #%i resolves to a valid response",
    async (_i, value) => {
      expectValidResponse(await route(cardCommand(value), registry));
    },
  );

  it.each(HOSTILE_STRINGS.map((s, i) => [i, s] as const))(
    "/alt with hostile value #%i resolves to a valid response",
    async (_i, value) => {
      expectValidResponse(await route(altCommand(value), registry));
    },
  );

  // /keyword (option "term") and /set (option "set") share the guarded
  // extractor; a non-string value must NOT throw (regression guard for #1).
  const optionCommand = (name: string, optionName: string, value: unknown) => ({
    type: 2,
    data: { name, options: [{ name: optionName, type: 3, value }] },
  });

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

  it("a non-string option value does not throw for /keyword or /set (finding #1)", async () => {
    expectValidResponse(await route(optionCommand("keyword", "term", 42), registry));
    expectValidResponse(await route(optionCommand("set", "set", 42), registry));
  });

  it.each(HOSTILE_STRINGS.map((s, i) => [i, s] as const))(
    "/card autocomplete with hostile value #%i answers with a choice array",
    async (_i, value) => {
      const res = await route(cardAutocomplete(value), registry);
      expectValidResponse(res);
      expect((res as { data?: { choices?: unknown[] } }).data?.choices).toBeInstanceOf(Array);
    },
  );
});
