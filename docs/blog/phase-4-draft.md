# Phase 4: The Community Starts Steering (DRAFT)

_DRAFT — publish (rename with date, add to the blog README) when Gate D
lands. Sections penciled in while fresh, mostly from the 2026-07-06/07
soak-week sessions. Still to come: 4.4 (parity review), 4.5 (hardening),
4.6 (restriction flag), 4.7 (/banlist)._

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

## TODO: Gate D closing section

_Awaits 4.4–4.7. Running theme so far: every chunk in this phase was
started by the community (or its judge) and finished by the pipeline —
feedback to production in under a day, twice, without breaking the soak._
