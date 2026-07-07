// Adapter unit tests (chunk 1.3) — fixture-driven per TESTING.md §2: real
// captured upstream records (test/fixtures, provenance in its README), never
// the network. If upstream changes shape, the weekly source-contract check
// catches it live; these tests pin what we BELIEVED the shape was.
import { describe, expect, it } from "vitest";
import fixture from "../../../test/fixtures/digimoncard-app-cards.json";
import { fetchCards, normalize, SOURCE_URL, type RawCard } from "./digimoncard-app.ts";

const raws = fixture as RawCard[];
const byId = new Map(raws.map((r) => [r.id as string, r]));
const one = (id: string): RawCard => {
  const raw = byId.get(id);
  if (!raw) throw new Error(`fixture record ${id} missing`);
  return raw;
};

describe("normalize — base card mapping", () => {
  it("maps a Digimon card's scalar fields (BT14-018 Goldramon)", () => {
    const [base] = normalize(one("BT14-018"));
    expect(base).toMatchObject({
      cardId: "BT14-018",
      variant: "0",
      name: "Goldramon",
      searchName: "goldramon",
      cardType: "Digimon",
      color: "Red/Yellow",
      level: 6, // parsed from "Lv.6"
      playCost: 12,
      dp: 12000,
      rarity: "R",
    });
    expect(base?.imageUrl).toBe(
      "https://raw.githubusercontent.com/TakaOtaku/Digimon-Card-App/main/src/assets/images/cards/BT14-018.webp",
    );
  });

  it("turns the upstream '-' sentinel into null (EX1-066 Tamer)", () => {
    const [base] = normalize(one("EX1-066"));
    expect(base).toMatchObject({ cardType: "Tamer", level: null, dp: null, playCost: 2 });
  });

  it("strips the decorative ▹ from set names", () => {
    const [base] = normalize(one("EX1-066"));
    expect(base?.setName).toBe("THEME BOOSTER CLASSIC COLLECTION [EX-01]");
  });

  it("normalizes punctuated names for search (BT16-014)", () => {
    const [base] = normalize(one("BT16-014"));
    expect(base?.name).toBe("Goldramon (X Antibody)");
    expect(base?.searchName).toBe("goldramon x antibody");
  });

  it("keeps Option card text, which upstream stores in `effect` (BT1-095)", () => {
    const [base] = normalize(one("BT1-095"));
    expect(base?.cardType).toBe("Option");
    expect(base?.effect).toBeTruthy();
  });

  it("passes dual-typed cards through untouched (BT25-043 Digimon/Option)", () => {
    const [base] = normalize(one("BT25-043"));
    expect(base?.cardType).toBe("Digimon/Option");
    expect(base?.effect).toContain("[Arts Digivolve]");
  });

  it("never throws on the garbage record (P-226) — dropping is 1.4's job", () => {
    const cards = normalize(one("P-226"));
    expect(cards[0]).toMatchObject({ cardId: "P-226", variant: "0", cardType: null });
  });
});

describe("normalize — effect folding", () => {
  it("labels ACE text and keeps self-labeled mechanics as-is (AD1-005)", () => {
    const [base] = normalize(one("AD1-005"));
    expect(base?.effect).toContain("[ACE] Overflow");
    expect(base?.effect).toContain("[App Fusion]"); // specialDigivolve, self-labeled
  });

  it("folds all three LINK fields (BT21-009)", () => {
    const [base] = normalize(one("BT21-009"));
    expect(base?.effect).toContain("[Link]"); // linkRequirement, self-labeled
    expect(base?.effect).toContain("[Link DP] +2000 DP");
    expect(base?.effect).toContain("[Link Effect]");
  });

  it("composes inherited from digivolveEffect (AD1-009)", () => {
    const [base] = normalize(one("AD1-009"));
    expect(base?.inherited).toBe("＜Security A. +1＞");
  });

  it("composes inherited from the self-labeled security effect (EX1-066)", () => {
    const [base] = normalize(one("EX1-066"));
    expect(base?.inherited).toContain("[Security]");
  });
});

describe("normalize — restriction mapping (chunk 4.6)", () => {
  it("stores the English restriction verbatim (BT1-090 Restricted to 1)", () => {
    const [base] = normalize(one("BT1-090"));
    expect(base?.restriction).toBe("Restricted to 1");
  });

  it("maps the common 'Unrestricted' to null (EX1-066)", () => {
    const [base] = normalize(one("EX1-066"));
    expect(base?.restriction).toBeNull();
  });

  it("keeps 'Not released' as data — display filtering is the embed's job (P-226)", () => {
    const [base] = normalize(one("P-226"));
    expect(base?.restriction).toBe("Not released");
  });

  it("returns null for a missing or malformed restrictions object", () => {
    const raw = { ...one("BT1-090") };
    delete (raw as Record<string, unknown>).restrictions;
    expect(normalize(raw)[0]?.restriction).toBeNull();
    expect(normalize({ ...raw, restrictions: "Banned" })[0]?.restriction).toBeNull();
    expect(normalize({ ...raw, restrictions: { english: 42 } })[0]?.restriction).toBeNull();
  });

  it("alt-art variants inherit the base card's restriction", () => {
    const cards = normalize({ ...one("EX1-066"), restrictions: { english: "Banned" } });
    expect(cards.length).toBeGreaterThan(1);
    expect(cards.every((c) => c.restriction === "Banned")).toBe(true);
  });
});

describe("normalize — alt-art variants", () => {
  it("expands EX1-066 into base + 5 unique variants (double P3 deduped)", () => {
    const cards = normalize(one("EX1-066"));
    expect(cards.map((c) => c.variant)).toEqual(["0", "P1", "P2", "P3", "P4", "P5"]);
  });

  it("gives variants their own image and set, inheriting everything else", () => {
    const cards = normalize(one("EX1-066"));
    const p1 = cards.find((c) => c.variant === "P1");
    expect(p1?.imageUrl).toBe(
      "https://raw.githubusercontent.com/TakaOtaku/Digimon-Card-App/main/src/assets/images/cards/EX1-066_P1.webp",
    );
    expect(p1?.setName).toBe("EX-01: Theme Booster Classic Collection");
    expect(p1?.name).toBe("Analog Youth");
    expect(p1?.searchName).toBe("analog youth");
  });

  it("excludes Japanese alt-arts (JAAs) by design", () => {
    const cards = normalize(one("EX1-066"));
    expect(cards.some((c) => c.variant.endsWith("-J"))).toBe(false);
  });

  it("emits only the base card when there are no alt-arts (P-226)", () => {
    expect(normalize(one("P-226"))).toHaveLength(1);
  });
});

describe("normalize — full fixture sweep", () => {
  it("produces schema-shaped rows for every captured record without throwing", () => {
    for (const raw of raws) {
      for (const card of normalize(raw)) {
        expect(typeof card.cardId).toBe("string");
        expect(typeof card.variant).toBe("string");
        expect(card.variant.length).toBeGreaterThan(0);
        expect(typeof card.searchName).toBe("string");
      }
    }
  });
});

describe("fetchCards", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });

  it("fetches SOURCE_URL and returns the parsed array", async () => {
    const seen: string[] = [];
    const stub: typeof fetch = (input) => {
      seen.push(String(input));
      return Promise.resolve(jsonResponse(raws));
    };
    const result = await fetchCards({ fetchImpl: stub });
    expect(seen).toEqual([SOURCE_URL]);
    expect(result).toHaveLength(raws.length);
  });

  it("retries transient failures with backoff (503 then 200)", async () => {
    let calls = 0;
    const stub: typeof fetch = () => {
      calls++;
      return Promise.resolve(calls === 1 ? jsonResponse({}, 503) : jsonResponse(raws));
    };
    await expect(fetchCards({ fetchImpl: stub, backoffMs: 0 })).resolves.toHaveLength(raws.length);
    expect(calls).toBe(2);
  });

  it("gives up after retries are exhausted and reports the attempt count", async () => {
    const stub: typeof fetch = () => Promise.resolve(jsonResponse({}, 500));
    await expect(fetchCards({ fetchImpl: stub, retries: 2, backoffMs: 0 })).rejects.toThrow(
      /failed after 3 attempts.*500/,
    );
  });

  it("rejects a 200 whose body is not a JSON array (HTML error page case)", async () => {
    const stub: typeof fetch = () =>
      Promise.resolve(new Response("<html>oops</html>", { status: 200 }));
    await expect(fetchCards({ fetchImpl: stub, retries: 0, backoffMs: 0 })).rejects.toThrow(
      /failed after 1 attempts/,
    );
  });

  it("rejects a 200 with a JSON object instead of an array", async () => {
    const stub: typeof fetch = () => Promise.resolve(jsonResponse({ cards: [] }));
    await expect(fetchCards({ fetchImpl: stub, retries: 0, backoffMs: 0 })).rejects.toThrow(
      /non-array JSON/,
    );
  });
});
