// GET /health (TESTING.md §4): the read-only vitals the post-deploy smoke
// script and any uptime pinger assert against. Public-safe by design — the
// three fields say "the Worker runs, D1 answers, and the data is this
// fresh" and nothing else. No secrets, no internals.
import { getActiveVersion, getLastSuccessfulSync, getLiveCardCount } from "./sync/load";

export async function handleHealth(db: D1Database): Promise<Response> {
  const [activeVersion, cardCount, lastSuccessfulSync] = await Promise.all([
    getActiveVersion(db),
    getLiveCardCount(db),
    getLastSuccessfulSync(db),
  ]);
  return new Response(JSON.stringify({ activeVersion, cardCount, lastSuccessfulSync }), {
    headers: { "content-type": "application/json" },
  });
}
