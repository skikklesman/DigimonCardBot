# Roadmap — Milestones, Gates & Work Chunks

> Expands [HANDOFF.md §13](../HANDOFF.md) into small, individually completable work
> chunks. Each chunk is sized to be finished (including its tests) in a single
> working session. Do them in order unless a chunk explicitly says it can run in
> parallel.
>
> **How to use this file:** check off chunks as they land (`[x]`). When a gate's
> criteria are all true, record the date next to the gate. If scope changes, edit
> this file in the same commit as the code change — this document must never
> describe a plan the code has abandoned.

---

## The five gates

| Gate  | Name                    | Meaning                                                                                        | Reached at end of |
| ----- | ----------------------- | ---------------------------------------------------------------------------------------------- | ----------------- |
| **A** | 🏗️ **Scaffolding Up**   | First runnable: Worker deployed, signature verification live, Discord accepts the endpoint URL | Phase 0           |
| **B** | 🎮 **First Playable**   | A human in the test guild types `/card` and gets a card embed back                             | Phase 2           |
| **C** | 🚀 **MVP**              | Could replace the old bot for its core use case today (definition below)                       | Phase 3           |
| **D** | ✅ **Feature Complete** | Full command set matching the old bot, hardened                                                | Phase 4           |
| **E** | 🌍 **Launched**         | Global commands, Discord-verified, rolled out                                                  | Phase 5           |

### MVP definition (Gate C)

The MVP is **the smallest bot that could fully replace DigimonTCGBot's core
product** ([HANDOFF §1](../HANDOFF.md): "lookup behavior is the whole product").
All of the following must be true:

1. **`/card` works** by name and by ID, with autocomplete, alt-art/variant
   support, image embeds, and graceful not-found / multiple-match handling.
2. **Data refreshes itself**: the cron sync runs on schedule, passes all
   validation gates ([HANDOFF §8](../HANDOFF.md)), and has completed at least
   **two successful automated runs** in production.
3. **Failures are visible**: sync-failure and stale-sync alerts fire to the
   private webhook, and this has been _proven_ by a forced failure test.
4. **Stability soak passed**: 7 consecutive days live in the test guild with no
   unhandled errors in Worker logs and no failed interactions.
5. **The automated test suite passes in CI** — unit + integration + post-deploy
   smoke tests (see [TESTING.md](TESTING.md)).

Explicitly **not** in MVP: `/keyword`, `/release`, `/page`, manual-resync route
polish, global registration. `/alt` **is** in MVP because alt-art support is
named in the product goal (HANDOFF §1). _(Flagged as a human decision — demote
`/alt` to Phase 4 if you disagree.)_

---

## Phase 0 — Scaffolding → 🏗️ Gate A: "Scaffolding Up"

Goal: a deployed, verifiable, testable skeleton. Nothing card-related yet.

- [x] **0.1 — Repo & toolchain init.** _(git init + GitHub remote already done
      2026-07-03; toolchain landed 2026-07-04.)_ TypeScript (strict) + Wrangler project; Vitest with
      `@cloudflare/vitest-pool-workers` (verify current package name/status at
      build time); lint/format config; `npm test` and `wrangler dev` both run
      green on an empty-ish project. Layout per [TECH-DESIGN.md](TECH-DESIGN.md).
      _DoD: fresh clone → `npm install && npm test` passes; `wrangler dev` serves._
- [x] **0.2 — CI skeleton.** _(Landed 2026-07-04.)_ GitHub Actions: typecheck +
      lint + format-check + tests on every push. Deploy step stubbed but present.
      _DoD: a pushed commit shows a green check._
- [x] **0.3 — Ed25519 verification module.** _(Landed 2026-07-04.)_ Pure function:
      `(publicKey, signature, timestamp, body) → boolean` via WebCrypto. **Unit
      tests with known-good and known-bad vectors** — this is the security boundary;
      it gets real tests, not a mock.
      _DoD: tests cover valid sig, bad sig, tampered body, missing headers._
- [x] **0.4 — Interaction endpoint stub.** _(Landed 2026-07-04.)_ `fetch`
      handler: reject unsigned/ invalid (401), answer PING (type 1) with PONG
      (type 1), return a benign placeholder for anything else. Integration test
      in the Workers runtime.
- [x] **0.5 — Discord app + first deploy.** _(Landed 2026-07-05.)_ Create the Discord application
      (decide Team vs. personal owner now — HANDOFF §14), set
      `DISCORD_PUBLIC_KEY` via `wrangler secret put`, deploy, and **save the
      Interactions Endpoint URL in the Developer Portal.**
      _Needs the human present: the Team-vs-personal call (DECISIONS open
      decision #5), Discord Developer Portal access, and a one-time browser
      handshake for `wrangler login` (like the `gh` one)._

**🏗️ Gate A criteria:** endpoint URL saves successfully (Discord's test PING
passes); CI green; signature tests in place. **Reached:** 2026-07-05

---

## Phase 1 — Data layer (no Discord involvement)

Goal: a populated, versioned card cache. Verifiable entirely with SQL.

- [x] **1.1 — D1 + schema migrations.** _(Landed 2026-07-05.)_
      `wrangler d1 create`, schema from [HANDOFF §5](../HANDOFF.md) as a
      migration file, seed `meta` with `active_version = 0`. Local D1 works
      under `wrangler dev` and vitest.
- [x] **1.2 — Pick & verify the card source.** _(Landed 2026-07-05; chose the
      `TakaOtaku/Digimon-Card-App` dataset, which beat all HANDOFF §9 candidates
      on alt-art/image coverage — evidence in [DECISIONS.md](DECISIONS.md).)_
      Evaluate `niamu/digimon-card-game` vs. `digimoncard.io`/`.dev` (HANDOFF
      §9): current status, license, rate limits, field coverage (need image URLs + variants). **Record the decision and evidence in
      [DECISIONS.md](DECISIONS.md).** Save a real response snapshot into
      `test/fixtures/` — it becomes the contract-test fixture.
- [x] **1.3 — Source adapter.** _(Landed 2026-07-05; `normalize(raw)` returns
      `Card[]` — base printing + one row per alt-art variant. Mapping choices in
      [DECISIONS.md](DECISIONS.md).)_ `fetchCards(): Promise<RawCard[]>` +
      `normalize(raw): Card` behind the adapter boundary (HANDOFF §9). Unit tests
      run against the fixture, never the network.
- [x] **1.4 — Validation gates.** _(Landed 2026-07-05. The adapter exports its
      `EXPECTED_FIELDS` contract so the drift gate stays source-agnostic —
      upstream-shape knowledge remains in `sync/adapter/` per TECH-DESIGN
      §3.3.)_ Shrink guard, per-record validation with drop
      counting, schema-drift detection (HANDOFF §8, Defense 2). Pure functions.
      Drift detection is **two-directional** (DECISIONS 2026-07-05): a known
      field missing/renamed → abort the sync; an **unknown new field present →
      proceed but emit a warning** (surfaced via the alert webhook once 3.3
      lands) — the early-warning signal for new game mechanics like ACE/LINK/
      Dual. **Unit-test every gate, including each documented catastrophe:**
      empty array, truncated feed, HTML error page, renamed fields, single bad
      card — plus the unknown-extra-field case (warns, does not abort).
- [x] **1.5 — Versioned load + atomic flip.** _(Landed 2026-07-05. Flip +
      `last_successful_sync` + GC happen in one transactional `db.batch`; a
      failed attempt's staging rows are cleared at the start of the next run.)_
      Chunked idempotent upserts under
      `active_version + 1`, verify count, flip pointer, write
      `last_successful_sync`, GC versions `< active - 1`. Integration tests against
      local D1: happy path, re-run idempotency, mid-load failure leaves the live
      version untouched.
- [x] **1.6 — `scheduled()` handler + first real sync.** _(Landed 2026-07-05.
      First real sync: version 1 promoted, 8,425 rows — 4,295 unique cards +
      alt-art variants — 0 dropped, 0 warnings; EX1-066 P1–P5 and multi-printing
      `goldramon%` search spot-checked in local D1. Production D1 is still
      empty by design — populate it before 2.5's deploy-and-test.)_ Wire fetch
      → validate → load → flip into the cron handler; trigger manually
      (`wrangler dev --test-scheduled` or the curl equivalent) against the real
      source. _(Gate per HANDOFF §13.3: cards table holds a full versioned
      dataset — spot-check row count and a few known cards.)_

---

## Phase 2 — Read path → 🎮 Gate B: "First Playable"

- [x] **2.1 — Interaction router.** _(Landed 2026-07-05. Handlers plug in via a
      registry in `index.ts`; a throwing command handler → friendly ephemeral
      error, a throwing autocomplete handler → empty choices.)_ Branch on
      interaction type: 1→PONG,
      2→command dispatch, 4→autocomplete dispatch (HANDOFF §6.4). Unknown
      types/commands get a polite error response, never a crash. Unit tests per
      branch.
- [x] **2.2 — Card repository.** _(Landed 2026-07-05. Also ships
      `listPrintings` for 3.2's `/alt`; name search returns base printings only,
      one row per card.)_ Query module: lookup by exact `card_id`
      (+variant), by `card_id|variant` value, by normalized-name search — always
      filtered on `active_version`. Integration tests against seeded local D1.
- [x] **2.3 — `/card` command handler + embed builder.** _(Landed 2026-07-05.
      Resolution ladder: `card_id|variant` token → card id → name search;
      not-found/disambiguation replies are ephemeral; user input sanitized
      before echoing.)_ ID hit → embed with
      image + card text; name search → single hit / closest-matches disambiguation
      / not-found. Must handle free-text values that aren't a `card_id|variant`
      token (HANDOFF §6.4 edge cases). Embed builder is a pure function — snapshot-
      test its JSON.
- [x] **2.4 — Command registration script.** _(Landed 2026-07-05:
      `npm run register` / `register:global`; runs on Node ≥22.18 native TS.
      **Human prereq for 2.5:** put `DISCORD_APP_ID`, `DISCORD_BOT_TOKEN`, and
      `DISCORD_TEST_GUILD_ID` in `.dev.vars`, then run `npm run register`.)_
      Standalone script (HANDOFF §7),
      PUT to the guild-commands endpoint for the test guild. `card-name` option has
      `autocomplete: true`. Lives in `scripts/`, runs from dev machine/CI, never in
      the Worker.
- [x] **2.5 — First Playable test.** _(Landed 2026-07-05. Owner registered
      `/card` to the test guild and ran the manual script — all five steps
      passed. Production D1 populated by export/import of the local synced
      dataset with a manual pointer flip (staged rows first, flip last —
      rehearsing the promote); refreshes properly once the cron lands in
      3.6.)_ Deploy; in the private test guild run the
      manual script in [TESTING.md → First Playable script](TESTING.md).

**🎮 Gate B criteria:** the First Playable manual script passes end-to-end in
the test guild. **Reached:** 2026-07-05

---

## Phase 3 — MVP hardening → 🚀 Gate C: "MVP"

- [x] **3.1 — Autocomplete.** _(Landed 2026-07-05. Labels are `Name (CARD-ID)`
      rather than set name — see DECISIONS.md.)_ Type-4 branch: prefix query on
      `search_name`,
      ≤25 choices, label `Name (Set)`, value `card_id|variant`, exact-prefix
      prioritized (HANDOFF §6.4). **Never deferred.** Integration tests; manual
      gate: typing `goldr` offers the Goldramon printings.
- [x] **3.2 — `/alt` command.** _(Landed 2026-07-05. Responds with an embed
      gallery — one image per printing, ≤10 per Discord's limit; resolution
      ladder shared with `/card` via `commands/resolve.ts`; `/alt` reuses the
      `/card` autocomplete. Registered + deployed.)_ List/show alt-art
      printings for a card
      (variants of the same `card_id`). Same handler discipline as `/card`.
- [x] **3.3 — Observability.** _(Landed 2026-07-06. **Proven**: both drills
      ran against the real webhook and the owner confirmed both messages
      arrived — ❌ forced failure via the new `CARD_SOURCE_URL` override
      pointed at a dead host, and ⚠️ stale-sync with a backdated timestamp.
      Production secret set; alerting live in prod.)_ Sync failures →
      `SYNC_ALERT_WEBHOOK`; stale-sync
      detection (`last_successful_sync` older than cadence + margin) alerts too
      (HANDOFF §8 Defense 5). **Prove it: force a failure (bad source URL in a
      test) and see the Discord alert arrive.**
- [x] **3.4 — Manual resync route.** _(Landed 2026-07-06. `POST /admin/resync`,
      bearer auth via SHA-256 + `timingSafeEqual`; 404s are byte-identical to
      unknown routes; with no `RESYNC_TOKEN` secret the route is disabled.
      Shares `runSyncWithAlerts` with the cron path. Operator setup:
      generate a token, `wrangler secret put RESYNC_TOKEN`, add to
      `.dev.vars`.)_ Authenticated route on `fetch` triggering
      the sync (HANDOFF §8). Constant-time token check; 404 on bad auth. Tests:
      no-token, bad-token, good-token.
- [x] **3.5 — Post-deploy smoke suite.** _(Landed 2026-07-06 per TESTING.md
      §4's boundary+vitals design — production signatures can't be forged, so:
      unsigned POST → 401, `GET /health` vitals with freshness assertions,
      unknown-route 404. CI deploy job de-stubbed: deploys activate when a
      `CLOUDFLARE_API_TOKEN` repo secret is added; smoke runs against
      production on every master push either way.)_ Scripted signed synthetic
      interactions
      against the _live_ endpoint: PING, `/card` by ID, autocomplete query. Runs in
      CI after every deploy. (Details: [TESTING.md](TESTING.md).)
- [x] **3.6 — Cron live + soak.** _(Cron enabled 2026-07-06: Tuesdays 06:00
      UTC — see DECISIONS.md for the day choice; expected automated runs Jul 7 + Jul 14. Also closed a plan gap: the TESTING.md §5 weekly
      source-contract CI job now exists — Mondays 06:00 UTC, one day ahead of
      the sync; verified green against the real upstream. **Soak runs
      2026-07-06 → 2026-07-13**; owner duties in OWNER-TODO.md. Repo-wide
      change: relative imports carry explicit `.ts` extensions so scripts,
      deploys, and tests share one resolution style.)_ Enable the production
      cron schedule. Start the
      7-day soak: bot in test guild, daily use, watch logs/alerts. Fix anything the
      soak surfaces.

**🚀 Gate C criteria:** all five MVP-definition bullets above are true.
**Reached:** `pending`

---

## Phase 4 — Full command set → ✅ Gate D: "Feature Complete"

Chunks 4.1–4.3 are independent — parallelizable.

- [x] **4.1 — `/keyword`.** _(Landed 2026-07-06. Static curated glossary of
      ~45 keywords — inventory extracted from real card text, definitions
      cross-checked; four 2026 mechanics deliberately omitted pending verified
      text. In-memory autocomplete. DECISIONS.md has sources + update path.
      Registered + deployed.)_ Keyword/rules-term lookup. Needs a keyword data
      source — may be a small static dataset shipped with the bot; decide and
      record in DECISIONS.md.
- [x] **4.2 — `/release`.** _(Landed 2026-07-06. Scoping finding: the card
      source has NO release dates — set names per card only (122 messy
      distinct strings, most of them promo/event packs). So: curated static
      dataset of the ~71 real products (BT/EX/ST/LM/RB/AD + special
      boosters) with EN dates verified against official Bandai product
      pages, plus a live D1 card tally per set. Autocomplete is in-memory
      like /keyword — zero D1 reads per keystroke. Matchers validated
      against the full real dataset. DECISIONS.md has scope + conventions.
      Registered + deployed.)_ Set/release info lookup. Check what the card
      source exposes about sets; scope accordingly.
- [x] **4.3 — `/page`.** _(Closed 2026-07-06 as **Will Not Do** — owner
      call, DECISIONS.md. Nobody could describe what the old bot's `/page`
      did, and a wrong guess at a parity feature is worse than an honest
      gap. Reopens only if 4.4's community input or post-launch feedback
      supplies the missing spec.)_ Whatever the old bot's `/page` did —
      **confirm with the community what this command actually does before
      building** (open decision, HANDOFF §14).
- [ ] **4.4 — Command-set parity review.** Compare against the old bot with
      community input; finalize names/options (HANDOFF §14).
- [ ] **4.5 — Hardening pass.** Input fuzzing on interaction payloads
      (malformed options, absurd lengths, weird unicode in names); D1 error
      handling (what does the user see if D1 errors mid-lookup? — must be a
      friendly message, not a Discord "application did not respond").
- [ ] **4.6 — Banned/restricted display on `/card`.** _(Independent of
      4.4/4.5 — parallelizable; prefer landing it before 4.5 so the fuzz
      pass covers it.)_ The upstream `restrictions` field is in the
      adapter's known-fields contract but is dropped before the model, so
      `/card` shows a banned card with no flag — misinformation, not a
      gap (DECISIONS 2026-07-06). Upstream shape: per-region object
      (`english`/`japanese`/`chinese`/`korean`) with values like
      `Unrestricted`, `Restricted to 1`, `Banned`, `Not released`. Carry
      the **English** value through the stack: migration 0002 (nullable
      `restriction` column), adapter mapping, loader, repo reads, and a
      warning line on the `/card` embed for any value other than
      `Unrestricted` (exact placement/wording decided in-chunk; survey
      the full dataset's distinct values first). Verify displayed values
      against the official Banned & Restricted announcement
      (en.digimoncard.com/rule/restriction_card). Tests: snapshot the
      embed for banned / restricted / unrestricted / not-released cards;
      adapter + loader coverage for the new field.
- [ ] **4.7 — `/banlist`.** Add a command that will simply list out all of the
      current banned and restricted cards (name and card ID), for easy reference.  
      (Claude: fill out any info here that is important for your execution.  Also
      ask the Owner first if you need any clarification, don't assume you know the answer.)

**✅ Gate D criteria:** full command set live in the test guild; fuzz findings
fixed. **Reached:** `pending`

---

## Phase 5 — Launch → 🌍 Gate E: "Launched"

Sequencing here is dictated by Discord's rules — HUMAN actions included
(HANDOFF §12).

- [ ] **5.1 — Re-verify drift facts.** Everything in
      [HANDOFF §16](../HANDOFF.md): free-tier limits, verification thresholds, API
      version, source status.
- [ ] **5.2 — Global command registration.** Flip the registration script to
      global (allow ~1h propagation). Keep guild registration for the test guild as
      the fast-iteration path.
- [ ] **5.3 — Submit Discord bot verification** _(human, government ID)_
      **before crossing 100 servers** — the bot freezes at #100 otherwise
      (HANDOFF §12). Historically ~5-day review; start early.
- [ ] **5.4 — Launch checklist.** Run the release checklist in
      [TESTING.md](TESTING.md); confirm alerting, rollback procedure rehearsed,
      soak-period learnings addressed.
- [ ] **5.5 — Rollout.** Publish invite link to the community; monitor closely
      for the first week (alerts + Worker analytics + D1 metrics).

**🌍 Gate E criteria:** verified, global, invited, first-week monitoring
clean. **Reached:** `pending`

---

## Standing rules (apply to every chunk)

1. **Tests land with the chunk**, not in a later "testing phase". Phase 0
   establishes the harness precisely so this is cheap.
2. **A chunk isn't done until its DoD is demonstrably true** — run the thing.
3. **Never violate HANDOFF §15 (Do NOT list).** If a chunk seems to require it,
   stop and re-read the relevant HANDOFF section; the design almost certainly
   anticipated the problem.
4. **Record non-trivial decisions in [DECISIONS.md](DECISIONS.md)** as you make
   them, with the why.
