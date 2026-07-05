// Internal card model + search_name normalization. This is the shared
// vocabulary of the two paths: sync/ writes Cards, interactions/ reads them
// (TECH-DESIGN §3.1) — nothing here may import from either side.

/** One printing (card id + variant), matching a `cards` table row sans `version`. */
export interface Card {
  cardId: string;
  /** '0' = base printing; alt-arts use the upstream parallel token (e.g. 'P1'). */
  variant: string;
  name: string;
  /** normalizeSearchName(name) — precomputed for LIKE prefix search. */
  searchName: string;
  cardType: string | null;
  color: string | null;
  level: number | null;
  playCost: number | null;
  dp: number | null;
  effect: string | null;
  /** Inherited and/or security effect text. */
  inherited: string | null;
  setName: string | null;
  rarity: string | null;
  imageUrl: string | null;
}

/**
 * Normalization applied to card names before storage in `search_name` AND to
 * user-typed autocomplete/search input. The two sides must stay identical or
 * search silently breaks (TECH-DESIGN §4) — that is why this lives here and
 * nowhere else.
 *
 * Rules: lowercase → strip diacritics (NFKD, drop combining marks) → every
 * run of non-alphanumeric characters becomes a single space → trim. So
 * "Goldramon (X Antibody)" → "goldramon x antibody" and
 * "Habakirimon/Habakiri" → "habakirimon habakiri": typing the printed name,
 * however punctuated, always prefix-matches.
 */
export function normalizeSearchName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
