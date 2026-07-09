// The /card command (HANDOFF §6.3): resolve the card-name value via the
// shared ladder, render hit / disambiguation / not-found.
import {
  InteractionResponseType,
  MessageFlags,
  type APIChatInputApplicationCommandInteraction,
  type APIInteractionResponse,
} from "discord-api-types/v10";
import type { Card } from "../../data/schema.ts";
import type { CardRepo } from "../../data/repo.ts";
import { CHOICE_PARTNERS } from "../../data/restrictions.ts";
import type { CommandHandler, ComponentHandler } from "../router.ts";
import { stringOption } from "../options.ts";
import {
  CARD_EFFECT_ID,
  cardEffectResponse,
  cardResponse,
  disambiguationResponse,
  notFoundResponse,
} from "../embeds.ts";
import { resolveCardValue } from "./resolve.ts";

export const CARD_NAME_OPTION = "card-name";

export function cardNameValue(
  interaction: APIChatInputApplicationCommandInteraction,
): string | null {
  return stringOption(interaction, CARD_NAME_OPTION);
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

/** Ephemeral response for a card whose effect text can't be shown — the button
 * carried a card id no longer in the live data (resynced away) or malformed. */
const EFFECT_UNAVAILABLE: APIInteractionResponse = {
  type: InteractionResponseType.ChannelMessageWithSource,
  data: {
    content: "I can't find that card's effect anymore — try `/card` again.",
    flags: MessageFlags.Ephemeral,
  },
};

/** The "Show effect text" button (chunk 4.10). custom_id is
 * `card:effect:<cardId>` (built by cardResponse); the card id is the third
 * `:`-segment. The router dispatches the whole `card` namespace here, so this
 * verifies the `effect` action before slicing — a different `card:` action
 * (none today, but the namespace is shared) is not this handler's to answer.
 * Re-queries the live repo so the button keeps working on old messages — a
 * card that's since left the data just yields the ephemeral note. Effect text
 * is identical across a card's printings, so the base printing lookup is
 * enough (no variant carried in the id). */
export function createCardEffectComponent(repo: CardRepo): ComponentHandler {
  const prefix = `${CARD_EFFECT_ID}:`;
  return async (interaction): Promise<APIInteractionResponse> => {
    const { custom_id } = interaction.data;
    if (!custom_id.startsWith(prefix)) return EFFECT_UNAVAILABLE;
    const cardId = custom_id.slice(prefix.length);
    if (!cardId) return EFFECT_UNAVAILABLE;
    const card = await repo.findPrinting(cardId);
    if (!card) return EFFECT_UNAVAILABLE;
    return cardEffectResponse(card);
  };
}
