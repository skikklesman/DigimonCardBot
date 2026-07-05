# DigimonCardBot — Claude session guide

Discord slash-command bot for Digimon TCG card lookup, replacing DigimonTCGBot
(shuts down 2026-07-31). Cloudflare Worker (HTTP interactions, no Gateway) +
D1 card cache with version-pointer sync. Target: ~1,000 servers, ~$0/month,
minimal maintenance.

## Project facts

- Remote: https://github.com/skikklesman/DigimonCardBot (`origin`, branch
  `master`). **Private for now** — the owner intends to open-source it once
  it's up and running (license + public README are launch-phase tasks; see
  DECISIONS.md open decisions).
- The `gh` CLI is installed and authenticated as `skikklesman` on the dev
  machine.
- Timeline pressure: the old bot dies **2026-07-31**, and Discord bot
  verification (human action, ~5-day review) must be submitted before the bot
  reaches 100 servers.

### Live deployment (as of chunk 0.5, 2026-07-05 — Gate A)

- **Worker is deployed and live** (production) at
  `https://digimon-tcg-bot.rstewart555.workers.dev`; the interactions endpoint
  is `POST /interactions`. It only answers Discord's signed PING for now — every
  card command lands in later chunks.
- **Cloudflare:** account `<OWNER_EMAIL>'s Account`
  (`<CLOUDFLARE_ACCOUNT_ID>`); `wrangler` authed via OAuth on the dev
  machine (token has `workers` + `d1` write — no re-login needed for Phase 1).
- **D1:** database `cards` (`004a6c30-4560-4990-9b41-2bf7805bb94e`) exists,
  bound as `DB`, schema migrated (chunk 1.1) — `meta.active_version = 0`, no
  card data until the first sync (chunk 1.6).
- **Discord app:** owned by a **Team** (DECISIONS #5). `DISCORD_PUBLIC_KEY` is
  set as a Worker secret (`wrangler secret put`); the Interactions Endpoint URL
  is saved in the Developer Portal and passed Discord's verification.
- None of the above are secrets. Actual secrets live only in `wrangler secret`
  / `.dev.vars` — never the repo.

## Read these before writing code

1. **[HANDOFF.md](HANDOFF.md)** — the founding spec: architecture, data model,
   sync defenses, and the **§15 Do NOT list**. Decisions recorded there are
   deliberate; do not quietly reverse them. Treat this file as read-mostly.
2. **[docs/ROADMAP.md](docs/ROADMAP.md)** — work chunks, the five gates
   (Scaffolding Up / First Playable / MVP / Feature Complete / Launched), and
   the MVP definition. **Find the first unchecked chunk; that's the current
   work.** Check chunks off as they land.
3. **[docs/TECH-DESIGN.md](docs/TECH-DESIGN.md)** — repo layout, module
   boundaries, conventions, and implementation-level guardrails.
4. **[docs/TESTING.md](docs/TESTING.md)** — test plan; every roadmap chunk
   ships with its tests, no exceptions.
5. **[docs/DECISIONS.md](docs/DECISIONS.md)** — decision log + open questions.
   Append when you make a non-trivial choice; check it before re-debating one.

## Hard rules (summary — full list in HANDOFF §15 and TECH-DESIGN §5)

- HTTP interactions only. Never the Gateway, never privileged intents.
- Never `DELETE`+`INSERT` on live card data — version pointer flip only.
- Every read query filters on `active_version`.
- No secrets in the repo, ever (`wrangler secret put` / `.dev.vars`).
- Feed data passes all validation gates before any write.
- Autocomplete responds synchronously — it cannot be deferred.
- New runtime dependencies require a DECISIONS.md entry.

## Workflow expectations

- Update ROADMAP checkboxes and gate dates in the same commit as the work.
- Tests land with the chunk (see TESTING.md for which layer).
- Facts marked "verify at build time" (HANDOFF §16) really do drift — check
  them when a chunk touches them, and note findings in DECISIONS.md.
