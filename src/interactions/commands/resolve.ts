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

export type CardFamilyResolution =
  | { kind: "hit"; card: Card; family: Card[] }
  | { kind: "multi"; matches: Card[] }
  | { kind: "miss" };

/**
 * Like {@link resolveCardValue}, but returns the hit's full printing FAMILY,
 * fetching it with a SINGLE `listPrintings` — so /card can render the Prev/Next
 * nav (chunk 4.12) without a second D1 round-trip. That extra round-trip pushed
 * /card past Discord's 3-second budget in production (2026-07-10 regression;
 * DECISIONS.md): a token/id resolves in one query here, restoring /card's
 * pre-4.12 single-round-trip profile on the common path.
 *
 * `resolveCardValue` stays for the alt-option autocomplete, which needs only a
 * card id and must stay cheap per keystroke — it must NOT fetch a family.
 */
export async function resolveCardFamily(
  repo: CardRepo,
  value: string,
): Promise<CardFamilyResolution> {
  // 1. Autocomplete token → that exact printing; the same query yields the family.
  if (value.includes("|")) {
    const [cardId, variant] = value.split("|");
    if (!cardId || !variant) return { kind: "miss" };
    const family = await repo.listPrintings(cardId);
    const card = family.find((p) => p.variant === variant);
    return card ? { kind: "hit", card, family } : { kind: "miss" };
  }

  // 2. Card id, as printed (case-insensitive) → base printing + family.
  if (CARD_ID_PATTERN.test(value)) {
    const family = await repo.listPrintings(value.toUpperCase());
    const card = family.find((p) => p.variant === "0") ?? family[0];
    if (card) return { kind: "hit", card, family };
    // fall through: "ADR-01" is id-shaped but is actually a name prefix
  }

  // 3. Free-text name search; a single hit then needs its family — the only
  // two-query path, and the least common one (picks and ids are the common ones).
  const matches = await repo.searchByName(value);
  const first = matches[0];
  if (!first) return { kind: "miss" };
  if (matches.length > 1) return { kind: "multi", matches };
  const family = await repo.listPrintings(first.cardId);
  return { kind: "hit", card: first, family };
}
