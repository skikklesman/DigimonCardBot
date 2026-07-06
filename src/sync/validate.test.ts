// Validation-gate unit tests (chunk 1.4) — one test per documented
// catastrophe (TESTING.md §2 / HANDOFF §8). Two catastrophes are handled a
// layer earlier and tested with the adapter (1.3): truncated JSON and an
// HTML error page both fail fetchCards' parse/array check. Their degraded
// cousins (parseable-but-short feed, junk records) land here.
import { describe, expect, it } from "vitest";
import type { Card } from "../data/schema.ts";
import fixture from "../../test/fixtures/digimoncard-app-cards.json";
import { EXPECTED_FIELDS } from "./adapter/digimoncard-app.ts";
import { checkSchemaDrift, checkShrink, validateCards } from "./validate.ts";

const raws = fixture as Record<string, unknown>[];

function card(overrides: Partial<Card> = {}): Card {
  return {
    cardId: "BT1-010",
    variant: "0",
    name: "Agumon",
    searchName: "agumon",
    cardType: "Digimon",
    color: "Red",
    level: 3,
    playCost: 3,
    dp: 2000,
    effect: null,
    inherited: null,
    setName: null,
    rarity: "C",
    imageUrl: null,
    ...overrides,
  };
}

describe("checkShrink (shrink guard)", () => {
  it("CATASTROPHE: empty incoming array is refused, even on first sync", () => {
    expect(checkShrink(0, 0).ok).toBe(false);
    expect(checkShrink(0, 9000).ok).toBe(false);
  });

  it("CATASTROPHE: feed shrunk >10% is refused (truncated-feed case)", () => {
    const result = checkShrink(8000, 9000); // ~11% shrink
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("8000");
  });

  it("a 9% shrink PASSES — sets do rotate out legitimately", () => {
    expect(checkShrink(8190, 9000).ok).toBe(true);
  });

  it("growth always passes (new set released)", () => {
    expect(checkShrink(9400, 9000).ok).toBe(true);
  });

  it("first sync (live count 0) passes for any non-empty batch", () => {
    expect(checkShrink(4295, 0).ok).toBe(true);
  });
});

describe("validateCards (per-record validation)", () => {
  it("passes a clean batch through untouched", () => {
    const result = validateCards([card(), card({ cardId: "BT1-011", variant: "P1" })]);
    expect(result.valid).toHaveLength(2);
    expect(result.dropped).toBe(0);
    expect(result.dropSpikeWarning).toBeNull();
  });

  it("CATASTROPHE: one bad card among good ones is dropped AND counted; batch proceeds", () => {
    const result = validateCards([card(), card({ cardId: "" }), card({ cardId: "BT1-012" })]);
    expect(result.valid.map((c) => c.cardId)).toEqual(["BT1-010", "BT1-012"]);
    expect(result.dropped).toBe(1);
    expect(result.dropReasons[0]).toContain("empty id");
  });

  it("drops cards whose name normalizes to nothing (unsearchable)", () => {
    const result = validateCards([card({ name: "()!&", searchName: "" })]);
    expect(result.valid).toHaveLength(0);
    expect(result.dropReasons[0]).toContain("unsearchable");
  });

  it("keeps a cosmetically garbaged card that still has a stable id + name (HANDOFF §8 rule; fixture P-226)", () => {
    const p226 = card({ cardId: "P-226", name: "[[:Category:|]]", searchName: "category" });
    expect(validateCards([p226]).valid).toHaveLength(1);
  });

  it("warns (not aborts) when drops exceed 1% of the batch", () => {
    const batch = [
      ...Array.from({ length: 97 }, () => card()),
      card({ cardId: "" }),
      card({ cardId: "" }),
    ];
    const result = validateCards(batch);
    expect(result.valid).toHaveLength(97);
    expect(result.dropSpikeWarning).toContain("2/99");
  });
});

describe("checkSchemaDrift (two-directional)", () => {
  it("passes the real captured feed with no findings", () => {
    const result = checkSchemaDrift(raws, EXPECTED_FIELDS);
    expect(result).toEqual({ ok: true, missingFields: [], unknownFields: [] });
  });

  it("CATASTROPHE: a renamed required field aborts (id → cardCode)", () => {
    const renamed = raws.map(({ id, ...rest }) => ({ ...rest, cardCode: id }));
    const result = checkSchemaDrift(renamed, EXPECTED_FIELDS);
    expect(result.ok).toBe(false);
    expect(result.missingFields).toContain("id");
    // the rename's other half shows up as an unknown field — nice diagnosis
    expect(result.unknownFields).toContain("cardCode");
  });

  it("an unknown NEW field warns but does not abort (new-mechanic early warning)", () => {
    const withNew = raws.map((r) => ({ ...r, overclockEffect: "＜Overclock＞" }));
    const result = checkSchemaDrift(withNew, EXPECTED_FIELDS);
    expect(result.ok).toBe(true);
    expect(result.unknownFields).toEqual(["overclockEffect"]);
  });

  it("a required field present in only a minority of records counts as missing", () => {
    const degraded = raws.map(({ dp, ...rest }, i) => (i === 0 ? { ...rest, dp } : rest));
    const result = checkSchemaDrift(degraded, EXPECTED_FIELDS);
    expect(result.ok).toBe(false);
    expect(result.missingFields).toEqual(["dp"]);
  });

  it("CATASTROPHE: junk records (HTML fragments parsed as strings) fail every required field", () => {
    const result = checkSchemaDrift(["<html>", "<body>", null], EXPECTED_FIELDS);
    expect(result.ok).toBe(false);
    expect(result.missingFields).toEqual([...EXPECTED_FIELDS.required]);
  });

  it("an empty feed reports all required fields missing (no false OK)", () => {
    const result = checkSchemaDrift([], EXPECTED_FIELDS);
    expect(result.ok).toBe(false);
  });
});
