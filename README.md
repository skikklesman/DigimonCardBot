<!--
  Maintainer note (not rendered on GitHub): DRAFT for owner review before the
  repo goes public. Fill the placeholders flagged in [brackets]: the invite
  link (published at rollout, 5.5), the license (MIT recommended — see the
  open decision), and the contact/support line. The Privacy/ToS links below
  are the public home the verification form needs — once this README is live,
  paste those URLs into docs/DISCORD-VERIFICATION.md.
-->

# DigimonCardBot

A fast, no-frills **Digimon Trading Card Game** card-lookup bot for Discord.
Type a card name and get its image, ban/restriction status, and alternate-art
printings — right in the channel, with autocomplete.

Built to carry on for the community bot **DigimonTCGBot** (retiring
2026‑07‑31).

## Add it to your server

**[Invite link — coming at launch.]**

The bot installs with the **`applications.commands` scope only** — it adds
slash commands and nothing else. It is **not** a member of your server, has no
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
interactions** model — a signed request/response endpoint, with **no Gateway
connection and no privileged intents**. Card data lives in a **Cloudflare D1**
database, refreshed on a weekly schedule from a public community card dataset
behind a validation pipeline (so a bad upstream update can't corrupt live
data). The design targets ~1,000 servers at roughly \$0/month with minimal
maintenance.

## Development

Requires Node.js (native TypeScript) and a Cloudflare account for deploys.

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

**[License — TBD; MIT recommended.]** See `LICENSE` once chosen.

---

_DigimonCardBot is an unofficial, fan-made project. Digimon and the Digimon
Card Game are trademarks of their respective owners; this project is not
affiliated with, endorsed by, or sponsored by Bandai._
