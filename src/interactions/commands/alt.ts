// The /alt command (chunk 3.2): list/show every printing of a card — the
// alt-art support named in the product goal (HANDOFF §1). Same resolution
// discipline as /card; the payoff is a gallery of printing embeds.
import {
  InteractionResponseType,
  MessageFlags,
  type APIChatInputApplicationCommandInteraction,
  type APIInteractionResponse,
} from "discord-api-types/v10";
import type { CardRepo } from "../../data/repo";
import type { CommandHandler } from "../router";
import { altGalleryResponse, disambiguationResponse, notFoundResponse } from "../embeds";
import { cardNameValue, MISSING_OPTION_RESPONSE } from "./card";
import { resolveCardValue } from "./resolve";

export function createAltCommand(repo: CardRepo): CommandHandler {
  return async (interaction): Promise<APIInteractionResponse> => {
    const value = cardNameValue(interaction as APIChatInputApplicationCommandInteraction);
    if (value === null) return MISSING_OPTION_RESPONSE;

    const resolution = await resolveCardValue(repo, value);
    if (resolution.kind === "miss") return notFoundResponse(value);
    if (resolution.kind === "multi") return disambiguationResponse(value, resolution.matches);

    // Whatever printing resolved (a picked alt-art token included), /alt is
    // about the whole family: list every printing of that card id.
    const printings = await repo.listPrintings(resolution.card.cardId);
    if (printings.length <= 1) {
      const card = resolution.card;
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: `**${card.name}** \`${card.cardId}\` has no alt-art printings in the current dataset.`,
          flags: MessageFlags.Ephemeral,
        },
      };
    }
    return altGalleryResponse(printings);
  };
}
