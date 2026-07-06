// Worker entry point. Stays thin: verify → route → respond (TECH-DESIGN §3.5).
import { InteractionResponseType, InteractionType } from "discord-api-types/v10";
import { verifyDiscordSignature } from "./interactions/verify";
import { runSync } from "./sync/run";

export interface Env {
  DISCORD_PUBLIC_KEY: string;
  DB: D1Database;
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

    let interaction: { type: number };
    try {
      interaction = JSON.parse(rawBody) as { type: number };
    } catch {
      return new Response("malformed body", { status: 400 });
    }

    if (interaction.type === InteractionType.Ping) {
      return json({ type: InteractionResponseType.Pong });
    }

    // Real command/autocomplete routing lands in chunk 2.1. Until then, any
    // verified interaction gets a benign visible reply rather than an error.
    return json({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: { content: "DigimonCardBot is under construction — card lookup coming soon." },
    });
  },

  // Sync path (HANDOFF §3). The production cron trigger lands in chunk 3.6;
  // until then this runs via `wrangler dev --test-scheduled`. Webhook
  // alerting lands in 3.3 — for now failures go to Worker logs, and the
  // rethrow marks the invocation failed in Cloudflare's metrics.
  async scheduled(_controller, env): Promise<void> {
    try {
      const summary = await runSync(env.DB);
      console.log(`sync complete: ${JSON.stringify(summary)}`);
    } catch (error) {
      console.error(`sync failed: ${String(error)}`);
      throw error;
    }
  },
} satisfies ExportedHandler<Env>;
