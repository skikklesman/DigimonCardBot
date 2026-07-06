// Manual resync route (chunk 3.4, HANDOFF §8): POST /admin/resync with a
// bearer token triggers the same sync pipeline the cron runs — for
// source-swap recovery and populating a fresh deployment without waiting a
// week. Security posture: bad or missing auth gets the SAME 404 as any
// unknown route, so the endpoint's existence is not probeable; with no
// RESYNC_TOKEN secret configured the route simply doesn't exist.
import { runSyncWithAlerts, type SyncOutcome, type SyncWithAlertsOptions } from "./sync/run.ts";

/** Structural slice of the Worker Env this route needs (avoids importing
 * the entry point's Env type back into a module the entry point imports). */
export interface ResyncEnv {
  DB: D1Database;
  RESYNC_TOKEN?: string;
  SYNC_ALERT_WEBHOOK?: string;
  CARD_SOURCE_URL?: string;
}

export type SyncRunner = (db: D1Database, options: SyncWithAlertsOptions) => Promise<SyncOutcome>;

/** Byte-identical to the entry point's generic 404 — indistinguishability
 * is the point. */
function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

/**
 * Constant-time token comparison. Workers' timingSafeEqual requires
 * equal-length inputs, so both sides are SHA-256'd first — digests are
 * always 32 bytes, and the hashing also masks length information.
 */
async function tokenMatches(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

export async function handleResync(
  request: Request,
  env: ResyncEnv,
  runner: SyncRunner = runSyncWithAlerts,
): Promise<Response> {
  // No secret configured → the route does not exist.
  if (!env.RESYNC_TOKEN) return notFound();

  const auth = request.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (token === "" || !(await tokenMatches(token, env.RESYNC_TOKEN))) {
    return notFound();
  }

  const outcome = await runner(env.DB, {
    webhookUrl: env.SYNC_ALERT_WEBHOOK,
    sourceUrl: env.CARD_SOURCE_URL,
  });
  return new Response(JSON.stringify(outcome.ok ? outcome.summary : { error: outcome.error }), {
    status: outcome.ok ? 200 : 500,
    headers: { "content-type": "application/json" },
  });
}
