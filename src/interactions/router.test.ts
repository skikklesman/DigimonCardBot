// Router unit tests (chunk 2.1) — one suite per branch (TESTING.md §2):
// each interaction type routes correctly; unknown types and unknown command
// names produce a friendly response object, never a throw.
import { describe, expect, it } from "vitest";
import {
  InteractionResponseType,
  MessageFlags,
  type APIInteractionResponse,
} from "discord-api-types/v10";
import { route, type HandlerRegistry } from "./router.ts";

const empty: HandlerRegistry = { commands: {}, autocomplete: {}, components: {} };

const command = (name: string) => ({ type: 2, data: { name } });
const autocomplete = (name: string) => ({ type: 4, data: { name } });
const component = (custom_id: string) => ({ type: 3, data: { custom_id } });

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

describe("route — message components (type 3)", () => {
  it("dispatches to the handler registered for the custom_id namespace", async () => {
    const reply: APIInteractionResponse = {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: { content: "the effect", flags: MessageFlags.Ephemeral },
    };
    const registry: HandlerRegistry = {
      ...empty,
      components: { card: () => Promise.resolve(reply) },
    };
    // custom_id `card:effect:BT14-018` routes on its `card` namespace.
    await expect(route(component("card:effect:BT14-018"), registry)).resolves.toBe(reply);
  });

  it("answers an unregistered namespace with a polite ephemeral message", async () => {
    const content = expectEphemeral(await route(component("nope:go"), empty));
    expect(content).toContain("can't handle");
  });

  it("stays total on a non-string custom_id — parses no namespace, never throws", async () => {
    // A malformed body could carry any type; the namespace parse sits outside
    // the handler try, so a `.split` on a non-string must not escape route().
    const registry: HandlerRegistry = {
      ...empty,
      components: { card: () => Promise.reject(new Error("must not be reached")) },
    };
    const content = expectEphemeral(await route({ type: 3, data: { custom_id: 123 } }, registry));
    expect(content).toContain("can't handle");
  });

  it("catches a throwing component handler and answers with a friendly error", async () => {
    const registry: HandlerRegistry = {
      ...empty,
      components: { card: () => Promise.reject(new Error("D1 exploded")) },
    };
    const content = expectEphemeral(await route(component("card:effect:BT14-018"), registry));
    expect(content).toContain("Something went wrong");
    expect(content).not.toContain("D1 exploded"); // internals stay internal
  });
});

describe("route — error reporting (chunk 4.5)", () => {
  const boom = () => Promise.reject(new Error("D1 exploded"));

  it("reports a throwing command handler with its context, then still degrades friendly", async () => {
    const reported: Array<[string, unknown]> = [];
    const registry: HandlerRegistry = { ...empty, commands: { card: boom } };
    const content = expectEphemeral(
      await route(command("card"), registry, (ctx, err) => reported.push([ctx, err])),
    );
    expect(content).toContain("Something went wrong");
    expect(reported).toHaveLength(1);
    expect(reported[0]![0]).toBe("command /card");
    expect(String(reported[0]![1])).toContain("D1 exploded");
  });

  it("reports a throwing autocomplete handler, still degrading to an empty list", async () => {
    const reported: string[] = [];
    const registry: HandlerRegistry = { ...empty, autocomplete: { card: boom } };
    const res = await route(autocomplete("card"), registry, (ctx) => reported.push(ctx));
    expect((res as { data: { choices: unknown[] } }).data.choices).toEqual([]);
    expect(reported).toEqual(["autocomplete /card"]);
  });

  it("reports a throwing component on the bounded namespace, not the per-card custom_id", async () => {
    // The dedup key must be the namespace so a D1 outage while users click
    // across many cards can't fire one alert per card id (finding #2).
    const reported: string[] = [];
    const registry: HandlerRegistry = { ...empty, components: { card: boom } };
    await route(component("card:effect:BT1-001"), registry, (ctx) => reported.push(ctx));
    await route(component("card:effect:EX5-002"), registry, (ctx) => reported.push(ctx));
    expect(reported).toEqual(["component card", "component card"]);
  });

  it("does not report when nothing throws", async () => {
    const reported: string[] = [];
    const reply: APIInteractionResponse = {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: { content: "ok" },
    };
    const registry: HandlerRegistry = {
      ...empty,
      commands: { card: () => Promise.resolve(reply) },
    };
    await route(command("card"), registry, (ctx) => reported.push(ctx));
    expect(reported).toEqual([]);
  });
});

describe("route — everything else", () => {
  it.each([
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
