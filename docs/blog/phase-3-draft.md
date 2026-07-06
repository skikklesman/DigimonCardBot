# Phase 3: Making It Impossible to Shut Up (DRAFT)

_DRAFT — publish (rename with date, add to the blog README) when Gate C
lands, expected ~2026-07-14 after the soak and the second automated cron
run. Sections are penciled in while fresh; the Gate C section awaits its
ending._

---

## TODO: intro

_Phase 2 ended with "the bot can talk." Phase 3's job: make it impossible
to shut up — autocomplete, alt-arts, alerting proven by arson, an admin
lever, smoke tests, and finally the cron that removes the last human from
the loop. All six chunks (plus a Phase 4 stowaway) landed across
2026-07-05/06._

## 3.1 — Autocomplete, almost anticlimactically

The marquee feature — the reason the whole local-cache architecture exists
(autocomplete cannot be deferred; you answer in ~3 seconds or you answer
nothing) — took the least code of any chunk. Extract the focused option,
run the same prefix query a human ran by hand two days earlier, map to
choices. The router built in 2.1 already handled the caps and the
degrade-to-empty error path; the repo built in 2.2 already had the indexed
query. When a chunk feels too easy, either you've missed something or the
architecture already did it. This time it was the architecture.

One recorded deviation: labels are `Goldramon (EX3-035)` — card id, not
HANDOFF's sketched set name. Set names in our data run novel-length;
the id is short, collision-proof, and it's what players retype anyway.

## 3.2 — /alt earns the data-source decision

Discord allows ten embeds per message, so `/alt` answers with a gallery —
every printing full-size, base first, variant labels, set footers. The
resolution ladder moved to a shared module (`commands/resolve.ts`) so
`/card` and `/alt` interpret input identically, forever, by construction.
The chunk that justified choosing digimoncard.app back in 1.2 (the only
source with alt-art image URLs) took an afternoon to cash the check.

## 3.3 — Alerting, proven by arson

The architecture makes failure invisible to users by design — an aborted
sync changes nothing, the bot keeps serving. Which means it's invisible to
the _maintainer_ too, unless something announces it. Chunk 3.3: a webhook
alert module whose cardinal property is that it never throws (a broken
alerter must not turn a diagnosable failure into a crash), plus a dead-man
check that alerts when the last good sync ages past cadence + 25%.

Per the MVP definition, none of it counts until proven by forced failure.
So: point the sync at `digimoncard-drill.invalid`, watch ❌ arrive in the
real alert channel. Backdate the sync timestamp ten days, watch ⚠️ STALE
arrive — then watch the very same run repair the staleness it reported.
Both messages confirmed by a human eyeball.

The drill also produced the session's best bug: appending the drill's
source-URL override to `.dev.vars` — a file that ended without a trailing
newline — fused the new line onto the webhook URL, corrupting both. The
tell was magnificent: the sync _succeeded_ when it should have failed.
When a test you expect to fail passes, believe the test. (TECH-DESIGN got
a new bullet; the file got its newline.)

## 3.4 — The admin lever (operated from a moving train)

`POST /admin/resync`: the same pipeline the cron runs, triggerable by a
human with a bearer token. Constant-time comparison (SHA-256 both sides,
then `timingSafeEqual` — hashing makes lengths equal and masks them), and
every auth failure returns a 404 byte-identical to any unknown route: the
endpoint is not probeable. No token secret configured → the route simply
doesn't exist.

The verification had a wrinkle: the owner was away from home. So the whole
operator setup ran remotely — token generated and piped into both
destinations without ever printing to the transcript — and the live test
doubled as production's first pipeline-driven sync: 8,425 rows fetched,
gated, staged, verified, flipped, in 5.7 seconds, retiring the
hand-transferred Gate B snapshot.

## 3.5 — Smoke tests, and what you can't fake

TESTING.md had already faced the honest constraint: you cannot forge
Discord-signed interactions against production, because Discord holds the
private key. So the post-deploy smoke is boundary + vitals: unsigned POST
must get 401 (proves verification is ON — the failure that matters), a new
`GET /health` returns exactly three public-safe fields with freshness
asserted, unknown routes 404. The script deliberately imports nothing from
`src/` — a broken Worker build can't break its own detector.

CI's deploy job got de-stubbed in the same chunk: deploys activate when a
`CLOUDFLARE_API_TOKEN` secret appears; smoke runs against production on
every master push either way. The pipeline's last stub is gone.

## 3.6 — The cron, a calendar trick, and a stowaway NUL

Two lines in wrangler.toml make the bot self-sufficient — but _which_ two
lines: the sketch said Mondays, and enabling on a Monday afternoon would
have put the second automated run (Gate C needs two) on July 20. Tuesdays
06:00 UTC gets runs on July 7 and 14 — six days back — and lets the weekly
source-contract CI job own Mondays, one day ahead of the sync, exactly the
"we knew a day early" promise from the test plan. That job, incidentally,
existed in TESTING.md but in no roadmap chunk; 3.6 adopted the orphan.

Wiring the contract check to reuse the real adapter forced explicit `.ts`
extensions on every relative import (Node's loader demands them; the
bundler didn't) — and that conversion exposed a stowaway: a literal NUL
byte in `load.ts`, present since chunk 1.5, functionally harmless, and the
reason git had been quietly treating the file as binary. Now a visible
`backslash-u-0000` escape. Same string, honest source.

## 4.1 (a Phase 4 stowaway) — /keyword and data archaeology

_Landed during the soak wait._ The keyword inventory wasn't scraped or
remembered — it was extracted from the card data itself: every `＜…＞`
token across twelve effect fields, frequency-ranked. Ground truth for what
appears on cards. Best find: `Overclock` is a real keyword — the same name
this project had invented as a _fictional_ mechanic for its drift-gate
tests months of subjective time earlier. Reality merged our fixture.

Definitions were cross-checked against community compilations; four 2026
mechanics were deliberately omitted rather than risk wrong rules text.
And then the twist: the owner disclosed they're an **official Digimon TCG
judge**. The glossary's review now sits with the most authoritative
reviewer it could possibly have, and this project's apprenticeship —
which had run one direction, Workers-knowledge flowing owner-ward —
turns out to run both ways. TODO: note the judge-review outcome here.

## TODO: Gate C — the soak and the two Tuesdays

_Soak 2026-07-06 → 07-13. Automated runs expected Jul 7 + Jul 14. Record
what the soak surfaced (ideally: nothing), the /health timestamps, and the
Gate C verdict._

## TODO: scoreboard & reflections

_176 tests and counting; one incident (newline fusion) with a same-day
convention written; the "silence is success" inversion — the bot now pings
the maintainer, never the reverse. Numbers at publish time._
