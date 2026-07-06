# Decision Log

> Append-only. One entry per non-trivial decision, newest at the top. Each
> entry: date, decision, why, and what would make us revisit it. The founding
> architectural decisions live in [HANDOFF.md](../HANDOFF.md) §4 and are not
> repeated here — this log starts where HANDOFF ends.
>
> Open decisions awaiting a human call are tracked in the section at the
> bottom; move them up into the log when resolved.

---

## 2026-07-06 — Autocomplete search uses an explicit index range, not LIKE (test-coverage audit)

- **Decision:** `searchByName` filters with
  `search_name >= ?prefix AND search_name < ?prefix || '{'` instead of
  `search_name LIKE 'prefix%'`. A `QUERY PLAN PIN` test in `repo.test.ts`
  EXPLAINs the exact exported SQL and fails if the range constraint ever
  drops off the index.
- **Why (measured 2026-07-06):** SQLite's default case-insensitive `LIKE`
  cannot use the BINARY-collated `(version, search_name)` index — the plan
  was `SEARCH … (version=?)`, i.e. a filter over **every row of the active
  version**: ~8.4k row reads per autocomplete keystroke. D1 bills row
  reads; at the 5M/day free tier that capped autocomplete at roughly 600
  keystrokes/day — untenable at the ~1,000-server target. The range form
  plans as `(version=? AND search_name>? AND search_name<?)` and reads only
  the matches. Bounds are sound because `normalizeSearchName` guarantees
  the alphabet `[a-z0-9 space]`, all below `'{'` (0x7b).
- **Revisit if:** normalization ever admits characters ≥ `'{'` (the upper
  bound must widen), or search outgrows prefix matching entirely.

---

## 2026-07-06 — /health carries the freshness verdict in its status code (test-coverage audit)

- **Decision:** `GET /health` returns **503 when the data is stale** by the
  dead-man rule (`checkStaleSync`, cadence + 25% margin — one shared
  implementation), including for an unparseable sync timestamp; 200
  otherwise. Body unchanged (same three public-safe fields). Pre-first-sync
  stays 200, matching `checkStaleSync`'s "never synced isn't stale."
- **Why:** the stale-sync alert ran only inside the cron it monitors — a
  dead cron trigger (dropped from wrangler.toml, disabled schedule, account
  issue) would never announce itself. With the verdict in the status code,
  any dumb external pinger asserting "200" catches a dead cron from outside
  Cloudflare (see OWNER-TODO: uptime ping). The smoke script's independent
  freshness check remains as depth.
- **Revisit if:** an uptime service needs a body probe instead, or 503
  confuses some consumer that treats /health as a plain liveness check.

---

## 2026-07-06 — /keyword ships a curated static dataset (chunk 4.1)

- **Decision:** `/keyword` looks up a **static, curated glossary**
  (`src/data/keywords.ts`, ~45 entries) shipped with the bot — no network,
  no D1; its autocomplete filters the same in-memory list.
- **Sources & method:** the keyword _inventory_ was extracted from the real
  card dataset (every `＜…＞` token across all effect fields, frequency-
  ranked — ground truth for what appears on cards); definitions use
  official reminder-text phrasing, cross-checked against digimonmeta.com's
  keyword compilation (May 2025) and web sources for 2026 mechanics
  (Engage, Ascension, Overclock, Decode, Link, App Fusion). Numbers are
  normalized to "N".
- **Deliberate omissions** (wrong rules text is worse than none — `/card`
  shows any card's printed text regardless): `Training`, `Guard`,
  `Assembly`, `Arts Digivolve` — add when official text is verified.
  Upstream strips reminder text from card data, so definitions can't be
  self-sourced from the feed (checked).
- **Update path:** new keywords arrive a few times a year with new sets;
  the unknown-field drift warning and `/keyword`'s own "not in my glossary
  yet" reply both surface the gap. Editing the file is the whole job.
- **Revisit if:** the glossary churns often enough to justify sourcing
  from a maintained external dataset instead.

---

## 2026-07-06 — Sync cron on Tuesdays; source-contract check owns Mondays (chunk 3.6)

- **Decision:** Production sync cron is `0 6 * * 2` (Tuesdays 06:00 UTC),
  not the HANDOFF sketch's illustrative Monday. The TESTING.md §5 weekly
  source-contract CI job (which had no roadmap chunk — gap closed in 3.6)
  runs Mondays 06:00 UTC, one day ahead of the sync.
- **Why:** (a) The contract check must precede the sync to deliver its
  "we knew a day early" promise — Monday-check/Tuesday-sync does that
  cleanly. (b) Cron enabled Monday 2026-07-06 afternoon: a Tuesday
  schedule yields automated runs on Jul 7 and Jul 14, completing Gate C's
  "two successful automated runs" criterion ~6 days sooner than a Monday
  schedule (Jul 13/20) — meaningful against the 2026-07-31 deadline.
- **Also:** the contract check posts failures to the alert webhook only if
  a `SYNC_ALERT_WEBHOOK` repo secret is configured (owner-optional); a red
  workflow run + GitHub's failure email is the baseline signal.
- **Revisit if:** upstream's update rhythm changes, or the community needs
  fresher-than-weekly data (cadence is one line in wrangler.toml).

---

## 2026-07-05 — Autocomplete labels use card id, not set name (chunk 3.1)

- **Decision:** Autocomplete choice labels are `Name (CARD-ID)` — e.g.
  `Goldramon (EX3-035)` — not HANDOFF §6.4's literal `Name (set_name)`
  sketch. Values are unchanged (`card_id|variant`).
- **Why:** Our source's set names are long (`BOOSTER BLAST ACE [BT-14]`)
  and would crowd Discord's 100-char label cap; the card id is short,
  collision-free even when one set contains two same-named cards, and it's
  the string players already type into `/card`. HANDOFF's own examples
  (`Goldramon (EX3)`) are set _codes_, which the id contains anyway.
- **Revisit if:** the community finds ids less scannable than set names in
  practice (soak feedback) — the label lives in one function.

---

## 2026-07-05 — Adapter mapping choices (chunk 1.3)

- **Decisions** (all localized to `src/sync/adapter/digimoncard-app.ts`;
  `Card` + `normalizeSearchName` live in `src/data/schema.ts`):
  - **Images from GitHub raw** (`raw.githubusercontent.com/TakaOtaku/...`),
    not `digimoncard.app` — same files (site is built from the repo), but
    GitHub's CDN carries the hotlink load instead of a hobby site, and
    Discord proxies/caches embed images anyway.
  - **English alt-arts only**: `AAs` become variant rows (`P1`, `P2`, …);
    `JAAs` (Japanese alt-arts) are excluded — English-first bot, and JAA
    image coverage is unverified. Duplicate variant ids (re-releases) dedupe
    to one row, first occurrence wins.
  - **Effect folding**: supplementary mechanic text (ACE, LINK, rule,
    digiXros/DNA/burst/special digivolve, assembly, dual) is folded into the
    `effect` column, newline-separated, labeled only where upstream text
    isn't self-labeled (`[ACE]`, `[Rule]`, `[Link DP]`, `[Link Effect]`).
    Information-preserving: new mechanics stay displayable without schema
    changes; the 2.3 embed builder chooses presentation.
  - `inherited` = digivolveEffect + securityEffect (security text is
    self-labeled upstream). `search_name` rules: lowercase → strip
    diacritics → non-alphanumeric runs → single space → trim.
  - **Conscious cut:** AA `illustrator`/treatment `type` have no schema
    column and are dropped; revisit at 3.2 if `/alt` wants richer labels
    (set name per variant is kept via the AA `note`).
- **Why:** every choice favors "swap/extend without rewrite": upstream shape
  knowledge stays in one file, and lossy cuts are listed here rather than
  discovered later.
- **Revisit if:** the community wants JAA lookups, `/alt` needs treatment
  labels, or GitHub raw hotlinking misbehaves in Discord embeds (fallback:
  `digimoncard.app` host, one constant).

---

## 2026-07-05 — Schema-drift detection is two-directional (scopes chunk 1.4)

- **Decision:** The 1.4 schema-drift gate compares upstream fields against the
  adapter's known-field list in **both directions**: a known field
  missing/renamed → **abort** (HANDOFF §8 Defense 2, unchanged); an unknown
  new field present → **proceed + warning** (to the alert webhook once 3.3
  wires it).
- **Why:** New game mechanics arrive as new fields (`aceEffect`,
  `linkEffect`, `assembly` all did). A tolerant adapter ignores them, so
  cards keep resolving but silently lose new rules text in embeds — users
  would notice before the maintainer. The warn path converts that silent
  degradation into a Discord ping the week a mechanic ships, for ~zero cost
  (the drift gate already computes the field inventory). New _values_ in
  existing fields (e.g. Dual cards' `Digimon/Option` cardType) need no
  gate — TEXT columns and default-branch rendering absorb them; fixture
  record BT25-043 pins that.
- **Revisit if:** the warning turns noisy (upstream adds cosmetic fields
  often) — then batch/dedupe warnings rather than dropping the signal.

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

Carried from HANDOFF §14 plus new ones raised by the roadmap. Resolved ones
move up into the log above — so far #1 (card source), #2 (`/alt` in MVP),
#4 (keyword source), #5 (Team owner), and #6 (sync cadence).

| #   | Decision                                           | Default until decided              | Needed by |
| --- | -------------------------------------------------- | ---------------------------------- | --------- |
| 3   | What does the old bot's `/page` actually do?       | Ask community                      | Chunk 4.3 |
| 7   | Final command names/options parity                 | Mirror old bot                     | Chunk 4.4 |
| 8   | Open-source license (repo goes public post-launch) | MIT unless owner prefers otherwise | Phase 5   |
