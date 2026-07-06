// Pure embed/response builders (TECH-DESIGN §2): Card in, Discord response
// JSON out — no I/O, snapshot-tested. Card hits are public messages;
// not-found and disambiguation are ephemeral so a mistyped name doesn't
// spam the channel.
import {
  InteractionResponseType,
  MessageFlags,
  type APIEmbed,
  type APIInteractionResponse,
} from "discord-api-types/v10";
import type { Card } from "../data/schema";

// Discord embed limits (title 256 / field value 1024). Long effects get cut
// with an ellipsis — the full text is on the card image anyway.
const MAX_TITLE = 256;
const MAX_FIELD = 1024;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

// Left accent bar, keyed on the card's (first) color.
const EMBED_COLORS: Record<string, number> = {
  red: 0xe0455a,
  blue: 0x3387c2,
  yellow: 0xf2c94c,
  green: 0x43a575,
  black: 0x3b3f46,
  purple: 0x8b5cb8,
  white: 0xe4e7eb,
};
const DEFAULT_COLOR = 0x99aab5;

function embedColor(color: string | null): number {
  const first = color?.split("/")[0]?.trim().toLowerCase() ?? "";
  return EMBED_COLORS[first] ?? DEFAULT_COLOR;
}

/** `Goldramon — BT14-018`, with the variant tagged for alt-arts. */
function cardTitle(card: Card): string {
  const variant = card.variant === "0" ? "" : ` (${card.variant})`;
  return truncate(`${card.name} — ${card.cardId}${variant}`, MAX_TITLE);
}

export function cardResponse(card: Card): APIInteractionResponse {
  const stats: Array<[label: string, value: string | null]> = [
    ["Type", card.cardType],
    ["Color", card.color],
    ["Level", card.level === null ? null : String(card.level)],
    ["Play Cost", card.playCost === null ? null : String(card.playCost)],
    ["DP", card.dp === null ? null : String(card.dp)],
    ["Rarity", card.rarity],
  ];

  const embed: APIEmbed = {
    title: cardTitle(card),
    color: embedColor(card.color),
    fields: stats
      .filter((entry): entry is [string, string] => entry[1] !== null)
      .map(([name, value]) => ({ name, value, inline: true })),
  };
  if (card.effect) {
    embed.fields?.push({ name: "Effect", value: truncate(card.effect, MAX_FIELD) });
  }
  if (card.inherited) {
    embed.fields?.push({
      name: "Inherited / Security",
      value: truncate(card.inherited, MAX_FIELD),
    });
  }
  if (card.imageUrl) {
    embed.image = { url: card.imageUrl };
  }
  if (card.setName) {
    embed.footer = { text: truncate(card.setName, MAX_FIELD) };
  }

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { embeds: [embed] },
  };
}

/** How many closest matches to list before telling the user to narrow it. */
const MAX_LISTED_MATCHES = 8;

export function disambiguationResponse(query: string, matches: Card[]): APIInteractionResponse {
  const listed = matches.slice(0, MAX_LISTED_MATCHES);
  const lines = listed.map((card) => {
    const set = card.setName ? ` — ${card.setName}` : "";
    return `• **${card.name}** \`${card.cardId}\`${set}`;
  });
  const more =
    matches.length > listed.length ? `\n…and ${matches.length - listed.length} more.` : "";
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: truncate(
        `Found ${matches.length} cards matching **${sanitize(query)}** — run the command again with one of these IDs:\n${lines.join("\n")}${more}`,
        2000,
      ),
      flags: MessageFlags.Ephemeral,
    },
  };
}

export function notFoundResponse(query: string): APIInteractionResponse {
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: `No cards found matching **${sanitize(query)}**. Try the autocomplete suggestions, or search by card ID (like \`EX1-066\`).`,
      flags: MessageFlags.Ephemeral,
    },
  };
}

/** User text echoed into a message: strip markdown/mention triggers, cap length. */
function sanitize(query: string): string {
  return truncate(query.replace(/[`*_~|@#<>[\]()\\]/g, ""), 100);
}
