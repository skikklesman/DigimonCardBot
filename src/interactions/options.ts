// Shared slash-command option extraction (chunk 4.5). One guarded reader for
// String options, so every command doesn't re-implement the find + typeof +
// trim dance — and can't re-open the hole where a forgotten typeof guard lets
// a hostile non-string value throw on `.trim()` (finding #1: /card was
// hardened but /keyword and /set were not).
import {
  ApplicationCommandOptionType,
  type APIApplicationCommandInteractionDataStringOption,
  type APIChatInputApplicationCommandInteraction,
} from "discord-api-types/v10";

/**
 * Read a String option's trimmed value, or null when it's absent, empty, or
 * malformed. A crafted payload can carry a non-string `value` even under a
 * String option type; the typeof guard yields null (treated as "no value")
 * rather than a thrown `.trim()` the router would have to catch — and would
 * (mis)report as an owner alert.
 */
export function stringOption(
  interaction: APIChatInputApplicationCommandInteraction,
  optionName: string,
): string | null {
  const option = interaction.data.options?.find(
    (o): o is APIApplicationCommandInteractionDataStringOption =>
      o.name === optionName && o.type === ApplicationCommandOptionType.String,
  );
  const raw = option?.value;
  const value = typeof raw === "string" ? raw.trim() : "";
  return value === "" ? null : value;
}
