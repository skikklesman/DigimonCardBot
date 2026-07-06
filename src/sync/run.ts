// The sync pipeline (HANDOFF §3, sync path): fetch → drift check →
// normalize → per-record validation → shrink guard → versioned load +
// atomic flip. Any throw aborts with the live dataset untouched — callers
// (the scheduled handler now, alerting in 3.3) decide how to report it.
import { EXPECTED_FIELDS, fetchCards, normalize } from "./adapter/digimoncard-app.ts";
import { checkSchemaDrift, checkShrink, validateCards } from "./validate.ts";
import { getLiveCardCount, loadNewVersion } from "./load.ts";
import { sendSyncAlert } from "./alert.ts";

export interface SyncSummary {
  version: number;
  loaded: number;
  duplicatesCollapsed: number;
  dropped: number;
  /** Non-fatal findings for the sync report: unknown upstream fields
   * (new-mechanic early warning), drop-count spikes. */
  warnings: string[];
}

export interface RunSyncOptions {
  /** Injection point for tests — integration tests never touch the network. */
  fetchImpl?: typeof fetch;
  /** Source override (CARD_SOURCE_URL) — staging/drill use; defaults to the
   * adapter's real source. */
  sourceUrl?: string;
  now?: Date;
}

/** Expected sync cadence (weekly cron) + 25% margin (TESTING.md §7). */
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000 * 1.25;

/**
 * Dead-man check: alert-worthy when the last successful sync is older than
 * cadence + margin. Null when fresh — or when no sync has EVER succeeded
 * (the pre-first-sync state isn't staleness; first-sync failures alert
 * through the failure path).
 */
export async function checkStaleSync(
  db: D1Database,
  now: Date = new Date(),
): Promise<string | null> {
  const row = await db
    .prepare("SELECT value FROM meta WHERE key = 'last_successful_sync'")
    .first<{ value: string }>();
  if (!row) return null;
  const last = Date.parse(row.value);
  if (!Number.isFinite(last)) {
    return `last_successful_sync is unparseable (${JSON.stringify(row.value)}) — sync health unknown`;
  }
  const ageMs = now.getTime() - last;
  if (ageMs <= STALE_AFTER_MS) return null;
  const days = (ageMs / 86_400_000).toFixed(1);
  return `card data is STALE: last successful sync was ${days} days ago (${row.value}) — expected weekly`;
}

export interface SyncWithAlertsOptions extends RunSyncOptions {
  /** SYNC_ALERT_WEBHOOK — failures/warnings announce themselves here. */
  webhookUrl?: string;
}

export type SyncOutcome = { ok: true; summary: SyncSummary } | { ok: false; error: string };

/**
 * The sync with its reporting attached — shared by the cron handler and the
 * manual resync route so the two paths can never drift: failure → ❌ alert,
 * success-with-warnings → ⚠️ alert. Never throws; callers branch on `ok`
 * (the cron handler rethrows to mark its invocation failed).
 */
export async function runSyncWithAlerts(
  db: D1Database,
  options: SyncWithAlertsOptions = {},
): Promise<SyncOutcome> {
  try {
    const summary = await runSync(db, options);
    console.log(`sync complete: ${JSON.stringify(summary)}`);
    if (summary.warnings.length > 0) {
      await sendSyncAlert(
        options.webhookUrl,
        `⚠️ card sync v${summary.version} succeeded with warnings:\n• ${summary.warnings.join("\n• ")}`,
      );
    }
    return { ok: true, summary };
  } catch (error) {
    const message = String(error);
    console.error(`sync failed: ${message}`);
    await sendSyncAlert(options.webhookUrl, `❌ card sync FAILED: ${message}`);
    return { ok: false, error: message };
  }
}

export async function runSync(db: D1Database, options: RunSyncOptions = {}): Promise<SyncSummary> {
  const warnings: string[] = [];

  const raws = await fetchCards({ fetchImpl: options.fetchImpl, url: options.sourceUrl });

  const drift = checkSchemaDrift(raws, EXPECTED_FIELDS);
  if (!drift.ok) {
    throw new Error(
      `sync aborted (schema drift): required fields missing upstream: ${drift.missingFields.join(", ")}` +
        (drift.unknownFields.length
          ? `; unknown fields present: ${drift.unknownFields.join(", ")}`
          : ""),
    );
  }
  if (drift.unknownFields.length > 0) {
    warnings.push(`upstream added unmapped fields: ${drift.unknownFields.join(", ")}`);
  }

  const { valid, dropped, dropSpikeWarning } = validateCards(raws.flatMap(normalize));
  if (dropSpikeWarning) warnings.push(dropSpikeWarning);

  const liveCount = await getLiveCardCount(db);
  const shrink = checkShrink(valid.length, liveCount);
  if (!shrink.ok) {
    throw new Error(`sync aborted (shrink guard): ${shrink.reason ?? "unknown"}`);
  }

  const result = await loadNewVersion(db, valid, { now: options.now });
  return { ...result, dropped, warnings };
}
