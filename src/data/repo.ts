// Card repository — ALL read-path SQL lives here (TECH-DESIGN §3.2), and
// every query filters on the active version by construction: there is no
// raw-query escape hatch, so a reader cannot accidentally see a staged or
// stale dataset. Command handlers receive a CardRepo and stay SQL-free.
import { normalizeSearchName, type Card } from "./schema.ts";

// Interpolated into every statement — the version-pointer read (HANDOFF §5).
const LIVE = "version = (SELECT value FROM meta WHERE key = 'active_version')";

const COLUMNS =
  "card_id, variant, name, search_name, card_type, color, level, play_cost, dp, effect, inherited, set_name, rarity, image_url";

interface CardRow {
  card_id: string;
  variant: string;
  name: string;
  search_name: string;
  card_type: string | null;
  color: string | null;
  level: number | null;
  play_cost: number | null;
  dp: number | null;
  effect: string | null;
  inherited: string | null;
  set_name: string | null;
  rarity: string | null;
  image_url: string | null;
}

function toCard(row: CardRow): Card {
  return {
    cardId: row.card_id,
    variant: row.variant,
    name: row.name,
    searchName: row.search_name,
    cardType: row.card_type,
    color: row.color,
    level: row.level,
    playCost: row.play_cost,
    dp: row.dp,
    effect: row.effect,
    inherited: row.inherited,
    setName: row.set_name,
    rarity: row.rarity,
    imageUrl: row.image_url,
  };
}

export interface CardRepo {
  /** Exact printing lookup; variant defaults to the base printing. */
  findPrinting(cardId: string, variant?: string): Promise<Card | null>;
  /** Resolve an autocomplete value token, `card_id|variant` (HANDOFF §6.4).
   * Returns null for anything that isn't a well-formed, existing token —
   * the /card handler then falls back to a name search. */
  findByValue(value: string): Promise<Card | null>;
  /** Prefix search on the normalized name; base printings only, so each
   * card appears once. The query is normalized with the SAME function the
   * sync used to write search_name — the invariant search depends on. */
  searchByName(query: string, limit?: number): Promise<Card[]>;
  /** Every printing of a card (base + alt-arts), for /alt. */
  listPrintings(cardId: string): Promise<Card[]>;
}

const DEFAULT_SEARCH_LIMIT = 25;

/**
 * The autocomplete hot path — an explicit index range, NOT `LIKE ?`.
 * SQLite's default case-insensitive LIKE cannot use the BINARY-collated
 * (version, search_name) index, so `LIKE 'prefix%'` scanned every row of
 * the active version (~8.4k row reads per keystroke, measured 2026-07-06 —
 * see DECISIONS.md). The range form narrows on the index itself.
 *
 * Bounds are sound because normalizeSearchName guarantees the alphabet
 * [a-z0-9 space], all below '{' (0x7b): every string starting with `prefix`
 * sorts in [prefix, prefix + '{').
 *
 * Exported so repo.test.ts can EXPLAIN QUERY PLAN the exact SQL served and
 * fail if a future edit de-indexes it.
 */
export const SEARCH_BY_NAME_SQL = `SELECT ${COLUMNS} FROM cards
   WHERE ${LIVE} AND search_name >= ? AND search_name < ? AND variant = '0'
   ORDER BY search_name, card_id
   LIMIT ?`;

export function createRepo(db: D1Database): CardRepo {
  return {
    async findPrinting(cardId, variant = "0") {
      const row = await db
        .prepare(`SELECT ${COLUMNS} FROM cards WHERE ${LIVE} AND card_id = ? AND variant = ?`)
        .bind(cardId, variant)
        .first<CardRow>();
      return row ? toCard(row) : null;
    },

    async findByValue(value) {
      const parts = value.split("|");
      if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
      return this.findPrinting(parts[0], parts[1]);
    },

    async searchByName(query, limit = DEFAULT_SEARCH_LIMIT) {
      const prefix = normalizeSearchName(query);
      // An empty prefix would range-match the whole table — refuse instead.
      if (prefix === "") return [];
      const { results } = await db
        .prepare(SEARCH_BY_NAME_SQL)
        .bind(prefix, `${prefix}{`, limit)
        .all<CardRow>();
      return results.map(toCard);
    },

    async listPrintings(cardId) {
      const { results } = await db
        .prepare(`SELECT ${COLUMNS} FROM cards WHERE ${LIVE} AND card_id = ? ORDER BY variant`)
        .bind(cardId)
        .all<CardRow>();
      return results.map(toCard);
    },
  };
}
