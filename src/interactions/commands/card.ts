// The /card command (HANDOFF §6.3): resolve the card-name value via the
// shared ladder, render hit / disambiguation / not-found. Since chunk 4.12 it
// also owns alt-art viewing (the retired /alt): an optional `alt` option jumps
// to a specific printing, and multi-printing cards get Prev/Next buttons that
// page the family in an ephemeral view.
import {
  InteractionResponseType,
  MessageFlags,
  type APIChatInputApplicationCommandInteraction,
  type APIInteractionResponse,
  type APIMessageComponentInteraction,
} from "discord-api-types/v10";
import type { Card } from "../../data/schema.ts";
import type { CardRepo } from "../../data/repo.ts";
import { CHOICE_PARTNERS } from "../../data/restrictions.ts";
import type { CommandHandler, ComponentHandler } from "../router.ts";
import { stringOption } from "../options.ts";
import {
  CARD_EFFECT_ID,
  CARD_PRINTING_ID,
  cardEffectResponse,
  cardMessageData,
  cardResponse,
  disambiguationResponse,
  notFoundResponse,
  type PrintingNav,
} from "../embeds.ts";
import { resolveCardFamily, type CardFamilyResolution } from "./resolve.ts";

export const CARD_NAME_OPTION = "card-name";
/** Optional printing selector (chunk 4.12): its autocomplete offers the
 * card-name card's printings, value = the `card_id|variant` token. */
export const ALT_OPTION = "alt";

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

/** The shown printing's position in its (already-fetched) family, or undefined
 * for a single-printing card — no Prev/Next, and no extra query, since the
 * resolution already returned the whole family (2026-07-10 timeout fix). */
function printingNav(card: Card, family: Card[]): PrintingNav | undefined {
  if (family.length <= 1) return undefined;
  const index = family.findIndex((p) => p.variant === card.variant);
  return { index: index < 0 ? 0 : index, total: family.length };
}

export function createCardCommand(repo: CardRepo): CommandHandler {
  return async (interaction): Promise<APIInteractionResponse> => {
    const chat = interaction as APIChatInputApplicationCommandInteraction;
    const nameValue = cardNameValue(chat);
    const altValue = stringOption(chat, ALT_OPTION);
    if (nameValue === null && altValue === null) return MISSING_OPTION_RESPONSE;

    // An explicit alt-printing pick (a `card_id|variant` token from the alt
    // autocomplete) wins. It's only ever a token, so gate on the `|` — never
    // let free text typed into `alt` fall through to a name search. An alt that
    // doesn't resolve (free text, or a token gone stale) falls back to the
    // card-name card, but says so rather than dropping the pick (altMissed;
    // owner call, 4.12 review #8). Each resolution fetches the printing family
    // in ONE query, so the nav needs no second D1 round-trip — the fix for the
    // 2026-07-10 /card-timeout regression (DECISIONS.md).
    const altResolved =
      altValue && altValue.includes("|") ? await resolveCardFamily(repo, altValue) : null;
    const altHit = altResolved?.kind === "hit" ? altResolved : null;
    const altMissed = altValue !== null && altHit === null;
    const result: CardFamilyResolution = altHit
      ? altHit
      : nameValue !== null
        ? await resolveCardFamily(repo, nameValue)
        : { kind: "miss" };

    const query = nameValue ?? altValue ?? "";
    switch (result.kind) {
      case "hit": {
        const related = await relatedCardNames(repo, result.card);
        const note = altMissed
          ? "I couldn't match that printing, so here's the card itself."
          : undefined;
        return cardResponse(result.card, related, printingNav(result.card, result.family), note);
      }
      case "multi":
        return disambiguationResponse(query, result.matches);
      case "miss":
        return notFoundResponse(query);
    }
  };
}

/** Ephemeral note when a component's card can't be resolved — the button
 * carried a card id no longer in the live data (resynced away) or malformed. */
const CARD_COMPONENT_UNAVAILABLE: APIInteractionResponse = {
  type: InteractionResponseType.ChannelMessageWithSource,
  data: {
    content: "I can't find that card anymore — try `/card` again.",
    flags: MessageFlags.Ephemeral,
  },
};

/**
 * The `card`-namespace component handler (chunks 4.10 + 4.12). The router
 * dispatches the whole namespace here; this branches on the action prefix:
 *   - `card:effect:<cardId>`   → the ephemeral effect-text reveal (4.10).
 *   - `card:printing:<cardId>:<index>` → Prev/Next printing paging (4.12).
 * Total like all handlers; an unknown action degrades to the polite note.
 */
export function createCardComponent(repo: CardRepo): ComponentHandler {
  const effectPrefix = `${CARD_EFFECT_ID}:`;
  const printingPrefix = `${CARD_PRINTING_ID}:`;
  return async (interaction): Promise<APIInteractionResponse> => {
    const { custom_id } = interaction.data;
    if (custom_id.startsWith(effectPrefix)) {
      const cardId = custom_id.slice(effectPrefix.length);
      if (!cardId) return CARD_COMPONENT_UNAVAILABLE;
      const card = await repo.findPrinting(cardId);
      if (!card) return CARD_COMPONENT_UNAVAILABLE;
      return cardEffectResponse(card);
    }
    if (custom_id.startsWith(printingPrefix)) {
      return printingPage(repo, interaction, custom_id.slice(printingPrefix.length));
    }
    return CARD_COMPONENT_UNAVAILABLE;
  };
}

/**
 * Prev/Next paging (chunk 4.12). `rest` is `<cardId>:<targetIndex>`; card ids
 * carry no colon, so the index is the segment after the LAST colon. Re-queries
 * the live family so the buttons keep working on old messages, wrapping/clamping
 * the index if a resync changed the printing count. Responds EPHEMERALLY when
 * the click came from the public /card message (so that message never mutates —
 * no shared-control fighting), and edits IN PLACE when it came from an existing
 * ephemeral pager (told apart by the source message's ephemeral flag).
 */
async function printingPage(
  repo: CardRepo,
  interaction: APIMessageComponentInteraction,
  rest: string,
): Promise<APIInteractionResponse> {
  const lastColon = rest.lastIndexOf(":");
  if (lastColon <= 0) return CARD_COMPONENT_UNAVAILABLE;
  const cardId = rest.slice(0, lastColon);
  const target = Number(rest.slice(lastColon + 1));
  if (!Number.isInteger(target)) return CARD_COMPONENT_UNAVAILABLE;

  const printings = await repo.listPrintings(cardId);
  if (printings.length === 0) return CARD_COMPONENT_UNAVAILABLE;
  const index = ((target % printings.length) + printings.length) % printings.length;
  const card = printings[index]!;
  const data = cardMessageData(card, await relatedCardNames(repo, card), {
    index,
    total: printings.length,
  });

  const fromEphemeral = Boolean((interaction.message?.flags ?? 0) & MessageFlags.Ephemeral);
  return fromEphemeral
    ? { type: InteractionResponseType.UpdateMessage, data }
    : {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { ...data, flags: MessageFlags.Ephemeral },
      };
}
