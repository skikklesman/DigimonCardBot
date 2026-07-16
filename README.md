# DigimonCardBot

A fast **Digimon Trading Card Game** card-lookup bot for Discord.
Type a card name and get its image, ban/restriction status, and alternate-art
printings.

Inspired by the dearly departed **DigimonTCGBot** who retired in July 2026.

## Add it to your server

[**Bot Install Link (User or Server)**](https://discord.com/oauth2/authorize?client_id=1523405095507857600)

The bot installs with the **`applications.commands` scope only** — it adds slash
commands and nothing else. It is not a member of your server, has no presence,
reads no messages, and cannot post on its own.

## About the project

I built this as a replacement for the DigimonTCGBot that went down, and as an experiment
to see what Claude Code is capable of as a programming assistant.
One of the hurdles was not having access to the source code of that original bot. For
this one, I want to make the code public for others to reference if they want to
build their own bots.

I also want anyone with a good idea for a new feature to be able to add it. If
you want to contribute, please do! If you make a
[**Pull Request**](https://github.com/skikklesman/DigimonCardBot/pulls), I will
review it and get it in, and the bot will be better for it.

If you find bugs or desire to see a new command or other feature, create a ticket
in [**Issues**](https://github.com/skikklesman/DigimonCardBot/issues).

## Commands

| Command                  | What it does                                                                                                                                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`/card <name or ID>`** | Look up a card (autocomplete by name or card ID). Replies with the card image, flags any **banned/restricted** status, and — for cards with alternate art — adds **◀ Prev / Next ▶** buttons to page the printings, plus an optional `alt` option to jump straight to one. |
| **`/keyword <term>`**    | Explain a rules keyword from a curated, judge-reviewed glossary.                                                                                                                                                                                                           |
| **`/set <set>`**         | Look up a set's release info.                                                                                                                                                                                                                                              |
| **`/release`**           | List the upcoming Digimon TCG releases.                                                                                                                                                                                                                                    |
| **`/banlist`**           | Show the current banned & restricted list.                                                                                                                                                                                                                                 |

## How it works

DigimonCardBot runs as a single **Cloudflare Worker** using Discord's **HTTP
interactions** model — a signed request/response endpoint, with no Gateway
connection and no privileged intents. Card data lives in a **Cloudflare D1**
database, refreshed on a weekly schedule from a public community card dataset
behind a validation pipeline. The design should mean that it can operate in the
Cloudflare free tier for up to ~1,000 servers, with minimal maintenance.

## Deployment

Every push to `master` runs the checks in CI (typecheck, lint, tests). If those
come back green, the new build is deployed to Cloudflare automatically and is
live on all servers within the hour.

## Contributing

If you want to contribute to the project, thank you! Just fork the repo and make
a change on your branch, then create a
[**Pull Request**](https://github.com/skikklesman/DigimonCardBot/pulls).

1. Fork the project
2. Create a feature branch
3. Push changes to that branch
4. Open a Pull Request back to this master branch

Before you open the PR, run the same checks CI will:

```bash
npm install
npm test            # unit + integration (Vitest, Workers runtime + local D1)
npm run typecheck
npm run lint
```

The tests are self-contained — they run against a local D1, so you don't need a
Cloudflare account or a Discord app just to contribute. Formatting is **not**
enforced: `npm run format` (Prettier) is there if you want it, but it will never
fail a build.

## Creating your own bot

The code is public partly so you can build your own. Be aware that running your
own copy needs more than `npm install` — the bot is bound to **your** Cloudflare
and Discord resources, not this project's.

**You'll need:** Node.js **≥ 22.18** (the scripts run TypeScript natively; CI
uses 24), a Cloudflare account, and your own Discord application.

1. **Create a Discord app** in the
   [Developer Portal](https://discord.com/developers/applications). Copy
   `.dev.vars.example` to `.dev.vars` (gitignored) and fill in your app's public
   key, app id, and bot token.
2. **Create your own D1 database** — `npx wrangler d1 create cards` — then
   replace `database_id` in `wrangler.toml` with the id it prints. The id
   committed here belongs to this project; you won't have access to it.
3. **Apply the schema** — `npx wrangler d1 migrations apply cards` (add
   `--local` for local development). The migrations live in `migrations/`.
4. **Seed the card data.** A fresh database is **empty**, and there is no seed
   script: data arrives via the weekly cron or a `POST /admin/resync` (bearer
   `RESYNC_TOKEN`). Until it's populated, `/card` finds nothing and `/health`
   returns 503 — that's the dead-man check working, not a bug.
5. **Register the commands** — `npm run register` (guild-scoped and instant,
   good for testing) or `npm run register:global` (~1h propagation). Needs
   `DISCORD_APP_ID`, `DISCORD_BOT_TOKEN`, and `DISCORD_TEST_GUILD_ID`.
6. **Give Discord a public HTTPS URL.** This is the one that surprises people:
   HTTP interactions mean Discord POSTs _to you_, so `npm run dev`
   (`wrangler dev`) on localhost is not reachable. Either deploy
   (`npm run deploy`) or run a tunnel in front of the dev server, then set that
   URL as the **Interactions Endpoint URL** in the Developer Portal.

Architecture and design notes live in [`docs/`](docs/) — start with
[`HANDOFF.md`](HANDOFF.md) (the founding spec) and
[`docs/TECH-DESIGN.md`](docs/TECH-DESIGN.md) (module boundaries and
conventions).

## Privacy & Terms

The bot collects and stores **no personal data** — no message content, no user
IDs, no analytics. Each interaction is handled statelessly.

- **[Privacy Policy](docs/PRIVACY.md)**
- **[Terms of Service](docs/TERMS.md)**

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
