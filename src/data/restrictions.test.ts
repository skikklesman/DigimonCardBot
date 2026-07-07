// Dataset-integrity tests for the curated choice-partner map (chunk 4.6
// amendment) — same spirit as the keywords/releases integrity tests: the
// data is hand-maintained, so pin the invariants an edit could break.
import { describe, expect, it } from "vitest";
import { CHOICE_PARTNERS } from "./restrictions.ts";

describe("CHOICE_PARTNERS integrity", () => {
  const entries = Object.entries(CHOICE_PARTNERS);

  it("every partner id is itself a mapped choice-restricted card", () => {
    for (const [, partners] of entries) {
      for (const partner of partners) {
        expect(CHOICE_PARTNERS[partner], `partner ${partner} missing from map`).toBeDefined();
      }
    }
  });

  it("no card conflicts with itself, and no partner list is empty", () => {
    for (const [cardId, partners] of entries) {
      expect(partners.length).toBeGreaterThan(0);
      expect(partners).not.toContain(cardId);
    }
  });

  it("conflicts point back: if A lists B, B lists A", () => {
    // The MAP is asymmetric in shape (different lists per card), but the
    // conflict relation itself is mutual — two cards either clash or don't.
    for (const [cardId, partners] of entries) {
      for (const partner of partners) {
        expect(CHOICE_PARTNERS[partner] ?? [], `${partner} does not list ${cardId} back`).toContain(
          cardId,
        );
      }
    }
  });

  it("card ids look like real printing ids (SET-NNN)", () => {
    for (const [cardId, partners] of entries) {
      for (const id of [cardId, ...partners]) {
        expect(id).toMatch(/^[A-Z]+\d*-\d+$/);
      }
    }
  });
});
