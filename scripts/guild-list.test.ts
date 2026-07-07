// Guild-list parsing tests (chunk 3.6.1): a malformed .dev.vars entry
// should never turn into a bogus Discord API call.
import { describe, expect, it } from "vitest";
import { parseGuildList } from "./guild-list.ts";

describe("parseGuildList", () => {
  it("returns a single id unchanged", () => {
    expect(parseGuildList("123456789012345678")).toEqual(["123456789012345678"]);
  });

  it("splits a comma-separated list", () => {
    expect(parseGuildList("111,222,333")).toEqual(["111", "222", "333"]);
  });

  it("trims whitespace around ids", () => {
    expect(parseGuildList(" 111 , 222 ")).toEqual(["111", "222"]);
  });

  it("drops empty entries from stray/trailing commas", () => {
    expect(parseGuildList("111,,222,")).toEqual(["111", "222"]);
  });

  it("returns empty for blank input", () => {
    expect(parseGuildList("")).toEqual([]);
    expect(parseGuildList(" , ")).toEqual([]);
  });
});
