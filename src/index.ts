// Worker entry point. Stays thin: verify → route → respond (TECH-DESIGN §3.5).
import { verifyDiscordSignature } from "./interactions/verify.ts";
import { route, type HandlerRegistry } from "./interactions/router.ts";
import { createRepo } from "./data/repo.ts";
import { createCardCommand } from "./interactions/commands/card.ts";
import { createAltCommand } from "./interactions/commands/alt.ts";
import { createCardAutocomplete } from "./interactions/autocomplete.ts";
import {
  createKeywordAutocomplete,
  createKeywordCommand,
} from "./interactions/commands/keyword.ts";
import { createSetAutocomplete, createSetCommand } from "./interactions/commands/set.ts";
import { createReleaseCommand } from "./interactions/commands/release.ts";
import { createBanlistCommand } from "./interactions/commands/banlist.ts";
import { checkStaleSync, runSyncWithAlerts } from "./sync/run.ts";
import { sendSyncAlert } from "./sync/alert.ts";
import { handleResync } from "./admin.ts";
import { handleHealth } from "./health.ts";

// Handlers close over the repo, so the registry is built per request (the
// D1 binding arrives with env).
function buildRegistry(env: Env): HandlerRegistry {
  const repo = createRepo(env.DB);
  const cardAutocomplete = createCardAutocomplete(repo);
  return {
    commands: {
      card: createCardCommand(repo),
      alt: createAltCommand(repo),
      keyword: createKeywordCommand(),
      set: createSetCommand(repo),
      // /release is the no-argument upcoming-releases forecast (4.9).
      release: createReleaseCommand(),
      banlist: createBanlistCommand(repo),
    },
    // /alt shares /card's autocomplete — same option, same suggestions.
    // /keyword and /set autocomplete static in-memory lists (no D1);
    // /release and /banlist have no options, so no autocomplete entries.
    autocomplete: {
      card: cardAutocomplete,
      alt: cardAutocomplete,
      keyword: createKeywordAutocomplete(),
      set: createSetAutocomplete(),
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
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return handleHealth(env.DB);
    }
    if (request.method === "POST" && url.pathname === "/admin/resync") {
      return handleResync(request, env);
    }
    if (request.method !== "POST" || url.pathname !== "/interactions") {
      return new Response("Not found", { status: 404 });
    }

    // The signature covers the exact raw bytes — read the body as text and
    // verify BEFORE parsing anything (HANDOFF §6.1).
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

    return json(await route(interaction, buildRegistry(env)));
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
      await sendSyncAlert(env.SYNC_ALERT_WEBHOOK, `⚠️ ${stale}`);
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
