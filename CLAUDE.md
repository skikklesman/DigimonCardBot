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

### Live deployment (current through chunk 4.9, 2026-07-07)

- **Worker is deployed and live** (production) at
  `https://digimon-tcg-bot.rstewart555.workers.dev`; the interactions endpoint
  is `POST /interactions`. It only answers Discord's signed PING for now — every
  card command lands in later chunks.
- **Cloudflare:** account `<OWNER_EMAIL>'s Account`
  (`<CLOUDFLARE_ACCOUNT_ID>`); `wrangler` authed via OAuth on the dev
  machine (token has `workers` + `d1` write — no re-login needed for Phase 1).
- **D1:** database `cards` (`004a6c30-4560-4990-9b41-2bf7805bb94e`) exists,
  bound as `DB`, schema migrated (chunk 1.1). **Production D1 is populated**
  (2026-07-05, Gate B): version 1 live, 8,425 rows / 4,295 cards, transferred
  from the first real local sync. It will NOT refresh until the cron trigger
  lands (chunk 3.6) — data staleness is expected and harmless until then.
- **Phases 1–3 complete + chunks 4.1/4.2/4.8/4.9 and 3.6.1**
  (2026-07-05/07): sync pipeline, router, repository, `/card` (image-first
  since 4.8, autocomplete), `/alt` (gallery), `/keyword` (static
  glossary), `/set` (set lookup — born as `/release`, renamed in 4.9),
  `/release` (upcoming-releases forecast, 4.9), alerting (proven by live
  drills), `POST /admin/resync` (bearer-auth, proven against production),
  `GET /health` (503 when stale), post-deploy smoke in CI, weekly
  source-contract CI job (Mondays 06:00 UTC). Chunk 4.6 (2026-07-07):
  `/card` shows a ⚠️ description line for banned/restricted/choice-
  restricted cards (`restriction` column, migration 0002). Chunk 4.7
  (2026-07-07): `/banlist` — the full banned/restricted list, grouped
  Banned / Restricted to 1 / Choice restriction (related cards named).
  Chunk 4.6.1 (2026-07-08): `/card`'s choice line names the related
  cards — handler-resolved, same `Name (ID)` format as /banlist.
  Chunk 4.11 (2026-07-08): card images move off hotlinked
  `raw.githubusercontent.com` (429-rate-limited → intermittent blank
  `/card` images) to jsDelivr's CDN — one `IMAGE_BASE` constant; ships
  `npm run image-audit` (weekly CI, Mondays 07:00 UTC) probing every
  card image for coverage gaps. **Needs a production resync** to rewrite
  the stored `image_url` values (OWNER-TODO).
  4.3 (`/page`) closed as Will Not Do; **next buildable chunk: 4.5
  (hardening/fuzz)**; 4.4 needs community input. The owner is an
  **official Digimon TCG judge**: primary source for all rules/keyword
  content (see OWNER-TODO's glossary-review item).
- **Cron is LIVE**: `0 6 * * 2` — which on Cloudflare means **Mondays**
  06:00 UTC (their cron numbers weekdays from 1 = Sunday; diagnosed and
  deliberately kept 2026-07-07, DECISIONS — spell days by NAME in any
  future cron edit). A temporary one-off recovery trigger `0 6 8 7 *`
  fires Wed Jul 8 and is removed after. **The 7-day soak runs 2026-07-06
  → 2026-07-13**; Gate C also needs the two automated runs (expected
  Jul 8 one-off + Jul 13 weekly). Owner duties in OWNER-TODO.md.
  Production D1: version 2, 8,425 rows, pipeline-loaded via the resync
  route.
- **Commands registered to the soak guilds** (`DISCORD_TEST_GUILD_ID` is a
  comma-separated list since 3.6.1; owner's `.dev.vars` has
  `DISCORD_APP_ID`, `DISCORD_BOT_TOKEN`, `DISCORD_TEST_GUILD_ID`,
  `SYNC_ALERT_WEBHOOK`, `RESYNC_TOKEN`; re-register with
  `npm run register` after any command-definition change). Production secrets:
  `DISCORD_PUBLIC_KEY`, `SYNC_ALERT_WEBHOOK`, `RESYNC_TOKEN`. Optional
  `CARD_SOURCE_URL` overrides the card source for staging/drills.
- **Convention since 3.6:** relative imports carry explicit `.ts`
  extensions (Node scripts import real `src/` modules; one resolution
  style across Node, esbuild, vitest).
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
4. **[docs/TECH-DIRECTION.md](docs/TECH-DIRECTION.md)** — working
   agreements: **read before starting a chunk and before any commit.**
   Branch-per-chunk workflow (never develop on master), commit-message
   files, the pre-merge gate.
5. **[docs/TESTING.md](docs/TESTING.md)** — test plan; every roadmap chunk
   ships with its tests, no exceptions.
6. **[docs/DECISIONS.md](docs/DECISIONS.md)** — decision log + open questions.
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

- **Branch per chunk, squash-merge to master, commit via message file** —
  the full cycle is TECH-DIRECTION.md (2026-07-07). Never develop on
  master; owner reviews before the squash-merge.
- Update ROADMAP checkboxes and gate dates in the same commit as the work.
- Tests land with the chunk (see TESTING.md for which layer).
- Facts marked "verify at build time" (HANDOFF §16) really do drift — check
  them when a chunk touches them, and note findings in DECISIONS.md.
