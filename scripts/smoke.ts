// Post-deploy smoke checks (chunk 3.5, TESTING.md §4) — run against the
// LIVE Worker after every deploy: `npm run smoke` (or WORKER_URL=… for a
// different target). Deliberately self-contained: no imports from src/, so
// a broken Worker build can't break the thing that's supposed to detect it.
//
// We cannot forge Discord-signed interactions against production (Discord
// holds the private key), so the checks are boundary + vitals:
//   1. unsigned POST /interactions → 401  (verification is ON)
//   2. GET /health vitals             (D1 answers; data present and fresh)
//   3. unknown route → 404            (no accidental catch-all)

// No imports by design (see above) — this marks the file as a module so
// top-level await is legal.
export {};

const BASE = process.env.WORKER_URL ?? "https://digimon-tcg-bot.rstewart555.workers.dev";

/** Live dataset floor — well below the ~8.4k real rows, well above junk. */
const MIN_CARD_COUNT = 5000;
/** Freshness bound: weekly cadence + 25% margin (mirrors src/sync/run.ts —
 * keep in step if the cadence ever changes). */
const MAX_SYNC_AGE_MS = 7 * 24 * 60 * 60 * 1000 * 1.25;

let failed = 0;

function check(label: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "  ✓" : "  ✗"} ${label} — ${detail}`);
  if (!ok) failed++;
}

console.log(`Smoke-checking ${BASE} …`);

// 1. Signature boundary: an unsigned interaction must be rejected.
const unsigned = await fetch(`${BASE}/interactions`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ type: 1 }),
});
check("unsigned POST /interactions is rejected", unsigned.status === 401, `got ${unsigned.status}`);

// 2. Health vitals.
const healthRes = await fetch(`${BASE}/health`);
check("GET /health responds 200", healthRes.status === 200, `got ${healthRes.status}`);
if (healthRes.status === 200) {
  const health = (await healthRes.json()) as {
    activeVersion: number;
    cardCount: number;
    lastSuccessfulSync: string | null;
  };
  check("a dataset is live", health.activeVersion >= 1, `activeVersion=${health.activeVersion}`);
  check(
    `card count ≥ ${MIN_CARD_COUNT}`,
    health.cardCount >= MIN_CARD_COUNT,
    `cardCount=${health.cardCount}`,
  );
  const syncAge = health.lastSuccessfulSync
    ? Date.now() - Date.parse(health.lastSuccessfulSync)
    : Number.POSITIVE_INFINITY;
  check(
    "last sync is fresh (< cadence + 25%)",
    syncAge < MAX_SYNC_AGE_MS,
    `lastSuccessfulSync=${health.lastSuccessfulSync ?? "never"}`,
  );
}

// 3. No accidental catch-all.
const unknown = await fetch(`${BASE}/definitely-not-a-route`);
check("unknown route 404s", unknown.status === 404, `got ${unknown.status}`);

if (failed > 0) {
  console.error(`\nSMOKE FAILED: ${failed} check(s) red. The deployed Worker is not healthy.`);
  process.exit(1);
}
console.log("\nAll smoke checks green.");
