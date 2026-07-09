// Pure embed/response builders (TECH-DESIGN §2): Card in, Discord response
// JSON out — no I/O, snapshot-tested. Card hits are public messages;
// not-found and disambiguation are ephemeral so a mistyped name doesn't
// spam the channel.
import {
  ButtonStyle,
  ComponentType,
  InteractionResponseType,
  MessageFlags,
  type APIEmbed,
  type APIInteractionResponse,
  type APIInteractionResponseCallbackData,
} from "discord-api-types/v10";
import type { Card } from "../data/schema.ts";
import type { ReleaseSet } from "../data/releases.ts";
import { CHOICE_PARTNERS } from "../data/restrictions.ts";

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

/** Restriction warning wordings (chunk 4.6). Values are the upstream English
 * status verbatim; wording owner-approved 2026-07-07. */
const RESTRICTION_LINES: Record<string, string> = {
  Banned: "⚠️ **Banned**",
  "Restricted to 1": "⚠️ **Restricted to 1** — decks may include at most one copy",
};

/** 'Not released' (in English) shows nothing (owner call 2026-07-07); an
 * unrecognized future value falls through raw — surfacing beats hiding.
 * Choice restriction names the related cards from the curated
 * CHOICE_PARTNERS map as `Name (ID)` (chunk 4.6.1, owner call — matches
 * /banlist), using the caller-resolved name map; a name the map lacks
 * degrades to the bare id, and a card CHOICE_PARTNERS doesn't know yet
 * falls back to generic wording. */
function restrictionLine(
  restriction: string | null,
  cardId: string,
  relatedCardNames?: ReadonlyMap<string, string>,
): string | null {
  if (!restriction || restriction === "Not released") return null;
  if (restriction === "Choice Restriction") {
    const partners = CHOICE_PARTNERS[cardId];
    if (!partners) {
      return "⚠️ **Choice restriction** — decks may include only one card from its restriction group";
    }
    const related = partners.map((id) => {
      const name = relatedCardNames?.get(id);
      return name ? `${name} (${id})` : id;
    });
    return `⚠️ **Choice restriction** — cannot be in a deck with ${related.join(" or ")}`;
  }
  return RESTRICTION_LINES[restriction] ?? `⚠️ **${truncate(restriction, 100)}**`;
}

/** custom_id `namespace:action` for the /card effect-reveal button (chunk
 * 4.10). The router dispatches on the namespace (`card`); the handler parses
 * the card id from the trailing segment. Exported so the handler parses the
 * exact string this builder emits — one source of truth, no magic-string
 * drift. */
export const CARD_EFFECT_ID = "card:effect";

/** True when a card has any text worth revealing behind the button. */
function hasEffectText(card: Card): boolean {
  return Boolean(card.effect || card.inherited);
}

/** Image-first (chunk 4.8, owner call): the card image already prints
 * every stat and effect, so the embed carries only what the image
 * lacks — title, set name, and the 4.6 restriction warning as the
 * description line. `relatedCardNames` (4.6.1) is the handler-resolved
 * id→name map for choice-restriction partners — passed in so this
 * builder stays a pure function with no repo access. Chunk 4.10: when the
 * card has effect/inherited text, a single "Show effect text" button lets a
 * viewer pull that text up as an ephemeral reply (built by
 * cardEffectResponse) without cluttering the public, image-first message. */
export function cardResponse(
  card: Card,
  relatedCardNames?: ReadonlyMap<string, string>,
): APIInteractionResponse {
  const embed: APIEmbed = {
    title: cardTitle(card),
    color: embedColor(card.color),
  };
  const warning = restrictionLine(card.restriction, card.cardId, relatedCardNames);
  if (warning) {
    embed.description = warning;
  }
  if (card.imageUrl) {
    embed.image = { url: card.imageUrl };
  }
  if (card.setName) {
    embed.footer = { text: truncate(card.setName, MAX_FIELD) };
  }

  const data: APIInteractionResponseCallbackData = { embeds: [embed] };
  if (hasEffectText(card)) {
    data.components = [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            style: ButtonStyle.Secondary,
            label: "Show effect text",
            custom_id: `${CARD_EFFECT_ID}:${card.cardId}`,
          },
        ],
      },
    ];
  }

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data,
  };
}

/** The effect-reveal itself (chunk 4.10): an ephemeral embed carrying the
 * Effect and Inherited/Security text that the image-first /card message omits
 * (removed from the public embed in 4.8). Ephemeral so only the clicker sees
 * it — the public message stays clean and nobody else's channel view changes.
 * A card with neither field shouldn't reach here (the button is gated on
 * hasEffectText), but degrade to a plain note rather than an empty embed. */
export function cardEffectResponse(card: Card): APIInteractionResponse {
  if (!hasEffectText(card)) {
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: `**${cardTitle(card)}** has no effect text.`,
        flags: MessageFlags.Ephemeral,
      },
    };
  }
  const fields: NonNullable<APIEmbed["fields"]> = [];
  if (card.effect) {
    fields.push({ name: "Effect", value: truncate(card.effect, MAX_FIELD) });
  }
  if (card.inherited) {
    fields.push({ name: "Inherited / Security", value: truncate(card.inherited, MAX_FIELD) });
  }
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      embeds: [
        {
          title: cardTitle(card),
          color: embedColor(card.color),
          fields,
        },
      ],
      flags: MessageFlags.Ephemeral,
    },
  };
}

/** A rules-keyword definition (/keyword) — no card, no image, just text. */
export function keywordResponse(keyword: { name: string; text: string }): APIInteractionResponse {
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      embeds: [
        {
          title: truncate(`＜${keyword.name}＞`, MAX_TITLE),
          description: truncate(keyword.text, 4096),
          color: DEFAULT_COLOR,
          footer: { text: "Digimon Card Game keyword" },
        },
      ],
    },
  };
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2023-11-17" → "November 17, 2023"; "2025-10" → "October 2025". */
function formatReleaseDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  const monthName = MONTHS[Number(month) - 1] ?? month ?? "";
  return day ? `${monthName} ${Number(day)}, ${year}` : `${monthName} ${year}`;
}

/** Set/release info (/release). `now` decides released-vs-upcoming phrasing
 * — injected so the builder stays a pure, snapshot-testable function. */
export function releaseResponse(
  set: ReleaseSet,
  counts: { cards: number; printings: number } | null,
  now: Date,
): APIInteractionResponse {
  // Lexicographic compare works: releasedEN is ISO-ordered, and a bare
  // "YYYY-MM" sorts before any day within that month (upcoming-ish is the
  // right call for a month-only announcement).
  const upcoming = set.releasedEN > now.toISOString().slice(0, 10);
  const dateLine = `${upcoming ? "Releases" : "Released"} ${formatReleaseDate(set.releasedEN)}`;

  const fields = [
    { name: "Product", value: set.product, inline: true },
    { name: "English release", value: dateLine, inline: true },
  ];
  if (counts && counts.printings > 0) {
    fields.push({
      name: "In my card data",
      value: `${counts.cards} cards · ${counts.printings} printings`,
      inline: true,
    });
  } else if (counts && upcoming) {
    fields.push({ name: "In my card data", value: "Nothing yet — not out!", inline: true });
  }

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      embeds: [
        {
          title: truncate(`${set.code} — ${set.name}`, MAX_TITLE),
          color: DEFAULT_COLOR,
          fields,
          footer: { text: "Digimon Card Game set" },
        },
      ],
    },
  };
}

/** Upcoming-releases forecast (/release, chunk 4.9): every curated set
 * dated today or later, soonest first — derived entirely from
 * releases.ts, so a stale file shortens the list but never lies.
 * Month-only announcements ("2026-08") stay listed through their whole
 * month; a set releasing today still counts as upcoming. `now` is
 * injected to keep the builder pure and snapshot-testable. */
export function upcomingReleasesResponse(sets: ReleaseSet[], now: Date): APIInteractionResponse {
  const today = now.toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  const upcoming = sets
    .filter((s) => (s.releasedEN.length === 7 ? s.releasedEN >= thisMonth : s.releasedEN >= today))
    .sort((a, b) => a.releasedEN.localeCompare(b.releasedEN));

  const lines = upcoming.map(
    (s) => `• **${s.name}** (${s.code}) — ${formatReleaseDate(s.releasedEN)}`,
  );
  const description =
    lines.length > 0
      ? truncate(lines.join("\n"), 4096)
      : "No upcoming sets in my release data right now — new Bandai announcements land here as they're added.";

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      embeds: [
        {
          title: "Upcoming Releases",
          description,
          color: DEFAULT_COLOR,
          footer: { text: "English release dates · YYYY-MM = announced month" },
        },
      ],
    },
  };
}

/** The official Banned & Restricted page — /banlist's title link and the
 * build-time verification source (ROADMAP 4.7). */
const OFFICIAL_RESTRICTION_URL = "https://en.digimoncard.com/rule/restriction_card/";

/** /banlist section order and headings. Known statuses get owner-approved
 * wording (2026-07-07); any unknown future status becomes its own
 * raw-headed section after these — surfacing beats hiding, as on /card. */
const BANLIST_SECTIONS: ReadonlyArray<{ status: string; heading: string }> = [
  { status: "Banned", heading: "**Banned**" },
  { status: "Restricted to 1", heading: "**Restricted to 1** — at most one copy per deck" },
  {
    status: "Choice Restriction",
    heading: "**Choice restriction** — decks with this card cannot include the related cards",
  },
];

/** `• **Name** \`ID\``; choice-restricted lines name their related cards
 * as `Name (ID)` (owner wording 2026-07-07). Partner ids come from the
 * curated map; names resolve from the fetched list itself — choice
 * restriction is mutual, so partners appear in the same list. Degrades
 * to the bare id for a partner the list doesn't cover, and to a bare
 * line for a card the map doesn't know yet. */
function banlistLine(card: Card, nameById: ReadonlyMap<string, string>): string {
  const partners =
    card.restriction === "Choice Restriction" ? CHOICE_PARTNERS[card.cardId] : undefined;
  const related = partners?.map((id) => {
    const name = nameById.get(id);
    return name ? `${name} (${id})` : id;
  });
  const suffix = related ? ` — with ${related.join(" or ")}` : "";
  return `• **${card.name}** \`${card.cardId}\`${suffix}`;
}

/** The complete banned/restricted list (/banlist, chunk 4.7): one public
 * embed, grouped by status, title linking the official announcement.
 * Cards arrive from the repo already sorted by card id. */
export function banlistResponse(cards: Card[]): APIInteractionResponse {
  const nameById = new Map(cards.map((c) => [c.cardId, c.name] as const));
  const byStatus = new Map<string, Card[]>();
  for (const card of cards) {
    const status = card.restriction ?? "";
    byStatus.set(status, [...(byStatus.get(status) ?? []), card]);
  }

  const known = BANLIST_SECTIONS.map((s) => s.status);
  const sections = [
    ...BANLIST_SECTIONS,
    ...[...byStatus.keys()]
      .filter((status) => !known.includes(status))
      .sort()
      .map((status) => ({ status, heading: `**${truncate(status, 100)}**` })),
  ];

  const lines: string[] = [];
  for (const { status, heading } of sections) {
    const group = byStatus.get(status);
    if (!group || group.length === 0) continue;
    if (lines.length > 0) lines.push("");
    lines.push(heading, ...group.map((card) => banlistLine(card, nameById)));
  }

  let description = "No cards are currently banned or restricted.";
  if (lines.length > 0) {
    description = lines.join("\n");
    if (description.length > 4096) {
      // Cut whole lines, never mid-card: the current list fits with room
      // to spare, so this only guards a much larger future list.
      const note = "\n…list truncated — the linked official page has the rest.";
      while (lines.length > 0 && lines.join("\n").length + note.length > 4096) lines.pop();
      description = lines.join("\n") + note;
    }
  }

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      embeds: [
        {
          title: "Banned & Restricted Cards",
          url: OFFICIAL_RESTRICTION_URL,
          description,
          color: DEFAULT_COLOR,
          footer: { text: "Official list: en.digimoncard.com/rule/restriction_card" },
        },
      ],
    },
  };
}

/** Discord allows at most 10 embeds per message — the /alt gallery cap. */
const MAX_GALLERY_EMBEDS = 10;

/** Every printing of one card as an embed gallery: image-first, one embed
 * per printing, stats omitted — /alt is about the art. */
export function altGalleryResponse(printings: Card[]): APIInteractionResponse {
  const shown = printings.slice(0, MAX_GALLERY_EMBEDS);
  const first = shown[0];
  const overflow =
    printings.length > shown.length ? ` (showing ${shown.length} of ${printings.length})` : "";
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: first
        ? `**${first.name}** \`${first.cardId}\` — ${printings.length} printings${overflow}`
        : undefined,
      embeds: shown.map((card) => {
        const label = card.variant === "0" ? "base printing" : `alt-art ${card.variant}`;
        const embed: APIEmbed = {
          title: truncate(`${card.name} — ${card.cardId} · ${label}`, MAX_TITLE),
          color: embedColor(card.color),
        };
        if (card.imageUrl) embed.image = { url: card.imageUrl };
        if (card.setName) embed.footer = { text: truncate(card.setName, MAX_FIELD) };
        return embed;
      }),
    },
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
