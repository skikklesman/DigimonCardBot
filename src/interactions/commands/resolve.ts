// The shared card-value resolution ladder (HANDOFF §6.4 edge cases), used by
// /card (command + the alt-option autocomplete). The card-name value may or
// may not have come from a picked autocomplete suggestion:
//   1. looks like a `card_id|variant` token → exact printing lookup
//   2. looks like a card id (EX1-066) → base printing lookup
//   3. anything else → normalized name search
import type { CardRepo } from "../../data/repo.ts";
import type { Card } from "../../data/schema.ts";

/** EX1-066, BT14-018, ST9-15, P-001 … — set prefix, dash, number. */
const CARD_ID_PATTERN = /^[A-Za-z]+\d*-\d+$/;

export type CardResolution =
  { kind: "hit"; card: Card } | { kind: "multi"; matches: Card[] } | { kind: "miss" };

export async function resolveCardValue(repo: CardRepo, value: string): Promise<CardResolution> {
  // 1. Autocomplete token. A miss means the suggestion went stale (the
  // dataset rotated between typing and submitting) — report the miss
  // honestly; a retry gets fresh suggestions.
  if (value.includes("|")) {
    const picked = await repo.findByValue(value);
    return picked ? { kind: "hit", card: picked } : { kind: "miss" };
  }

  // 2. Card id, as printed (case-insensitive).
  if (CARD_ID_PATTERN.test(value)) {
    const byId = await repo.findPrinting(value.toUpperCase());
    if (byId) return { kind: "hit", card: byId };
    // fall through: "ADR-01" is id-shaped but is actually a name prefix
  }

  // 3. Free-text name search.
  const matches = await repo.searchByName(value);
  const [first] = matches;
  if (!first) return { kind: "miss" };
  if (matches.length === 1) return { kind: "hit", card: first };
  return { kind: "multi", matches };
}
