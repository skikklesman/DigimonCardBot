// /card autocomplete (HANDOFF §6.4): the type-4 branch. Synchronous by
// hard constraint — no deferral exists for autocomplete — which is exactly
// why lookups run against the local D1 cache, and why they must stay cheap.
// The router wraps our choices and enforces the 25-cap and the degrade-to-empty
// error path.
//
// /card has two autocompleting options, so this one handler branches on which
// is focused: `card-name` is the name prefix search; `alt` (chunk 4.12) is
// cross-option — it reads the current card-name value, resolves it to a single
// card, and offers that card's printings.
import {
  ApplicationCommandOptionType,
  type APIApplicationCommandAutocompleteInteraction,
  type APIApplicationCommandOptionChoice,
} from "discord-api-types/v10";
import type { CardRepo } from "../data/repo.ts";
import type { AutocompleteHandler } from "./router.ts";
import type { Card } from "../data/schema.ts";
import { ALT_OPTION, CARD_NAME_OPTION } from "./commands/card.ts";
import { resolveCardValue } from "./commands/resolve.ts";
import { readStringOption } from "./options.ts";

/** Discord's cap; the repo queries LIMIT to this so we never over-fetch. */
const MAX_CHOICES = 25;
/** Discord's per-choice label length cap. */
const MAX_LABEL = 100;

/**
 * card-name choice — Label: `Name (CARD-ID)` (DECISIONS.md 2026-07-05: the id
 * is short, collision-free, and what players retype). Value: the stable
 * `card_id|variant` token the /card handler resolves.
 */
function toChoice(card: Card): APIApplicationCommandOptionChoice {
  return {
    name: `${card.name} (${card.cardId})`.slice(0, MAX_LABEL),
    value: `${card.cardId}|${card.variant}`,
  };
}

/** alt choice — which printing of the already-chosen card; value is the exact
 * `card_id|variant` token, so the /card handler jumps straight to it. */
function toPrintingChoice(card: Card): APIApplicationCommandOptionChoice {
  const label = card.variant === "0" ? "Base printing" : `Alt-art ${card.variant}`;
  const withSet = card.setName ? `${label} · ${card.setName}` : label;
  return { name: withSet.slice(0, MAX_LABEL), value: `${card.cardId}|${card.variant}` };
}

/**
 * The card id the `alt` option should list printings for, from the current
 * card-name value. A picked suggestion is a `card_id|variant` token, so the id
 * is just its first segment — no D1 read needed on this per-keystroke path (the
 * `listPrintings` below is the only read, and an empty result already means
 * "not a real card"). Only free text or a bare id costs a resolve; an ambiguous
 * name (multi-match) returns null, so the option offers nothing until one card
 * is settled.
 */
async function altCardId(repo: CardRepo, value: string): Promise<string | null> {
  if (value.includes("|")) {
    const id = value.split("|")[0];
    return id ? id : null;
  }
  const resolution = await resolveCardValue(repo, value);
  return resolution.kind === "hit" ? resolution.card.cardId : null;
}

export function createCardAutocomplete(repo: CardRepo): AutocompleteHandler {
  return async (
    interaction: APIApplicationCommandAutocompleteInteraction,
  ): Promise<APIApplicationCommandOptionChoice[]> => {
    const options = interaction.data.options;
    const focused = options?.find(
      (o) => o.type === ApplicationCommandOptionType.String && "focused" in o && o.focused === true,
    );
    if (!focused) return [];

    // The `alt` printing selector (chunk 4.12). Cross-option: resolve the
    // card-name value to ONE card, then offer its printings. Ambiguous free
    // text (a multi-match or miss) yields nothing — pick the card first.
    if (focused.name === ALT_OPTION) {
      const nameValue = readStringOption(options, CARD_NAME_OPTION);
      if (nameValue === null) return [];
      const cardId = await altCardId(repo, nameValue);
      if (cardId === null) return [];
      const printings = await repo.listPrintings(cardId, MAX_CHOICES);
      return printings.map(toPrintingChoice);
    }

    if (focused.name === CARD_NAME_OPTION) {
      // Prefix search on the shared normalized name. The repo orders by
      // search_name, so an exact full-name match ("goldramon") sorts ahead of
      // its extensions ("goldramon x antibody") — exact-prefix-first falls out.
      const typed = readStringOption(options, CARD_NAME_OPTION);
      if (typed === null) return [];
      const matches = await repo.searchByName(typed, MAX_CHOICES);
      return matches.map(toChoice);
    }

    return [];
  };
}
