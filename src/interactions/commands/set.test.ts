// /set tests (chunk 4.2, as /release; renamed in 4.9): dataset integrity +
// handler resolution + static autocomplete. The repo is stubbed —
// countSetCards has its own integration tests in data/repo.test.ts.
import { describe, expect, it } from "vitest";
import type { APIInteractionResponse } from "discord-api-types/v10";
import { RELEASES, setNameMatchers } from "../../data/releases.ts";
import { normalizeSearchName } from "../../data/schema.ts";
import type { CardRepo } from "../../data/repo.ts";
import { createSetAutocomplete, createSetCommand } from "./set.ts";

function stubRepo(counts = { cards: 104, printings: 118 }) {
  const calls: string[][] = [];
  const repo = {
    countSetCards: (matchers: string[]) => {
      calls.push(matchers);
      return Promise.resolve(counts);
    },
  } as unknown as CardRepo;
  return { repo, calls };
}

const invoke = (set: string, repo = stubRepo().repo) =>
  createSetCommand(repo)({
    type: 2,
    data: { name: "set", options: [{ name: "set", type: 3, value: set }] },
  } as never);

const suggest = (typed: string) =>
  createSetAutocomplete()({
    type: 4,
    data: { name: "set", options: [{ name: "set", type: 3, value: typed, focused: true }] },
  } as never);

type Loose = {
  data: {
    content?: string;
    flags?: number;
    embeds?: Array<{ title: string; fields: Array<{ name: string; value: string }> }>;
  };
};
const loose = (r: APIInteractionResponse) => (r as unknown as Loose).data;

describe("release dataset integrity", () => {
  it("has unique codes, also after normalization (they are autocomplete values)", () => {
    const seen = new Set<string>();
    for (const s of RELEASES) {
      const key = normalizeSearchName(s.code).replace(/\s/g, "");
      expect(seen.has(key), `duplicate code: ${s.code}`).toBe(false);
      seen.add(key);
    }
  });

  it("has well-formed EN dates (ISO day, or ISO month for announcements)", () => {
    for (const s of RELEASES) {
      expect(s.releasedEN, s.code).toMatch(/^\d{4}-(0[1-9]|1[0-2])(-([0-2]\d|3[01]))?$/);
    }
  });

  it("keeps every autocomplete label inside Discord's 100-char cap", () => {
    for (const s of RELEASES) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.product.length).toBeGreaterThan(0);
      expect(`${s.code} — ${s.name}`.length).toBeLessThanOrEqual(100);
    }
  });

  it("uses no LIKE metacharacters in count matchers", () => {
    for (const s of RELEASES) {
      for (const m of setNameMatchers(s)) {
        expect(m, `${s.code} matcher`).not.toMatch(/[%_]/);
        expect(m.length).toBeGreaterThan(3);
      }
    }
  });
});

describe("/set resolution", () => {
  it("resolves an exact code with the live tally", async () => {
    const { repo, calls } = stubRepo();
    const data = loose(await invoke("BT-14", repo));
    expect(data.embeds?.[0]?.title).toBe("BT-14 — Blast Ace");
    expect(data.embeds?.[0]?.fields).toContainEqual({
      name: "In my card data",
      value: "104 cards · 118 printings",
      inline: true,
    });
    expect(calls).toEqual([["[BT-14]", "BT-14:"]]);
  });

  it("resolves the compact code form players actually type (bt14)", async () => {
    const data = loose(await invoke("bt14"));
    expect(data.embeds?.[0]?.title).toBe("BT-14 — Blast Ace");
  });

  it("resolves a set name, case-insensitively", async () => {
    const data = loose(await invoke("beginning observer"));
    expect(data.embeds?.[0]?.title).toBe("BT-16 — Beginning Observer");
  });

  it("resolves every autocomplete value it hands out", async () => {
    for (const s of RELEASES) {
      const data = loose(await invoke(s.code));
      expect(data.embeds?.[0]?.title, s.code).toBe(`${s.code} — ${s.name}`);
    }
  });

  it("lists candidates for an ambiguous prefix, ephemerally", async () => {
    const data = loose(await invoke("bt1"));
    expect(data.flags).toBe(64);
    expect(data.content).toContain("BT-14");
    expect(data.content).toContain("BT-16");
  });

  it("skips the tally (and the repo) when a product has no matchers", async () => {
    const { repo, calls } = stubRepo();
    const data = loose(await invoke("LM-01", repo));
    expect(data.embeds?.[0]?.title).toBe("LM-01 — Digimon Ghost Game");
    expect(data.embeds?.[0]?.fields?.some((f) => f.name === "In my card data")).toBe(false);
    expect(calls).toEqual([]);
  });

  it("admits ignorance for unknown sets (new-product caveat included)", async () => {
    const data = loose(await invoke("zzzznotaset"));
    expect(data.flags).toBe(64);
    expect(data.content).toContain("brand-new products");
  });
});

describe("/set autocomplete", () => {
  it("suggests newest releases first before typing (router caps at 25)", async () => {
    const choices = await suggest("");
    expect(choices.length).toBe(RELEASES.length);
    const dates = choices.map((c) => RELEASES.find((s) => s.code === c.value)?.releasedEN ?? "");
    expect(dates).toEqual([...dates].sort((a, b) => b.localeCompare(a)));
  });

  it("filters by code prefix, including the compact form", async () => {
    const choices = await suggest("bt2");
    expect(choices.length).toBeGreaterThan(0);
    for (const c of choices) expect(String(c.value).startsWith("BT-2")).toBe(true);
  });

  it("filters by name and labels as CODE — Name with the code as value", async () => {
    const choices = await suggest("gallantmon");
    expect(choices).toEqual([{ name: "ST-07 — Gallantmon", value: "ST-07" }]);
  });
});
