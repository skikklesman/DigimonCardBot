// Shared slash-command option extraction (chunk 4.5). One guarded reader for
// String options, so every command AND every autocomplete stops re-implementing
// the find + typeof + trim dance — and can't re-open the hole where a forgotten
// typeof guard lets a hostile non-string value throw on `.trim()` (4.5 hardened
// /card but not /keyword or /set; 4.12's code review found the autocomplete
// side had grown its own copies too).
import {
  ApplicationCommandOptionType,
  type APIChatInputApplicationCommandInteraction,
} from "discord-api-types/v10";

/** The shape both command and autocomplete option arrays share, structurally —
 * enough to read a String option's value defensively without caring which
 * interaction type produced it. */
type OptionLike = { name: string; type: number; value?: unknown };

/**
 * Read a String option's trimmed value from a raw options array, or null when
 * it's absent, empty, or malformed. A crafted payload can carry a non-string
 * `value` even under a String option type; the typeof guard yields null
 * (treated as "no value") rather than a thrown `.trim()` the router would have
 * to catch — and would (mis)report as an owner alert. Works for both a command
 * interaction's options and an autocomplete interaction's options (the sibling
 * read the 4.12 `alt` cross-option autocomplete needs).
 */
export function readStringOption(
  options: readonly OptionLike[] | undefined,
  optionName: string,
): string | null {
  const option = options?.find(
    (o) => o.name === optionName && o.type === ApplicationCommandOptionType.String,
  );
  const raw = option?.value;
  const value = typeof raw === "string" ? raw.trim() : "";
  return value === "" ? null : value;
}

/** Command-handler convenience over {@link readStringOption}. */
export function stringOption(
  interaction: APIChatInputApplicationCommandInteraction,
  optionName: string,
): string | null {
  return readStringOption(interaction.data.options, optionName);
}
