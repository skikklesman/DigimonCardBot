# Tech Design — Repo Layout, Module Boundaries & Conventions

> Covers the engineering decisions [HANDOFF.md](../HANDOFF.md) leaves open:
> project structure, tooling, module boundaries, and coding conventions.
> HANDOFF is the _what/why_ of the architecture; this is the _how_ of the
> codebase. Where the two conflict, HANDOFF wins — and file an issue, because
> that conflict is a bug in this document.

---

## 1. Stack decisions (proposals — confirm in chunk 0.1)

| Concern                | Choice                                                                                    | Why                                                                                                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language               | TypeScript, `strict: true`                                                                | Interaction payloads and card records are exactly the kind of loosely-shaped JSON that TS catches mistakes in.                                                                                 |
| Framework              | **None** — plain `fetch`/`scheduled` export                                               | The Worker has one POST route, one health route, one admin route. A router framework is more surface than the app.                                                                             |
| Signature verification | WebCrypto Ed25519 (built into Workers)                                                    | No dependency for the security boundary. Verify current WebCrypto Ed25519 support/algorithm name at build time; fall back to the `discord-interactions` package only if WebCrypto can't do it. |
| Test runner            | Vitest + Cloudflare's Workers pool (`@cloudflare/vitest-pool-workers` at time of writing) | Runs tests inside workerd with a real local D1 — integration tests without deploying.                                                                                                          |
| Discord API types      | `discord-api-types` package                                                               | Types only, zero runtime cost, keeps interaction-type magic numbers named.                                                                                                                     |
| Migrations             | `wrangler d1 migrations`                                                                  | Built-in, good enough for one database.                                                                                                                                                        |
| CI                     | GitHub Actions                                                                            | Free for public repos; `wrangler-action` for deploys.                                                                                                                                          |

Dependency policy: **every runtime dependency needs a written justification in
[DECISIONS.md](DECISIONS.md).** The bot must outlive maintainer attention
(HANDOFF §1); every dependency is a future breakage.

---

## 2. Repository layout

```
/
├── HANDOFF.md              # Founding spec — what & why (do not casually edit)
├── CLAUDE.md               # Entry point for AI-assisted sessions
├── docs/
│   ├── ROADMAP.md          # Work chunks, gates, MVP definition
│   ├── TESTING.md          # Test plan & live-stability regimen
│   ├── TECH-DESIGN.md      # This file
│   └── DECISIONS.md        # Append-only decision log
├── wrangler.toml           # Bindings + cron. NO SECRETS. (HANDOFF §10)
├── src/
│   ├── index.ts            # Worker entry: exports fetch + scheduled. Thin.
│   ├── interactions/
│   │   ├── verify.ts       # Ed25519 verification (pure, no I/O)
│   │   ├── router.ts       # Branch on interaction type & command name
│   │   ├── commands/       # One file per slash command (card.ts, alt.ts, …)
│   │   ├── autocomplete.ts # Autocomplete branch
│   │   └── embeds.ts       # Pure embed/response builders
│   ├── data/
│   │   ├── repo.ts         # All SQL for the read path (version-filtered)
│   │   └── schema.ts       # Card type + search_name normalization rules
│   ├── sync/
│   │   ├── adapter/        # Source adapter(s) — the swappable boundary (§9)
│   │   ├── validate.ts     # Shrink guard, per-record, schema-drift (pure)
│   │   ├── load.ts         # Versioned upsert + atomic flip + GC
│   │   └── alert.ts        # Webhook alerting
│   └── health.ts           # GET /health for smoke tests & uptime pings
├── scripts/
│   ├── register-commands.ts# PUT command definitions (guild or global flag)
│   └── smoke.ts            # Post-deploy smoke checks
├── migrations/             # D1 migration files
└── test/
    └── fixtures/           # Captured source responses, interaction payloads
```

## 3. Module boundaries (the rules that keep this maintainable)

1. **`sync/` and `interactions/` never import each other.** They share only
   `data/schema.ts` types and the D1 binding. This is the two-path isolation
   from HANDOFF §3 expressed in code.
2. **All SQL lives in `data/repo.ts` and `sync/load.ts`.** No inline SQL in
   command handlers. Every read query filters on `active_version` — the repo
   module enforces this by construction (no raw-query escape hatch).
3. **The source adapter is the only module that knows the upstream's shape.**
   Everything past `adapter/` speaks the internal `Card` type. Swapping sources
   (HANDOFF §9) must touch only `sync/adapter/`.
4. **Handlers are pure where possible.** Command handlers take
   `(options, repo)` and return a response object; `index.ts` does the HTTP
   plumbing. This is what makes the unit-test layer cheap.
5. **`index.ts` stays thin**: verify signature → route → serialize response.
   If it grows logic, that logic belongs in a module.

## 4. Conventions

- **Interaction type/response magic numbers** always via `discord-api-types`
  constants — never bare `4`s in handler code.
- **Errors the user can see:** any thrown error in a command handler is caught
  at the router and turned into a friendly ephemeral "something went wrong"
  response. A user must never see Discord's "application did not respond" due
  to an unhandled throw.
- **Errors we need to see:** sync-path errors go to the alert webhook with
  enough context to diagnose from the Discord message alone (stage, counts,
  upstream status code).
- **`search_name` normalization** is defined once in `data/schema.ts` and used
  by _both_ the sync (writing) and autocomplete/lookup (querying) paths. If
  these ever diverge, search silently breaks — unit-test them against the same
  table of cases.
- **Timestamps** are ISO-8601 UTC strings everywhere (matches HANDOFF §5).
- **Config matrix:** local dev uses `.dev.vars` (gitignored); deployed secrets
  via `wrangler secret put` only (HANDOFF §10). A `staging` Wrangler
  environment with its own D1 is optional; the test-guild-against-production
  pattern is acceptable at this scale until it hurts.

## 5. Things future sessions will be tempted to do — don't

These extend HANDOFF §15 with implementation-level guardrails:

- Don't add a router/DI/ORM framework. The app is three routes and two tables.
- Don't "improve" autocomplete to substring search (`%x%`) without being asked
  — it abandons the index (HANDOFF §6.4).
- Don't move command registration into the Worker "for convenience." It's a
  deploy-time script by design (HANDOFF §7).
- Don't add caching layers (KV, in-memory) in front of D1. A single indexed
  D1 read at the edge is already inside the latency budget; extra layers add
  staleness bugs for no user-visible gain.
- Don't let test code share the production D1 database name. Local tests use
  the local simulator; anything touching real infrastructure lives only in
  `scripts/smoke.ts`.
