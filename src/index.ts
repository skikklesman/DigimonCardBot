// Worker entry point. Stays thin: verify → route → respond (TECH-DESIGN §3.5).
import { verifyDiscordSignature } from "./interactions/verify.ts";
import { route, type ErrorReporter, type HandlerRegistry } from "./interactions/router.ts";
import { reportRequestError } from "./interactions/error-alert.ts";
import { createRepo, type CardRepo } from "./data/repo.ts";
import { createCardCommand, createCardComponent } from "./interactions/commands/card.ts";
import { createCardAutocomplete } from "./interactions/autocomplete.ts";
import {
  createKeywordAutocomplete,
  createKeywordCommand,
} from "./interactions/commands/keyword.ts";
import { createSetAutocomplete, createSetCommand } from "./interactions/commands/set.ts";
import { createReleaseCommand } from "./interactions/commands/release.ts";
import { createBanlistCommand } from "./interactions/commands/banlist.ts";
import { checkStaleSync, runSyncWithAlerts } from "./sync/run.ts";
import { sendAlert } from "./alert.ts";
import { handleResync } from "./admin.ts";
import { handleHealth } from "./health.ts";

// Handlers close over the repo, so the registry is built per request (the
// D1 binding arrives with env). Exported and repo-parameterized so the fuzz
// suite (chunk 4.5) drives the REAL command set, not a hand-built subset —
// a new command is fuzzed automatically the moment it's wired here.
export function buildRegistry(repo: CardRepo): HandlerRegistry {
  const cardAutocomplete = createCardAutocomplete(repo);
  return {
    commands: {
      card: createCardCommand(repo),
      keyword: createKeywordCommand(),
      set: createSetCommand(repo),
      // /release is the no-argument upcoming-releases forecast (4.9).
      release: createReleaseCommand(),
      banlist: createBanlistCommand(repo),
    },
    // /card's autocomplete serves both its options (card-name + the 4.12 alt
    // printing selector). /keyword and /set autocomplete static in-memory lists
    // (no D1); /release and /banlist have no options, so no autocomplete entries.
    autocomplete: {
      card: cardAutocomplete,
      keyword: createKeywordAutocomplete(),
      set: createSetAutocomplete(),
    },
    // Message components, keyed by custom_id namespace (4.10). `card` owns the
    // "Show effect text" button (`card:effect:<id>`) and the 4.12 Prev/Next
    // printing pager (`card:printing:<id>:<index>`).
    components: {
      card: createCardComponent(repo),
    },
  };
}

export interface Env {
  DISCORD_PUBLIC_KEY: string;
  DB: D1Database;
  /** Alert webhook (wrangler secret; optional — alerts log-and-drop without it). */
  SYNC_ALERT_WEBHOOK?: string;
  /** Card source override for staging/drills; defaults to the real source. */
  CARD_SOURCE_URL?: string;
  /** Bearer token for POST /admin/resync (wrangler secret; optional —
   * without it the route 404s like it doesn't exist). */
  RESYNC_TOKEN?: string;
}

function json(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    // HEAD is accepted alongside GET (RFC 9110 §9.3.2) because uptime pingers
    // (UptimeRobot's plain HTTP monitor) probe with HEAD; the runtime strips
    // the body, so the same handler serves both (BUGS.md fix, 2026-07-10).
    if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/health") {
      return handleHealth(env.DB);
    }
    if (request.method === "POST" && url.pathname === "/admin/resync") {
      return handleResync(request, env);
    }
    if (request.method !== "POST" || url.pathname !== "/interactions") {
      return new Response("Not found", { status: 404 });
    }

    // A caught handler error (D1 hiccup, a bug in a handler) still returns a
    // friendly response to the user — but it must reach the owner, not die in
    // a log line. The router calls this before its fallback; waitUntil keeps
    // the alert off the response's critical path (chunk 4.5).
    const onError: ErrorReporter = (context, error) =>
      ctx.waitUntil(reportRequestError(env.SYNC_ALERT_WEBHOOK, context, error));

    // The whole interaction path — verify, parse, route — sits under one catch
    // so NOTHING unexpected escapes as a silent bare 500 (chunk 4.5). The 401
    // (bad signature) and 400 (malformed body) are deliberate `return`s inside
    // it, so they keep their status codes; only an unexpected throw reaches the
    // catch below.
    try {
      // The signature covers the exact raw bytes — read + verify BEFORE
      // parsing anything (HANDOFF §6.1).
      const rawBody = await request.text();
      const verified = await verifyDiscordSignature(
        env.DISCORD_PUBLIC_KEY,
        request.headers.get("X-Signature-Ed25519"),
        request.headers.get("X-Signature-Timestamp"),
        rawBody,
      );
      if (!verified) {
        return new Response("invalid request signature", { status: 401 });
      }

      let interaction: unknown;
      try {
        interaction = JSON.parse(rawBody);
      } catch {
        return new Response("malformed body", { status: 400 });
      }

      return json(await route(interaction, buildRegistry(createRepo(env.DB)), onError));
    } catch (error) {
      // route() is total by design and verify.ts never throws, so reaching
      // here means an unexpected internal fault — a broken binding, a body
      // read error, a serialization bug. Alert AND return 500 so Cloudflare's
      // error metrics catch it too — the deep, should-never-happen failures get
      // the loudest signal, even though the rare user hitting one sees
      // "application did not respond" (owner call 2026-07-09, DECISIONS.md).
      ctx.waitUntil(reportRequestError(env.SYNC_ALERT_WEBHOOK, "worker fetch", error));
      console.error(`fetch handler faulted: ${String(error)}`);
      return new Response("internal error", { status: 500 });
    }
  },

  // Sync path (HANDOFF §3). Runs on the production cron (Mondays 06:00 UTC —
  // see the dialect warning in wrangler.toml); also triggerable locally via `wrangler dev
  // --test-scheduled`. Failures and warnings announce themselves to the alert
  // webhook (HANDOFF §8 Defense 5); the rethrow additionally marks the
  // invocation failed in Cloudflare's metrics.
  async scheduled(_controller, env): Promise<void> {
    // Dead-man check first: if the last GOOD sync is older than cadence +
    // margin, say so even if (especially if) this run is about to fail too.
    const stale = await checkStaleSync(env.DB);
    if (stale) {
      await sendAlert(env.SYNC_ALERT_WEBHOOK, `⚠️ ${stale}`);
    }
    const outcome = await runSyncWithAlerts(env.DB, {
      webhookUrl: env.SYNC_ALERT_WEBHOOK,
      sourceUrl: env.CARD_SOURCE_URL,
    });
    if (!outcome.ok) {
      throw new Error(outcome.error);
    }
  },
} satisfies ExportedHandler<Env>;
