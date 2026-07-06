// The sync pipeline (HANDOFF §3, sync path): fetch → drift check →
// normalize → per-record validation → shrink guard → versioned load +
// atomic flip. Any throw aborts with the live dataset untouched — callers
// (the scheduled handler now, alerting in 3.3) decide how to report it.
import { EXPECTED_FIELDS, fetchCards, normalize } from "./adapter/digimoncard-app";
import { checkSchemaDrift, checkShrink, validateCards } from "./validate";
import { getLiveCardCount, loadNewVersion } from "./load";

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
  now?: Date;
}

export async function runSync(db: D1Database, options: RunSyncOptions = {}): Promise<SyncSummary> {
  const warnings: string[] = [];

  const raws = await fetchCards({ fetchImpl: options.fetchImpl });

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
