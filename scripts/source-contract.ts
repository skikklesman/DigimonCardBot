// Weekly source-contract check (TESTING.md §5): fetch the REAL upstream,
// run it through the adapter + validation gates, WRITE NOTHING. Scheduled
// in CI Mondays 06:00 UTC — same hour as the sync cron since the
// cron-dialect finding (DECISIONS.md 2026-07-07): an independent probe of
// upstream, no longer a day-early warning.
//
// Run: `npm run source-contract` (Node ≥22.18). Exits non-zero on any gate
// failure; posts to the alert webhook when SYNC_ALERT_WEBHOOK is set (in
// CI that's an optional repo secret — without it, the failed run itself is
// the signal).
import { EXPECTED_FIELDS, fetchCards, normalize } from "../src/sync/adapter/digimoncard-app.ts";
import { checkSchemaDrift, validateCards } from "../src/sync/validate.ts";
import { sendSyncAlert } from "../src/sync/alert.ts";

/** No D1 here (we write nothing), so the shrink guard's live-count
 * comparison is approximated by a hard floor well under the ~8.4k real
 * rows (mirrors scripts/smoke.ts). */
const MIN_CARD_COUNT = 5000;

const problems: string[] = [];
const warnings: string[] = [];

const raws = await fetchCards().catch((error: unknown) => {
  problems.push(`fetch failed: ${String(error)}`);
  return [];
});

if (problems.length === 0) {
  const drift = checkSchemaDrift(raws, EXPECTED_FIELDS);
  if (!drift.ok) {
    problems.push(`schema drift: required fields missing: ${drift.missingFields.join(", ")}`);
  }
  if (drift.unknownFields.length > 0) {
    warnings.push(`upstream added unmapped fields: ${drift.unknownFields.join(", ")}`);
  }

  const { valid, dropped, dropSpikeWarning } = validateCards(raws.flatMap(normalize));
  if (dropSpikeWarning) warnings.push(dropSpikeWarning);
  if (valid.length < MIN_CARD_COUNT) {
    problems.push(`only ${valid.length} valid cards (floor ${MIN_CARD_COUNT}) — truncated feed?`);
  }
  console.log(
    `source contract: ${raws.length} records → ${valid.length} valid cards, ${dropped} dropped`,
  );
}

for (const warning of warnings) console.warn(`  ⚠ ${warning}`);
for (const problem of problems) console.error(`  ✗ ${problem}`);

const webhook = process.env.SYNC_ALERT_WEBHOOK;
if (problems.length > 0) {
  await sendSyncAlert(
    webhook,
    `🔶 source-contract check FAILED (tomorrow's sync will abort):\n• ${problems.join("\n• ")}`,
  );
  process.exit(1);
}
if (warnings.length > 0) {
  await sendSyncAlert(
    webhook,
    `⚠️ source-contract check passed with warnings:\n• ${warnings.join("\n• ")}`,
  );
}
console.log("source contract: PASS");
