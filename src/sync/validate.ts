// Validation gates (HANDOFF §8 Defense 2) — all pure functions, no I/O.
// The sync pipeline (chunk 1.6) runs them between fetch and load; any gate
// failure aborts the sync with the live cache untouched. The distinction
// that matters (HANDOFF §8): one bad card → skip it; the whole feed wrong →
// abort the batch.
import type { Card } from "../data/schema.ts";

/** Expected upstream shape, provided by the source adapter — the gate itself
 * is source-agnostic. `required`: fields the adapter depends on (missing
 * across the board = schema drift = abort). `known`: every field we've seen
 * and consciously handle or ignore (anything else = new-mechanic warning). */
export interface ExpectedFields {
  required: readonly string[];
  known: readonly string[];
}

export interface DriftResult {
  ok: boolean;
  /** Required fields present in fewer than REQUIRED_PRESENCE of records. */
  missingFields: string[];
  /** Fields upstream added that we don't map — warn, never abort
   * (DECISIONS.md 2026-07-05: the new-mechanic early-warning signal). */
  unknownFields: string[];
}

/** A required field must be present (key exists, any value) in at least this
 * share of records. The dataset is generator-produced, so keys are near
 * all-or-nothing; 90% tolerates a few hand-edited stragglers. */
const REQUIRED_PRESENCE = 0.9;

/**
 * Two-directional schema-drift detection over the RAW feed (before
 * normalization, which would mask renames behind nulls).
 */
export function checkSchemaDrift(
  records: readonly unknown[],
  expected: ExpectedFields,
): DriftResult {
  const presence = new Map<string, number>(expected.required.map((f) => [f, 0]));
  const unknown = new Set<string>();
  const known = new Set(expected.known);
  let objectRecords = 0;

  for (const record of records) {
    if (typeof record !== "object" || record === null || Array.isArray(record)) continue;
    objectRecords++;
    for (const key of Object.keys(record)) {
      const count = presence.get(key);
      if (count !== undefined) presence.set(key, count + 1);
      if (!known.has(key)) unknown.add(key);
    }
  }

  // No usable records at all → every required field is "missing"; the shrink
  // guard will also fail this batch, but drift must not report a false OK.
  const threshold = Math.max(1, objectRecords * REQUIRED_PRESENCE);
  const missingFields = expected.required.filter((f) => (presence.get(f) ?? 0) < threshold);
  return { ok: missingFields.length === 0, missingFields, unknownFields: [...unknown].sort() };
}

export interface RecordValidationResult {
  valid: Card[];
  /** Count of dropped cards — a spike is itself a signal (HANDOFF §8). */
  dropped: number;
  /** One human-readable line per dropped card, for the sync alert/summary. */
  dropReasons: string[];
  /** Set when drops exceed DROP_SPIKE_RATIO of the batch (warn, not abort). */
  dropSpikeWarning: string | null;
}

/** Monitoring matrix (TESTING.md §7): drop-count spike warns above 1%. */
const DROP_SPIKE_RATIO = 0.01;

/**
 * Per-record validation on NORMALIZED cards. HANDOFF §8 requires "at least a
 * stable ID and name" — cards failing that are dropped and counted; the
 * batch proceeds. (So a cosmetically garbaged record that still has both,
 * like fixture P-226, deliberately survives.)
 */
export function validateCards(cards: readonly Card[]): RecordValidationResult {
  const valid: Card[] = [];
  const dropReasons: string[] = [];
  for (const card of cards) {
    if (!card.cardId) {
      dropReasons.push(`dropped card with empty id (name: ${JSON.stringify(card.name)})`);
    } else if (!card.name || !card.searchName) {
      dropReasons.push(`dropped ${card.cardId}/${card.variant}: empty or unsearchable name`);
    } else {
      valid.push(card);
    }
  }
  const dropped = dropReasons.length;
  const total = cards.length;
  const dropSpikeWarning =
    total > 0 && dropped / total > DROP_SPIKE_RATIO
      ? `drop-count spike: ${dropped}/${total} records dropped (>${DROP_SPIKE_RATIO * 100}%)`
      : null;
  return { valid, dropped, dropReasons, dropSpikeWarning };
}

export interface ShrinkResult {
  ok: boolean;
  reason: string | null;
}

/** Refuse the batch if it shrank more than this vs. the live dataset. */
const MAX_SHRINK_RATIO = 0.1;

/**
 * Shrink guard (HANDOFF §8, "highest value"): a legitimate update never
 * removes most of the pool. Neutralizes the catastrophic cases — empty
 * array, truncated feed, error page parsed as junk — in one comparison.
 * `liveCount = 0` (first sync) passes, but an empty batch never does.
 */
export function checkShrink(newCount: number, liveCount: number): ShrinkResult {
  if (newCount <= 0) {
    return { ok: false, reason: "incoming dataset is empty" };
  }
  const floor = liveCount * (1 - MAX_SHRINK_RATIO);
  if (newCount < floor) {
    return {
      ok: false,
      reason: `incoming count ${newCount} is below the shrink floor ${Math.ceil(floor)} (live: ${liveCount})`,
    };
  }
  return { ok: true, reason: null };
}
