// search_name normalization (chunk 1.3). Table-driven per TESTING.md §2 —
// the sync (write) and autocomplete (query) paths both call this function,
// so this table IS the definition of what users can type and still match.
import { describe, expect, it } from "vitest";
import { normalizeSearchName } from "./schema.ts";
import { HOSTILE_STRINGS } from "../../test/fixtures/fuzz-inputs.ts";

const CASES: ReadonlyArray<[input: string, expected: string]> = [
  // plain names
  ["Analog Youth", "analog youth"],
  ["Goldramon", "goldramon"],
  // punctuation becomes a single space; typing the printed name always matches
  ["Goldramon (X Antibody)", "goldramon x antibody"],
  ["Habakirimon/Habakiri", "habakirimon habakiri"],
  ["Matt Ishida & T.K. Takaishi", "matt ishida t k takaishi"],
  ["ADR-01 Jeri", "adr 01 jeri"],
  // diacritics stripped (NFKD)
  ["Épée Ångström", "epee angstrom"],
  // whitespace collapsed, edges trimmed
  ["  weird   spacing  ", "weird spacing"],
  // degenerate inputs come out empty rather than throwing
  ["", ""],
  ["()!&", ""],
];

describe("normalizeSearchName", () => {
  it.each(CASES)("%j → %j", (input, expected) => {
    expect(normalizeSearchName(input)).toBe(expected);
  });

  it("is idempotent (normalizing a normalized name is a no-op)", () => {
    for (const [, expected] of CASES) {
      expect(normalizeSearchName(expected)).toBe(expected);
    }
  });

  // The repo's autocomplete hot path (SEARCH_BY_NAME_SQL) is an index RANGE
  // whose bounds are sound ONLY IF this function's output stays inside the
  // alphabet [a-z0-9 space], all below '{' (repo.ts). Fuzz that invariant
  // against the hostile corpus so a future edit can't quietly break the range
  // and de-index the query (chunk 4.5).
  describe("output-alphabet invariant (index-range soundness)", () => {
    it.each(HOSTILE_STRINGS.map((s, i) => [i, s] as const))(
      "hostile input #%i normalizes into [a-z0-9 space], trimmed",
      (_i, input) => {
        const out = normalizeSearchName(input);
        expect(out).toMatch(/^[a-z0-9 ]*$/);
        expect(out).toBe(out.trim());
        expect(out).not.toContain("  "); // runs collapsed to a single space
        // Every character sorts below '{' (0x7b), the range's upper sentinel.
        for (const ch of out) expect(ch.codePointAt(0)!).toBeLessThan(0x7b);
      },
    );

    it("is idempotent on hostile inputs too", () => {
      for (const input of HOSTILE_STRINGS) {
        const once = normalizeSearchName(input);
        expect(normalizeSearchName(once)).toBe(once);
      }
    });
  });
});
