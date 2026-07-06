// The /card command (HANDOFF §6.3): resolve the card-name value via the
// shared ladder, render hit / disambiguation / not-found.
import {
  ApplicationCommandOptionType,
  InteractionResponseType,
  MessageFlags,
  type APIApplicationCommandInteractionDataStringOption,
  type APIChatInputApplicationCommandInteraction,
  type APIInteractionResponse,
} from "discord-api-types/v10";
import type { CardRepo } from "../../data/repo.ts";
import type { CommandHandler } from "../router.ts";
import { cardResponse, disambiguationResponse, notFoundResponse } from "../embeds.ts";
import { resolveCardValue } from "./resolve.ts";

export const CARD_NAME_OPTION = "card-name";

export function cardNameValue(
  interaction: APIChatInputApplicationCommandInteraction,
): string | null {
  const option = interaction.data.options?.find(
    (o): o is APIApplicationCommandInteractionDataStringOption =>
      o.name === CARD_NAME_OPTION && o.type === ApplicationCommandOptionType.String,
  );
  const value = option?.value.trim() ?? "";
  return value === "" ? null : value;
}

/** Discord enforces required options; this only guards synthetic payloads. */
export const MISSING_OPTION_RESPONSE: APIInteractionResponse = {
  type: InteractionResponseType.ChannelMessageWithSource,
  data: { content: "Please provide a card name or ID.", flags: MessageFlags.Ephemeral },
};

export function createCardCommand(repo: CardRepo): CommandHandler {
  return async (interaction): Promise<APIInteractionResponse> => {
    const value = cardNameValue(interaction as APIChatInputApplicationCommandInteraction);
    if (value === null) return MISSING_OPTION_RESPONSE;

    const resolution = await resolveCardValue(repo, value);
    switch (resolution.kind) {
      case "hit":
        return cardResponse(resolution.card);
      case "multi":
        return disambiguationResponse(value, resolution.matches);
      case "miss":
        return notFoundResponse(value);
    }
  };
}
