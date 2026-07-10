// The /set command (chunk 4.2, born as /release; renamed in 4.9 — same
// behavior, clearer name): set/release info from the static dataset in
// data/releases.ts, plus a live card tally from D1. The autocomplete is
// entirely in-memory (like /keyword) — the only D1 query runs on the
// command invocation itself, never per keystroke.
import {
  InteractionResponseType,
  MessageFlags,
  type APIChatInputApplicationCommandInteraction,
  type APIInteractionResponse,
} from "discord-api-types/v10";
import { RELEASES, setNameMatchers, type ReleaseSet } from "../../data/releases.ts";
import { normalizeSearchName } from "../../data/schema.ts";
import type { CardRepo } from "../../data/repo.ts";
import type { AutocompleteHandler, CommandHandler } from "../router.ts";
import { releaseResponse } from "../embeds.ts";
import { readStringOption, stringOption } from "../options.ts";

export const SET_OPTION = "set";

/** Normalized lookup index: codes (spaced and compacted — "bt 14" and
 * "bt14") and names → set. Codes are what autocomplete submits as values. */
const INDEX = new Map<string, ReleaseSet>();
for (const set of RELEASES) {
  const code = normalizeSearchName(set.code);
  for (const key of [code, code.replace(/\s/g, ""), normalizeSearchName(set.name)]) {
    if (key && !INDEX.has(key)) INDEX.set(key, set);
  }
}

function prefixMatches(normalized: string): ReleaseSet[] {
  const compact = normalized.replace(/\s/g, "");
  const seen = new Set<ReleaseSet>();
  for (const [key, set] of INDEX) {
    if (key.startsWith(normalized) || key.replace(/\s/g, "").startsWith(compact)) seen.add(set);
  }
  return [...seen];
}

export function createSetCommand(repo: CardRepo): CommandHandler {
  return async (interaction): Promise<APIInteractionResponse> => {
    const typed =
      stringOption(interaction as APIChatInputApplicationCommandInteraction, SET_OPTION) ?? "";
    const normalized = normalizeSearchName(typed);
    if (!normalized) {
      return ephemeral("Please name a set, like `BT-14` or `Beginning Observer`.");
    }

    let set = INDEX.get(normalized) ?? INDEX.get(normalized.replace(/\s/g, ""));
    if (!set) {
      const matches = prefixMatches(normalized);
      if (matches.length === 1) set = matches[0];
      else if (matches.length > 1) {
        const codes = matches.map((s) => `\`${s.code}\``).join(", ");
        return ephemeral(`Did you mean one of: ${codes}?`);
      }
    }
    if (!set) {
      return ephemeral(
        "I don't have release info for that set. Try the autocomplete suggestions — brand-new products may not be in my release data yet.",
      );
    }

    const matchers = setNameMatchers(set);
    // Empty matchers = this product's cards can't be told apart in the card
    // data (see releases.ts) — show the release info without a tally.
    const counts = matchers.length > 0 ? await repo.countSetCards(matchers) : null;
    return releaseResponse(set, counts, new Date());
  };
}

/** Autocomplete over the static set list — newest first, no I/O. */
export function createSetAutocomplete(): AutocompleteHandler {
  const newestFirst = [...RELEASES].sort((a, b) => b.releasedEN.localeCompare(a.releasedEN));
  return (interaction) => {
    // Single-option command — the shared guarded reader covers it (4.12 review
    // #3); no re-inlined typeof guard.
    const typed = normalizeSearchName(readStringOption(interaction.data.options, SET_OPTION) ?? "");
    const pool = typed ? prefixMatchesInOrder(typed, newestFirst) : newestFirst;
    return Promise.resolve(pool.map((s) => ({ name: `${s.code} — ${s.name}`, value: s.code })));
  };
}

function prefixMatchesInOrder(normalized: string, ordered: ReleaseSet[]): ReleaseSet[] {
  const hits = new Set(prefixMatches(normalized));
  return ordered.filter((s) => hits.has(s));
}

function ephemeral(content: string): APIInteractionResponse {
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content, flags: MessageFlags.Ephemeral },
  };
}
