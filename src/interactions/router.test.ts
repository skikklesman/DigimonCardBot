// Router unit tests (chunk 2.1) — one suite per branch (TESTING.md §2):
// each interaction type routes correctly; unknown types and unknown command
// names produce a friendly response object, never a throw.
import { describe, expect, it } from "vitest";
import {
  InteractionResponseType,
  MessageFlags,
  type APIInteractionResponse,
} from "discord-api-types/v10";
import { route, type HandlerRegistry } from "./router";

const empty: HandlerRegistry = { commands: {}, autocomplete: {} };

const command = (name: string) => ({ type: 2, data: { name } });
const autocomplete = (name: string) => ({ type: 4, data: { name } });

function expectEphemeral(response: APIInteractionResponse): string {
  expect(response.type).toBe(InteractionResponseType.ChannelMessageWithSource);
  const data = (response as { data: { content: string; flags: number } }).data;
  expect(data.flags).toBe(MessageFlags.Ephemeral);
  return data.content;
}

describe("route — PING", () => {
  it("answers PING with PONG", async () => {
    await expect(route({ type: 1 }, empty)).resolves.toEqual({
      type: InteractionResponseType.Pong,
    });
  });
});

describe("route — commands (type 2)", () => {
  it("dispatches to the registered handler by name", async () => {
    const reply: APIInteractionResponse = {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: { content: "a card!" },
    };
    const registry: HandlerRegistry = {
      ...empty,
      commands: { card: () => Promise.resolve(reply) },
    };
    await expect(route(command("card"), registry)).resolves.toBe(reply);
  });

  it("answers an unknown command with a polite ephemeral message", async () => {
    const content = expectEphemeral(await route(command("nope"), empty));
    expect(content).toContain("don't know that command");
  });

  it("catches a throwing handler and answers with a friendly error", async () => {
    const registry: HandlerRegistry = {
      ...empty,
      commands: {
        card: () => Promise.reject(new Error("D1 exploded")),
      },
    };
    const content = expectEphemeral(await route(command("card"), registry));
    expect(content).toContain("Something went wrong");
    expect(content).not.toContain("D1 exploded"); // internals stay internal
  });
});

describe("route — autocomplete (type 4)", () => {
  it("wraps handler choices in an autocomplete result", async () => {
    const registry: HandlerRegistry = {
      ...empty,
      autocomplete: {
        card: () => Promise.resolve([{ name: "Goldramon (BT-14)", value: "BT14-018|0" }]),
      },
    };
    await expect(route(autocomplete("card"), registry)).resolves.toEqual({
      type: InteractionResponseType.ApplicationCommandAutocompleteResult,
      data: { choices: [{ name: "Goldramon (BT-14)", value: "BT14-018|0" }] },
    });
  });

  it("caps choices at Discord's limit of 25", async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ name: `c${i}`, value: `v${i}` }));
    const registry: HandlerRegistry = {
      ...empty,
      autocomplete: { card: () => Promise.resolve(many) },
    };
    const response = await route(autocomplete("card"), registry);
    const data = (response as { data: { choices: unknown[] } }).data;
    expect(data.choices).toHaveLength(25);
  });

  it("answers an unregistered autocomplete with an empty list, not an error", async () => {
    await expect(route(autocomplete("nope"), empty)).resolves.toEqual({
      type: InteractionResponseType.ApplicationCommandAutocompleteResult,
      data: { choices: [] },
    });
  });

  it("degrades a throwing autocomplete handler to an empty list (never deferred, never an error)", async () => {
    const registry: HandlerRegistry = {
      ...empty,
      autocomplete: {
        card: () => Promise.reject(new Error("timeout")),
      },
    };
    await expect(route(autocomplete("card"), registry)).resolves.toEqual({
      type: InteractionResponseType.ApplicationCommandAutocompleteResult,
      data: { choices: [] },
    });
  });
});

describe("route — everything else", () => {
  it.each([
    ["message component (type 3)", { type: 3, data: { custom_id: "x" } }],
    ["modal submit (type 5)", { type: 5 }],
    ["future interaction type", { type: 99 }],
    ["missing type", { data: {} }],
    ["null body", null],
    ["string body", "hello"],
  ])("answers %s with a polite ephemeral message", async (_label, body) => {
    const content = expectEphemeral(await route(body, empty));
    expect(content).toContain("can't handle");
  });
});
