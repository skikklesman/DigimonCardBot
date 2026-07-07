// Command registration (HANDOFF §7) — a deploy-time script, NEVER part of
// the Worker. Run from the repo root with Node ≥ 22.18 (native TS):
//
//   npm run register            # guild commands (instant, for the soak guilds)
//   npm run register:global     # global (launch only — ~1h propagation)
//
// Credentials come from the environment or .dev.vars (gitignored):
//   DISCORD_APP_ID, DISCORD_BOT_TOKEN, DISCORD_TEST_GUILD_ID
// DISCORD_TEST_GUILD_ID may be a comma-separated list (chunk 3.6.1) —
// every listed guild gets the same command set.
import { readFileSync } from "node:fs";
import { COMMAND_DEFINITIONS } from "./command-definitions.ts";
import { parseGuildList } from "./guild-list.ts";

const API = "https://discord.com/api/v10"; // version: re-verify per HANDOFF §16

function loadConfig(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    for (const line of readFileSync(".dev.vars", "utf8").split("\n")) {
      const match = /^([A-Z_]+)\s*=\s*"?([^"\r]*)"?\s*$/.exec(line);
      if (match && match[1] === name) return match[2];
    }
  } catch {
    // no .dev.vars — fall through to the error below
  }
  return undefined;
}

function required(name: string): string {
  const value = loadConfig(name);
  if (!value) {
    console.error(
      `Missing ${name}. Set it in the environment or in .dev.vars (KEY=value, gitignored).\n` +
        `App ID and bot token live in the Discord Developer Portal; the guild id comes from\n` +
        `right-clicking your test server with developer mode on.`,
    );
    process.exit(1);
  }
  return value;
}

const isGlobal = process.argv.includes("--global");
const appId = required("DISCORD_APP_ID");
const token = required("DISCORD_BOT_TOKEN");

const guilds = isGlobal ? [] : parseGuildList(required("DISCORD_TEST_GUILD_ID"));
if (!isGlobal && guilds.length === 0) {
  console.error("DISCORD_TEST_GUILD_ID contains no guild ids.");
  process.exit(1);
}

const targets = isGlobal
  ? [{ label: "GLOBALLY (allow ~1h to propagate)", url: `${API}/applications/${appId}/commands` }]
  : guilds.map((guildId) => ({
      label: `to guild ${guildId}`,
      url: `${API}/applications/${appId}/guilds/${guildId}/commands`,
    }));

for (const target of targets) {
  console.log(`Registering ${COMMAND_DEFINITIONS.length} command(s) ${target.label}…`);

  const response = await fetch(target.url, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(COMMAND_DEFINITIONS),
  });

  if (!response.ok) {
    console.error(`Discord rejected the registration: ${response.status} ${response.statusText}`);
    console.error(await response.text());
    process.exit(1);
  }

  const registered = (await response.json()) as Array<{ id: string; name: string }>;
  for (const command of registered) {
    console.log(`  ✓ /${command.name}  (id ${command.id})`);
  }
}
console.log("Done.");
