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
import type { Card } from "../data/schema.ts";
import type { ReleaseSet } from "../data/releases.ts";

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

/** Image-first (chunk 4.8, owner call): the card image already prints
 * every stat and effect, so the embed carries only what the image
 * lacks — title, set name, and (once chunk 4.6 lands) a restriction
 * warning as the description line. */
export function cardResponse(card: Card): APIInteractionResponse {
  const embed: APIEmbed = {
    title: cardTitle(card),
    color: embedColor(card.color),
  };
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
