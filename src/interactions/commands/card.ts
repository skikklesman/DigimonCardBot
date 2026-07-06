// The /card command (HANDOFF §6.3 + §6.4 edge cases). Resolution ladder for
// the card-name value, which may or may not have come from a picked
// autocomplete suggestion:
//   1. looks like a `card_id|variant` token → exact printing lookup
//   2. looks like a card id (EX1-066) → base printing lookup
//   3. anything else → normalized name search → hit / disambiguate / not-found
import {
  ApplicationCommandOptionType,
  InteractionResponseType,
  MessageFlags,
  type APIApplicationCommandInteractionDataStringOption,
  type APIChatInputApplicationCommandInteraction,
  type APIInteractionResponse,
} from "discord-api-types/v10";
import type { CardRepo } from "../../data/repo";
import type { CommandHandler } from "../router";
import { cardResponse, disambiguationResponse, notFoundResponse } from "../embeds";

export const CARD_NAME_OPTION = "card-name";

/** EX1-066, BT14-018, ST9-15, P-001 … — set prefix, dash, number. */
const CARD_ID_PATTERN = /^[A-Za-z]+\d*-\d+$/;

function cardNameValue(interaction: APIChatInputApplicationCommandInteraction): string | null {
  const option = interaction.data.options?.find(
    (o): o is APIApplicationCommandInteractionDataStringOption =>
      o.name === CARD_NAME_OPTION && o.type === ApplicationCommandOptionType.String,
  );
  const value = option?.value.trim() ?? "";
  return value === "" ? null : value;
}

export function createCardCommand(repo: CardRepo): CommandHandler {
  return async (interaction): Promise<APIInteractionResponse> => {
    const value = cardNameValue(interaction as APIChatInputApplicationCommandInteraction);
    if (value === null) {
      // Discord enforces required options; this only guards synthetic payloads.
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { content: "Please provide a card name or ID.", flags: MessageFlags.Ephemeral },
      };
    }

    // 1. Autocomplete token. A miss means the suggestion went stale (the
    // dataset rotated between typing and submitting) — say so rather than
    // guessing, the retry will get fresh suggestions.
    if (value.includes("|")) {
      const picked = await repo.findByValue(value);
      return picked ? cardResponse(picked) : notFoundResponse(value);
    }

    // 2. Card id, as printed (case-insensitive).
    if (CARD_ID_PATTERN.test(value)) {
      const byId = await repo.findPrinting(value.toUpperCase());
      if (byId) return cardResponse(byId);
      // fall through: "ADR-01" is id-shaped but is actually a name prefix
    }

    // 3. Free-text name search.
    const matches = await repo.searchByName(value);
    const [first] = matches;
    if (!first) return notFoundResponse(value);
    if (matches.length === 1) return cardResponse(first);
    return disambiguationResponse(value, matches);
  };
}
