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

| Gate  | Name                    | Meaning                                                                                          | Reached at end of |
| ----- | ----------------------- | ------------------------------------------------------------------------------------------------ | ----------------- |
| **A** | 🏗️ **Scaffolding Up**   | First runnable: Worker deployed, signature verification live, Discord accepts the endpoint URL   | Phase 0           |
| **B** | 🎮 **First Playable**   | A human in the test guild types `/card` and gets a card embed back                               | Phase 2           |
| **C** | 🚀 **MVP**              | Could replace the old bot for its core use case today (definition below)                         | Phase 3           |
| **D** | ✅ **Feature Complete** | Full command set matching the old bot, hardened                                                  | Phase 4           |
| **E** | 🌍 **Launched**         | Global commands, publicly invited, first week clean (verification follows post-launch — see 6.1) | Phase 5           |

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
polish, global registration. Alt-art support **is** in MVP because it's named in
the product goal (HANDOFF §1) — it shipped as the `/alt` command through the MVP
and, since chunk 4.12, lives as `/card`'s `alt` option + Prev/Next paging (the
standalone `/alt` command was retired).

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
- [x] **3.6 — Cron live + soak.** _(Cron enabled 2026-07-06: intended
      Tuesdays 06:00 UTC — see DECISIONS.md for the day choice; expected automated runs Jul 7 + Jul 14. **Corrected 2026-07-07:** Cloudflare
      reads `0 6 * * 2` as Mondays (weekdays number from 1 = Sunday), so
      Jul 7 never fired; owner kept the de-facto Monday schedule, runs
      re-dated Jul 8 (one-off recovery) + Jul 13 — DECISIONS.md
      2026-07-07. Also closed a plan gap: the TESTING.md §5 weekly
      source-contract CI job now exists — Mondays 06:00 UTC, now the same
      hour as the sync; verified green against the real upstream. **Corrected 2026-07-10:** **Soak runs
      2026-07-06 → 2026-07-11**; owner duties in OWNER-TODO.md. Repo-wide
      change: relative imports carry explicit `.ts` extensions so scripts,
      deploys, and tests share one resolution style.)_ Enable the production
      cron schedule. Start the
      5-day soak: bot in test guild, daily use, watch logs/alerts. Fix anything the
      soak surfaces.
- [x] **3.6.1 — Expand soak coverage to a 2nd guild.** _(Landed
      2026-07-06: `npm run register` handles a comma-separated
      `DISCORD_TEST_GUILD_ID` list; owner installed the app in guild 2
      (`applications.commands` scope only), registered, and verified the
      commands respond — day one of the soak week, so the full window
      gets two-guild traffic.)_ _(Time-sensitive:
      do early in the soak week — 2026-07-06 → 07-13 — so the extra
      traffic actually accrues. Joining mid-soak does NOT reset the 7-day
      clock: the soak measures the bot's stability, and more real usage
      is more signal.)_ To get more user commands during the soak,
      install the bot on a second guild and confirm every command works
      there. **Script change:** `DISCORD_TEST_GUILD_ID` accepts a
      comma-separated list of guild ids; `npm run register` PUTs the
      command set to each listed guild, so any future command change
      keeps all soak guilds in sync with one run. Unit-test the
      list parsing (whitespace/empty entries ignored). **Owner steps
      (human, like 2.5):** authorize the app in guild 2 via the OAuth2
      install link with the `applications.commands` scope only (no `bot`
      scope — HTTP interactions, no bot member, per HANDOFF §15); append
      the guild id to `DISCORD_TEST_GUILD_ID` in `.dev.vars`; run
      `npm run register`; verify `/card`, `/alt`, `/keyword`, `/release`
      and autocomplete all respond in guild 2. Add guild-2 spot checks
      to the OWNER-TODO.md soak duties. Note: the unverified-bot ceiling
      is 100 servers (HANDOFF §12) — two is nowhere close, but the
      server count officially starts mattering now.

**🚀 Gate C criteria:** all five MVP-definition bullets above are true.
**Reached:** ✅ **2026-07-11** (owner call). Evidence, per bullet: ① `/card`
proven since Gate B and exercised all soak week (incl. the 4.12 alt fold);
② two automated production syncs — Jul 8 one-off recovery (v4) + Jul 11
first weekly Saturday fire (v7, `lastSuccessfulSync` 2026-07-11T06:00:24Z);
③ alerting proven by the Phase 3 forced-failure + stale-sync drills (and
again by 4.5's request-path drill); ④ soak ran 2026-07-06 → 07-11 — a
**5-day window by owner decision** (DECISIONS 2026-07-10, cron move),
superseding this file's original "7 consecutive days" wording; findings it
surfaced (cron dialect, blank images → 4.11, 2-printing custom_id dup)
were all fixed inside the window, alert channel otherwise silent; ⑤ CI
green throughout, post-deploy smoke included. Note: the soak did surface
failed interactions (that was its job) — the gate reads "no failed
interactions" as **none left standing**, not none ever seen.

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
- [x] **4.4 — Command-set parity review.** _(Complete 2026-07-10, owner call:
      the current five commands — `/card` (with alt-art viewing folded in,
      4.12), `/keyword`, `/set`, `/release`, `/banlist` — match what the old
      bot's users rely on; names/options frozen ahead of global launch. The two
      soak-week community-input items are **closed as not needed for parity**
      (Will Not Do unless post-launch feedback resurfaces them, like `/page`):
      a `/compare` side-by-side command, and the `/keyword` discoverability gap.
      DECISIONS.md 2026-07-10.)_ Compare against the old bot with community
      input; finalize names/options (HANDOFF §14).
- [x] **4.5 — Hardening pass.** _(Landed 2026-07-09. Two halves: input
      fuzzing + error visibility. Finding: the router was already total, so
      the gap was the worker entry — a throw in verify/buildRegistry/
      serialization returned a raw 500. Owner call 2026-07-09: caught errors
      must REACH the owner, not die in a log line. So the router now reports
      caught handler errors (D1 hiccup etc.) to a NEW request-path alerter —
      friendly response to the user + rate-limited ping to
      `SYNC_ALERT_WEBHOOK` via `ctx.waitUntil`; the worker's new top-level
      catch alerts AND returns 500 for the should-never-happen faults so
      Cloudflare metrics catch them too. Rate-limiting is in-isolate,
      best-effort — DECISIONS.md. Fuzz corpus in
      `test/fixtures/fuzz-inputs.ts`, shared by a router-level fuzz suite and
      the normalizeSearchName index-range invariant test. Review-hardened
      before merge (DECISIONS 2026-07-09 "Code-review refinements"): a shared
      `interactions/options.ts#stringOption` guard for ALL String-option
      commands (not just /card); the fuzz suite drives the real exported
      `buildRegistry`, so every command is fuzzed; the catch widened to wrap
      verify+parse; component alerts dedup on the namespace; a failed alert
      rolls back the dedup window; the shared alerter moved to `src/alert.ts`
      (`sendAlert`) so interactions/ no longer imports sync/.)_ Input fuzzing on
      interaction payloads (malformed options, absurd lengths, weird unicode
      in names); D1 error handling (what does the user see if D1 errors
      mid-lookup? — must be a friendly message, not a Discord "application
      did not respond").
- [x] **4.6 — Banned/restricted display on `/card`.** _(Landed 2026-07-07.
      Value survey found a fifth upstream value beyond the scoped four:
      `Choice Restriction` (5 cards, 2 groups) — all banned/choice cards
      verified against the official page; DECISIONS.md has the survey +
      display calls. Stored verbatim with `Unrestricted` → NULL;
      `Not released` stored but shows nothing (owner call); unknown future
      values render raw. `restrictions` promoted to a required drift-gate
      field — the flag is load-bearing now. Migration 0002 applied local +
      remote; deployed; production repopulated via resync.)_ _(Independent of
      4.4/4.5 — parallelizable; prefer landing it before 4.5 so the fuzz
      pass covers it.)_ The upstream `restrictions` field is in the
      adapter's known-fields contract but is dropped before the model, so
      `/card` shows a banned card with no flag — misinformation, not a
      gap (DECISIONS 2026-07-06). Upstream shape: per-region object
      (`english`/`japanese`/`chinese`/`korean`) with values like
      `Unrestricted`, `Restricted to 1`, `Banned`, `Not released`. Carry
      the **English** value through the stack: migration 0002 (nullable
      `restriction` column), adapter mapping, loader, repo reads, and a
      warning on the `/card` embed for any value other than
      `Unrestricted` — a ⚠️ **description line** directly under the title
      (owner call 2026-07-06, see 4.8; survey the full dataset's
      distinct values first). Verify displayed values
      against the official Banned & Restricted announcement
      (en.digimoncard.com/rule/restriction_card). Tests: snapshot the
      embed for banned / restricted / unrestricted / not-released cards;
      adapter + loader coverage for the new field. _Implementation map
      (verified 2026-07-07): new `migrations/0002_*.sql` (ALTER TABLE
      cards ADD COLUMN, nullable TEXT); `src/data/schema.ts` (`Card`
      interface); `src/data/repo.ts` (`CardRow` + the row→Card mapping +
      SELECT column lists); `src/sync/adapter/digimoncard-app.ts`
      (`normalize` maps `restrictions.english`; the field is already in
      EXPECTED_FIELDS so no drift-gate change); `src/sync/load.ts`
      (INSERT column); `src/interactions/embeds.ts` (`cardResponse`
      description line — the slot is reserved, see the 4.8 comment
      there). Store null for "Unrestricted" so the embed's
      only-when-present logic stays a simple truthy check — decide
      in-chunk after the value survey._
- [x] **4.6.1 — `/card` choice line names the related cards.** _(Landed
      2026-07-08, as pre-scoped: the handler resolves partner names via
      `findPrinting` — at most two extra indexed lookups, only on the ~5
      choice cards — and passes an id→name map into the still-pure
      `cardResponse`. Tests: embed snapshot + degrade assertions, handler
      lookup coverage incl. a missing-partner fixture, and a signed
      end-to-end /card BT20-037 through workerd + seeded D1.)_ _(Owner
      call 2026-07-07, made reviewing 4.7 — reverses the 4.6 ids-only
      call.)_ The `/card` choice-restriction line should read like
      `/banlist`'s: "cannot be in a deck with Taomon (BT17-035) or
      Sakuyamon (X Antibody) (EX8-037)" — `Name (ID)`, stacked parens
      kept for names that contain parens. Names resolve at command time
      by repo lookups of the `CHOICE_PARTNERS` ids (the `/card` handler
      owns the repo; `cardResponse` stays a pure builder — pass resolved
      labels in). Degrade ladder unchanged from 4.6: lookup miss → bare
      id; unmapped card → generic wording. Tests: embed snapshots +
      handler coverage for the lookup path. Small chunk — land before
      4.5 so the fuzz pass covers it.
- [x] **4.7 — `/banlist`.** _(Landed 2026-07-07. Spec amendment, owner
      call: a third **Choice restriction** section — the status 4.6
      discovered after this chunk was scoped — with each line naming its
      related cards as `Name (ID)`: ids from the curated
      `CHOICE_PARTNERS` map, names resolved from the fetched list itself
      (bare line + explanatory section subtitle for an unmapped card).
      An unknown future status lists in its own raw-headed section,
      consistent with
      `/card`'s surface-don't-hide call. Volume verified against
      production D1: 3 banned + 50 restricted + 5 choice ≈ 1.8k chars —
      one embed with room; whole-line truncation + official-page pointer
      guards a larger future list. Owner: `npm run register` after the
      deploy.)_ _(Depends on 4.6 — needs the `restriction`
      column.)_ List all currently banned and restricted cards (name +
      card ID) for easy reference. No options; **public** reply (owner
      call, 2026-07-06). One D1 query over the active version:
      base printings only (dedupe alt-art variants), `restriction` not
      `Unrestricted`/`Not released`, sorted by card ID — a per-invocation
      scan like `/release`'s tally, fine at this volume. **English values
      only** — owner (judge) confirms regions converged on a unified
      banned/restricted list (and unified set releases) as of BT-21, so
      one list is the whole truth; revisit only if regions ever diverge
      again. Embed grouped into **Banned** and **Restricted to 1**
      sections (empty section omitted); current list fits one embed —
      truncate with a "see official page" pointer if it ever outgrows
      the 4096-char description. Footer links the official announcement
      (en.digimoncard.com/rule/restriction_card), which is also the
      verification source at build time. Tests: repo-query integration
      test against seeded D1 (banned + restricted + unrestricted +
      not-released + variant-dedupe cases); embed snapshot for a mixed
      list and for the empty-list reply.
- [x] **4.8 — Minimal `/card` embed: title → image.** _(Landed
      2026-07-06, same day as the feedback: `cardResponse` stripped to
      title/color/image/footer, snapshots regenerated, keywords.ts
      rationale updated. Needs a deploy to reach production.)_ _(Owner
      feedback
      from real soak-week usage, 2026-07-06 — DECISIONS.md. Independent
      of the other Phase 4 chunks; do before or together with 4.6, which
      builds on the new shape.)_ Every stat the embed currently prints
      (Type/Color/Level/Play Cost/DP/Rarity fields, Effect,
      Inherited/Security) is redundant — the card image carries all of
      it. Strip `cardResponse` to: **title** (`Name — CARD-ID (variant)`)
      → optional **⚠️ description line** (4.6's restriction warning —
      the one fact NOT printed on the card) → **image** → **set-name
      footer** (kept — also not printed on the card; owner call). Net
      look matches `/alt`'s galleries. Safety note: every card passing
      validation has an `imageUrl` (derived from its card id), so the
      image-only body can't come up empty; the existing null guard
      stays as belt-and-braces. _(Superseded by 4.11: a present `imageUrl`
      guarantees only the field, not a successful fetch — a throttled host
      renders blank. The CDN swap + coverage audit are the real guarantee;
      the null guard remains belt-and-braces.)_ Also update the stale rationale in
      `src/data/keywords.ts` ("… `/card` still shows any card's full
      printed text") — after this chunk the glossary is the bot's only
      _text_ rules reference, which raises the stakes on its accuracy
      (already judge-reviewed). Tests: update the `cardResponse`
      snapshots; disambiguation/not-found and `/alt` are untouched.
- [x] **4.9 — `/release` parity split: rename to `/set`, `/release`
      becomes the upcoming-releases forecast.** _(Landed 2026-07-07.
      Verification finding: BT-26/LM-08/LM-09 dates re-confirmed on
      official pages, but the old bot's December-onward horizon (BT-27
      "Ignition of X", ST-25/ST-26 Alysion decks, EX-14, BT-28, ST-27)
      has NO official EN product listings yet — community leaks only, so
      per the 4.2 convention nothing was added; OWNER-TODO has the watch
      item. Registered + verified in the soak guilds 2026-07-07.)_ _(Owner parity feedback,
      2026-07-07 — DECISIONS.md. Do before Gate D: renames are free
      while the commands are guild-only, breaking after global launch.)_
      **(a) Rename** the current set-lookup command `/release` → `/set` —
      same option, handler, and autocomplete; name only. One
      `npm run register` PUT swaps the command set in every soak guild
      atomically. **(b) New `/release`** (no options, public): the old
      bot's "Upcoming Releases" list — every `releases.ts` entry with
      `releasedEN` today-or-later, ascending, one line each
      (`Name (CODE): <formatted date>`; month-only entries render as
      the month). Derived 100% from the existing curated dataset — NO
      second hand-maintained list (the old bot's per-set flavor text
      like "preorders open until…" was almost certainly manual and is
      deliberately out of scope); a stale file degrades to a shorter
      list, never wrong data. **In-chunk prereq:** refresh `releases.ts`
      against current official announcements — the old bot lists
      BT-27/ST-25/ST-26 (Dec 2026), EX-14 (Jan 2027), BT-28/ST-27
      (Mar 2027) beyond our current horizon; verify each on Bandai
      product pages before adding. Also sweep living docs for the
      rename (CLAUDE.md command list, OWNER-TODO spot-check item);
      historical DECISIONS entries stay as written. Tests:
      command-definition tests updated for both names; forecast builder
      is a pure function with injected `now` like `releaseResponse` —
      snapshot a mixed day/month-precision list, the empty-forecast
      reply, and pin the release-day boundary (a set releasing today
      still counts as upcoming).
- [x] **4.10 — `/card` "Show effect text" button (ephemeral effect reveal).**
      _(Landed 2026-07-08. Needs a deploy to reach production; no
      `npm run register` — buttons ride the message payload, not the command
      definitions.)_ _(Owner request 2026-07-08: give viewers a way back to
      the Effect / Inherited-Security text that 4.8 removed, without
      un-cleaning the public embed — DECISIONS.md.)_ **Does NOT reverse 4.8:**
      the public `/card` reply stays image-first; when a card has
      effect/inherited text it just gains one **`Show effect text`** button
      (Secondary style). Clicking it sends an **ephemeral** embed — Effect and
      Inherited/Security fields, visible only to the clicker — so nobody's
      channel view changes. Also lands the bot's **first message-component
      dispatch**: the router gains an `InteractionType.MessageComponent` branch
      and a third `HandlerRegistry.components` map keyed by the `custom_id`
      **namespace** (`namespace:action:arg`, here `card:effect:<cardId>`);
      component handlers are total like command handlers (nothing thrown
      escapes). State rides in the `custom_id` (the handler re-queries the live
      repo via `findPrinting`, reusing the pre-4.8 field code), so the button
      keeps working on old messages — a card resynced away just yields a
      graceful ephemeral note. No new runtime dependency
      (`discord-api-types` already exports `ComponentType`/`ButtonStyle`).
      Sets the precedent for future components (`/alt` pagination,
      disambiguation select). Tests: `cardResponse` snapshots regenerated
      (button present with text / absent without), new `cardEffectResponse`
      builder tests, router type-3 dispatch + throw-safety + unknown-namespace,
      component-handler parse/lookup/miss.

- [x] **4.11 — Card image reliability: CDN swap + coverage audit.** _(Landed
      2026-07-08. Owner-reported bug from soak testing: `/card` intermittently
      returns a blank image, e.g. Amaterasumon EX12-047. Root cause —
      synthesized image URLs hotlinked from `raw.githubusercontent.com`, which
      429-rate-limits under load; Discord's image proxy renders blank on a
      throttled cold fetch, so it's non-deterministic. DECISIONS.md has the
      diagnosis + probe evidence.)_ **(a)** Point `IMAGE_BASE` at jsDelivr
      (`cdn.jsdelivr.net/gh/TakaOtaku/…`) — same repo, same files, a real CDN
      built for hotlink load; one constant, no re-hosting. **Requires a
      production resync** to rewrite the materialized `image_url` values.
      **(b)** New `npm run image-audit` (`scripts/image-audit.ts` CLI +
      `scripts/image-coverage.ts` pure, tested auditor): fetches real upstream,
      runs the same adapter + validation gate as `/card`, probes every printing
      (base + alt-art) with bounded concurrency + retry/backoff, and categorizes
      `ok` / `missing` (404 gap) / `throttled` (429 or jsDelivr's burst-403) /
      `error`. Fails only on a **missing spike** (`--max-missing-pct`, default 5) — the first run found ~185 genuine 404s that are pre-existing on
      raw.github and un-fixable in code (new sets like BT-26 + un-imaged
      alt-arts; upstream `cardImage` points at the same filenames), so a hard
      fail on the baseline would be noise; a jump toward 100% (upstream moved
      the image paths) is the real signal. Weekly CI job
      (`.github/workflows/image-audit.yml`, Mondays 07:00 UTC) +
      `workflow_dispatch`. Deliberately NOT a unit test (8.5k live requests
      self-induce the throttling they'd measure). Tests: `image-coverage`
      categorization/retry/concurrency (incl. 403-throttle) with a fake fetch;
      adapter URL assertions re-pinned to `IMAGE_BASE`. **Owner:** run
      `POST /admin/resync` (or wait for the Saturday cron) so production serves
      jsDelivr URLs. Also corrects the stale 4.8 safety note below.

- [x] **4.12 — Fold `/alt` into `/card`; retire the `/alt` command.** _(Landed
      2026-07-09. Owner concern: `/alt`'s gallery (`altGalleryResponse`) posted
      one embed **per printing**, walling the channel. Design review reframed
      the fix — alt-art viewing moved into `/card` and `/alt` was dropped;
      preserves the HANDOFF §1 alt-art goal, drops only the redundant command +
      the all-at-once gallery. Reduces 4.4's surface (6→5 commands) and turns the
      `Next ▶` button into passive alt-art discovery. **Needs a
      `npm run register`** (`/card` gained an option, `/alt` removed) — done
      before global launch, when that's free.)_ **(a)** New optional **`alt`**
      option on `/card` (autocomplete, not required): its autocomplete is
      **cross-option** — it reads the current `card-name` value, resolves it to
      one card, and offers that card's printings (value = the `card_id|variant`
      token); ambiguous free text yields no suggestions (pick the card first);
      omitted → base printing. **(b)** **Prev/Next** on the `/card` reply for a
      card with more than one printing (one action row with the 4.10 "Show
      effect text" button + a
      `n/total` footer). The public message **never mutates** (no shared-control
      fighting): clicking Prev/Next opens an **ephemeral** pager; Prev/Next on
      _that_ ephemeral edit it in place (`UpdateMessage`, type 7 — first use),
      told apart by `interaction.message.flags`. Wrap-around; base is in the
      cycle; **no Show-all**. **(c)** `/alt` retired: command definition,
      handler (`commands/alt.ts`), `altGalleryResponse`, and registry wiring all
      removed. _State_ rides the `custom_id` (`card:printing:<cardId>:<index>`);
      the handler re-queries `listPrintings` (stable variant order) and clamps
      the index if a resync shrank the family. No new runtime dependency. Reuses
      `resolveCardValue`, `repo.listPrintings`, `stringOption`, and the 4.10
      `card` component namespace. Tests: `cardMessageData`/`cardResponse` nav
      buttons + footer, the generalized `card` component handler (effect vs
      printing, new-ephemeral-vs-UpdateMessage by flag, clamp, stale/malformed),
      the alt-branch autocomplete, the command handler's alt-token path + nav,
      deleted the `/alt` suites, and signed end-to-end `/card` (multi-printing) →
      nav buttons + a signed Prev/Next click → the neighbor printing.

**✅ Gate D criteria:** full command set live in the test guild; fuzz findings
fixed. **Reached: 2026-07-10** — all Phase 4 chunks complete (4.4 parity call
2026-07-10; 4.5 fuzz findings fixed), and the folded `/card` set is registered
and live in the soak guilds (owner-verified in Discord — the same live
verification that surfaced the 2-printing pager bug, fixed same day:
duplicate nav custom_ids, DECISIONS 2026-07-10; fuzz suite refreshed for the
new 4.12 surfaces).

---

## Phase 5 — Launch → 🌍 Gate E: "Launched"

Sequencing here is dictated by Discord's rules — HUMAN actions included
(HANDOFF §12).

- [x] **5.1 — Re-verify drift facts.** _(Done 2026-07-10, DECISIONS.md. All four
      HANDOFF §16 facts confirmed current; no code changes fell out. Workers free
      100k req/day + 10ms CPU + 50 subreq; D1 free 5M rows-read/day + 100k
      write/day (autocomplete row-reads are the ceiling to watch at ~1k servers —
      may need Workers Paid $5/mo, a monitoring item not a blocker). Discord
      100-server verification cap UNCHANGED (still gates verification —
      chunk 6.1 since the 2026-07-11 post-launch restructure); the 2026
      privileged-intents change (100 servers → 10k users) is N/A — we use no
      intents. API v10 current, pinned explicitly. Source repo healthy + MIT.)_
      Everything in [HANDOFF §16](../HANDOFF.md): free-tier limits, verification
      thresholds, API version, source status.
- [x] **5.2 — Global command registration.** _(Done 2026-07-10: ran
      `npm run register:global` — the 5 commands (`/card` incl. the `alt`
      option, `/keyword`, `/set`, `/release`, `/banlist`) are registered to the
      global scope (fresh global command ids), ~1h propagation. Guild
      registration kept for the soak guilds as the fast-iteration path (guild
      commands take precedence there, so no visible duplicates). Zero user reach
      until the bot is publicly invited (5.5). Reversible.)_ Flip the
      registration script to global (allow ~1h propagation). Keep guild
      registration for the test guild as the fast-iteration path.
- **5.3 — moved to Post-Launch as 6.1** _(2026-07-11, owner call)_: Discord
  verification is growth-gated, not launch-gated — the App Verification
  tab only appears at **>75 servers**, which can only happen after the
  5.5 rollout. See the Post-Launch section below; the prep sheet
  ([DISCORD-VERIFICATION.md](DISCORD-VERIFICATION.md)) is done and
  waiting.
- [ ] **5.4 — Launch checklist.** _(First pass 2026-07-10: 5 of 6 release-checklist
      items green — CI (checks + deploy+smoke) success; `/health` fresh (v6,
      8,535 cards, not stale); alerting forced-failure drill within 30 days
      (Phase 3 + Gate C); Gate B effectively re-validated by the post-fix `/card`
      spot-check; soak learnings (cron dialect, blank image 4.11, 2-printing
      timeout) all addressed. **Open:** a rollback-playbook rehearsal —
      OWNER-TODO. Re-run this whole checklist immediately before Gate E.)_ Run the
      release checklist in [TESTING.md](TESTING.md); confirm alerting, rollback
      procedure rehearsed, soak-period learnings addressed.
- [ ] **5.5 — Rollout.** Publish invite link to the community; monitor closely
      for the first week (alerts + Worker analytics + D1 metrics).
      **Throttle the invite pace across the 75→100 window** so verification
      (6.1) clears before server #100 — a fast rollout can hit the freeze
      mid-review (DECISIONS 2026-07-07).

**🌍 Gate E criteria:** global, invited, first-week monitoring clean.
**Reached:** `pending`
_(2026-07-11: "verified" removed from the criteria — verification can only
begin at 75+ servers, which only exist after rollout, so it was never truly
a launch-phase criterion. It's now Post-Launch chunk 6.1; the 100-server
freeze remains the hard constraint, guarded by 5.5's throttle rule.)_

---

## Post-Launch (Phase 6) — after 🌍 Gate E

Launch isn't the finish line; it's when the growth-gated and steady-state
work starts. Nothing here can (or should) happen before the bot is public.
No gate closes this section — it's the operating roadmap.

- [ ] **6.1 — Submit Discord bot verification** _(human, government ID;
      moved from 5.3, 2026-07-11)_ **before crossing 100 servers** — the bot
      freezes at #100 otherwise (HANDOFF §12). Historically ~5-day review.
      _Can't be started before **75 servers** — the App Verification tab
      only appears then (verified 2026-07-07, DECISIONS.md), so the earliest
      submit and the #100 freeze are only ~25 servers apart. The checklist
      answers are pre-drafted ([DISCORD-VERIFICATION.md](DISCORD-VERIFICATION.md))
      so it's submit-on-sight; the invite-pace throttle that protects the
      window lives in 5.5._
- [ ] **6.2 — Capacity watch → Workers Paid decision.** From the 5.1 drift
      check: D1's free 5 M row-reads/day is the ceiling to watch
      (autocomplete is the hungry path) as servers approach ~1,000. Watch
      Workers/D1 analytics closely during 5.5's first week, then on a
      monthly rhythm; if metrics near the cap, flip on **Workers Paid
      ($5/mo)** — no code change. _Done when: traffic has stabilized and
      the stay-free / go-paid call is made and recorded._
- [ ] **6.3 — Open-source the repo.** The standing intent (CLAUDE.md;
      license landed as MIT 2026-07-10 with the public README): flip the
      repo public once the bot is up and running stably.
      **Pre-flip work is DONE (2026-07-15) — only the visibility flip itself
      remains** (owner action: Settings → General → Danger Zone → Change
      visibility). What's already closed:
      ① **history audited** — no secret has ever been committed (`.dev.vars`
      has never been tracked in any commit; no webhook URLs or bot tokens
      anywhere in the log; the one committed keypair,
      `test/fixtures/discord-test-keypair.json`, is a documented test-only
      Ed25519 pair that guards nothing);
      ② **copyright line settled** — stays on the `skikklesman` handle, and
      that is deliberate (DECISIONS 2026-07-15 — do not "fix" it);
      ③ **public docs finalized** — README/PRIVACY/TERMS carry no draft notes
      and no `[placeholders]`; contact and invite link are live; the ToS
      governing-law section was dropped (DECISIONS 2026-07-15);
      ④ **Worker URL + D1 id confirmed publishable** as non-secrets
      (DECISIONS 2026-07-15).
- [ ] **6.4 — Glossary: judge review + Comprehensive Rules §16 alignment.**
      The owner (official Digimon TCG judge) reviews the `/keyword`
      definitions (OWNER-TODO item); align them against the official
      ruleset's §16 keyword reference, and revisit the four 2026 mechanics
      deliberately omitted in 4.1. Update the Phase 3 blog post's pending
      judge-review line when done.
- [ ] **6.5 — Steady-state operations rhythm.** The watch items that
      outlive launch: the weekly trio (Saturday sync cron, source-contract
      check, image audit) stays green — pre-release image gaps like BT26's
      404s self-resolve upstream and only matter if the audit breaches its
      5% ceiling; the alert channel stays the single signal (silence is
      success); and the old bot's shutdown (**2026-07-31**) likely brings a
      migration wave — watch its timing against the 75→100 verification
      window. _Done when: the first post-launch month closes with the
      rhythm documented and no manual intervention needed._

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
