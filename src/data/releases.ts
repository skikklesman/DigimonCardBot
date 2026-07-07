// Static set/release dataset for /release (chunk 4.2, DECISIONS.md
// 2026-07-06). The card source exposes no release dates (verified — set
// names per card only), so this is curated like the /keyword glossary:
// main product lines only (BT/EX/ST boosters and decks, LM packs, RB, AD,
// the combined special boosters). Promo/tournament/demo distributions are
// deliberately out of scope — they have event windows, not release dates.
//
// Dates are ENGLISH releases, verified 2026-07-06 against the official
// Bandai product pages (world.digimoncard.com/products, en.digimoncard.com).
// "YYYY-MM-DD" = confirmed day; "YYYY-MM" = announced month (upcoming or
// month-only listings). Where EN dates split by region (ST-11), the
// earliest is used. New sets arrive a few times a year — editing this file
// is the whole update job, same cadence as the keyword glossary.

export interface ReleaseSet {
  /** Product code as printed on the box, e.g. "BT-14". Unique — doubles as
   * the autocomplete value. */
  code: string;
  /** Official EN product name (subtitle for boosters). */
  name: string;
  /** Product line label, e.g. "Booster", "Starter Deck". */
  product: string;
  /** EN release date: "YYYY-MM-DD" (confirmed) or "YYYY-MM" (announced). */
  releasedEN: string;
  /** Substrings matched (case-insensitively) against D1 `set_name` for the
   * live card count. Omitted → derived as ["[CODE]", "CODE:"]. Empty array
   * → this product's cards are indistinguishable in the feed (LM-01/02 ship
   * under BT-15's set string); show no count rather than a wrong one. */
  matchers?: string[];
}

/** The D1 set_name substrings that identify a product's cards. */
export function setNameMatchers(set: ReleaseSet): string[] {
  return set.matchers ?? [`[${set.code}]`, `${set.code}:`];
}

export const RELEASES: ReleaseSet[] = [
  // — main boosters & special boosters —
  {
    code: "BT01-03 Ver.1.0",
    name: "Release Special Booster Ver.1.0",
    product: "Special Booster",
    releasedEN: "2021-02-12",
    matchers: ["SPECIAL BOOSTER 1.0", "SPECIAL BOOSTER VER.1.0"],
  },
  {
    code: "BT01-03 Ver.1.5",
    name: "Release Special Booster Ver.1.5",
    product: "Special Booster",
    releasedEN: "2021-03-12",
    matchers: ["SPECIAL BOOSTER 1.5", "SPECIAL BOOSTER VER.1.5"],
  },
  { code: "BT-04", name: "Great Legend", product: "Booster", releasedEN: "2021-06-11" },
  { code: "BT-05", name: "Battle of Omni", product: "Booster", releasedEN: "2021-08-06" },
  { code: "BT-06", name: "Double Diamond", product: "Booster", releasedEN: "2021-10-15" },
  { code: "BT-07", name: "Next Adventure", product: "Booster", releasedEN: "2022-03-04" },
  { code: "BT-08", name: "New Awakening", product: "Booster", releasedEN: "2022-05-13" },
  { code: "BT-09", name: "X Record", product: "Booster", releasedEN: "2022-07-29" },
  { code: "BT-10", name: "Xros Encounter", product: "Booster", releasedEN: "2022-10-14" },
  { code: "BT-11", name: "Dimensional Phase", product: "Booster", releasedEN: "2023-02-17" },
  { code: "BT-12", name: "Across Time", product: "Booster", releasedEN: "2023-04-28" },
  { code: "BT-13", name: "Versus Royal Knights", product: "Booster", releasedEN: "2023-07-21" },
  { code: "BT-14", name: "Blast Ace", product: "Booster", releasedEN: "2023-11-17" },
  { code: "BT-15", name: "Exceed Apocalypse", product: "Booster", releasedEN: "2024-02-16" },
  { code: "BT-16", name: "Beginning Observer", product: "Booster", releasedEN: "2024-05-24" },
  { code: "BT-17", name: "Secret Crisis", product: "Booster", releasedEN: "2024-08-09" },
  {
    code: "BT18-19",
    name: "Special Booster Ver.2.0",
    product: "Special Booster",
    releasedEN: "2024-11-01",
    matchers: ["[BT18-19]"],
  },
  {
    code: "BT19-20",
    name: "Special Booster Ver.2.5",
    product: "Special Booster",
    releasedEN: "2025-02-28",
    matchers: ["[BT19-20]"],
  },
  {
    code: "BT-21",
    name: "World Convergence",
    product: "Booster",
    releasedEN: "2025-04-25",
    // "BT-21:" alone would also sweep in the Illustration Celebration promo
    // pack, and "[BT-21]" is LM-05's set string upstream.
    matchers: ["BT-21: BOOSTER"],
  },
  { code: "BT-22", name: "Cyber Eden", product: "Booster", releasedEN: "2025-07-25" },
  { code: "BT-23", name: "Hackers' Slumber", product: "Booster", releasedEN: "2025-10-24" },
  { code: "BT-24", name: "Time Stranger", product: "Booster", releasedEN: "2026-01-23" },
  { code: "BT-25", name: "Dual Revolution", product: "Booster", releasedEN: "2026-05-22" },
  { code: "BT-26", name: "Timeless Bonds", product: "Booster", releasedEN: "2026-09-04" },

  // — theme / extra boosters —
  { code: "EX-01", name: "Classic Collection", product: "Theme Booster", releasedEN: "2021-12-10" },
  { code: "EX-02", name: "Digital Hazard", product: "Theme Booster", releasedEN: "2022-06-24" },
  { code: "EX-03", name: "Draconic Roar", product: "Theme Booster", releasedEN: "2022-11-11" },
  { code: "EX-04", name: "Alternative Being", product: "Theme Booster", releasedEN: "2023-06-23" },
  { code: "EX-05", name: "Animal Colosseum", product: "Theme Booster", releasedEN: "2024-01-19" },
  { code: "EX-06", name: "Infernal Ascension", product: "Theme Booster", releasedEN: "2024-06-28" },
  { code: "EX-07", name: "Digimon Liberator", product: "Extra Booster", releasedEN: "2024-09-13" },
  {
    code: "EX-08",
    name: "Chain of Liberation",
    product: "Extra Booster",
    releasedEN: "2025-01-10",
  },
  { code: "EX-09", name: "Versus Monsters", product: "Extra Booster", releasedEN: "2025-06-26" },
  { code: "EX-10", name: "Sinister Order", product: "Extra Booster", releasedEN: "2025-09-19" },
  { code: "EX-11", name: "Dawn of Liberator", product: "Extra Booster", releasedEN: "2026-02-13" },
  {
    code: "EX-12",
    name: "Digital World Shambala",
    product: "Extra Booster",
    releasedEN: "2026-07-03",
  },
  { code: "EX-13", name: "Chivalrous XIII", product: "Extra Booster", releasedEN: "2026-10" },

  // — starter / advanced decks —
  { code: "ST-01", name: "Gaia Red", product: "Starter Deck", releasedEN: "2021-01-29" },
  { code: "ST-02", name: "Cocytus Blue", product: "Starter Deck", releasedEN: "2021-01-29" },
  { code: "ST-03", name: "Heaven's Yellow", product: "Starter Deck", releasedEN: "2021-01-29" },
  { code: "ST-04", name: "Giga Green", product: "Starter Deck", releasedEN: "2021-06-11" },
  { code: "ST-05", name: "Machine Black", product: "Starter Deck", releasedEN: "2021-06-11" },
  { code: "ST-06", name: "Venomous Violet", product: "Starter Deck", releasedEN: "2021-06-11" },
  { code: "ST-07", name: "Gallantmon", product: "Starter Deck", releasedEN: "2021-10-15" },
  { code: "ST-08", name: "UlforceVeedramon", product: "Starter Deck", releasedEN: "2021-10-15" },
  {
    code: "ST-09",
    name: "Ultimate Ancient Dragon",
    product: "Starter Deck",
    releasedEN: "2022-05-13",
  },
  {
    code: "ST-10",
    name: "Parallel World Tactician",
    product: "Starter Deck",
    releasedEN: "2022-05-13",
  },
  { code: "ST-11", name: "Special Entry Set", product: "Starter Deck", releasedEN: "2022-10-14" },
  { code: "ST-12", name: "Jesmon", product: "Starter Deck", releasedEN: "2022-10-14" },
  { code: "ST-13", name: "RagnaLoardmon", product: "Starter Deck", releasedEN: "2022-10-14" },
  { code: "ST-14", name: "Beelzemon", product: "Advanced Deck Set", releasedEN: "2023-03-24" },
  { code: "ST-15", name: "Dragon of Courage", product: "Starter Deck", releasedEN: "2023-10-13" },
  { code: "ST-16", name: "Wolf of Friendship", product: "Starter Deck", releasedEN: "2023-10-13" },
  { code: "ST-17", name: "Double Typhoon", product: "Advanced Deck Set", releasedEN: "2024-03-08" },
  { code: "ST-18", name: "Guardian Vortex", product: "Starter Deck", releasedEN: "2024-09-13" },
  { code: "ST-19", name: "Fable Waltz", product: "Starter Deck", releasedEN: "2024-09-13" },
  { code: "ST-20", name: "Protector of Light", product: "Starter Deck", releasedEN: "2025-04-18" },
  { code: "ST-21", name: "Hero of Hope", product: "Starter Deck", releasedEN: "2025-04-18" },
  {
    code: "ST-22",
    name: "Amethyst Mandala",
    product: "Advanced Deck Set",
    releasedEN: "2025-12-05",
  },
  { code: "ST-23", name: "Digimon Beatbreak", product: "Starter Deck", releasedEN: "2026-05-15" },
  {
    code: "ST-24",
    name: "Digimon Data Squad",
    product: "Starter Deck",
    releasedEN: "2026-05-15",
  },

  // — everything else with a real product release —
  {
    code: "RB-01",
    name: "Resurgence Booster",
    product: "Booster",
    releasedEN: "2023-09-29",
    matchers: ["[RB01]", "RB-01"], // upstream brackets it unhyphenated
  },
  {
    code: "AD-01",
    name: "Digimon Generation",
    product: "Advanced Booster",
    releasedEN: "2026-03-27",
  },
  {
    code: "LM-01",
    name: "Digimon Ghost Game",
    product: "Limited Card Pack",
    releasedEN: "2023-07-22",
    matchers: [], // LM-01/02 cards ship under BT-15's set string upstream
  },
  {
    code: "LM-02",
    name: "DeathXmon",
    product: "Limited Card Pack",
    releasedEN: "2023-11-12",
    matchers: [],
  },
  {
    code: "LM-03/04",
    name: "Special Limited Set",
    product: "Limited Card Set",
    releasedEN: "2024-12-13",
    matchers: ["[LM03-04]"], // survives the upstream "SPEICIAL" typo
  },
  {
    code: "LM-05",
    name: "Shield of the Just",
    product: "Limited Card Pack",
    releasedEN: "2025-03-21",
    matchers: ["LIMITED CARD PACK [BT-21]"], // upstream files it under BT-21
  },
  { code: "LM-06", name: "Billion Bullet", product: "Limited Card Pack", releasedEN: "2025-10" },
  { code: "LM-07", name: "Another Knight", product: "Limited Card Pack", releasedEN: "2026-03" },
  { code: "LM-08", name: "Final Crest", product: "Limited Card Pack", releasedEN: "2026-08" },
  { code: "LM-09", name: "Distancia Cero", product: "Limited Card Pack", releasedEN: "2026-11" },
];
