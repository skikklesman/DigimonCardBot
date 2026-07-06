// /keyword tests (chunk 4.1): dataset integrity + handler resolution +
// static autocomplete. Everything in-memory, no D1.
import { describe, expect, it } from "vitest";
import type { APIInteractionResponse } from "discord-api-types/v10";
import { KEYWORDS } from "../../data/keywords.ts";
import { normalizeSearchName } from "../../data/schema.ts";
import { createKeywordAutocomplete, createKeywordCommand } from "./keyword.ts";

const handle = createKeywordCommand();
const complete = createKeywordAutocomplete();

const invoke = (term: string) =>
  handle({
    type: 2,
    data: { name: "keyword", options: [{ name: "term", type: 3, value: term }] },
  } as never);

const suggest = (typed: string) =>
  complete({
    type: 4,
    data: { name: "keyword", options: [{ name: "term", type: 3, value: typed, focused: true }] },
  } as never);

type Loose = {
  data: {
    content?: string;
    flags?: number;
    embeds?: Array<{ title: string; description: string }>;
  };
};
const loose = (r: APIInteractionResponse) => (r as unknown as Loose).data;

describe("keyword dataset integrity", () => {
  it("has non-empty rules text within Discord limits, everywhere", () => {
    for (const k of KEYWORDS) {
      expect(k.name.length).toBeGreaterThan(0);
      expect(k.text.length).toBeGreaterThan(20);
      expect(k.text.length).toBeLessThanOrEqual(1024);
    }
  });

  it("has no duplicate normalized names or aliases", () => {
    const seen = new Set<string>();
    for (const k of KEYWORDS) {
      for (const name of [k.name, ...(k.aliases ?? [])]) {
        const key = normalizeSearchName(name);
        expect(seen.has(key), `duplicate: ${name}`).toBe(false);
        seen.add(key);
      }
    }
  });
});

describe("/keyword resolution", () => {
  it("matches a canonical name exactly", async () => {
    const data = loose(await invoke("Blocker"));
    expect(data.embeds?.[0]?.title).toBe("＜Blocker＞");
    expect(data.embeds?.[0]?.description).toContain("suspend this Digimon");
  });

  it("matches case-insensitively with punctuation noise", async () => {
    const data = loose(await invoke("de-digivolve"));
    expect(data.embeds?.[0]?.title).toContain("De-Digivolve");
  });

  it("matches aliases (SA → Security Attack)", async () => {
    const data = loose(await invoke("sa"));
    expect(data.embeds?.[0]?.title).toContain("Security Attack");
  });

  it("matches names with the N placeholder omitted", async () => {
    const data = loose(await invoke("draw"));
    expect(data.embeds?.[0]?.title).toContain("Draw");
  });

  it("resolves an unambiguous prefix", async () => {
    const data = loose(await invoke("retal"));
    expect(data.embeds?.[0]?.title).toBe("＜Retaliation＞");
  });

  it("lists candidates for an ambiguous prefix, ephemerally", async () => {
    const data = loose(await invoke("bl"));
    expect(data.flags).toBe(64);
    expect(data.content).toContain("Blocker");
    expect(data.content).toContain("Blitz");
  });

  it("admits ignorance for unknown terms (new-mechanic caveat included)", async () => {
    const data = loose(await invoke("zzzznotakeyword"));
    expect(data.flags).toBe(64);
    expect(data.content).toContain("brand-new mechanic");
  });
});

describe("/keyword autocomplete", () => {
  it("suggests from the full list before typing (router caps at 25)", async () => {
    const choices = await suggest("");
    expect(choices.length).toBe(KEYWORDS.length);
  });

  it("filters by normalized prefix, including aliases", async () => {
    const choices = await suggest("digi");
    const names = choices.map((c) => c.name);
    expect(names).toContain("Digi-Burst N");
    expect(names).toContain("DigiXros N"); // via alias "DigiXros"
    expect(names).not.toContain("Blocker");
  });

  it("suggests canonical names as both label and value", async () => {
    const [choice] = await suggest("blocker");
    expect(choice).toEqual({ name: "Blocker", value: "Blocker" });
  });
});
