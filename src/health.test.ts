// GET /health integration tests (chunk 3.5) via the real Worker in workerd.
import { env, SELF } from "cloudflare:test";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadNewVersion } from "./sync/load.ts";

const URL_ = "https://example.com/health";

interface HealthBody {
  activeVersion: number;
  cardCount: number;
  lastSuccessfulSync: string | null;
}

async function resetDb(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM cards"),
    env.DB.prepare("UPDATE meta SET value = '0' WHERE key = 'active_version'"),
    env.DB.prepare("DELETE FROM meta WHERE key = 'last_successful_sync'"),
  ]);
}

describe("GET /health", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("reports the pre-first-sync state truthfully", async () => {
    const res = await SELF.fetch(URL_);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      activeVersion: 0,
      cardCount: 0,
      lastSuccessfulSync: null,
    });
  });

  it("reports live vitals after a sync", async () => {
    await loadNewVersion(
      env.DB,
      [
        {
          cardId: "BT1-010",
          variant: "0",
          name: "Agumon",
          searchName: "agumon",
          cardType: "Digimon",
          color: "Red",
          level: 3,
          playCost: 3,
          dp: 2000,
          effect: null,
          inherited: null,
          setName: null,
          rarity: "C",
          imageUrl: null,
        },
      ],
      { now: new Date("2026-07-06T09:00:00Z") },
    );
    const body = (await (await SELF.fetch(URL_)).json()) as HealthBody;
    expect(body).toEqual({
      activeVersion: 1,
      cardCount: 1,
      lastSuccessfulSync: "2026-07-06T09:00:00.000Z",
    });
  });

  it("exposes exactly the three public-safe fields, nothing else", async () => {
    const body = (await (await SELF.fetch(URL_)).json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["activeVersion", "cardCount", "lastSuccessfulSync"]);
  });

  it("is GET-only (POST /health falls through to 404)", async () => {
    const res = await SELF.fetch(URL_, { method: "POST" });
    expect(res.status).toBe(404);
  });

  describe("freshness verdict in the status code (dead-man rule)", () => {
    const setSyncTime = (iso: string) =>
      env.DB.prepare(
        "INSERT INTO meta (key, value) VALUES ('last_successful_sync', ?) " +
          "ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      )
        .bind(iso)
        .run();

    it("answers 200 while the last sync is within cadence + margin", async () => {
      await setSyncTime(new Date().toISOString());
      const res = await SELF.fetch(URL_);
      expect(res.status).toBe(200);
    });

    it("answers 503 once the data goes stale, still with the same public body", async () => {
      await setSyncTime("2020-01-01T00:00:00.000Z");
      const res = await SELF.fetch(URL_);
      expect(res.status).toBe(503);
      const body = (await res.json()) as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual([
        "activeVersion",
        "cardCount",
        "lastSuccessfulSync",
      ]);
      expect(body.lastSuccessfulSync).toBe("2020-01-01T00:00:00.000Z");
    });

    it("answers 503 on an unparseable sync timestamp (health unknown ≠ healthy)", async () => {
      await setSyncTime("not-a-date");
      const res = await SELF.fetch(URL_);
      expect(res.status).toBe(503);
    });
  });
});
