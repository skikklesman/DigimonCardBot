// Choice-restriction partner map (chunk 4.6 amendment, owner call
// 2026-07-07): the upstream feed only says a card IS choice-restricted;
// the official Banned & Restricted page defines WHICH cards conflict
// (en.digimoncard.com/rule/restriction_card — the verification source,
// checked 2026-07-07). Hand-maintained like keywords.ts/releases.ts: a
// stale map degrades to the generic no-partners wording (embeds.ts falls
// back when a card id is missing here), never to a wrong pairing.
//
// NOT symmetric by design: per the official ruling, BT17-035 and EX8-037
// each conflict only with BT20-037 — they may share a deck with each other.
export const CHOICE_PARTNERS: Readonly<Record<string, readonly string[]>> = {
  "EX2-007": ["EX7-064"],
  "EX7-064": ["EX2-007"],
  "BT20-037": ["BT17-035", "EX8-037"],
  "BT17-035": ["BT20-037"],
  "EX8-037": ["BT20-037"],
};
