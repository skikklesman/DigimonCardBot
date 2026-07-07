// Guild-list parsing for command registration (chunk 3.6.1): the
// DISCORD_TEST_GUILD_ID config value may hold one guild id or a
// comma-separated list — every listed guild gets the same command set,
// so soak guilds can't drift apart. Lives in its own module because
// register-commands.ts runs on import (it's a script, not a library).

/** "123, 456,,789 " → ["123", "456", "789"]. */
export function parseGuildList(value: string): string[] {
  return value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");
}
