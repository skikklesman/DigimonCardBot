// Image-coverage auditor (chunk 4.11): given the image URL of every card
// printing, probe each one and categorize the result. Pure library half of
// the audit — no I/O of its own beyond the injected fetch, no top-level side
// effects — so it unit-tests with a fake fetch (scripts/image-audit.ts is the
// network-touching CLI that wires in the real dataset).
//
// Why this exists: `/card` image URLs are SYNTHESIZED from the card id
// (`${IMAGE_BASE}/${cardId}.webp`), never validated against what the source
// actually ships, and the source rate-limits. So a blank card image has two
// distinct causes we must tell apart — a genuinely absent file (`missing`, a
// coverage gap to fix) versus the host throttling the fetch (`throttled`, the
// CDN-health signal that motivated moving off raw.githubusercontent).

/** One printing to probe: identity kept alongside the URL so the report can
 * name the gap, not just count it. */
export interface ImageProbe {
  cardId: string;
  variant: string;
  url: string;
}

/**
 * - `ok`        — 2xx/206, the image is served.
 * - `missing`   — 404 (or 410): a real coverage gap. Deterministic; the file
 *                 isn't there under the name we guessed.
 * - `throttled` — 429/403 after exhausting retries: the host rate-limited us.
 *                 This is the non-deterministic blank-image cause, not a data
 *                 gap. Both codes count: raw.githubusercontent.com throttles
 *                 with 429, but jsDelivr answers a burst with 403 (verified
 *                 2026-07-08 — the same files return 200 when re-probed solo).
 * - `error`     — anything else (other non-2xx, timeout, network throw) after
 *                 retries. Surfaced separately so it can't hide a real gap.
 */
export type ProbeStatus = "ok" | "missing" | "throttled" | "error";

export interface ProbeResult extends ImageProbe {
  status: ProbeStatus;
  /** Last HTTP status seen, or null if every attempt threw before a response. */
  httpStatus: number | null;
  /** Total attempts made (1 + retries actually used). */
  attempts: number;
}

export interface AuditOptions {
  /** Injection point for tests — the CLI passes the real global fetch. */
  fetchImpl?: typeof fetch;
  /** Parallel in-flight probes. Modest by default: a CDN is happy with this,
   * and it keeps a rate-limited origin from drowning in 429s. */
  concurrency?: number;
  /** Extra attempts after the first, on a retryable result (429 / 5xx / throw). */
  retries?: number;
  /** Delay before retry n (ms), doubled each attempt (matches fetchCards). */
  backoffMs?: number;
  timeoutMs?: number;
  /** Called after each probe settles — the CLI uses it for a progress line. */
  onProgress?: (done: number, total: number) => void;
  /** Sleep impl, injectable so tests don't wait on real backoff. */
  sleep?: (ms: number) => Promise<void>;
}

// 403 is retryable because jsDelivr uses it for burst-throttling (not for
// missing files — those are 404). A genuinely forbidden file would retry in
// vain and land in `throttled`, which is the right side of the line: it is not
// a coverage gap, and it never fails the audit.
const RETRYABLE = new Set([403, 408, 425, 429, 500, 502, 503, 504]);
const THROTTLE_CODES = new Set([403, 429]);

function classify(httpStatus: number): ProbeStatus {
  if (httpStatus >= 200 && httpStatus < 300) return "ok";
  if (httpStatus === 404 || httpStatus === 410) return "missing";
  if (THROTTLE_CODES.has(httpStatus)) return "throttled";
  return "error";
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Probe one URL with retry/backoff. A Range request for the first byte avoids
 * pulling whole images (thousands of them) while still exercising the exact
 * path Discord's proxy would fetch; servers answer 206/200 either way. Retries
 * only on transient signals — a 404 is authoritative and returns immediately.
 */
async function probeOne(
  probe: ImageProbe,
  fetchImpl: typeof fetch,
  retries: number,
  backoffMs: number,
  timeoutMs: number,
  sleep: (ms: number) => Promise<void>,
): Promise<ProbeResult> {
  let lastHttp: number | null = null;
  let attempts = 0;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(backoffMs * 2 ** (attempt - 1));
    attempts++;
    let httpStatus: number | null = null;
    try {
      const response = await fetchImpl(probe.url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      httpStatus = response.status;
      // Drain the tiny body so the connection can be reused, not leaked.
      await response.arrayBuffer().catch(() => undefined);
    } catch {
      httpStatus = null; // network throw / timeout — retryable
    }
    lastHttp = httpStatus;
    if (httpStatus !== null && !RETRYABLE.has(httpStatus)) {
      return { ...probe, status: classify(httpStatus), httpStatus, attempts };
    }
  }
  // Retries exhausted on a transient signal.
  const status: ProbeStatus =
    lastHttp !== null && THROTTLE_CODES.has(lastHttp) ? "throttled" : "error";
  return { ...probe, status, httpStatus: lastHttp, attempts };
}

/**
 * Probe every image with a bounded worker pool. Results come back in input
 * order regardless of completion order, so a diff between two runs (e.g. two
 * image hosts) lines up row-for-row.
 */
export async function auditImages(
  probes: ImageProbe[],
  options: AuditOptions = {},
): Promise<ProbeResult[]> {
  const {
    fetchImpl = fetch,
    // Deliberately gentle: a full 8.5k-image sweep at high concurrency makes
    // even a CDN burst-throttle (jsDelivr → 403). Modest parallelism plus the
    // 403 retry keeps the run clean without hammering the host.
    concurrency = 4,
    retries = 4,
    backoffMs = 1000,
    timeoutMs = 15_000,
    onProgress,
    sleep = defaultSleep,
  } = options;

  const results = new Array<ProbeResult>(probes.length);
  let next = 0;
  let done = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= probes.length) return;
      results[i] = await probeOne(probes[i]!, fetchImpl, retries, backoffMs, timeoutMs, sleep);
      done++;
      onProgress?.(done, probes.length);
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, probes.length)) }, worker);
  await Promise.all(workers);
  return results;
}

export interface AuditSummary {
  total: number;
  ok: number;
  missing: ProbeResult[];
  throttled: ProbeResult[];
  errored: ProbeResult[];
}

export function summarize(results: ProbeResult[]): AuditSummary {
  return {
    total: results.length,
    ok: results.filter((r) => r.status === "ok").length,
    missing: results.filter((r) => r.status === "missing"),
    throttled: results.filter((r) => r.status === "throttled"),
    errored: results.filter((r) => r.status === "error"),
  };
}
