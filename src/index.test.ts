// Integration tests for the interaction endpoint: the full HTTP surface as
// Discord sees it, running inside workerd via SELF — signature check,
// routing, and (since 2.3) the /card read path against seeded local D1.
import { env, SELF } from "cloudflare:test";
import { afterAll, describe, expect, it } from "vitest";
import { signedInteraction, signedRawBody } from "../test/helpers/discord-sign.ts";
import { loadNewVersion } from "./sync/load.ts";
import { normalizeSearchName } from "./data/schema.ts";

const ENDPOINT = "https://example.com/interactions";

describe("interaction endpoint", () => {
  it("rejects an unsigned POST with 401", async () => {
    const res = await SELF.fetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({ type: 1 }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a signed-then-tampered body with 401", async () => {
    const init = await signedInteraction({ type: 1 });
    const res = await SELF.fetch(ENDPOINT, { ...init, body: JSON.stringify({ type: 2 }) });
    expect(res.status).toBe(401);
  });

  it("answers a signed PING with PONG", async () => {
    const res = await SELF.fetch(ENDPOINT, await signedInteraction({ type: 1 }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    await expect(res.json()).resolves.toEqual({ type: 1 });
  });

  it("rejects a correctly signed but malformed JSON body with 400", async () => {
    // Signature verification covers raw bytes and runs BEFORE parsing —
    // valid-signature-invalid-JSON must land in the parse guard, not a throw.
    const res = await SELF.fetch(ENDPOINT, await signedRawBody("{not json"));
    expect(res.status).toBe(400);
  });

  it("routes a verified command interaction (unknown command → polite ephemeral)", async () => {
    const res = await SELF.fetch(
      ENDPOINT,
      await signedInteraction({ type: 2, data: { name: "not-a-command" } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { type: number; data: { content: string; flags: number } };
    expect(body.type).toBe(4); // CHANNEL_MESSAGE_WITH_SOURCE
    expect(body.data.flags).toBe(64); // ephemeral
    expect(body.data.content).toContain("don't know that command");
  });

  describe("full /card read path (seeded D1)", () => {
    // Two Goldramon printings make "goldramon" a multi-match; Analog Youth
    // is the single-hit free-text case.
    const goldramon = (cardId: string) => ({
      cardId,
      variant: "0",
      name: "Goldramon",
      searchName: normalizeSearchName("Goldramon"),
      cardType: "Digimon",
      color: "Yellow",
      level: 6,
      playCost: 12,
      dp: 12000,
      effect: null,
      inherited: null,
      setName: null,
      rarity: "SR",
      imageUrl: `https://example.com/${cardId}.webp`,
    });
    const seed = () =>
      loadNewVersion(env.DB, [
        {
          cardId: "EX1-066",
          variant: "0",
          name: "Analog Youth",
          searchName: normalizeSearchName("Analog Youth"),
          cardType: "Tamer",
          color: "White",
          level: null,
          playCost: 2,
          dp: null,
          effect: "[On Play] Reveal the top 3 cards of your deck.",
          inherited: "[Security] Play this card without paying the cost.",
          setName: "EX-01",
          rarity: "R",
          imageUrl: "https://example.com/EX1-066.webp",
        },
        goldramon("BT14-018"),
        goldramon("EX3-035"),
      ]);

    afterAll(async () => {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM cards"),
        env.DB.prepare("UPDATE meta SET value = '0' WHERE key = 'active_version'"),
        env.DB.prepare("DELETE FROM meta WHERE key = 'last_successful_sync'"),
      ]);
    });

    it("answers a signed /card interaction with the card embed", async () => {
      await seed();
      const res = await SELF.fetch(
        ENDPOINT,
        await signedInteraction({
          type: 2,
          data: {
            name: "card",
            options: [{ name: "card-name", type: 3, value: "EX1-066" }],
          },
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        type: number;
        data: { embeds: [{ title: string; image: { url: string } }] };
      };
      expect(body.type).toBe(4);
      expect(body.data.embeds[0].title).toBe("Analog Youth — EX1-066");
      expect(body.data.embeds[0].image.url).toBe("https://example.com/EX1-066.webp");
    });

    it("answers a signed autocomplete interaction with prefix-matched choices", async () => {
      await seed();
      const res = await SELF.fetch(
        ENDPOINT,
        await signedInteraction({
          type: 4,
          data: {
            name: "card",
            options: [{ name: "card-name", type: 3, value: "analog", focused: true }],
          },
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        type: number;
        data: { choices: Array<{ name: string; value: string }> };
      };
      expect(body.type).toBe(8); // APPLICATION_COMMAND_AUTOCOMPLETE_RESULT
      expect(body.data.choices).toEqual([{ name: "Analog Youth (EX1-066)", value: "EX1-066|0" }]);
    });

    it("answers free text with a single name match as the card embed (TESTING.md §3)", async () => {
      await seed();
      const res = await SELF.fetch(
        ENDPOINT,
        await signedInteraction({
          type: 2,
          data: {
            name: "card",
            options: [{ name: "card-name", type: 3, value: "analog you" }],
          },
        }),
      );
      const body = (await res.json()) as { data: { embeds: [{ title: string }] } };
      expect(body.data.embeds[0].title).toBe("Analog Youth — EX1-066");
    });

    it("disambiguates a multi-match name with the candidate ids, ephemerally", async () => {
      await seed();
      const res = await SELF.fetch(
        ENDPOINT,
        await signedInteraction({
          type: 2,
          data: {
            name: "card",
            options: [{ name: "card-name", type: 3, value: "goldramon" }],
          },
        }),
      );
      const body = (await res.json()) as { data: { content: string; flags: number } };
      expect(body.data.flags).toBe(64);
      expect(body.data.content).toContain("BT14-018");
      expect(body.data.content).toContain("EX3-035");
    });

    it("answers a signed /card miss with the ephemeral not-found message", async () => {
      await seed();
      const res = await SELF.fetch(
        ENDPOINT,
        await signedInteraction({
          type: 2,
          data: {
            name: "card",
            options: [{ name: "card-name", type: 3, value: "zzzznotacard" }],
          },
        }),
      );
      const body = (await res.json()) as { data: { content: string; flags: number } };
      expect(body.data.flags).toBe(64);
      expect(body.data.content).toContain("No cards found");
    });
  });

  it("answers a signed /release interaction with the set embed (static data + live tally)", async () => {
    const res = await SELF.fetch(
      ENDPOINT,
      await signedInteraction({
        type: 2,
        data: {
          name: "release",
          options: [{ name: "set", type: 3, value: "BT-14" }],
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { embeds: [{ title: string; fields: Array<{ name: string; value: string }> }] };
    };
    expect(body.data.embeds[0].title).toBe("BT-14 — Blast Ace");
    expect(body.data.embeds[0].fields).toContainEqual({
      name: "English release",
      value: "Released November 17, 2023",
      inline: true,
    });
  });

  it("returns 404 for non-interaction routes", async () => {
    const res = await SELF.fetch("https://example.com/");
    expect(res.status).toBe(404);
  });

  it("returns 404 for GET on the interactions path", async () => {
    const res = await SELF.fetch(ENDPOINT);
    expect(res.status).toBe(404);
  });
});
