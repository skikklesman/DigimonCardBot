# Phase 4: The Community Starts Steering (DRAFT)

_DRAFT — publish (rename with date, add to the blog README) when Gate D
lands. Written across the 2026-07-06/09 soak-and-build sessions. Only 4.4
(the parity review) is still open before Gate D closes; the wrap-up section
at the bottom waits on it._

---

## TODO: intro

_Phases 1–3 were built from a spec. Phase 4 is being built from feedback —
the soak week put the bot in front of real users, and almost every chunk
below started as a screenshot or a question from the owner rather than a
line in HANDOFF.md._

## The question that added three chunks

The owner asked a simple question: "did you ever look at the official
rules page?" The honest answer was no — the keyword glossary had been
compiled from card text and community sources, and `en.digimoncard.com`
appeared in the repo only as a product-page citation.

The page turned out to be load-bearing. The Comprehensive Rules PDF's §16
is a complete keyword-effects reference — it settled, among other things,
why two "missing keywords" had no reminder text anywhere to find:
**Assembly and Arts Digivolve aren't keyword effects at all; they're
rules**, like DigiXros. No compilation we'd cross-checked made that
distinction, because compilations transcribe what's printed on cards, and
rules aren't printed on cards.

But the buried lede was on the same page: the official Banned & Restricted
announcement. Our upstream feed carries a `restrictions` field per card —
and our adapter _knew_ about it. It sat in the known-fields contract
(so the schema-drift gate wouldn't cry wolf about it) and was then dropped
on the floor before the data model. `/card` would happily render a banned
card with no flag. For a bot whose owner is a tournament judge, that's not
a missing feature — it's misinformation by omission. Two chunks went on
the roadmap within the hour: a ⚠️ line on `/card` (4.6) and a `/banlist`
command (4.7), both fed by the same one-column carry-through, both
verifiable against the official announcement page.

Lesson: the drift gate did exactly its job — it knew the field existed —
but "known" and "used" are different ledgers. Worth auditing the gap
between them once per project.

## The screenshot that deleted half an embed

Mid-soak, the owner posted a screenshot of `/card` output with a red
circle around... almost all of it. Type, color, level, cost, DP, rarity,
effect text, inherited effect — every one of those facts is printed on
the card image directly below the text. The embed was saying everything
twice, and in a live channel the duplication read as clutter, not
thoroughness.

The fix (4.8) shipped the same evening: `/card` is now title → image →
set-name footer. What stays is exactly what the image _doesn't_ carry —
the searchable title, the set name, and (reserved for 4.6) the
banned/restricted warning, which no card image will ever print. The
result converges with `/alt`'s galleries, so the bot now has one visual
language.

One consequence got written down in three places: the keyword glossary is
now the bot's **only** text rules reference. The 4.1-era comfort blanket
("a missing keyword is fine, `/card` shows the printed text anyway") is
gone. Good thing a judge reviewed the glossary the day before.

Lesson: design reviews approve embeds; usage deletes them. The soak week
is earning its calendar slot.

## Undeleting, without un-cleaning

The morning after I stripped the embed, the owner asked the obvious question
back: what about the times you _do_ want the effect text — a rules dispute at
a table, a card whose art is hard to read? Fair. But putting the text back on
the public embed would undo the thing I'd just shipped the night before.

So 4.10 threaded the needle. The public `/card` stays image-first, and _when
a card actually has effect text_ it grows one small "Show effect text" button.
Click it and the Effect and Inherited/Security fields arrive as an
**ephemeral** reply — visible only to you, gone when you dismiss it, nobody
else's channel view touched. It's the bot's first message component, so it
also meant building the plumbing underneath: the router learned to dispatch a
button click by a `custom_id` namespace, and the handler re-queries the live
data on every click rather than remembering anything, so the button still
works on a `/card` message from last week. The state lives in the button, not
in any memory of mine — which is the same discipline the whole request path
runs on, now extended to clicks.

Lesson: "add it back" and "put it back where it was" are different requests.
A button is the distance between them.

## Parity archaeology: what does "/release" mean?

Another screenshot, this time of the _old_ bot: its `/release` command
outputs a forward look — "Upcoming Releases," eight bullets of future
sets with dates. Ours was a set-_lookup_ command. Both useful; same name;
different products. To the community, `/release` means the forecast, and
parity is the mission.

So 4.9 split them: the lookup kept its exact behavior under the clearer
name `/set`, and `/release` became the forecast. The forecast's data
design is the part worth writing down: it derives _entirely_ from the
same curated `releases.ts` that `/set` reads — filter to dates from today
forward, sort ascending, done. No second dataset, no scraping, and per
the owner's explicit requirement, nothing to babysit. A stale file makes
the forecast shorter, never wrong.

The verification pass had a sting in it. The old bot's forecast reaches
into March 2027 — BT-27 "Ignition of X," two Alysion starter decks,
EX-14, BT-28. None of them have official EN product listings yet; the
dates circulating are community leaks and preview-stream notes. The old
bot (or its data source) shipped them anyway. We didn't: the dataset
convention is official dates only, so those sets enter `releases.ts` the
day Bandai posts them and not before. The owner — who hears announcements
before most webpages do — carries the watch item.

Lesson: parity means matching the _function_, not inheriting the
sourcing standards.

## The invisible install

Small operational comedy from 3.6.1 (second soak guild): the owner
installed the app, got Discord's success screen, then reported it
"didn't look like it installed" — no bot in the member list, no
welcome-to-the-server message. Which is exactly right. An
`applications.commands`-scope install grants slash-command registration
and nothing else: no bot member, no presence, no unprompted messages.
Every Gateway-era instinct says something failed; the HTTP-interactions
design says this is what correct looks like. The only visible trace is
Server Settings → Integrations.

The multi-guild support itself was one small script change —
`DISCORD_TEST_GUILD_ID` takes a comma-separated list now, and one
`npm run register` keeps every soak guild's command set identical.

## A URL that resolves to nothing

The bug report was a screenshot of `/card` with a blank rectangle where
Amaterasumon should have been — and the maddening detail attached to it, "it
works sometimes." Intermittent image failures are the worst kind: nothing in
the logs, nothing wrong with the data, and the image demonstrably _exists_ if
you open the URL yourself.

The URLs were synthesized from the card id and hotlinked straight off
`raw.githubusercontent.com`. GitHub's raw host rate-limits under load, and
here's the part it took a probe to see: Discord doesn't fetch an embed's image
from the viewer's browser — it fetches it once, through its own proxy, and
caches the result. When that _cold_ fetch hits a 429, the proxy caches nothing
and renders blank; a later, already-warm image looks fine. Which is exactly
what "works sometimes" is made of. I proved it by hammering the host: the same
image returned 200 five times in a row on its own, then threw three 429s out
of four when I asked for a burst of different cards at once. Not a data bug — a
load bug wearing a data bug's clothes.

The fix was a single constant: point the image base at jsDelivr, a real CDN
that mirrors the very same GitHub repo, built for exactly this hotlink load.
But I didn't want "it's fixed" to be a feeling, so 4.11 also shipped an audit
that walks every printing's image once a week and reports coverage. It taught
me two things I hadn't known. jsDelivr signals throttling with a **403**, not
a 429 — my first audit run miscounted about 150 of them as real errors until I
made 403 retryable. And roughly 185 cards are genuinely imageless upstream:
brand-new sets whose art Bandai simply hasn't published yet. So the audit
fails only on a _spike_ in missing images, never on that standing baseline — a
hard fail on 185 unfixable gaps would only train us to ignore the alarm.

Lesson: a present `imageUrl` guarantees a field, not a picture. The null-check
I'd leaned on since 4.8 was quietly checking the wrong thing.

## Erring toward knowing

4.5 was meant to be a quiet hardening pass: fuzz the interaction payloads,
make sure a database hiccup mid-lookup shows the user a friendly line instead
of Discord's dreaded "application did not respond." I built a corpus of
hostile inputs — 10,000-character names, right-to-left overrides, lone
surrogates, SQL metacharacters — and fired all of it at the router. Mostly it
just held. The router had been written total from day one; nothing I threw
made it throw back.

The interesting part was a question the owner asked about that friendly-line
path: if a lookup fails and the user gets a polite apology, how do _you_ find
out it happened? The honest answer was that I didn't — the error hit a
`console.error` in a log nobody watches, and the apology quietly swallowed it.
The owner's steer came in one sentence: "I would rather err on the side of
knowing the error than covering it over." That reframed the whole chunk.
Handling a failure isn't only sparing the user; it's making sure the failure
_reaches someone_. So caught errors now also ping the same alert channel the
sync path uses — rate-limited, so a broken deploy pings twice, not ten
thousand times — and the truly unexpected faults return a real 500 on top, so
they show up in the metrics too. The friendly message stays; it just no longer
means silence.

There's a coda I owe this section honestly. A code review of my own branch
found that I'd hardened the input guard on `/card` and never applied the same
guard to `/keyword` and `/set` — and that my shiny fuzz suite hadn't caught it
because it was testing a hand-built subset of the commands instead of the real
set. Both got fixed; the fuzzer now drives the actual command registry, so the
next command I forget will fail loudly. Being total is a property you have to
keep _proving_, not one you write down once.

Lesson: a caught error and a known error are not the same thing. The gap
between them is a log file no one opens.

## The feature request that became a deletion

The owner flagged a real problem with `/alt`: on a card with a dozen alt-arts
it dumped a dozen embeds into the channel. My first plan was a cycler — one
image, a Next button, page through in place. Then, mid-conversation, a sharper
question came back: "if you can pick the printing at autocomplete time, can we
just…" — and the shape changed under me. The autocomplete token already
carried the exact printing (`card_id|variant`); nothing stopped `/card` from
offering one directly. Which raised the follow-on neither of us could un-see:
if `/card` can show any printing and page between them, what is `/alt` _for_?

Nothing. So it's gone — folded into `/card` as an optional `alt` option plus
Prev/Next buttons, the standalone command deleted. A free move today while
we're guild-only; a breaking one after launch, which is exactly why now and
not later. The one knot was the owner's dislike of "fighting": if Next edits a
public message, whoever clicks last wins it for everyone watching. The
resolution keeps the public card still and makes browsing _ephemeral_ — click
Next and you get a private pager only you can see. The channel shows the one
art you chose; everyone else flips through their own copy in peace.

Lesson: the best answer to a feature request is sometimes one fewer command.
Phase 4 is community-steered — but this time it steered toward less surface,
not more.

## TODO: Gate D closing section

_Awaits 4.4 (the parity review) and the gate itself. Running theme: nearly
every chunk in this phase was started by the community — or its judge — and
finished by the pipeline, feedback to production in about a day. The later
chunks added a turn to it: the steering stopped pointing only at features and
started pointing at reliability (4.11), at knowing when we fail (4.5), and at
removing surface rather than adding it (4.12)._
