// Request-path error alerting (chunk 4.5). The router and the worker entry
// catch errors so a user never sees Discord's "application did not respond";
// this makes those caught errors REACH the owner instead of dying in a log
// line nobody reads (owner call 2026-07-09, DECISIONS.md — "err on the side of
// knowing the error"). Total and best-effort, exactly like sendAlert:
// reporting an error must never itself throw or add latency to the response.
//
// Rate-limited so a systemic failure — a bad deploy failing every /card, a D1
// outage — pings the webhook a couple of times, not thousands. The limiter is
// in-isolate module state: imperfect across Cloudflare's many isolates, but a
// hot isolate serves a burst of requests, so it collapses the flood where it
// actually forms, at ~$0 and with no new dependency or stored state.
import { sendAlert } from "../alert.ts";

/** One alert per signature per window; a longer outage re-pings each window. */
export const ALERT_WINDOW_MS = 5 * 60_000;

const lastSentAt = new Map<string, number>();

/**
 * True when an alert for `signature` hasn't fired within the window — and
 * records the send time as a side effect when it returns true, so the caller
 * doesn't double-count. Keyed on the caller's context string (e.g.
 * "command /card"), so repeated failures of one surface collapse to one ping
 * while a different surface still gets through. Exported for tests.
 */
export function shouldAlert(signature: string, now = Date.now()): boolean {
  const previous = lastSentAt.get(signature);
  if (previous !== undefined && now - previous < ALERT_WINDOW_MS) return false;
  lastSentAt.set(signature, now);
  return true;
}

/** Undo a stamp — used to roll back the window when delivery fails, so a
 * dropped alert doesn't silence the surface for the rest of the window. */
function unstamp(signature: string): void {
  lastSentAt.delete(signature);
}

/** Clear the in-isolate limiter — tests only. */
export function resetAlertLimiter(): void {
  lastSentAt.clear();
}

export interface ReportOptions {
  /** Injection point for tests — unit tests never touch the network. */
  fetchImpl?: typeof fetch;
  /** Clock injection for the rate-limiter, tests only. */
  now?: number;
}

/**
 * Report a caught request-path error to the alert webhook, deduped by
 * `context`. Awaitable so the caller can hand it to `ctx.waitUntil` (keeping
 * it off the response's critical path). Never throws: a failure to report an
 * already-handled error must not escalate into a crash.
 *
 * The dedup window is only *kept* on a successful delivery — if `sendAlert`
 * reports failure (unset webhook, non-ok response, unreachable), the stamp is
 * rolled back so the very next error retries instead of the owner being
 * silenced for the full window on a dropped first alert (chunk 4.5, finding
 * #3 — against the "err on the side of knowing the error" intent).
 */
export async function reportRequestError(
  webhookUrl: string | undefined,
  context: string,
  error: unknown,
  options: ReportOptions = {},
): Promise<void> {
  try {
    const { now = Date.now(), fetchImpl } = options;
    if (!shouldAlert(context, now)) return;
    const delivered = await sendAlert(
      webhookUrl,
      `🔴 request-path error [${context}]: ${String(error)}`,
      { fetchImpl },
    );
    if (!delivered) unstamp(context);
  } catch (reportingError) {
    console.error(`request-error reporting failed: ${String(reportingError)}`);
  }
}
