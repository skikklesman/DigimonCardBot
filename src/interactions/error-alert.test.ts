// Request-path error alerting (chunk 4.5): dedup window and best-effort
// delivery. No network — a fake fetch captures the webhook call.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ALERT_WINDOW_MS,
  reportRequestError,
  resetAlertLimiter,
  shouldAlert,
} from "./error-alert.ts";

afterEach(() => resetAlertLimiter());

describe("shouldAlert — in-isolate rate limiter", () => {
  it("allows the first alert for a signature", () => {
    expect(shouldAlert("command /card", 1000)).toBe(true);
  });

  it("suppresses a repeat within the window", () => {
    expect(shouldAlert("command /card", 1000)).toBe(true);
    expect(shouldAlert("command /card", 1000 + ALERT_WINDOW_MS - 1)).toBe(false);
  });

  it("allows again once the window has passed", () => {
    expect(shouldAlert("command /card", 1000)).toBe(true);
    expect(shouldAlert("command /card", 1000 + ALERT_WINDOW_MS)).toBe(true);
  });

  it("tracks distinct signatures independently", () => {
    expect(shouldAlert("command /card", 1000)).toBe(true);
    expect(shouldAlert("command /banlist", 1000)).toBe(true);
    expect(shouldAlert("command /card", 1000)).toBe(false);
  });
});

describe("reportRequestError", () => {
  const webhook = "https://example.com/hook";

  it("posts a formatted alert naming the context", async () => {
    const posted: string[] = [];
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      posted.push((JSON.parse(String(init?.body)) as { content: string }).content);
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    await reportRequestError(webhook, "command /card", new Error("D1 exploded"), {
      fetchImpl,
      now: 1000,
    });
    expect(posted).toHaveLength(1);
    expect(posted[0]).toContain("command /card");
    expect(posted[0]).toContain("D1 exploded");
  });

  it("collapses a flood of the same failure to one webhook call", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    for (let i = 0; i < 50; i++) {
      await reportRequestError(webhook, "command /card", new Error("boom"), {
        fetchImpl,
        now: 1000 + i, // all inside the window
      });
    }
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("does not burn the dedup window when delivery fails — the next error retries", async () => {
    // A transient webhook 500 must not silence the surface for the full
    // window; the stamp is rolled back so the very next error tries again
    // (finding #3 — against the "know the error" intent).
    let attempts = 0;
    const failing = (async () => {
      attempts++;
      return new Response("no", { status: 500 });
    }) as typeof fetch;
    await reportRequestError(webhook, "command /card", new Error("boom"), {
      fetchImpl: failing,
      now: 1000,
    });
    await reportRequestError(webhook, "command /card", new Error("boom"), {
      fetchImpl: failing,
      now: 1001, // still inside the window — but the first drop rolled it back
    });
    expect(attempts).toBe(2);
  });

  it("does not throw when the webhook is unset (logs and drops)", async () => {
    await expect(
      reportRequestError(undefined, "command /card", new Error("boom"), { now: 1000 }),
    ).resolves.toBeUndefined();
  });

  it("swallows a throwing fetch — reporting never escalates into a crash", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    await expect(
      reportRequestError(webhook, "command /card", new Error("boom"), { fetchImpl, now: 1000 }),
    ).resolves.toBeUndefined();
  });
});
