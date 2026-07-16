# DigimonCardBot

A fast **Digimon Trading Card Game** card-lookup bot for Discord.
Type a card name and get its image, ban/restriction status, and alternate-art
printings.

Inspired by the dearly departed **DigimonTCGBot** who retired in July 2026.

## Add it to your server

[**\[Use this link to invite DigimonCardBot to a server, or add it to your own user.\]**](https://discord.com/oauth2/authorize?client_id=1523405095507857600)

The bot installs with the **`applications.commands` scope only**, it adds
slash commands and nothing else. It is not a member of your server, has no
presence, reads no messages, and cannot post on its own.

## Commands

| Command                  | What it does                                                                                                                                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`/card <name or ID>`** | Look up a card (autocomplete by name or card ID). Replies with the card image, flags any **banned/restricted** status, and — for cards with alternate art — adds **◀ Prev / Next ▶** buttons to page the printings, plus an optional `alt` option to jump straight to one. |
| **`/keyword <term>`**    | Explain a rules keyword from a curated, judge-reviewed glossary.                                                                                                                                                                                                           |
| **`/set <set>`**         | Look up a set's release info.                                                                                                                                                                                                                                              |
| **`/release`**           | List the upcoming Digimon TCG releases.                                                                                                                                                                                                                                    |
| **`/banlist`**           | Show the current banned & restricted list.                                                                                                                                                                                                                                 |

## Privacy & Terms

The bot collects and stores **no personal data** — no message content, no user
IDs, no analytics. Each interaction is handled statelessly.

- **[Privacy Policy](docs/PRIVACY.md)**
- **[Terms of Service](docs/TERMS.md)**

## How it works

DigimonCardBot runs as a single **Cloudflare Worker** using Discord's **HTTP
interactions** model — a signed request/response endpoint, with no Gateway
connection and no privileged intents. Card data lives in a **Cloudflare D1**
database, refreshed on a weekly schedule from a public community card dataset
behind a validation pipeline. The design should mean that it can operate in the
CloudFlare free tier for up to ~1,000 servers, with minimal maintenance.

## Development

This repository has scripts that automatically run on a new push to the master branch,
which kick off some validation tests. If those return green, a new build is
automatically deployed to the Cloudflare and will be live on all servers within an hour.

## Developing your own bot

If you want to fork this and develop your own version and release it, you will need Node.js
(native TypeScript), a Cloudflare account for deploys, and a new Discord developer application ID.

```bash
npm install
npm test            # unit + integration (Vitest, Workers runtime + local D1)
npm run typecheck
npm run lint
npm run dev         # wrangler dev
```

Architecture and design notes live in [`docs/`](docs/) — start with
[`HANDOFF.md`](HANDOFF.md) (the founding spec) and
[`docs/TECH-DESIGN.md`](docs/TECH-DESIGN.md) (module boundaries and
conventions).

## Credits

Card data from the community-maintained
[TakaOtaku/Digimon‑Card‑App](https://github.com/TakaOtaku/Digimon-Card-App)
dataset (MIT).

## License

Released under the [MIT License](LICENSE).

---

_DigimonCardBot is an unofficial, fan-made project. Digimon and the Digimon
Card Game are trademarks of their respective owners; this project is not
affiliated with, endorsed by, or sponsored by Bandai._
