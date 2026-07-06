// End-to-end sync pipeline tests (chunk 1.6) against real local D1, with
// the upstream fetch stubbed (fixture data — no network, TESTING.md §2).
// The pipeline's abort behavior is what's under test here; the individual
// gates have their own suites.
import { env } from "cloudflare:test";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import fixture from "../../test/fixtures/digimoncard-app-cards.json";
import { getActiveVersion } from "./load";
import { checkStaleSync, runSync } from "./run";

const feed = (body: unknown): typeof fetch =>
  (() => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))) as typeof fetch;

async function resetDb(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM cards"),
    env.DB.prepare("UPDATE meta SET value = '0' WHERE key = 'active_version'"),
    env.DB.prepare("DELETE FROM meta WHERE key = 'last_successful_sync'"),
  ]);
}

async function servedCount(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM cards WHERE version = (SELECT value FROM meta WHERE key = 'active_version')",
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

describe("runSync (fetch → gates → load → flip)", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  it("happy path: fixture feed lands as a promoted, queryable dataset", async () => {
    const summary = await runSync(env.DB, {
      fetchImpl: feed(fixture),
      now: new Date("2026-07-05T12:00:00Z"),
    });

    expect(summary.version).toBe(1);
    expect(summary.warnings).toEqual([]);
    // 17 records expand to base + alt-art rows; every one must be served
    expect(summary.loaded).toBeGreaterThan(17);
    await expect(servedCount()).resolves.toBe(summary.loaded);

    // spot-check a known card end-to-end (adapter → gates → D1)
    const goldramon = await env.DB.prepare(
      `SELECT name, level, dp FROM cards
       WHERE version = (SELECT value FROM meta WHERE key = 'active_version')
         AND card_id = 'BT14-018' AND variant = '0'`,
    ).first<{ name: string; level: number; dp: number }>();
    expect(goldramon).toEqual({ name: "Goldramon", level: 6, dp: 12000 });
  });

  it("reports unknown upstream fields as warnings, not failures", async () => {
    const withNew = (fixture as object[]).map((r) => ({ ...r, overclockEffect: "x" }));
    const summary = await runSync(env.DB, { fetchImpl: feed(withNew) });
    expect(summary.warnings.some((w) => w.includes("overclockEffect"))).toBe(true);
    await expect(getActiveVersion(env.DB)).resolves.toBe(1);
  });

  it("aborts on schema drift with the live dataset untouched", async () => {
    await runSync(env.DB, { fetchImpl: feed(fixture) }); // live version 1
    const before = await servedCount();

    const renamed = (fixture as Record<string, unknown>[]).map(({ id, ...rest }) => ({
      ...rest,
      cardCode: id,
    }));
    await expect(runSync(env.DB, { fetchImpl: feed(renamed) })).rejects.toThrow(/schema drift/);
    await expect(getActiveVersion(env.DB)).resolves.toBe(1);
    await expect(servedCount()).resolves.toBe(before);
  });

  it("aborts on the shrink guard when the feed collapses", async () => {
    await runSync(env.DB, { fetchImpl: feed(fixture) }); // live version 1
    const before = await servedCount();

    const tiny = (fixture as object[]).slice(0, 2);
    await expect(runSync(env.DB, { fetchImpl: feed(tiny) })).rejects.toThrow(/shrink guard/);
    await expect(getActiveVersion(env.DB)).resolves.toBe(1);
    await expect(servedCount()).resolves.toBe(before);
  });

  it("aborts before any write when the source is down", async () => {
    const down: typeof fetch = () => Promise.resolve(new Response("nope", { status: 503 }));
    await expect(runSync(env.DB, { fetchImpl: down })).rejects.toThrow(/fetch failed/);
    await expect(getActiveVersion(env.DB)).resolves.toBe(0);
    await expect(servedCount()).resolves.toBe(0);
  });

  it("drops invalid records but counts them in the summary", async () => {
    const withBad = [...(fixture as object[]), { name: { english: "No Id Card" } }];
    const summary = await runSync(env.DB, { fetchImpl: feed(withBad) });
    expect(summary.dropped).toBe(1);
    await expect(servedCount()).resolves.toBe(summary.loaded);
  });

  it("fetches from the sourceUrl override when provided", async () => {
    const seen: string[] = [];
    const spy: typeof fetch = ((url: unknown) => {
      seen.push(String(url));
      return Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 }));
    }) as typeof fetch;
    await runSync(env.DB, { fetchImpl: spy, sourceUrl: "https://staging.example/cards.json" });
    expect(seen).toEqual(["https://staging.example/cards.json"]);
  });
});

describe("checkStaleSync (dead-man check)", () => {
  beforeEach(resetDb);
  afterAll(resetDb);

  const setSyncTime = (iso: string) =>
    env.DB.prepare("INSERT INTO meta (key, value) VALUES ('last_successful_sync', ?)")
      .bind(iso)
      .run();

  it("is quiet when the last sync is within cadence + margin", async () => {
    await setSyncTime("2026-07-01T00:00:00.000Z");
    // 7 days later: within the 8.75-day threshold
    await expect(checkStaleSync(env.DB, new Date("2026-07-08T00:00:00Z"))).resolves.toBeNull();
  });

  it("alerts when the last sync is older than cadence + margin", async () => {
    await setSyncTime("2026-07-01T00:00:00.000Z");
    const message = await checkStaleSync(env.DB, new Date("2026-07-10T00:00:00Z"));
    expect(message).toContain("STALE");
    expect(message).toContain("9.0 days");
  });

  it("is quiet before any sync has ever succeeded (not staleness)", async () => {
    await expect(checkStaleSync(env.DB)).resolves.toBeNull();
  });

  it("alerts on an unparseable timestamp rather than staying silent", async () => {
    await setSyncTime("not-a-date");
    const message = await checkStaleSync(env.DB, new Date("2026-07-10T00:00:00Z"));
    expect(message).toContain("unparseable");
  });
});
