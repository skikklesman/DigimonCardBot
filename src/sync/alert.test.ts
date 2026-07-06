// Alert module unit tests (chunk 3.3). The cardinal property: sendSyncAlert
// never throws, whatever the webhook does.
import { describe, expect, it } from "vitest";
import { sendSyncAlert } from "./alert.ts";

describe("sendSyncAlert", () => {
  it("POSTs the message as Discord webhook JSON", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const stub: typeof fetch = (url, init) => {
      calls.push({ url: String(url), body: String(init?.body) });
      return Promise.resolve(new Response(null, { status: 204 }));
    };
    const ok = await sendSyncAlert("https://hooks.example/x", "❌ sync failed", {
      fetchImpl: stub,
    });
    expect(ok).toBe(true);
    expect(calls).toEqual([
      { url: "https://hooks.example/x", body: JSON.stringify({ content: "❌ sync failed" }) },
    ]);
  });

  it("returns false without throwing when the webhook is unset", async () => {
    await expect(sendSyncAlert(undefined, "lost alert")).resolves.toBe(false);
  });

  it("returns false without throwing on a webhook error status", async () => {
    const stub: typeof fetch = () => Promise.resolve(new Response("nope", { status: 404 }));
    await expect(sendSyncAlert("https://hooks.example/x", "x", { fetchImpl: stub })).resolves.toBe(
      false,
    );
  });

  it("returns false without throwing when the webhook is unreachable", async () => {
    const stub: typeof fetch = () => Promise.reject(new Error("ECONNREFUSED"));
    await expect(sendSyncAlert("https://hooks.example/x", "x", { fetchImpl: stub })).resolves.toBe(
      false,
    );
  });

  it("truncates content to Discord's 2000-char cap", async () => {
    let sent = "";
    const stub: typeof fetch = (_url, init) => {
      sent = (JSON.parse(String(init?.body)) as { content: string }).content;
      return Promise.resolve(new Response(null, { status: 204 }));
    };
    await sendSyncAlert("https://hooks.example/x", "y".repeat(5000), { fetchImpl: stub });
    expect(sent).toHaveLength(2000);
    expect(sent.endsWith("…")).toBe(true);
  });
});
