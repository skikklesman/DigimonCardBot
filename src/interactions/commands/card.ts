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
import type { Card } from "../../data/schema.ts";
import type { CardRepo } from "../../data/repo.ts";
import { CHOICE_PARTNERS } from "../../data/restrictions.ts";
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

/** Resolve the choice-restriction partners of a hit to their names
 * (chunk 4.6.1) so the embed can say "Taomon (BT17-035)" rather than a
 * bare id. At most two extra indexed lookups, and only on the ~5
 * choice-restricted cards; a lookup miss just leaves that id bare. */
async function relatedCardNames(
  repo: CardRepo,
  card: Card,
): Promise<ReadonlyMap<string, string> | undefined> {
  if (card.restriction !== "Choice Restriction") return undefined;
  const partners = CHOICE_PARTNERS[card.cardId];
  if (!partners) return undefined;
  const printings = await Promise.all(partners.map((id) => repo.findPrinting(id)));
  return new Map(printings.filter((p) => p !== null).map((p) => [p.cardId, p.name]));
}

export function createCardCommand(repo: CardRepo): CommandHandler {
  return async (interaction): Promise<APIInteractionResponse> => {
    const value = cardNameValue(interaction as APIChatInputApplicationCommandInteraction);
    if (value === null) return MISSING_OPTION_RESPONSE;

    const resolution = await resolveCardValue(repo, value);
    switch (resolution.kind) {
      case "hit":
        return cardResponse(resolution.card, await relatedCardNames(repo, resolution.card));
      case "multi":
        return disambiguationResponse(value, resolution.matches);
      case "miss":
        return notFoundResponse(value);
    }
  };
}
