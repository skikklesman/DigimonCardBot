// Source adapter for the TakaOtaku/Digimon-Card-App dataset (DECISIONS.md
// 2026-07-05). This module is the ONLY place that knows the upstream's shape
// (TECH-DESIGN §3.3); everything past it speaks `Card`. Swapping sources
// must touch only this directory.
import { normalizeSearchName, type Card } from "../../data/schema.ts";

export const SOURCE_URL =
  "https://raw.githubusercontent.com/TakaOtaku/Digimon-Card-App/main/src/assets/cardlists/DigimonCards.json";

const IMAGE_BASE =
  "https://raw.githubusercontent.com/TakaOtaku/Digimon-Card-App/main/src/assets/images/cards";

/**
 * Upstream record shape — tolerant reader (DECISIONS.md 2026-07-05, drift
 * entry): every field optional/loosely typed; unknown extra fields ignored.
 * `"-"` (occasionally `""`) is the upstream null sentinel.
 */
export interface RawCard {
  id?: unknown;
  cardNumber?: unknown;
  name?: { english?: unknown } | unknown;
  cardType?: unknown;
  color?: unknown;
  cardLv?: unknown;
  playCost?: unknown;
  dp?: unknown;
  effect?: unknown;
  digivolveEffect?: unknown;
  securityEffect?: unknown;
  aceEffect?: unknown;
  linkRequirement?: unknown;
  linkEffect?: unknown;
  linkDP?: unknown;
  rule?: unknown;
  digiXros?: unknown;
  dnaDigivolve?: unknown;
  burstDigivolve?: unknown;
  specialDigivolve?: unknown;
  assembly?: unknown;
  dualEffect?: unknown;
  optionCardColourRequirement?: unknown;
  optionCardEffect?: unknown;
  notes?: unknown;
  rarity?: unknown;
  restrictions?: unknown;
  AAs?: unknown;
}

/**
 * The upstream shape contract for schema-drift detection (validate.ts).
 * `required`: fields normalize() depends on — missing across the board means
 * the upstream renamed/restructured and the sync must abort. `known`: every
 * field observed in the dataset at capture (2026-07-05), whether we map it
 * or consciously ignore it — anything NEW beyond this list triggers the
 * new-mechanic warning (DECISIONS.md 2026-07-05).
 */
export const EXPECTED_FIELDS = {
  required: [
    "id",
    "name",
    "cardType",
    "color",
    "cardLv",
    "playCost",
    "dp",
    "effect",
    "digivolveEffect",
    "securityEffect",
    "notes",
    "rarity",
    // Promoted to required in chunk 4.6: /card's banned/restricted warning
    // depends on it, and a silently missing flag on a banned card is
    // misinformation — if upstream drops the field, abort loudly instead.
    "restrictions",
    "AAs",
  ],
  known: [
    "AAs",
    "JAAs",
    "aceEffect",
    "assembly",
    "attribute",
    "block",
    "burstDigivolve",
    "cardImage",
    "cardLv",
    "cardNumber",
    "cardType",
    "color",
    "digiXros",
    "digivolveCondition",
    "digivolveEffect",
    "dnaDigivolve",
    "dp",
    "dualEffect",
    "effect",
    "form",
    "id",
    "illustrator",
    "linkDP",
    "linkEffect",
    "linkRequirement",
    "name",
    "notes",
    "optionCardColourRequirement",
    "optionCardEffect",
    "playCost",
    "rarity",
    "restrictions",
    "rule",
    "securityEffect",
    "specialDigivolve",
    "type",
    "version",
  ],
} as const;

/** Upstream null sentinel → null; anything non-string → null. */
function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" || trimmed === "-" ? null : trimmed;
}

/** First integer found in the value ("Lv.6" → 6, "12000" → 12000), else null. */
function firstInt(value: unknown): number | null {
  const match = /\d+/.exec(typeof value === "string" ? value : "");
  return match ? parseInt(match[0], 10) : null;
}

/** Set name from `notes`: strip the decorative leading "▹". */
function setName(value: unknown): string | null {
  const t = text(value);
  return t ? (text(t.replace(/^▹\s*/, "")) ?? null) : null;
}

/**
 * English restriction status from the per-region `restrictions` object.
 * 'Unrestricted' → null (the ~94% case — survey 2026-07-07, DECISIONS.md),
 * so everything downstream treats "has a value" as "worth flagging".
 * Regions converged on one banned/restricted list as of BT-21 (owner/judge
 * call, ROADMAP 4.7), so the English value is the whole truth.
 */
function restriction(value: unknown): string | null {
  const english =
    typeof value === "object" && value !== null && "english" in value
      ? (value as { english?: unknown }).english
      : null;
  const t = text(english);
  return t === "Unrestricted" ? null : t;
}

// Supplementary mechanic text folded into `effect`, in display order. Most
// upstream values are self-labeled ("[Digivolve] …", "[Assembly -4] …");
// the ones that aren't get a label so they stay readable once merged.
// This fold is what keeps NEW mechanics displayable without a schema change.
const EFFECT_SUPPLEMENTS: ReadonlyArray<[keyof RawCard, string | null]> = [
  ["rule", "[Rule]"],
  ["aceEffect", "[ACE]"],
  ["dualEffect", null],
  // The other side of a dual card (e.g. a Digimon/Option) lives in its own
  // upstream fields, NOT in `effect`: the colour needed to play the Option
  // side, then its effect text — each labeled so the merged text says which
  // side it is (BUGS.md 2026-07-07: the Option side was being dropped).
  ["optionCardColourRequirement", "[Option Requirement]"],
  ["optionCardEffect", "[Option]"],
  ["specialDigivolve", null],
  ["digiXros", null],
  ["dnaDigivolve", null],
  ["burstDigivolve", null],
  ["assembly", null],
  ["linkRequirement", null],
  ["linkDP", "[Link DP]"],
  ["linkEffect", "[Link Effect]"],
];

function composeEffect(raw: RawCard): string | null {
  const parts: string[] = [];
  const main = text(raw.effect);
  if (main) parts.push(main);
  for (const [field, label] of EFFECT_SUPPLEMENTS) {
    const value = text(raw[field]);
    if (value) parts.push(label ? `${label} ${value}` : value);
  }
  return parts.length ? parts.join("\n") : null;
}

/** Inherited (digivolveEffect) and/or security effect; security text is self-labeled. */
function composeInherited(raw: RawCard): string | null {
  const parts = [text(raw.digivolveEffect), text(raw.securityEffect)].filter(
    (p): p is string => p !== null,
  );
  return parts.length ? parts.join("\n") : null;
}

/**
 * One upstream record → one Card per printing: the base card (variant '0')
 * plus one per unique English alt-art (variant 'P1', 'P2', …). Japanese
 * alt-arts (JAAs) are deliberately excluded (DECISIONS.md 2026-07-05).
 *
 * Tolerant by design: garbage records come out as garbage Cards (empty
 * cardId/name) — the 1.4 validation gates decide what gets dropped. This
 * function never throws on data.
 */
export function normalize(raw: RawCard): Card[] {
  const cardId = text(raw.id) ?? text(raw.cardNumber) ?? "";
  const nameField =
    typeof raw.name === "object" && raw.name !== null && "english" in raw.name
      ? (raw.name as { english?: unknown }).english
      : raw.name;
  const name = text(nameField) ?? "";

  const base: Card = {
    cardId,
    variant: "0",
    name,
    searchName: normalizeSearchName(name),
    cardType: text(raw.cardType),
    color: text(raw.color),
    level: firstInt(raw.cardLv),
    playCost: firstInt(raw.playCost),
    dp: firstInt(raw.dp),
    effect: composeEffect(raw),
    inherited: composeInherited(raw),
    setName: setName(raw.notes),
    rarity: text(raw.rarity),
    imageUrl: cardId ? `${IMAGE_BASE}/${cardId}.webp` : null,
    restriction: restriction(raw.restrictions),
  };

  const cards = [base];
  const seenVariants = new Set<string>();
  for (const aa of Array.isArray(raw.AAs) ? raw.AAs : []) {
    const aaRecord = aa as { id?: unknown; note?: unknown };
    const aaId = text(aaRecord.id);
    if (!aaId || !aaId.startsWith(`${cardId}_`)) continue;
    const variant = aaId.slice(cardId.length + 1);
    // The same variant id can appear twice (re-released in another set) —
    // one printing, one row; first occurrence wins.
    if (variant === "" || seenVariants.has(variant)) continue;
    seenVariants.add(variant);
    cards.push({
      ...base,
      variant,
      setName: text(aaRecord.note) ?? base.setName,
      imageUrl: `${IMAGE_BASE}/${aaId}.webp`,
    });
  }
  return cards;
}

export interface FetchCardsOptions {
  /** Injection point for tests — unit tests never touch the network. */
  fetchImpl?: typeof fetch;
  /** Source override (staging / forced-failure drills); defaults to SOURCE_URL. */
  url?: string;
  /** Attempts beyond the first (HANDOFF §8 Defense 1). */
  retries?: number;
  /** Delay before retry n (ms), doubled each attempt. */
  backoffMs?: number;
  timeoutMs?: number;
}

/**
 * Fetch the raw upstream dataset. Defensive per HANDOFF §8 Defense 1:
 * timeout, status check, retry with backoff on transient failure. Throws if
 * the feed can't be fetched or isn't a JSON array — the caller (sync
 * pipeline) treats any throw as "abort, live cache untouched".
 */
export async function fetchCards(options: FetchCardsOptions = {}): Promise<RawCard[]> {
  const {
    fetchImpl = fetch,
    url = SOURCE_URL,
    retries = 2,
    backoffMs = 1000,
    timeoutMs = 30_000,
  } = options;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, backoffMs * 2 ** (attempt - 1)));
    }
    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`card source responded ${response.status}`);
      }
      const data: unknown = await response.json();
      if (!Array.isArray(data)) {
        throw new Error("card source returned non-array JSON");
      }
      return data as RawCard[];
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`card source fetch failed after ${retries + 1} attempts: ${String(lastError)}`);
}
