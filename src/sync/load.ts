// Versioned load + atomic flip (HANDOFF §5, §8 Defenses 3 & 4). All sync-path
// SQL lives here (TECH-DESIGN §3.2). The live dataset is NEVER touched:
// rows load under active_version + 1, and promotion is a single atomic
// batch that flips the pointer, records the sync time, and GCs old versions.
import type { Card } from "../data/schema.ts";

const CARD_COLUMNS = [
  "version",
  "card_id",
  "variant",
  "name",
  "search_name",
  "card_type",
  "color",
  "level",
  "play_cost",
  "dp",
  "effect",
  "inherited",
  "set_name",
  "rarity",
  "image_url",
  "restriction",
] as const;

const UPDATE_COLUMNS = CARD_COLUMNS.filter(
  (c) => c !== "version" && c !== "card_id" && c !== "variant",
);

// D1 caps bound parameters per statement (100 at time of writing — verify
// when tuning): 16 columns/row → 6 rows keeps a statement at 96 binds.
const DEFAULT_ROWS_PER_STATEMENT = 6;
// Statements grouped per db.batch() round trip. Each batch is atomic; the
// load as a whole is not — which is fine, because nothing under a
// not-yet-promoted version is visible to readers.
const DEFAULT_STATEMENTS_PER_BATCH = 20;

export interface LoadOptions {
  /** Chunk-size overrides for tests; defaults match D1 limits. */
  rowsPerStatement?: number;
  statementsPerBatch?: number;
  /** Injectable clock for deterministic last_successful_sync tests. */
  now?: Date;
}

export interface LoadResult {
  /** The version the batch was loaded and promoted under. */
  version: number;
  /** Rows written = unique (card_id, variant) keys in the batch. */
  loaded: number;
  /** Duplicate keys collapsed before writing (same printing twice in feed). */
  duplicatesCollapsed: number;
}

/** Current version pointer; 0 = no dataset promoted yet (migration seed). */
export async function getActiveVersion(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT value FROM meta WHERE key = 'active_version'")
    .first<{ value: string }>();
  const version = row ? parseInt(row.value, 10) : 0;
  return Number.isFinite(version) ? version : 0;
}

/** ISO timestamp of the last promoted sync; null before the first one. */
export async function getLastSuccessfulSync(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare("SELECT value FROM meta WHERE key = 'last_successful_sync'")
    .first<{ value: string }>();
  return row?.value ?? null;
}

/** Row count of the LIVE dataset — the shrink guard's comparison basis. */
export async function getLiveCardCount(db: D1Database): Promise<number> {
  const row = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM cards WHERE version = (SELECT value FROM meta WHERE key = 'active_version')",
    )
    .first<{ n: number }>();
  return row?.n ?? 0;
}

function toRow(version: number, card: Card): unknown[] {
  return [
    version,
    card.cardId,
    card.variant,
    card.name,
    card.searchName,
    card.cardType,
    card.color,
    card.level,
    card.playCost,
    card.dp,
    card.effect,
    card.inherited,
    card.setName,
    card.rarity,
    card.imageUrl,
    card.restriction,
  ];
}

/**
 * Load a validated batch under active_version + 1, verify the row count,
 * then promote atomically. Throws on any failure — and a throw is always
 * safe: the live version and pointer are untouched, and the next attempt
 * starts by clearing the staging version (idempotent re-runs, Defense 3).
 */
export async function loadNewVersion(
  db: D1Database,
  cards: readonly Card[],
  options: LoadOptions = {},
): Promise<LoadResult> {
  const {
    rowsPerStatement = DEFAULT_ROWS_PER_STATEMENT,
    statementsPerBatch = DEFAULT_STATEMENTS_PER_BATCH,
    now = new Date(),
  } = options;

  // Collapse duplicate keys first: a multi-row upsert that touches the same
  // (card_id, variant) twice in one statement is a SQLite error, and the
  // post-load count check needs an exact expectation. First occurrence wins,
  // matching the adapter's variant dedupe.
  const byKey = new Map<string, Card>();
  for (const card of cards) {
    // NUL separator: cannot occur inside an id or variant, so keys never collide.
    const key = `${card.cardId}\u0000${card.variant}`;
    if (!byKey.has(key)) byKey.set(key, card);
  }
  const unique = [...byKey.values()];
  if (unique.length === 0) {
    throw new Error("refusing to load an empty batch (shrink guard should have caught this)");
  }

  const active = await getActiveVersion(db);
  const next = active + 1;

  // Clear leftovers from a previous failed attempt at this version. This is
  // staging data (never visible to readers) — NOT the live-table delete the
  // §15 Do-NOT list forbids.
  await db.prepare("DELETE FROM cards WHERE version = ?").bind(next).run();

  // Chunked upserts (Defense 3: stable-key idempotency).
  const columnList = CARD_COLUMNS.join(", ");
  const updateList = UPDATE_COLUMNS.map((c) => `${c} = excluded.${c}`).join(", ");
  const statements: D1PreparedStatement[] = [];
  for (let i = 0; i < unique.length; i += rowsPerStatement) {
    const chunk = unique.slice(i, i + rowsPerStatement);
    const placeholders = chunk.map(() => `(${CARD_COLUMNS.map(() => "?").join(", ")})`).join(", ");
    const sql = `INSERT INTO cards (${columnList}) VALUES ${placeholders} ON CONFLICT (version, card_id, variant) DO UPDATE SET ${updateList}`;
    statements.push(db.prepare(sql).bind(...chunk.flatMap((card) => toRow(next, card))));
  }
  for (let i = 0; i < statements.length; i += statementsPerBatch) {
    await db.batch(statements.slice(i, i + statementsPerBatch));
  }

  // Verify before promoting (Defense 4): the staged version must hold
  // exactly the batch we intended to write.
  const staged = await db
    .prepare("SELECT COUNT(*) AS n FROM cards WHERE version = ?")
    .bind(next)
    .first<{ n: number }>();
  if (staged?.n !== unique.length) {
    throw new Error(
      `staged row count ${staged?.n ?? "unknown"} does not match expected ${unique.length}; not promoting version ${next}`,
    );
  }

  // Atomic promote: pointer flip + sync timestamp + GC in ONE transactional
  // batch. Readers see the old dataset in full, then the new one in full.
  // GC keeps the immediately prior version for one-write rollback.
  await db.batch([
    db
      .prepare(
        "INSERT INTO meta (key, value) VALUES ('active_version', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      )
      .bind(String(next)),
    db
      .prepare(
        "INSERT INTO meta (key, value) VALUES ('last_successful_sync', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      )
      .bind(now.toISOString()),
    db.prepare("DELETE FROM cards WHERE version < ?").bind(next - 1),
  ]);

  return {
    version: next,
    loaded: unique.length,
    duplicatesCollapsed: cards.length - unique.length,
  };
}
