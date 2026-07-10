// The /keyword command (chunk 4.1): rules-term lookup against the static
// dataset in data/keywords.ts. Entirely in-memory — no D1 — so both the
// command and its autocomplete are pure functions over a constant list.
import {
  InteractionResponseType,
  MessageFlags,
  type APIChatInputApplicationCommandInteraction,
  type APIInteractionResponse,
} from "discord-api-types/v10";
import { KEYWORDS, type Keyword } from "../../data/keywords.ts";
import { normalizeSearchName } from "../../data/schema.ts";
import type { AutocompleteHandler, CommandHandler } from "../router.ts";
import { keywordResponse } from "../embeds.ts";
import { readStringOption, stringOption } from "../options.ts";

export const TERM_OPTION = "term";

/** Normalized lookup index: canonical names and aliases → keyword. Number
 * placeholders ("Draw N") also match without the N ("draw"). */
const INDEX = new Map<string, Keyword>();
for (const keyword of KEYWORDS) {
  const names = [keyword.name, ...(keyword.aliases ?? [])];
  for (const name of names) {
    for (const form of [name, name.replace(/\bn\b/gi, " ")]) {
      const key = normalizeSearchName(form);
      if (key && !INDEX.has(key)) INDEX.set(key, keyword);
    }
  }
}

function prefixMatches(normalized: string): Keyword[] {
  const seen = new Set<Keyword>();
  for (const [key, keyword] of INDEX) {
    if (key.startsWith(normalized)) seen.add(keyword);
  }
  return [...seen];
}

export function createKeywordCommand(): CommandHandler {
  return (interaction): Promise<APIInteractionResponse> => {
    const typed =
      stringOption(interaction as APIChatInputApplicationCommandInteraction, TERM_OPTION) ?? "";
    const normalized = normalizeSearchName(typed);
    if (!normalized) {
      return Promise.resolve(ephemeral("Please provide a keyword, like `Blocker` or `Raid`."));
    }

    const exact = INDEX.get(normalized);
    if (exact) return Promise.resolve(keywordResponse(exact));

    const matches = prefixMatches(normalized);
    if (matches.length === 1 && matches[0]) return Promise.resolve(keywordResponse(matches[0]));
    if (matches.length > 1) {
      const names = matches.map((k) => `\`${k.name}\``).join(", ");
      return Promise.resolve(ephemeral(`Did you mean one of: ${names}?`));
    }
    return Promise.resolve(
      ephemeral(
        "I don't know that keyword. Try the autocomplete suggestions — and if it's a brand-new mechanic, it may not be in my glossary yet.",
      ),
    );
  };
}

/** Autocomplete over canonical keyword names — static list, no I/O. */
export function createKeywordAutocomplete(): AutocompleteHandler {
  const sorted = [...KEYWORDS].sort((a, b) => a.name.localeCompare(b.name));
  return (interaction) => {
    // Single-option command: the term is the (only, always-focused) option, so
    // the shared guarded reader is enough — no re-inlined typeof dance (4.12
    // review #3). readStringOption returns null when absent/empty/malformed.
    const typed = normalizeSearchName(
      readStringOption(interaction.data.options, TERM_OPTION) ?? "",
    );
    const pool = typed
      ? sorted.filter((k) =>
          [k.name, ...(k.aliases ?? [])].some((n) => normalizeSearchName(n).startsWith(typed)),
        )
      : sorted;
    return Promise.resolve(pool.map((k) => ({ name: k.name, value: k.name })));
  };
}

function ephemeral(content: string): APIInteractionResponse {
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content, flags: MessageFlags.Ephemeral },
  };
}
