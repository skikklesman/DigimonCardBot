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

- [ ] **2.1 — Interaction router.** Branch on interaction type: 1→PONG,
      2→command dispatch, 4→autocomplete dispatch (HANDOFF §6.4). Unknown
      types/commands get a polite error response, never a crash. Unit tests per
      branch.
- [ ] **2.2 — Card repository.** Query module: lookup by exact `card_id`
      (+variant), by `card_id|variant` value, by normalized-name search — always
      filtered on `active_version`. Integration tests against seeded local D1.
- [ ] **2.3 — `/card` command handler + embed builder.** ID hit → embed with
      image + card text; name search → single hit / closest-matches disambiguation
      / not-found. Must handle free-text values that aren't a `card_id|variant`
      token (HANDOFF §6.4 edge cases). Embed builder is a pure function — snapshot-
      test its JSON.
- [ ] **2.4 — Command registration script.** Standalone script (HANDOFF §7),
      PUT to the guild-commands endpoint for the test guild. `card-name` option has
      `autocomplete: true`. Lives in `scripts/`, runs from dev machine/CI, never in
      the Worker.
- [ ] **2.5 — First Playable test.** Deploy; in the private test guild run the
      manual script in [TESTING.md → First Playable script](TESTING.md).

**🎮 Gate B criteria:** the First Playable manual script passes end-to-end in
the test guild. **Reached:** `pending`

---

## Phase 3 — MVP hardening → 🚀 Gate C: "MVP"

- [ ] **3.1 — Autocomplete.** Type-4 branch: prefix query on `search_name`,
      ≤25 choices, label `Name (Set)`, value `card_id|variant`, exact-prefix
      prioritized (HANDOFF §6.4). **Never deferred.** Integration tests; manual
      gate: typing `goldr` offers the Goldramon printings.
- [ ] **3.2 — `/alt` command.** List/show alt-art printings for a card
      (variants of the same `card_id`). Same handler discipline as `/card`.
- [ ] **3.3 — Observability.** Sync failures → `SYNC_ALERT_WEBHOOK`; stale-sync
      detection (`last_successful_sync` older than cadence + margin) alerts too
      (HANDOFF §8 Defense 5). **Prove it: force a failure (bad source URL in a
      test) and see the Discord alert arrive.**
- [ ] **3.4 — Manual resync route.** Authenticated route on `fetch` triggering
      the sync (HANDOFF §8). Constant-time token check; 404 on bad auth. Tests:
      no-token, bad-token, good-token.
- [ ] **3.5 — Post-deploy smoke suite.** Scripted signed synthetic interactions
      against the _live_ endpoint: PING, `/card` by ID, autocomplete query. Runs in
      CI after every deploy. (Details: [TESTING.md](TESTING.md).)
- [ ] **3.6 — Cron live + soak.** Enable the production cron schedule. Start the
      7-day soak: bot in test guild, daily use, watch logs/alerts. Fix anything the
      soak surfaces.

**🚀 Gate C criteria:** all five MVP-definition bullets above are true.
**Reached:** `pending`

---

## Phase 4 — Full command set → ✅ Gate D: "Feature Complete"

Chunks 4.1–4.3 are independent — parallelizable.

- [ ] **4.1 — `/keyword`.** Keyword/rules-term lookup. Needs a keyword data
      source — may be a small static dataset shipped with the bot; decide and
      record in DECISIONS.md.
- [ ] **4.2 — `/release`.** Set/release info lookup. Check what the card source
      exposes about sets; scope accordingly.
- [ ] **4.3 — `/page`.** Whatever the old bot's `/page` did — **confirm with the
      community what this command actually does before building** (open decision,
      HANDOFF §14).
- [ ] **4.4 — Command-set parity review.** Compare against the old bot with
      community input; finalize names/options (HANDOFF §14).
- [ ] **4.5 — Hardening pass.** Input fuzzing on interaction payloads
      (malformed options, absurd lengths, weird unicode in names); D1 error
      handling (what does the user see if D1 errors mid-lookup? — must be a
      friendly message, not a Discord "application did not respond").

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
