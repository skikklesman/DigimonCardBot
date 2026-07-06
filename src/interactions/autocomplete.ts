// /card autocomplete (HANDOFF §6.4): the type-4 branch. Synchronous by
// hard constraint — no deferral exists for autocomplete — which is exactly
// why lookups run against the local D1 cache. The router wraps our choices
// and enforces the 25-cap and the degrade-to-empty error path.
import {
  ApplicationCommandOptionType,
  type APIApplicationCommandAutocompleteInteraction,
  type APIApplicationCommandOptionChoice,
} from "discord-api-types/v10";
import type { CardRepo } from "../data/repo.ts";
import type { AutocompleteHandler } from "./router.ts";
import type { Card } from "../data/schema.ts";
import { CARD_NAME_OPTION } from "./commands/card.ts";

/** Discord's cap; the repo query LIMITs to this so we never over-fetch. */
const MAX_CHOICES = 25;

/**
 * Label: `Name (CARD-ID)` — deviates from HANDOFF's `Name (set_name)`
 * sketch deliberately (DECISIONS.md 2026-07-05): our set names are long
 * enough to crowd the 100-char label cap, while the card id is short,
 * collision-free, and what players retype anyway.
 * Value: the stable `card_id|variant` token the /card handler resolves.
 */
function toChoice(card: Card): APIApplicationCommandOptionChoice {
  return {
    name: `${card.name} (${card.cardId})`.slice(0, 100),
    value: `${card.cardId}|${card.variant}`,
  };
}

export function createCardAutocomplete(repo: CardRepo): AutocompleteHandler {
  return async (
    interaction: APIApplicationCommandAutocompleteInteraction,
  ): Promise<APIApplicationCommandOptionChoice[]> => {
    const focused = interaction.data.options?.find(
      (option) =>
        option.type === ApplicationCommandOptionType.String &&
        option.name === CARD_NAME_OPTION &&
        option.focused === true,
    );
    const typed =
      focused && "value" in focused && typeof focused.value === "string" ? focused.value : "";
    if (typed.trim() === "") return [];

    // Prefix search on the shared normalized name. The repo orders by
    // search_name, so an exact full-name match ("goldramon") sorts ahead
    // of its extensions ("goldramon x antibody") — HANDOFF's
    // exact-prefix-first prioritization falls out of the ordering.
    const matches = await repo.searchByName(typed, MAX_CHOICES);
    return matches.map(toChoice);
  };
}
