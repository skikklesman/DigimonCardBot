# digimoncard-app-cards.json — source contract fixture

Verbatim records captured from the chosen card source (chunk 1.2 /
DECISIONS.md 2026-07-05). **Do not hand-edit records** — they are the
contract: adapter tests (chunk 1.3) parse these to prove we understand the
upstream shape, so edits would test our imagination instead of reality.

## Provenance

- **Source file:** `src/assets/cardlists/DigimonCards.json` in
  [TakaOtaku/Digimon-Card-App](https://github.com/TakaOtaku/Digimon-Card-App)
- **Captured:** 2026-07-05, upstream commit
  `20e2841827b9833ddd7c6f1da32461a48c94b4f3` (2026-07-04)
- **Full dataset at capture:** 4,295 cards, 8.4 MB — this fixture is a
  17-record subset (records verbatim, file re-indented); the full file is
  deliberately not committed.

## What the subset covers (why each record is here)

| id       | why                                                              |
| -------- | ---------------------------------------------------------------- |
| EX1-066  | Tamer with many `AAs` + `JAAs` — the variant-modelling workhorse |
| BT14-018 | Digimon: digivolveCondition, inherited effect; Goldramon         |
| BT16-014 | second Goldramon printing — multi-match / disambiguation         |
| BT1-001  | Digi-Egg type                                                    |
| BT1-095  | Option card (note: text is in `effect`, NOT `optionCardEffect`)  |
| AD1-005  | ACE mechanic (`aceEffect`)                                       |
| BT21-009 | LINK mechanic (`linkEffect`)                                     |
| AD1-009  | `assembly` mechanic                                              |
| AD1-013  | `rule` text field                                                |
| BT1-090  | restricted/banned card (`restrictions`)                          |
| AD1-004  | multi-color (`Red/Black`)                                        |
| AD1-006  | `digiXros` requirement                                           |
| AD1-011  | DNA digivolve                                                    |
| P-226    | **empty** `cardType` — real data-quality edge                    |
| BT25-043 | dual `Digimon/Option` cardType                                   |
| AD1-019  | punctuation in name — search_name normalization case             |
| P-001    | promo (`P-`) set numbering                                       |

## Upstream shape notes (verified at capture)

- `"-"` (and sometimes `""`) is the null sentinel throughout; `name` is an
  object keyed by language; `restrictions` keyed by region.
- Alt-arts: `AAs` / `JAAs` arrays with per-variant `id` (`EX1-066_P1`),
  `illustrator`, `note` (set), `type` (treatment). The same variant id can
  appear twice (re-released in another set).
- Images: `https://digimoncard.app/assets/images/cards/{id}.webp` and the
  same path under
  `https://raw.githubusercontent.com/TakaOtaku/Digimon-Card-App/main/src/assets/images/cards/`
  — both verified 200 for base and `_P<n>` variant ids.
- Option cards: `optionCardEffect` / `optionCardColourRequirement` were `"-"`
  on **all 527** Option cards — effect text lives in `effect`.
