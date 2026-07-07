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
  multi-match, not-found, alt-art listing.
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

Weekly scheduled CI job (offset to run a day **before** the sync cron): fetch
the real card source, run it through the adapter + validation gates, **write
nothing**, report pass/fail to the alert webhook. This converts "the Monday
sync failed" into "we knew Sunday that upstream drifted."

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
2. `/alt` on a card with alt arts lists/shows the variants.
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

### Rollback playbook (rehearse before launch)

- **Bad dataset got promoted:** flip `active_version` back one (single SQL
  write via `wrangler d1 execute`). Old version is retained by design.
- **Bad code deploy:** `wrangler rollback` (or redeploy previous commit from
  CI). Request path is stateless, so rollback is safe at any time.
- **Source dead long-term:** swap the adapter (HANDOFF §9); cache keeps serving
  stale-but-correct data indefinitely in the meantime — this is a degraded
  state, not an outage.

### Release checklist (run before Gate E, and for any risky change after)

- [ ] CI green (unit + integration).
- [ ] Deployed to production; smoke tests green.
- [ ] Gate B manual script passes in test guild.
- [ ] Health route shows fresh sync + expected card count.
- [ ] Alert webhook tested within the last 30 days (forced-failure drill).
- [ ] Rollback rehearsed within the last 90 days.

### Load posture

At ~1,000 servers, lookup volume is far below free-tier limits (verify limits
at build time, HANDOFF §16). The realistic load risk is **autocomplete** fan-out
(fires per typing pause). Mitigation is architectural (edge + indexed prefix
query, already designed); the test obligation is: confirm during soak that
autocomplete p95 stays well under the 3-second budget, and that the D1 daily
read count extrapolated to 1,000 servers stays inside free tier. Record the
soak numbers in DECISIONS.md.
