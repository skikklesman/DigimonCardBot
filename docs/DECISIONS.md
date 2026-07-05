# Decision Log

> Append-only. One entry per non-trivial decision, newest at the top. Each
> entry: date, decision, why, and what would make us revisit it. The founding
> architectural decisions live in [HANDOFF.md](../HANDOFF.md) §4 and are not
> repeated here — this log starts where HANDOFF ends.
>
> Open decisions awaiting a human call are tracked in the section at the
> bottom; move them up into the log when resolved.

---

## 2026-07-05 — Card source: digimoncard.app dataset (chunk 1.2, resolves open decision #1)

- **Decision:** Primary card source is the **TakaOtaku/Digimon-Card-App**
  dataset — one JSON file
  (`src/assets/cardlists/DigimonCards.json`, ~8.4 MB, 4,295 cards) fetched
  from GitHub raw. **digimoncard.io's public API is the documented fallback**
  behind the adapter boundary (HANDOFF §9). Owner confirmed the choice.
- **Evidence (all verified 2026-07-05):**
  - **digimoncard.app:** MIT license; auto-updated from official Bandai
    sources every ~3 days (`[Automatic] Update Cards` commits, latest
    2026-07-04) plus human curation; richest field coverage (multilingual
    names, restrictions, ACE/LINK/assembly mechanics); **explicit alt-art
    variants** (`AAs`/`JAAs` arrays, ids like `EX1-066_P1`) **with working
    image URLs** (`digimoncard.app/assets/images/cards/EX1-066_P1.webp` → 200) — the only candidate that fully covers the MVP's `/alt`
    requirement. No API key, no meaningful rate limit for a weekly fetch.
  - **digimoncard.io:** working public API (15 req/10s limit);
    `search?series=Digimon Card Game` returns the full 9,000-row dataset in
    one ~9.6 MB call (verified not truncated via reverse-sort). But alt arts
    are only implied by duplicate rows keyed on `tcgplayer_id`, and alt-art
    image URLs use internal set-ids that **no public endpoint exposes** —
    `/alt` would have no variant images. Base images:
    `images.digimoncard.io/images/cards/{id}.jpg|webp`.
  - **niamu/digimon-card-game:** active and well-built, but the API is
    self-host software (Clojure/Datomic scraper + export + server) — wrong
    fit for a zero-maintenance bot — and CC BY-NC-SA licensed.
  - **digimoncard.dev:** deck-builder SPA; no public API found.
- **Fixture:** 17 verbatim records captured to
  `test/fixtures/digimoncard-app-cards.json` (provenance + upstream shape
  notes in the adjacent README; upstream commit `20e2841`).
- **Risks accepted:** hobby project (single maintainer, ~10 stars) — the
  adapter boundary + stale-cache-keeps-serving design (HANDOFF §8/9) makes a
  dead source a degraded state, not an outage, and .io is the tested swap.
- **Verify at build time (chunk 2.3):** Discord embeds render `.webp` card
  images correctly.
- **Revisit if:** the repo goes unmaintained/archived, the file moves or
  changes shape (the weekly source-contract CI check exists to catch this),
  or Bandai objects to community datasets.

---

## 2026-07-05 — D1 created; migration/test wiring facts for pool-workers 0.18 (chunk 1.1)

- **Decision:** D1 database `cards` created (id
  `004a6c30-4560-4990-9b41-2bf7805bb94e`, region ENAM), bound as `DB`.
  Schema is HANDOFF §5 verbatim in `migrations/0001_initial_schema.sql`
  (wrangler's default migrations dir), with the `meta` seed
  (`active_version = 0`) in the same migration — one file, one "empty but
  ready" state. Applied to both local and remote.
- **Drift findings (pool-workers 0.18, extends the 2026-07-04 entry):**
  - `readD1Migrations` now exports from the package **root** (the `/config`
    subpath is gone). Tests get migrations via a `TEST_MIGRATIONS` miniflare
    binding + a `setupFiles` script calling `applyD1Migrations` — the
    documented pattern, just with updated import paths.
  - **Per-test isolated storage is gone** in the plugin-API rewrite: tests in
    a file share one local D1, so D1 test suites must reset tables in
    `beforeEach` (see `test/migrations.test.ts`) and stay order-independent.
  - `env` from `cloudflare:test` is now typed as the global `Cloudflare.Env`
    (old `ProvidedEnv` module augmentation no longer exists); bindings are
    typed by augmenting `Cloudflare.Env` in `test/env.d.ts`.
- **Revisit if:** the pool reintroduces isolated storage (drop the manual
  resets), or migrations outgrow single-file simplicity.

---

## 2026-07-05 — Discord app owner: Team (chunk 0.5, resolves open decision #5)

- **Decision:** The Discord application is owned by a **Discord Team**, not the
  personal `skikklesman` account. Confirms the HANDOFF §14 / roadmap default.
- **Why:** Co-ownership and clean hand-off (this repo is intended to go
  open-source), no single-personal-account point of failure, and it keeps bot
  verification (gov-ID review before 100 servers, HANDOFF §12) attached to a
  Team rather than one individual.
- **Revisit if:** Discord changes Team requirements/pricing, or the owner
  decides sole personal ownership is preferable before verification.

---

## 2026-07-04 — First runtime dependency: discord-api-types (chunk 0.4)

- **Decision:** `discord-api-types` added as a runtime dependency (the
  dependency policy requires this entry). Also decided: the interactions
  endpoint lives at `POST /interactions` (not `/`), leaving `/` and `/health`
  free; a committed **test-only** Ed25519 keypair
  (`test/fixtures/discord-test-keypair.json`) lets integration tests sign
  synthetic interactions — it guards nothing and is not a secret.
- **Why:** TECH-DESIGN planned it for its interaction-type constants; its
  enums are runtime values, so "types-only devDependency" was not accurate.
  It is zero-network, bundled at deploy (34 KiB gzipped total bundle), and
  maintained in lockstep with Discord's API — safer than hand-copied magic
  numbers.
- **Gotcha recorded:** the package is CommonJS; the Workers Vitest pool
  imports its enums as `undefined` unless pre-bundled — fixed via
  `test.deps.optimizer.ssr.include` in vitest.config.ts. Production esbuild
  bundling handles it fine (verified with `wrangler deploy --dry-run`).
- **Revisit if:** bundle size ever matters (import only the `/v10` subpath) or
  the package goes unmaintained.

---

## 2026-07-04 — Toolchain locked in (chunk 0.1); Workers Vitest API drift noted

- **Decision:** TypeScript 6.0 (strict), Wrangler 4.107, Vitest 4.1 +
  `@cloudflare/vitest-pool-workers` 0.18, ESLint 10 + typescript-eslint,
  Prettier. **Zero runtime dependencies.** All dev-only, so no per-package
  justification entries needed under the dependency policy.
- **Drift finding (build-time verification paid off):** the pool-workers
  package dropped the documented `defineWorkersConfig` /
  `@cloudflare/vitest-pool-workers/config` API in the Vitest 4 era. Current
  wiring is a Vite plugin: `cloudflareTest({ wrangler: { configPath } })`
  from the package root, plus tsconfig types entry
  `@cloudflare/vitest-pool-workers/types` for `cloudflare:test`. If online
  docs/examples show `defineWorkersConfig`, they are stale — trust the
  package's own exports.
- **Revisit if:** typescript-eslint's supported TS range (<6.1.0 today) falls
  behind a TS upgrade.

---

## 2026-07-03 — Documentation set & gate structure established

- **Decision:** Roadmap uses five named gates (Scaffolding Up → First Playable
  → MVP → Feature Complete → Launched); MVP defined as `/card` + autocomplete +
  `/alt` + self-refreshing data + proven alerting + 7-day soak
  ([ROADMAP.md](ROADMAP.md)).
- **Why:** HANDOFF §13's nine milestones were too coarse to track and had no
  explicit definition of "done enough to replace the old bot."
- **Revisit if:** the community's priorities differ (e.g. `/keyword` matters
  more than `/alt`) — see open decisions.

---

## Open decisions (human input needed)

Carried from HANDOFF §14 plus new ones raised by the roadmap:

| #   | Decision                                           | Default until decided                | Needed by |
| --- | -------------------------------------------------- | ------------------------------------ | --------- |
| 2   | `/alt` in MVP or Phase 4?                          | In MVP (per HANDOFF §1 product goal) | Gate C    |
| 3   | What does the old bot's `/page` actually do?       | Ask community                        | Chunk 4.3 |
| 4   | Keyword data source for `/keyword`                 | Small static dataset in repo         | Chunk 4.1 |
| 6   | Sync cadence                                       | Weekly Mon 06:00 UTC (HANDOFF §10)   | Chunk 3.6 |
| 7   | Final command names/options parity                 | Mirror old bot                       | Chunk 4.4 |
| 8   | Open-source license (repo goes public post-launch) | MIT unless owner prefers otherwise   | Phase 5   |
