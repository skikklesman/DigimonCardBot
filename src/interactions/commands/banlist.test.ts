// /banlist tests (chunk 4.7): the handler is a thin delegate — grouping
// and wording are snapshot-tested in embeds.test.ts, the query in
// data/repo.test.ts. The repo is stubbed, set.test.ts-style.
import { describe, expect, it } from "vitest";
import type { Card } from "../../data/schema.ts";
import type { CardRepo } from "../../data/repo.ts";
import { createBanlistCommand } from "./banlist.ts";

const banned: Card = {
  cardId: "BT2-090",
  variant: "0",
  name: "Matt Ishida",
  searchName: "matt ishida",
  cardType: "Tamer",
  color: "Blue",
  level: null,
  playCost: 3,
  dp: null,
  effect: null,
  inherited: null,
  setName: "TEST SET",
  rarity: "R",
  imageUrl: null,
  restriction: "Banned",
};

const stubRepo = (cards: Card[]) =>
  ({ listRestricted: () => Promise.resolve(cards) }) as unknown as CardRepo;

const invoke = (cards: Card[]) =>
  createBanlistCommand(stubRepo(cards))({ type: 2, data: { name: "banlist" } } as never);

describe("/banlist", () => {
  it("returns the public banlist embed", async () => {
    const response = await invoke([banned]);
    const data = (
      response as unknown as {
        data: { embeds: [{ title: string; description: string }]; flags?: number };
      }
    ).data;
    expect(data.embeds[0].title).toBe("Banned & Restricted Cards");
    expect(data.embeds[0].description).toContain("Matt Ishida");
    expect(data.flags).toBeUndefined(); // public, not ephemeral (owner call)
  });

  it("answers gracefully when nothing is restricted", async () => {
    const response = await invoke([]);
    const data = (response as unknown as { data: { embeds: [{ description: string }] } }).data;
    expect(data.embeds[0].description).toBe("No cards are currently banned or restricted.");
  });
});
