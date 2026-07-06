// Integration tests for the interaction endpoint stub (chunk 0.4): the full
// HTTP surface as Discord sees it, running inside workerd via SELF.
import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { signedInteraction } from "../test/helpers/discord-sign";

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
      await signedInteraction({ type: 2, data: { name: "card" } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { type: number; data: { content: string; flags: number } };
    expect(body.type).toBe(4); // CHANNEL_MESSAGE_WITH_SOURCE
    expect(body.data.flags).toBe(64); // ephemeral
    expect(body.data.content).toContain("don't know that command");
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
