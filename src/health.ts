// GET|HEAD /health (TESTING.md §4): the read-only vitals the post-deploy
// smoke script and any uptime pinger assert against. Public-safe by design — the
// three fields say "the Worker runs, D1 answers, and the data is this
// fresh" and nothing else. No secrets, no internals.
//
// Status carries the freshness verdict: 200 = healthy, 503 = the data is
// stale by the dead-man rule (cadence + margin, src/sync/run.ts). The
// stale-sync check otherwise lives INSIDE the cron it monitors — if the
// trigger itself dies, nothing fires. A dumb external pinger asserting
// "/health is 200" now catches a dead cron from outside Cloudflare
// (DECISIONS.md 2026-07-06). Pre-first-sync is 200, matching checkStaleSync:
// a deployment that hasn't synced yet isn't stale.
import { getActiveVersion, getLastSuccessfulSync, getLiveCardCount } from "./sync/load.ts";
import { checkStaleSync } from "./sync/run.ts";

export async function handleHealth(db: D1Database): Promise<Response> {
  const [activeVersion, cardCount, lastSuccessfulSync, stale] = await Promise.all([
    getActiveVersion(db),
    getLiveCardCount(db),
    getLastSuccessfulSync(db),
    checkStaleSync(db),
  ]);
  return new Response(JSON.stringify({ activeVersion, cardCount, lastSuccessfulSync }), {
    status: stale === null ? 200 : 503,
    headers: { "content-type": "application/json" },
  });
}
