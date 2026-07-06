// Worker entry point. Stays thin: verify → route → respond (TECH-DESIGN §3.5).
import { verifyDiscordSignature } from "./interactions/verify";
import { route, type HandlerRegistry } from "./interactions/router";
import { createRepo } from "./data/repo";
import { createCardCommand } from "./interactions/commands/card";
import { createAltCommand } from "./interactions/commands/alt";
import { createCardAutocomplete } from "./interactions/autocomplete";
import { checkStaleSync, runSync } from "./sync/run";
import { sendSyncAlert } from "./sync/alert";

// Handlers close over the repo, so the registry is built per request (the
// D1 binding arrives with env).
function buildRegistry(env: Env): HandlerRegistry {
  const repo = createRepo(env.DB);
  const cardAutocomplete = createCardAutocomplete(repo);
  return {
    commands: { card: createCardCommand(repo), alt: createAltCommand(repo) },
    // /alt shares /card's autocomplete — same option, same suggestions.
    autocomplete: { card: cardAutocomplete, alt: cardAutocomplete },
  };
}

export interface Env {
  DISCORD_PUBLIC_KEY: string;
  DB: D1Database;
  /** Alert webhook (wrangler secret; optional — alerts log-and-drop without it). */
  SYNC_ALERT_WEBHOOK?: string;
  /** Card source override for staging/drills; defaults to the real source. */
  CARD_SOURCE_URL?: string;
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

  // Sync path (HANDOFF §3). The production cron trigger lands in chunk 3.6;
  // until then this runs via `wrangler dev --test-scheduled`. Failures and
  // warnings announce themselves to the alert webhook (HANDOFF §8 Defense
  // 5); the rethrow additionally marks the invocation failed in
  // Cloudflare's metrics.
  async scheduled(_controller, env): Promise<void> {
    // Dead-man check first: if the last GOOD sync is older than cadence +
    // margin, say so even if (especially if) this run is about to fail too.
    const stale = await checkStaleSync(env.DB);
    if (stale) {
      await sendSyncAlert(env.SYNC_ALERT_WEBHOOK, `⚠️ ${stale}`);
    }
    try {
      const summary = await runSync(env.DB, { sourceUrl: env.CARD_SOURCE_URL });
      console.log(`sync complete: ${JSON.stringify(summary)}`);
      if (summary.warnings.length > 0) {
        await sendSyncAlert(
          env.SYNC_ALERT_WEBHOOK,
          `⚠️ card sync v${summary.version} succeeded with warnings:\n• ${summary.warnings.join("\n• ")}`,
        );
      }
    } catch (error) {
      console.error(`sync failed: ${String(error)}`);
      await sendSyncAlert(env.SYNC_ALERT_WEBHOOK, `❌ card sync FAILED: ${String(error)}`);
      throw error;
    }
  },
} satisfies ExportedHandler<Env>;
