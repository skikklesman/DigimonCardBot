// /release tests (chunk 4.9): the handler is a thin delegate — the
// forecast logic itself is snapshot-tested in embeds.test.ts.
import { describe, expect, it } from "vitest";
import { createReleaseCommand } from "./release.ts";

describe("/release", () => {
  it("returns the public upcoming-releases embed", async () => {
    const response = await createReleaseCommand()({
      type: 2,
      data: { name: "release" },
    } as never);
    const data = (response as unknown as { data: { embeds: [{ title: string }]; flags?: number } })
      .data;
    expect(data.embeds[0].title).toBe("Upcoming Releases");
    expect(data.flags).toBeUndefined();
  });
});
