// Slash-command definitions (HANDOFF §7) — pure data, imported by the
// registration script and by tests. The definition is half of a contract:
// `card-name` declares autocomplete, which is what makes Discord send the
// type-4 interactions the router handles; autocomplete options must not
// also declare static `choices`.
import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  type RESTPutAPIApplicationGuildCommandsJSONBody,
} from "discord-api-types/v10";

export const COMMAND_DEFINITIONS = [
  {
    name: "card",
    type: ApplicationCommandType.ChatInput,
    description: "Look up a Digimon TCG card by name or card ID",
    options: [
      {
        name: "card-name",
        type: ApplicationCommandOptionType.String,
        description: "Card name or ID (e.g. Goldramon, EX1-066)",
        required: true,
        autocomplete: true,
      },
    ],
  },
] satisfies RESTPutAPIApplicationGuildCommandsJSONBody;
