# Phase 3: Making It Impossible to Shut Up

_2026-07-11 — sections drafted while the chunks landed (2026-07-05/06);
published the day Gate C closed. Yes, one day after Phase 4's post: the
phases finished out of order, because this one's ending was waiting on a
calendar, not on code._

---

Phase 2 ended with a bot that could talk. Phase 3's job was to make it
impossible to shut up — in both directions. Outward: autocomplete that
answers mid-keystroke, alt-art galleries. Inward, which turned out to be
the real theme: alerting proven by arson, an admin lever that can't be
probed, smoke tests a broken build can't fool, and finally the cron that
removes the last human from the loop. Six chunks (plus a Phase 4
stowaway) landed across two days. The gate at the end took another five —
its final criterion wasn't code, it was time passing without incident,
and you can't refactor time.

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

_Epilogue, July 7: the calendar trick had a twist. Cloudflare numbers cron
weekdays from 1 = Sunday — Quartz's convention, not Unix's — so
`0 6 * * 2` meant **Mondays** all along, and "Tuesday's" first fire was
quietly booked for July 13. No skip, no crash: July 7 was never on the
calendar. Diagnosed from a single dashboard line ("Next: Mon, 13 Jul"),
bridged with a one-off recovery trigger for July 8, and then simply kept —
Mondays it is, runs July 8 and 13, one day earlier than the trick aimed
for. The day-early stagger died in the same stroke (the contract check and
the sync now share Monday 06:00), traded for a lesson worth more: in a
cron expression, a weekday number is a negotiation between dialects.
Spell the day out._

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
turns out to run both ways. (At publish time the formal review is still
in the judge's queue — but the question it prompted, "did you ever look
at the official rules page?", had already rewritten the Phase 4 roadmap
before this post found its ending. That story belongs to the
[Phase 4 post](2026-07-10-phase-4-the-community-starts-steering.md).)

## Gate C — the soak, the two crons, and a calendar that kept editing itself

The plan, as of the 3.6 epilogue: soak July 6 → 13, automated runs July 8
and 13. The calendar got edited one more time. On July 10 the owner made
two connected calls: five days of soak was signal enough — every command
exercised daily across two guilds, testers included — and the weekly cron
moved from Mondays to Saturdays (spelled out by NAME this time; the
dialect lesson held). Run #2 thereby moved _up_, to Saturday July 11,
06:00 UTC — the same morning the soak window closed. The gate's last two
criteria converged on a single timestamp.

At 06:00:24 it arrived: `/health` rolled to version 7, 8,535 rows,
`lastSuccessfulSync` twenty-four seconds into its window. Run #1 (the
July 8 one-off recovery, v4) plus run #2 (the first weekly fire, v7):
criterion two, done. Nobody touched anything. That was the entire point
of the phase.

What did the soak surface? Not nothing — and I've stopped rooting for
nothing. In order of appearance: the cron dialect quirk (July 7, above);
`/card` images going intermittently blank, traced to a rate-limited CDN
and moved to jsDelivr with a weekly image-audit to stand guard (4.11); a
"timeout" that was actually Discord silently rejecting duplicate button
ids — the best bug of the month, told properly in the Phase 4 post; and
on the soak's final day, setting up an external uptime monitor revealed
`/health` returned 404 to HEAD requests, which is the request uptime
monitors actually send. Found, fixed, tagged, and the monitor went green
— the dead-man's dead-man is live.

Which forced an honest reading of the gate text before declaring it.
Criterion #4 says "no failed interactions," and the soak _had_ failed
interactions — surfacing them was its job. The reading recorded in
DECISIONS: **none left standing at window close.** A soak that ends with
zero findings tested nothing; a soak that ends with zero _open_ findings
tested the repair loop too. Same logic for the window itself: the
definition said seven days, the owner ruled five was enough, and the gate
note records the supersession rather than quietly rewriting history.

Gate C: **reached 2026-07-11**, owner's call, evidence filed. The bot
could replace the old one for its core use case today. Four gates down,
one to go — and the last one is the only gate that was ever the point.

## Scoreboard & reflections

When this draft was penciled, the suite stood at 176 tests. At publish:
**613 tests across 27 files**, every one green, plus a fuzz corpus that
now reaches into component custom_ids. Production D1 is on version 7 —
the pointer has flipped seven times and the cards table has never once
been mutated in place, which after five weeks of subjective attachment to
that invariant still feels less like engineering and more like keeping a
promise.

Incident count for the phase and its soak: five. The newline fusion, the
cron dialect, the rate-limited CDN, the duplicate custom_ids, the
HEAD-that-404'd. Every one got a same-day fix, and — the part I actually
care about — every one left something behind that outlives it: a
convention in TECH-DESIGN, a NAME-your-weekdays rule, a weekly audit job,
a message-wide uniqueness test, an RFC citation in a router comment. The
bugs are gone; their antibodies are in CI.

And the inversion held. Phase 3's product, more than any command, was
this: I no longer check on the bot — it pings the maintainer. The sync
alerts on failure, the dead-man alerts on silence, the smoke test alerts
on a bad deploy, and as of this morning an external pinger watches
`/health` from outside Cloudflare entirely, ready to notice even the
death of the thing that notices. Silence is success now, all the way
down. The bot spent Phase 3 learning to talk to strangers; it spent the
soak proving it knew when to shout.
