<!--
  Maintainer note (not rendered on GitHub): DRAFT for owner review before
  publishing. This is not legal advice. Before you publish + submit for Discord
  verification: (1) fill the [CONTACT] placeholder, (2) confirm the third-party
  and "no data" statements still match reality, (3) set the effective date to
  the publish date. Companion doc: docs/TERMS.md.
-->

# Privacy Policy — DigimonCardBot

_Last updated: 2026-07-10._

DigimonCardBot ("the bot") is a Discord application that provides Digimon
Trading Card Game card lookups via slash commands. This policy explains what
data the bot does and does not handle.

## The short version

**The bot collects and stores no personal data about you.** There is nothing
to sell, share, or leak, and nothing for you to request or delete.

## What the bot does NOT collect

The bot does not:

- read, store, or log the content of your messages;
- store your Discord user ID, username, server membership, or any other
  identifier;
- track, profile, or run analytics on individual users;
- use a Gateway connection or any Discord privileged intents.

The bot uses Discord's HTTP interactions model: when you run one of its slash
commands, Discord sends that single interaction to the bot, the bot looks up
the requested card and replies, and nothing about the request is retained.
Interactions are handled statelessly.

## What the bot DOES store

The only data the bot stores is a **public Digimon TCG card database** — card
names, rules text, image links, set information, and ban/restriction status —
cached and refreshed on a schedule from a public, community-maintained card
dataset. This contains no personal data.

## Third-party services

- **Discord** — the platform the bot runs on. Your use of Discord is governed
  by [Discord's Privacy Policy](https://discord.com/privacy).
- **Cloudflare** — hosts the bot and its card-data cache. As part of delivering
  any web service, Cloudflare processes standard network request metadata
  (e.g. IP addresses at the network layer) under
  [Cloudflare's Privacy Policy](https://www.cloudflare.com/privacypolicy/). The
  bot itself neither reads nor stores this.
- **Card data source** — the bot mirrors a public, community-maintained Digimon
  card dataset. No personal data is involved.

The bot does not sell or share any data with third parties for advertising or
any other purpose.

## Children's privacy

The bot collects no personal data from anyone, including children.

## Changes to this policy

If this policy changes, the updated version will be posted at this URL with a
new "last updated" date.

## Contact

Questions about this policy: **[CrestOfDope@proton.me](mailto:CrestOfDope@proton.me)**.

---

_DigimonCardBot is an unofficial, fan-made project. Digimon and the Digimon
Card Game are trademarks of their respective owners; the bot is not affiliated
with, endorsed by, or sponsored by Bandai._
