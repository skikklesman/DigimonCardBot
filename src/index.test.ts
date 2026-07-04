import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// Harness smoke test: proves the Workers test pool boots the real Worker.
// Replaced by real interaction tests in chunk 0.4.
describe("worker stub", () => {
  it("responds from inside the workerd runtime", async () => {
    const res = await SELF.fetch("https://example.com/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("digimon-tcg-bot");
  });
});
