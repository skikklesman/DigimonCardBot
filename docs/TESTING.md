# Test Plan — Automated Testing & Live Stability

> Companion to [ROADMAP.md](ROADMAP.md). Defines what "tested" means at each
> layer, the manual gate scripts, and the live-stability regimen. The core
> principle: **the request path and the sync path fail independently, so they
> are tested independently** — plus a thin layer of end-to-end checks that prove
> the deployed artifact actually works.

---

## 1. Test pyramid

| Layer               | Runs                                    | Tooling                                                        | What it proves                                             |
| ------------------- | --------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------- |
| Unit                | every push (CI) + locally               | Vitest                                                         | Pure logic is correct                                      |
| Integration         | every push (CI) + locally               | Vitest + Workers runtime pool (local D1)                       | Modules compose correctly inside the real runtime          |
| Post-deploy smoke   | after every deploy (CI)                 | Script: signed synthetic interactions → live endpoint          | The deployed Worker + real D1 + real secrets actually work |
| Source contract     | scheduled (weekly, before sync cadence) | Script: fetch real source, run validation gates, write nothing | Upstream hasn't drifted; we find out before the cron does  |
| Manual gate scripts | at each roadmap gate                    | Human + test guild                                             | The user-visible product works                             |

Verify the current Cloudflare-recommended Vitest integration
(`@cloudflare/vitest-pool-workers` at time of writing) during chunk 0.1 — this
is a drift-prone fact.

---

## 2. Unit tests

Target: all pure logic. These are the bulk of the suite and must stay fast
(<10s total). Key suites, by module:

- **Signature verification** (chunk 0.3) — the security boundary. Known-good
  vector, bad signature, tampered body, tampered timestamp, missing headers.
  Generate a test keypair in-suite; never mock WebCrypto.
- **Interaction router** — each interaction type routes correctly; unknown
  types and unknown command names produce a friendly error response object,
  never a throw.
- **Validation gates** (chunk 1.4) — one test per documented catastrophe from
  HANDOFF §8: empty array, feed shrunk >10%, feed shrunk 9% (must PASS),
  truncated JSON, HTML error page, renamed fields (schema drift), one bad card
  among good ones (dropped + counted, batch proceeds).
- **Adapter normalization** (chunk 1.3) — fixture-driven: real captured source
  response → expected `Card[]`. Includes `search_name` normalization rules
  (lowercase, punctuation, whatever we settle on — the autocomplete UX lives or
  dies here).
- **Embed builder** — snapshot tests of response JSON for: ID hit, name hit,
  multi-match, not-found, and (chunk 4.12) the `/card` printing nav — Prev/Next
  buttons + `n/total` footer on a multi-printing card, none on a single one.
- **Autocomplete choice construction** — ≤25 cap, exact-prefix prioritization,
  label format `Name (CARD-ID)` (DECISIONS.md 2026-07-05), value format
  `card_id|variant`.
- **Keyword glossary** (chunk 4.1) — dataset-integrity checks on the static
  glossary: every entry well-formed, numbers normalized to "N", and the
  in-memory autocomplete filters/caps the list correctly.
- **Release dataset** (chunk 4.2) — same discipline for the static set list:
  unique codes, well-formed ISO dates, labels inside Discord's cap, LIKE-safe
  matchers; resolution + in-memory autocomplete; every autocomplete value it
  hands out must resolve.
- **Input fuzzing** (chunk 4.5) — a shared hostile corpus
  (`test/fixtures/fuzz-inputs.ts`: malformed payloads + nasty card-name
  strings — absurd length, mixed-script unicode, combining marks, RTL,
  surrogates, LIKE/SQL metacharacters) drives two suites: a router-level
  fuzz pass wiring the real handlers to a fake repo (every input resolves to
  a valid response, never throws), and the `normalizeSearchName`
  **index-range invariant** (output stays in `[a-z0-9 space]`, all below
  `{`, so the repo's range query can't be de-indexed by hostile input).
  The router pass drives the real `buildRegistry` (every wired surface is
  fuzzed automatically) and, since the 2026-07-10 refresh, also pushes the
  hostile corpus through each **component custom_id segment** — the effect
  card id and the pager's card-id/index segments arrive verbatim from the
  client; `Number()` quirks (`Number("") === 0`, whitespace, exponent/hex
  forms) are pinned in the corpus.
- **Request-path error alerting** (chunk 4.5) — the rate-limiter dedup window
  and `reportRequestError`'s best-effort delivery (`error-alert.test.ts`,
  fake fetch); the router's `onError` reporter is called with the right
  context on a throwing handler (`router.test.ts`). The end-to-end proof —
  a D1 failure yields BOTH a friendly response AND a webhook alert, and a
  catastrophic fault yields 500 + alert — lives in the integration layer (§3).

Conventions: tests live beside source as `*.test.ts`; no network access in unit
tests, ever; fixtures in `test/fixtures/`.

---

## 3. Integration tests (Workers runtime + local D1)

Run the actual `fetch`/`scheduled` handlers inside the workerd runtime with a
real local SQLite-backed D1. Key suites:

- **Read path:** seed D1 with a small known dataset → send a full signed
  interaction payload → assert on the complete HTTP response (status, embed
  content). Cover: `/card` by ID, by name, multi-match, not-found, free-text
  fallback, autocomplete round-trip.
- **Sync path:** run the load pipeline against local D1 with a fixture feed.
  Cover: fresh load + flip; **idempotent re-run** (same state after running
  twice); **mid-load failure** (inject an error partway — live version must be
  untouched and still served); version GC keeps exactly `active` and
  `active - 1`.
- **Version isolation:** while a new version is half-loaded, reads still return
  only old-version rows. This is the core promise of the architecture — test it
  explicitly.
- **Auth on manual resync route:** missing/bad/good token.
- **Cron wiring (`scheduled()` + `runSyncWithAlerts`):** the glue, not the
  pieces — failure posts the ❌ alert AND rethrows (so Cloudflare marks the
  invocation failed); warnings post ⚠️; the stale dead-man alert fires before
  the sync attempt and also alongside a failure; a broken webhook cannot mask
  the sync outcome. Outbound traffic is intercepted by stubbing global fetch
  (the main worker shares the test isolate).
- **Query-plan pin:** EXPLAIN QUERY PLAN on the exported `searchByName` SQL
  must show an index RANGE on `(version, search_name)` — the autocomplete hot
  path's D1 row-read bill depends on it (DECISIONS.md 2026-07-06).

---

## 4. Post-deploy smoke tests (runtime testing)

A script (`scripts/smoke.ts`) that signs synthetic interaction payloads with a
**test keypair we control** is not possible against production — Discord's
public key signs real traffic — so the smoke script instead uses the app's real
flow where possible and falls back to boundary checks:

1. **PING check:** POST an unsigned request → expect 401 (proves verification
   is on, not off). _(A correctly signed PING can only come from Discord;
   don't try to fake it — instead re-save/re-verify the endpoint URL check in
   the Portal if verification is in doubt.)_
2. **Health route:** a trivial `GET /health` on the Worker returning
   `{ activeVersion, cardCount, lastSuccessfulSync }` — the smoke script
   asserts version > 0, count within expected range, sync timestamp fresh.
   This route is read-only and public-safe (no secrets in output). The status
   code carries the freshness verdict: **200 healthy, 503 stale** by the
   dead-man rule — so a dumb external pinger catches a dead cron trigger
   (DECISIONS.md 2026-07-06).
3. **Real interaction probe (manual or semi-automated):** after deploy, run
   `/card <known ID>` in the test guild. Automatable later via a Discord test
   harness if it proves worth it; do not over-engineer this on day one.

CI ordering: unit + integration → deploy → smoke. A failed smoke fails the
pipeline loudly.

---

## 5. Source contract check

Weekly scheduled CI job: fetch the real card source, run it through the
adapter + validation gates, **write nothing**, report pass/fail to the alert
webhook. Originally offset a day **before** the sync cron (converting "the
sync failed" into "we knew a day early that upstream drifted"); since
2026-07-07 it runs the **same hour** (Saturday 06:00 UTC) — the stagger was
lost to the Cloudflare cron-dialect finding and consciously not restored
(DECISIONS.md 2026-07-07). It remains an independent probe of upstream.

### 5.1 Image coverage audit (chunk 4.11)

Separate weekly CI job (`npm run image-audit`, Mondays 07:00 UTC): fetch the
real source, run it through the same adapter + validation gate `/card` uses,
and probe **every** printing's image URL (base + alt-art) against the live
CDN. Categorizes each as `ok` / `missing` (404 — a real coverage gap) /
`throttled` (429, or jsDelivr's burst-403, after retries — host rate-limiting)
/ `error`. Fails only on a **missing spike** (`--max-missing-pct`, default 5),
not on the ~2% baseline of un-uploaded art (new sets + un-imaged alt-arts,
identical on raw.github) — a jump toward 100% means upstream moved the image
paths. **Deliberately not a `vitest` test** — 8.5k live requests are slow and
would self-induce the throttling the audit measures. The categorization/retry/
concurrency logic _is_ unit-tested (`scripts/image-coverage.test.ts`, fake
fetch); the CLI (`scripts/image-audit.ts`) is the thin network half. `--base`
re-probes any host for a before/after (e.g. the old raw.githubusercontent.com).

---

## 6. Manual gate scripts

### 🏗️ Gate A — Scaffolding Up

1. Developer Portal → save Interactions Endpoint URL → succeeds (Discord PING
   verified).
2. `curl -X POST <endpoint>` unsigned → 401.
3. CI on latest commit: green.

### 🎮 Gate B — First Playable script

In the private test guild:

1. `/card card-name:EX1-066` → embed with correct card image + text.
2. `/card card-name:goldramon` (free text, no suggestion picked) → sensible
   result (single hit or disambiguation list).
3. `/card card-name:zzzznotacard` → friendly not-found message.
4. `/card` with a name matching multiple cards → disambiguation, not a random
   pick.
5. All responses arrive well inside 3 seconds, no "application did not
   respond".

### 🚀 Gate C — MVP script

Everything in Gate B, plus:

1. Typing `goldr` in the `card-name` option offers Goldramon printings with
   `Name (Set)` labels; picking one resolves that exact printing.
2. `/card` on a card with alt arts shows Prev/Next buttons; the `alt` option
   autocompletes that card's printings; Prev/Next page them in an ephemeral view
   (chunk 4.12 — the retired `/alt` folded into `/card`).
3. **Forced-failure drill:** point a test sync at a dead URL → alert arrives in
   the webhook channel; live lookups unaffected.
4. **Stale-sync drill:** set `last_successful_sync` back by > cadence+margin →
   stale alert fires.
5. Soak log reviewed: 7 days, no unhandled errors, ≥2 clean automated syncs.

---

## 7. Live stability plan

### Monitoring & alerting matrix

| Signal                             | Source                                                              | Alert path                                                                       | Threshold                |
| ---------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------ |
| Sync failure                       | `scheduled()` catch → webhook                                       | Private Discord channel                                                          | Any failure              |
| Stale data                         | `last_successful_sync` age check                                    | Webhook (from the cron) **and** `/health` → 503 (catches a dead cron via pinger) | > cadence + 25% margin   |
| Worker errors / failed invocations | Cloudflare Workers analytics                                        | Manual review weekly; Cloudflare notification if available on free tier (verify) | Any sustained error rate |
| Endpoint down                      | External uptime ping on `/health` (free tier of any uptime service) | Email/Discord                                                                    | 2 consecutive failures   |
| Drop-count spike                   | Validation gate counts, reported in sync summary                    | Webhook (warn, not fail)                                                         | > 1% of batch            |

### Rollback playbook (rehearse before launch; rehearsed 2026-07-12)

> **Click-to-run:** `scripts\rollback-playbook.cmd` walks all of this as a
> guided menu with confirmations (status / dataset flip back / flip forward /
> code rollback). It runs on your local wrangler OAuth login and contains no
> secrets. The raw commands below are the manual fallback — Windows
> PowerShell, from the repo root. Mind the two shell traps learned in the
> rehearsal: it's `npx wrangler` (project-local install, not on PATH) and
> `curl.exe` (bare `curl` is PowerShell's Invoke-WebRequest alias).

- **Bad dataset got promoted:** flip `active_version` back one — a single SQL
  write. The prior version's rows are retained by design (sync GC keeps
  exactly one, `src/sync/load.ts`).

  ```powershell
  # Baseline, then confirm the prior version's rows exist
  curl.exe -s https://digimon-tcg-bot.rstewart555.workers.dev/health
  npx wrangler d1 execute cards --remote --command "SELECT version, COUNT(*) AS n FROM cards GROUP BY version"

  # The rollback itself (<target> = activeVersion - 1)
  npx wrangler d1 execute cards --remote --command "UPDATE meta SET value = '<target>' WHERE key = 'active_version'"

  # Verify: /health 200 on the prior version, then spot-check /card in a soak guild
  curl.exe -s https://digimon-tcg-bot.rstewart555.workers.dev/health
  ```

  While flipped back, the next sync treats the newer version as **staging and
  deletes its rows** (`src/sync/load.ts`). In a real incident that's the cure:
  the next clean sync rebuilds it and re-promotes. In a **rehearsal** it would
  destroy the good live dataset — don't hit `/admin/resync`, stay clear of the
  weekly cron (Saturday 06:00 UTC), and flip forward promptly with the same
  `UPDATE`.

- **Bad code deploy:** `wrangler rollback`. Request path is stateless, so
  rollback is safe at any time.

  ```powershell
  npx wrangler deployments list   # note the CURRENT Version ID first
  npx wrangler rollback           # interactive -- pick the previous version
  curl.exe -s -o NUL -w "%{http_code}" https://digimon-tcg-bot.rstewart555.workers.dev/health

  # Roll forward later: "rollback" to the noted ID restores the exact
  # original build (no rebuild drift, unlike a fresh deploy)
  npx wrangler rollback <original-version-id>
  ```

  If wrangler reports a 5xx / "malformed response" from `api.cloudflare.com`,
  that's a Cloudflare API outage, not your auth — check
  [cloudflarestatus.com](https://www.cloudflarestatus.com/) and retry. The
  dataset path above rides the D1 API, which can be up while the deployments
  endpoint is down (observed live 2026-07-12: 521/525 on deployments, D1 and
  the worker itself fine).

- **Source dead long-term:** swap the adapter (HANDOFF §9); cache keeps serving
  stale-but-correct data indefinitely in the meantime — this is a degraded
  state, not an outage.

### Release checklist (run before Gate E, and for any risky change after)

- [x] CI green (unit + integration).
- [x] Deployed to production; smoke tests green.
- [x] Gate B manual script passes in test guild.
- [x] Health route shows fresh sync + expected card count.
- [x] Alert webhook tested within the last 30 days (forced-failure drill).
- [x] Rollback rehearsed within the last 90 days.

### Load posture

At ~1,000 servers, lookup volume is far below free-tier limits (verify limits
at build time, HANDOFF §16). The realistic load risk is **autocomplete** fan-out
(fires per typing pause). Mitigation is architectural (edge + indexed prefix
query, already designed); the test obligation is: confirm during soak that
autocomplete p95 stays well under the 3-second budget, and that the D1 daily
read count extrapolated to 1,000 servers stays inside free tier. Record the
soak numbers in DECISIONS.md.
