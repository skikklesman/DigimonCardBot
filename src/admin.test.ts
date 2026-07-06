// /admin/resync tests (chunk 3.4): the roadmap's required trio — no token,
// bad token, good token — plus the disabled-route and method cases. Auth
// rejections go through the real Worker via SELF; the good-token path calls
// the handler directly with a stubbed sync runner (a real run would hit the
// network, which tests never do).
import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { handleResync, type ResyncEnv, type SyncRunner } from "./admin.ts";

const URL_ = "https://example.com/admin/resync";
// Must match the RESYNC_TOKEN binding in vitest.config.ts.
const GOOD_TOKEN = "test-resync-token";

const post = (headers: Record<string, string> = {}) =>
  new Request(URL_, { method: "POST", headers });

describe("POST /admin/resync — auth (via the real Worker)", () => {
  it("404s with NO token, identically to an unknown route", async () => {
    const res = await SELF.fetch(URL_, { method: "POST" });
    expect(res.status).toBe(404);
    // byte-identical body to the generic 404 — not probeable
    expect(await res.text()).toBe(await (await SELF.fetch("https://example.com/nope")).text());
  });

  it("404s with a BAD token", async () => {
    const res = await SELF.fetch(URL_, {
      method: "POST",
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(404);
  });

  it("404s on a token of different length (constant-time compare handles it)", async () => {
    const res = await SELF.fetch(URL_, {
      method: "POST",
      headers: { Authorization: `Bearer ${GOOD_TOKEN}-and-then-some` },
    });
    expect(res.status).toBe(404);
  });

  it("404s for GET even with the good token (POST only)", async () => {
    const res = await SELF.fetch(URL_, {
      method: "GET",
      headers: { Authorization: `Bearer ${GOOD_TOKEN}` },
    });
    expect(res.status).toBe(404);
  });
});

describe("handleResync — behavior (stubbed sync runner)", () => {
  const okRunner: SyncRunner = () =>
    Promise.resolve({
      ok: true,
      summary: { version: 4, loaded: 8425, duplicatesCollapsed: 0, dropped: 0, warnings: [] },
    });

  it("GOOD token: runs the sync and returns the summary as JSON", async () => {
    const res = await handleResync(
      post({ Authorization: `Bearer ${GOOD_TOKEN}` }),
      env as ResyncEnv,
      okRunner,
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ version: 4, loaded: 8425 });
  });

  it("maps a failed sync to a 500 with the error", async () => {
    const failRunner: SyncRunner = () =>
      Promise.resolve({ ok: false, error: "sync aborted (shrink guard): boom" });
    const res = await handleResync(
      post({ Authorization: `Bearer ${GOOD_TOKEN}` }),
      env as ResyncEnv,
      failRunner,
    );
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "sync aborted (shrink guard): boom" });
  });

  it("never invokes the runner when auth fails", async () => {
    let invoked = 0;
    const spy: SyncRunner = () => {
      invoked++;
      return okRunner(env.DB, {});
    };
    await handleResync(post(), env as ResyncEnv, spy);
    await handleResync(post({ Authorization: "Bearer nope" }), env as ResyncEnv, spy);
    expect(invoked).toBe(0);
  });

  it("404s when RESYNC_TOKEN is not configured, even with a matching header", async () => {
    const disabledEnv = { ...(env as ResyncEnv), RESYNC_TOKEN: undefined };
    let invoked = 0;
    const spy: SyncRunner = () => {
      invoked++;
      return okRunner(env.DB, {});
    };
    const res = await handleResync(
      post({ Authorization: `Bearer ${GOOD_TOKEN}` }),
      disabledEnv,
      spy,
    );
    expect(res.status).toBe(404);
    expect(invoked).toBe(0);
  });
});
