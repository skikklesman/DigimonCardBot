// The cron entry point's wiring (TESTING.md §3): stale check → alert →
// sync-with-alerts → rethrow-on-failure. The pieces have their own suites;
// this proves the scheduled() handler actually connects them. The handler's
// signature is fixed by Cloudflare (no fetchImpl injection), so outbound
// traffic is intercepted by stubbing global fetch — the main worker runs in
// the same isolate as the tests, so the stub applies to it too.
import { createScheduledController, env } from "cloudflare:test";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../test/fixtures/digimoncard-app-cards.json";
import worker, { type Env } from "./index.ts";
import { getActiveVersion } from "./sync/load.ts";

const WEBHOOK = "https://hooks.test/alert";
const SOURCE = "https://source.test/cards.json";

async function resetDb(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM cards"),
    env.DB.prepare("UPDATE meta SET value = '0' WHERE key = 'active_version'"),
    env.DB.prepare("DELETE FROM meta WHERE key = 'last_successful_sync'"),
  ]);
}

/** Global-fetch stub: serves `body` at SOURCE, captures posts to WEBHOOK. */
function stubOutboundFetch(body: unknown): string[] {
  const alerts: string[] = [];
  vi.stubGlobal("fetch", (async (url: unknown, init?: RequestInit) => {
    if (String(url) === WEBHOOK) {
      alerts.push((JSON.parse(String(init?.body)) as { content: string }).content);
      return new Response(null, { status: 204 });
    }
    if (String(url) === SOURCE) {
      return new Response(JSON.stringify(body), { status: 200 });
    }
    throw new Error(`unexpected outbound fetch in test: ${String(url)}`);
  }) as typeof fetch);
  return alerts;
}

/** Feed whose renamed id field aborts at the drift gate — one fetch, no retries. */
const driftFeed = (fixture as Record<string, unknown>[]).map(({ id, ...rest }) => ({
  ...rest,
  cardCode: id,
}));

const testEnv: Env = {
  ...(env as unknown as Env),
  SYNC_ALERT_WEBHOOK: WEBHOOK,
  CARD_SOURCE_URL: SOURCE,
};

const runCron = () => worker.scheduled(createScheduledController(), testEnv);

describe("scheduled() — the cron wiring", () => {
  beforeEach(resetDb);
  afterEach(() => vi.unstubAllGlobals());
  afterAll(resetDb);

  it("happy path: syncs, flips the pointer, and stays quiet", async () => {
    const alerts = stubOutboundFetch(fixture);
    await runCron();
    await expect(getActiveVersion(env.DB)).resolves.toBe(1);
    expect(alerts).toEqual([]);
  });

  it("a failed sync posts the ❌ alert AND rejects, so Cloudflare marks the invocation failed", async () => {
    const alerts = stubOutboundFetch(driftFeed);
    await expect(runCron()).rejects.toThrow(/schema drift/);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain("❌");
    await expect(getActiveVersion(env.DB)).resolves.toBe(0);
  });

  it("stale data raises the ⚠️ dead-man alert first, then the sync still runs", async () => {
    await env.DB.prepare(
      "INSERT INTO meta (key, value) VALUES ('last_successful_sync', '2020-01-01T00:00:00.000Z')",
    ).run();
    const alerts = stubOutboundFetch(fixture);
    await runCron();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain("⚠️");
    expect(alerts[0]).toContain("STALE");
    await expect(getActiveVersion(env.DB)).resolves.toBe(1);
  });

  it("stale data cannot hide behind the failure it predicts — both alerts fire", async () => {
    await env.DB.prepare(
      "INSERT INTO meta (key, value) VALUES ('last_successful_sync', '2020-01-01T00:00:00.000Z')",
    ).run();
    const alerts = stubOutboundFetch(driftFeed);
    await expect(runCron()).rejects.toThrow(/schema drift/);
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toContain("STALE");
    expect(alerts[1]).toContain("❌");
  });
});
