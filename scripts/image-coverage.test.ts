// Image-coverage auditor tests (chunk 4.11): the categorization and retry
// logic is the whole point — a 429 that clears on retry must NOT be reported
// as a missing card, and a real 404 must NOT be masked by retries. Fake fetch
// throughout; no network, no real backoff (sleep is stubbed).
import { describe, expect, it, vi } from "vitest";
import { auditImages, summarize, type ImageProbe } from "./image-coverage.ts";

const probe = (cardId: string): ImageProbe => ({
  cardId,
  variant: "0",
  url: `https://cdn.example/${cardId}.webp`,
});

/** Fake fetch driven by a per-URL queue of statuses; each call shifts the next
 * status for that URL. A number → a Response with that status; "throw" → a
 * network-style rejection. */
function fakeFetch(plan: Record<string, Array<number | "throw">>): typeof fetch {
  const queues = new Map(Object.entries(plan).map(([url, seq]) => [url, [...seq]]));
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const step = queues.get(url)?.shift();
    if (step === undefined) throw new Error(`unexpected fetch: ${url}`);
    if (step === "throw") throw new Error("network down");
    return new Response(null, { status: step });
  }) as unknown as typeof fetch;
}

const noSleep = (): Promise<void> => Promise.resolve();
const URL_A = "https://cdn.example/A.webp";

/** Drive one probe (URL "A") through a status sequence and return its result. */
async function runOne(
  seq: Array<number | "throw">,
  opts: { retries?: number } = {},
): Promise<import("./image-coverage.ts").ProbeResult> {
  const [r] = await auditImages([probe("A")], {
    fetchImpl: fakeFetch({ [URL_A]: seq }),
    sleep: noSleep,
    ...opts,
  });
  return r!;
}

describe("auditImages", () => {
  it("marks a 200 as ok", async () => {
    const r = await runOne([200]);
    expect(r.status).toBe("ok");
    expect(r.attempts).toBe(1);
  });

  it("treats 206 (Range answer) as ok", async () => {
    expect((await runOne([206])).status).toBe("ok");
  });

  it("marks a 404 as missing and does NOT retry it", async () => {
    const r = await runOne([404], { retries: 4 });
    expect(r.status).toBe("missing");
    expect(r.httpStatus).toBe(404);
    expect(r.attempts).toBe(1); // authoritative — no wasted retries
  });

  it("retries a 429 and reports ok when it clears", async () => {
    const r = await runOne([429, 429, 200], { retries: 4 });
    expect(r.status).toBe("ok");
    expect(r.attempts).toBe(3);
  });

  it("reports throttled when 429 never clears within retries", async () => {
    const r = await runOne([429, 429, 429], { retries: 2 });
    expect(r.status).toBe("throttled");
    expect(r.httpStatus).toBe(429);
    expect(r.attempts).toBe(3); // 1 + 2 retries
  });

  it("retries a 403 (jsDelivr burst-throttle) and reports ok when it clears", async () => {
    const r = await runOne([403, 403, 200], { retries: 4 });
    expect(r.status).toBe("ok");
    expect(r.attempts).toBe(3);
  });

  it("reports a persistent 403 as throttled, NOT a missing gap", async () => {
    const r = await runOne([403, 403, 403], { retries: 2 });
    expect(r.status).toBe("throttled");
    expect(r.httpStatus).toBe(403);
  });

  it("retries a network throw, then reports error if it persists", async () => {
    const r = await runOne(["throw", "throw"], { retries: 1 });
    expect(r.status).toBe("error");
    expect(r.httpStatus).toBeNull();
  });

  it("recovers from a transient throw", async () => {
    const r = await runOne(["throw", 200], { retries: 2 });
    expect(r.status).toBe("ok");
    expect(r.attempts).toBe(2);
  });

  it("classifies an unexpected 403 as error, not missing", async () => {
    expect((await runOne([403])).status).toBe("error");
  });

  it("preserves input order under concurrency and probes every item once", async () => {
    const probes = ["A", "B", "C", "D", "E"].map(probe);
    const plan = Object.fromEntries(probes.map((p) => [p.url, [200] as number[]]));
    const results = await auditImages(probes, {
      fetchImpl: fakeFetch(plan),
      concurrency: 2,
      sleep: noSleep,
    });
    expect(results.map((r) => r.cardId)).toEqual(["A", "B", "C", "D", "E"]);
    expect(results.every((r) => r.status === "ok")).toBe(true);
  });

  it("reports progress for every settled probe", async () => {
    const probes = ["A", "B", "C"].map(probe);
    const plan = Object.fromEntries(probes.map((p) => [p.url, [200] as number[]]));
    const onProgress = vi.fn();
    await auditImages(probes, { fetchImpl: fakeFetch(plan), sleep: noSleep, onProgress });
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenLastCalledWith(3, 3);
  });
});

describe("summarize", () => {
  it("buckets each status and keeps the offending probes", async () => {
    const probes = ["OK", "GONE", "SLOW", "BOOM"].map(probe);
    const results = await auditImages(probes, {
      fetchImpl: fakeFetch({
        "https://cdn.example/OK.webp": [200],
        "https://cdn.example/GONE.webp": [404],
        "https://cdn.example/SLOW.webp": [429],
        "https://cdn.example/BOOM.webp": [500],
      }),
      retries: 0,
      sleep: noSleep,
    });
    const s = summarize(results);
    expect(s.total).toBe(4);
    expect(s.ok).toBe(1);
    expect(s.missing.map((r) => r.cardId)).toEqual(["GONE"]);
    expect(s.throttled.map((r) => r.cardId)).toEqual(["SLOW"]);
    expect(s.errored.map((r) => r.cardId)).toEqual(["BOOM"]);
  });
});
