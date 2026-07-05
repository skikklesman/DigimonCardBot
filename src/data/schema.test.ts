// search_name normalization (chunk 1.3). Table-driven per TESTING.md §2 —
// the sync (write) and autocomplete (query) paths both call this function,
// so this table IS the definition of what users can type and still match.
import { describe, expect, it } from "vitest";
import { normalizeSearchName } from "./schema";

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
});
