// Integration tests for the interaction endpoint: the full HTTP surface as
// Discord sees it, running inside workerd via SELF — signature check,
// routing, and (since 2.3) the /card read path against seeded local D1.
import { env, SELF } from "cloudflare:test";
import { afterAll, describe, expect, it } from "vitest";
import { signedInteraction } from "../test/helpers/discord-sign";
import { loadNewVersion } from "./sync/load";
import { normalizeSearchName } from "./data/schema";

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

  it("returns 404 for non-interaction routes", async () => {
    const res = await SELF.fetch("https://example.com/");
    expect(res.status).toBe(404);
  });

  it("returns 404 for GET on the interactions path", async () => {
    const res = await SELF.fetch(ENDPOINT);
    expect(res.status).toBe(404);
  });
});
