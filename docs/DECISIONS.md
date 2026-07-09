# Decision Log

> Append-only. One entry per non-trivial decision, newest at the top. Each
> entry: date, decision, why, and what would make us revisit it. The founding
> architectural decisions live in [HANDOFF.md](../HANDOFF.md) §4 and are not
> repeated here — this log starts where HANDOFF ends.
>
> Open decisions awaiting a human call are tracked in the section at the
> bottom; move them up into the log when resolved.

---

## 2026-07-08 — Message components: dispatch convention + /card effect-reveal button (chunk 4.10)

- **Decision (owner request):** the Effect / Inherited-Security text that
  4.8 removed from the public `/card` embed comes back as an **opt-in,
  ephemeral reveal**, not a return to the old text-heavy embed. `/card`
  gains a single **`Show effect text`** button (only when the card has
  effect/inherited text); clicking it replies with an **ephemeral** embed
  carrying those fields, visible only to the clicker. The public message
  stays image-first — this **layers on** 4.8's "image-first default", it
  does not reverse it. Why ephemeral + button (not a public in-place
  expand, not a select menu): keeps the shared channel view clean (the
  whole point of 4.8), needs no stored message state, and is one click to
  full text.
- **Architectural precedent — message-component dispatch:** this is the
  bot's first `MESSAGE_COMPONENT` (type 3) handling. The router gains an
  `InteractionType.MessageComponent` branch and a third
  `HandlerRegistry.components` map. **Convention:** components are keyed
  and dispatched by the **`custom_id` namespace** — `namespace:action:arg…`
  (colon-delimited), router routes on the first segment, the handler parses
  the rest. Here: `card:effect:<cardId>`. Component handlers are **total**
  like command handlers (nothing thrown reaches the user — HANDOFF §6.4);
  an unregistered namespace or a malformed/stale `custom_id` gets the same
  polite ephemeral as any unknown interaction.
- **Stateless by construction:** state rides in the `custom_id` (the card
  id), so the handler re-queries the **live** repo (`findPrinting`) on each
  click. The button therefore keeps working on old messages, and a card
  that's since left the data degrades to a graceful ephemeral note rather
  than a stale render or a throw. Effect text is identical across a card's
  printings, so the base-printing lookup needs no variant in the id.
- **No new runtime dependency:** `discord-api-types` already exports
  `ComponentType` / `ButtonStyle` — the component types come from the
  existing `/v10` import (consistent with the 2026-07-04 dependency entry).
  No `npm run register`: buttons ship inside the message payload, not the
  command definitions, so nothing about the registered command set changes.
- **Revisit if:** we want the effect visible to a whole table (a judge
  use-case) — that's a public in-place expand via `InteractionResponseType.UpdateMessage`
  (type 7), a different response shape, deliberately out of scope here; or
  if a future component needs to carry more state than fits a 100-char
  `custom_id` (then a lookup key, not inline args). The namespace-dispatch
  convention is the thing to reuse for `/alt` pagination or a
  disambiguation select.

## 2026-07-07 — /banlist: choice cards get their own section, related cards named (chunk 4.7)

- **Decision (owner, wording reviewed pre-commit):** `/banlist` groups
  into three sections — Banned, Restricted to 1, and **Choice
  restriction** (a status the 4.7 spec predates; discovered in 4.6's
  value survey). The choice section's subtitle, owner-worded: "decks
  with this card cannot include the related cards"; each line names its
  related cards as "Name (ID)" — e.g. "Chaosmon: Valdur Arm — with
  Taomon (BT17-035) or Sakuyamon (X Antibody) (EX8-037)".
- **Post-review calls (owner, same day):** stacked parens stay as-is for
  names that contain parens ("Sakuyamon (X Antibody) (EX8-037)"); and
  `/card`'s choice line should match this format too — that reverses
  the 4.6 "ids only, no names" call and is chunked as **4.6.1** rather
  than folded in here (`/card`'s pure embed builder needs the handler
  to resolve names first).
- **How the names resolve:** related-card **ids** come from the curated
  `CHOICE_PARTNERS` map; their **names** come from the fetched list
  itself — choice restriction is mutual, so every partner appears in
  the same query result, and no hand-maintained name map exists to go
  stale. Degrade ladder: partner id missing from the list → bare id;
  card missing from the map → bare name+id line under the
  still-explanatory subtitle — less info, never wrong info, same
  property as `/card`'s 4.6 fallback.
- **Also (implementation calls):** an unknown future status is **not**
  filtered out by an allowlist — the query excludes only
  `Unrestricted` (NULL) and `Not released`, so anything new lists in its
  own raw-headed section after the known three (surface-don't-hide,
  matching 4.6). The embed title links the official page; footer names
  it in plain text.
- **Volume check (production D1, read-only, 2026-07-07):** 3 banned +
  50 restricted + 5 choice ≈ 1.8k chars — half the 4096-char description
  cap. The guard for a much larger future list is whole-line truncation
  with an "official page has the rest" pointer, snapshot-tested.
- **Revisit if:** the list ever approaches the cap in practice
  (pagination or field-per-section layouts are the escape hatches), or
  a fourth restriction status ships wording-worthy enough to promote
  from the raw fallback into `BANLIST_SECTIONS`.

---

## 2026-07-07 — Jul 7 cron miss diagnosed: Cloudflare reads `2` as Monday; schedule kept (3.6 soak)

- **Diagnosis (owner's dashboard check, the OWNER-TODO "TONIGHT" item):**
  the weekly trigger `0 6 * * 2` was never going to fire Tuesday Jul 7.
  Cloudflare's cron dialect numbers days-of-week from **1 = Sunday**
  (Quartz-style), not Unix cron's 0 = Sunday — the dashboard shows
  "Next: **Mon**, 13 Jul 2026" for that expression, so our `2` means
  **Monday** there. Nothing was skipped and nothing crashed; the
  "trigger re-registered <2h before fire time" theory is retired. The
  only Monday slot so far (Jul 6 06:00) predated the trigger landing, so
  the schedule simply hasn't had a fire yet.
- **Decision (owner):** keep the deployed schedule as-is — the weekly
  sync is **Mondays 06:00 UTC**. This amends the 2026-07-06 entry below:
  the recorded intent moves to match the deployment rather than the
  reverse. No worker redeploy; comments/docs updated instead.
- **Consequence, separately accepted (owner):** the source-contract CI
  job (GitHub cron `0 6 * * 1` — GitHub _is_ Unix dialect, so that one
  really is Monday) now runs the **same hour** as the sync, so the
  "contract check warns a day early" stagger is gone. Accepted because
  the stagger was convenience, not safety: a failed sync alerts through
  its own webhook and can never corrupt data (validation gates + version
  pointer flip).
- **Gate C re-dating:** the two automated runs become **Jul 8** (the
  one-off recovery trigger, unaffected — day-of-month syntax has no
  dialect quirk) + **Jul 13** (first weekly Monday fire, inside the
  Jul 6→13 soak window and a day earlier than the old Jul 14
  expectation).
- **Lesson (HANDOFF §16 "verify at build time" class):** cron
  day-of-week _numbers_ are dialect-specific. Any future schedule edit
  should spell the day by **name** (`MON`, `TUE`) — names mean the same
  thing in every dialect.
- **Revisit if:** the same-hour CI overlap ever masks a drift warning in
  practice, or Monday 06:00 collides with upstream's own update rhythm —
  the ready fix is the one-line Sunday shift of the CI cron that was
  declined this round.

---

## 2026-07-07 — Choice-restriction wording amended: name the partner ids (4.6 follow-up)

- **Decision (owner, amending the same-day call below):** the `/card`
  choice-restriction line names the conflicting card **ids** — e.g.
  BT20-037 renders "⚠️ **Choice restriction** — cannot be in a deck with
  BT17-035 or EX8-037". Informative but minimal: ids only, no names.
- **How:** a tiny curated map, `src/data/restrictions.ts`
  (`CHOICE_PARTNERS`, 5 entries), sourced from the official Banned &
  Restricted page (verified 2026-07-07). The upstream feed still carries
  no partner info, so this is hand-maintained like keywords.ts/releases.ts
  — but a card missing from the map **falls back to the generic group
  wording**, so a stale map degrades to less info, never a wrong pairing.
- **Nuance the map encodes:** the relation is mutual but the groups are
  NOT flat — BT17-035 and EX8-037 each conflict only with BT20-037, not
  with each other (official ruling). Hence per-card partner lists, with
  integrity tests pinning back-references and referential closure.
- **Update path:** when a new choice restriction is announced, add its
  cards to `CHOICE_PARTNERS` (the drift in card _status_ arrives via the
  weekly sync automatically; only the partner mapping is manual).
- **Revisit if:** choice restrictions become frequent enough that manual
  upkeep lags — then push for partner data upstream or scrape the
  official page in the source-contract job.

---

## 2026-07-07 — Restriction display: value survey, storage & wording (chunk 4.6)

- **Value survey (full live dataset, 4,295 records, 2026-07-07):**
  `restrictions.english` is present on every record with exactly five
  values — `Unrestricted` (4,021), `Restricted to 1` (50),
  `Not released` (216), `Banned` (3), and **`Choice Restriction` (5)** —
  the last one not anticipated by the 4.6 scoping. All 8 banned/choice
  cards cross-check exactly against the official Banned & Restricted page
  (digimoncard.com/rule/restriction_card, fetched 2026-07-07): banned =
  BT2-090, BT5-109, EX5-065; choice groups = EX2-007 ↔ EX7-064 and
  BT20-037 ↔ BT17-035/EX8-037 ("may only include one of the pair").
- **Storage:** nullable `restriction` TEXT column (migration 0002), upstream
  English value verbatim, with **`Unrestricted` stored as NULL** (the ~94%
  case) so "has a value" means "worth flagging". `Not released` **is
  stored** (4.7's banlist query excludes it by name, per the roadmap) but
  is display-filtered.
- **Display (owner calls, 2026-07-07):**
  - `Not released` shows **nothing** on `/card` — same as Unrestricted.
  - `Choice Restriction` uses **generic wording** ("decks may include only
    one card from its restriction group") — upstream carries no
    partner-card info, and a hand-maintained pair map was declined.
  - An **unrecognized future value renders raw** (`⚠️ **<value>**`) —
    surfacing a new restriction type beats hiding it.
- **Drift gate:** `restrictions` **promoted to a required field** in the
  adapter contract. The flag is now load-bearing (`/card` warning, 4.7
  banlist); if upstream dropped the field, a tolerant sync would silently
  serve banned cards unflagged — the exact misinformation 4.6 exists to
  fix. Abort loudly instead.
- **Ops note:** production rows read NULL until the first post-migration
  sync repopulates the column — a brief flagless window identical to the
  pre-4.6 state, not a regression.
- **Revisit if:** upstream adds new restriction values (the raw fallback
  will show them; add wording then), regions diverge again (per-region
  columns), or the choice groups grow enough that generic wording stops
  being useful.

---

## 2026-07-07 — Discord verification opens at 75 servers, not 100 (drift-fact check, scopes 5.3/5.5)

- **Finding (re-verified 2026-07-07, part of the HANDOFF §16 / chunk 5.1
  drift facts):** the App Verification flow — including the Stripe Identity
  step — is **gated at >75 servers**, when an "App Verification" tab +
  banner appear on the app's Developer Portal page. **100 servers** is the
  hard freeze (unverified bot can't join server #101 until verified). So
  the ~5-day review clock **cannot be started early** at our current 2 soak
  guilds — the blocker is Discord's own gate, not our code.
- **Consequence (sequencing):** there is only a **75 → 100 server window**
  to submit and clear verification before the freeze. A rollout toward
  ~1,000 servers can blow through 100 during the ~5-day review, freezing
  mid-launch. **Chunk 5.5 (Rollout) must throttle invites:** reach ~75,
  submit, and hold below 100 until the verified badge lands. Chunk 5.3
  amended to note the 75-server floor.
- **Also confirmed:** the 2026 **10,000-user Privileged Intents** rule is
  now separate from server count and **does not apply** to this bot — HTTP
  interactions use no privileged intents. Not a second clock.
- **Startable now (does not need the portal gate):** pre-draft the App
  Verification checklist answers (features + data-storage practices) and
  the ToS/Privacy Policy pages, so 5.3 is submit-and-wait the moment we
  cross 75. Draft answers captured in
  [DISCORD-VERIFICATION.md](DISCORD-VERIFICATION.md).
- **Revisit if:** Discord changes the thresholds again (it has before —
  re-check at rollout time), or the app is somehow able to apply earlier.

---

## 2026-07-07 — Soak user-testing feedback triaged (no scope change)

- **Context:** first outside-tester feedback of the Gate C soak (two
  testers, 2026-07-06 evening). All commands worked; overall reception
  positive.
- **Decisions (owner calls):**
  - **Side-by-side card comparison** (tester request, e.g.
    `/compare card1 card2`) — **parked as chunk 4.4 community input**,
    not a new chunk yet. Build/no-build decided when the parity review
    runs. Feasibility note for then: the `/alt` gallery already does
    multi-embed replies, and Discord's shared-`url` embed trick renders
    up to 4 images side by side.
  - **"Bring back the full card text" preference** (one tester liked the
    pre-4.8 text embed, while agreeing the new form "feels better in some
    ways") — **logged only, no reversal** of the image-first call
    (2026-07-06). One vote for a possible future opt-in text toggle.
    Prerequisite if that ever happens: the dual-card `optionCardEffect`
    data gap in [BUGS.md](BUGS.md) must be fixed first, or the toggle
    ships incomplete text.
  - **Heavier/italic font preference** — not actionable; Discord owns
    embed typography, bots only get markdown. Recorded to close it out.
  - **Keyword-descriptions worry** — tester feared effect-keyword
    definitions were missing; `/keyword` covers this. Read as a
    **discoverability gap**, noted as 4.4 input (candidate: `/help` or
    richer command descriptions).
- **Revisit if:** more soak/launch feedback echoes the text-embed
  preference (strengthens the toggle case) or the compare request
  (promotes it from 4.4 input to its own chunk).

---

## 2026-07-07 — /release renamed /set; /release becomes the upcoming-releases forecast (chunk 4.9 planned)

- **Decision (owner call, parity feedback):** the current set-lookup
  command keeps its exact behavior but is renamed **`/set`** — the
  clearer name for "look up info on a specific set." The **`/release`**
  name is reassigned to match the old bot: a no-argument forward look
  listing every known upcoming set with its release date (screenshot
  evidence from the old bot, 2026-06-28: "Upcoming Releases" bullets
  through March 2027).
- **Why:** parity — to the community, `/release` means the forecast.
  Our set lookup is a genuinely new addition worth keeping, so it moves
  aside rather than out. The forecast **derives entirely from the
  existing curated `releases.ts`** (filter `releasedEN` ≥ today, sort
  ascending): no second dataset, no new maintenance burden beyond the
  file's existing update cadence — explicitly required by the owner
  ("nothing I have to manually babysit"). The old bot's per-set flavor
  lines ("preorders open until…") were almost certainly hand-curated
  and are deliberately out of scope. Staleness degrades safely: an
  un-updated file makes the forecast shorter, never wrong.
- **Timing:** must land before Gate D / global registration — a rename
  is free while commands are guild-only and painful after launch.
- **Revisit if:** the community misses the flavor text (then consider
  sourcing preorder windows officially, still not hand-typed), or
  Bandai's announcement pages ever expose a machine-readable upcoming
  list worth syncing instead.
- **Landed 2026-07-07 — verification findings:** BT-26 (Sep 4), LM-08
  (Aug), LM-09 (Nov) re-confirmed against world.digimoncard.com. The
  old bot's December-onward horizon — BT-27 "Ignition of X",
  ST-25/ST-26 (Digimon Alysion starter decks), EX-14, BT-28, ST-27 —
  has **no official EN product listings yet** (checked both official
  product pages 2026-07-07; only community leak/preview coverage
  exists). Held to the 4.2 convention: official dates only, so none
  were added; OWNER-TODO carries the watch item, and each future
  announcement is a one-line `releases.ts` edit that the forecast picks
  up automatically. Month-only boundary rule: a `YYYY-MM` announcement
  stays in the forecast through its whole month; a full date drops off
  the day after release.

---

## 2026-07-06 — /card goes image-first: title → image (chunk 4.8 planned)

- **Decision (owner call, from real soak-week usage):** the `/card`
  embed drops its stat fields (Type/Color/Level/Play Cost/DP/Rarity)
  and the Effect / Inherited/Security text blocks. New shape: title →
  optional ⚠️ restriction description line (4.6) → card image →
  set-name footer.
- **Why:** everything removed is printed on the card image itself — the
  embed was saying it all twice, and the doubled post is visibly worse
  in a live channel. What stays is exactly what the image does NOT
  carry: the searchable title, the banned/restricted status (4.6's
  warning becomes a description line under the title — owner call),
  and the full set name (footer kept — owner call). The result matches
  `/alt`'s image-first galleries, so the bot's look converges.
- **Trade-offs accepted:** effect text stops being copyable/searchable
  message text and unreadable-image situations (tiny screens, image
  load failures) lose the fallback — the owner weighs channel clutter
  as the bigger cost from actual use. Consequence: the keyword glossary
  becomes the bot's only _text_ rules reference (the 4.1-era rationale
  "`/card` still shows the full printed text" no longer holds —
  keywords.ts comment updated in-chunk), which raises the stakes on
  glossary accuracy; it is already judge-reviewed.
- **Revisit if:** the community asks for the text back (then consider a
  `verbose` option on `/card` rather than re-bloating the default).

---

## 2026-07-06 — /banlist scope: English-only, public, D1-derived (chunk 4.7 planned)

- **Decision (owner calls):** the planned `/banlist` (chunk 4.7) shows
  **English restriction values only** and replies **publicly**. Data
  comes from the `restriction` column chunk 4.6 adds — one D1 query, no
  second source; the official announcement page
  (`/rule/restriction_card`) is the build-time verification source, not
  a scrape target.
- **Why:** the owner (an official Digimon TCG judge) confirms that as
  of **BT-21 the regions converged** — unified set release dates and a
  single unified banned/restricted list — so the English value is the
  whole truth, not a regional slice. This **amends the 4.6 entry's
  "revisit if the community wants Japanese-format legality"**: there is
  no separate JP list to show anymore. Public because a banlist lookup
  usually settles a channel discussion, matching the /card convention
  (hits public, misses ephemeral).
- **Revisit if:** the regions ever diverge again (then add a `format`
  option rather than changing the default), or the list outgrows one
  embed (defined fallback: truncate + point at the official page).

---

## 2026-07-06 — Restriction display becomes chunk 4.6 (official rule-page survey)

- **Decision:** surveying Bandai's official rules hub
  (https://en.digimoncard.com/rule/ — owner-suggested source) added one
  chunk to the roadmap: **4.6 — banned/restricted display on `/card`**.
  The upstream `restrictions` field (per-region object keyed
  `english`/`japanese`/`chinese`/`korean`; values observed in the
  fixture: `Unrestricted`, `Restricted to 1`, `Not released` — plus
  `Banned` expected in the full dataset) is already in the adapter's
  known-fields contract (`digimoncard-app.ts`) but is silently dropped
  before the model, so `/card` shows banned cards with no flag.
- **Why:** for tournament players, a lookup that hides a card's
  banned/restricted status is worse than no lookup — it's
  misinformation, not a gap. The carry-through is cheap (one nullable
  column, one embed line), and the official Banned & Restricted
  announcement page (`/rule/restriction_card`) is the verification
  source for the feed's values.
- **Also found on the rule page (noted, not planned):**
  - **Comprehensive Rules PDF** (v4.1, 2026-06): §16 is the
    authoritative keyword-effects reference — the primary cross-check
    for any future glossary update (the 4.1 glossary predates this
    find). It also settles why two "missing keywords" had no reminder
    text anywhere: **Assembly (§7-3) and Arts Digivolve (§4-19) are
    rules, not keyword effects.** Owner keeps a local copy
    (`D:/Digimon/Rules/general_rule_41.pdf`).
  - **19 official token-card PDFs**: tokens have no card numbers, so
    they're presumably absent from the card feed and `/card` can't
    serve them — a candidate future `/token` command if the community
    asks.
  - **Effective Rule Revisions (errata) page**: unverified whether the
    card feed tracks errata'd text — same correctness class as the
    banlist; check if evidence of drift ever appears.
  - Official Glossary PDF (2023) — superseded by Comprehensive Rules
    §16 for keyword purposes.
- **Revisit if:** the feed's restriction values prove unreliable
  against the official announcements (then flip the source of truth to
  a small curated dataset, `releases.ts`-style), or the community wants
  Japanese-format legality shown too.

---

## 2026-07-06 — Owner reviewed the keywords.ts file

- **Decision (owner call):** Owner (a level 1 Judge for the Digimon TCG) reviewed
  the keywords file and added in the missing keywords/terms.
- **Why:** It needed an accuracy pass, and a decision on whether or not to add in
  the missing terms. Accurate wording on the keywords is critical to the bot's
  usefulness as a rules reference for card keywords.
- **Revisit if:** the rules are updated and new keywords added (or if a keyword ever
  changes its wording. Rare, but it has happened at least once.)

---

## 2026-07-06 — /page: Will Not Do (resolves open decision #3, closes chunk 4.3)

- **Decision (owner call):** `/page` will **not** be built. The chunk is
  closed without code; no command is reserved for it.
- **Why:** nobody could say what the old bot's `/page` actually did — the
  founding spec lists only the name (HANDOFF §1), and every guess implied a
  different build. The project's standing rule applies: shipping a wrong
  guess at a parity feature is worse than an honest gap, and four commands
  (`/card`, `/alt`, `/keyword`, `/release`) already cover the documented
  product ("lookup behavior is the whole product").
- **Revisit if:** the 4.4 parity review or post-launch feedback shows the
  community actually used `/page` and can describe it — that description
  becomes the chunk's missing spec, and the command name is still free.

---

## 2026-07-06 — /release ships curated set data + live D1 tallies (chunk 4.2)

- **Decision:** `/release` looks up a **static, curated dataset**
  (`src/data/releases.ts`, ~71 products) of set codes, official EN names,
  product lines, and English release dates — because the card source
  exposes **no dates at all** (verified: per-card set names only, 122
  distinct strings, mostly promo/event packs). The command adds a live
  D1 tally (cards + printings per set) matched via curated `set_name`
  substrings; its autocomplete is in-memory like `/keyword`'s.
- **Scope:** main product lines only — BT boosters, EX theme/extra
  boosters, ST starter/advanced decks, LM limited packs, RB-01, AD-01, and
  the combined special boosters (BT01-03 ×2, BT18-19, BT19-20) — including
  announced upcoming products (BT-26, EX-13, LM-08/09). Promo, tournament,
  demo-deck, and PB accessory distributions are deliberately excluded:
  they have event windows, not release dates.
- **Sources & conventions:** dates verified 2026-07-06 against the
  official Bandai product listings (world.digimoncard.com/products,
  en.digimoncard.com product pages). `YYYY-MM-DD` = confirmed day;
  `YYYY-MM` = month-only announcement. Regional EN splits use the earliest
  date (ST-11: EU 2022-10-14 vs NA 10-21). LM-01/02 have no matchers —
  upstream files their cards under BT-15's set string, so no tally beats a
  wrong one. Matchers were validated against the full real dataset (every
  entry hits plausible counts; only unreleased BT-26/EX-13 and the
  reprints-only ST-11 hit zero).
- **Why the tally scans:** `set_name` has no index, so the count scans the
  active version — acceptable because it runs per `/release` _invocation_
  only (low volume); the per-keystroke path (autocomplete) is static
  precisely so no D1 query rides it (see the 2026-07-06 index-range entry).
- **Update path:** a new set = one entry in `releases.ts`, same edit
  cadence as the keyword glossary (a few times a year, when sets release).
- **Revisit if:** the community wants promo-pack coverage, upstream starts
  publishing dates (then sync them instead), or the tally's string
  coupling breaks often enough to annoy (counts degrade to "no tally
  shown", never wrong data).

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

> _Amended 2026-07-07 (cron-dialect entry above): Cloudflare reads `2` as
> Monday, so the schedule this entry chose never actually deployed as
> Tuesdays. The owner kept the de-facto Mondays; the stagger rationale
> below no longer holds._

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
#3 (`/page`: Will Not Do), #4 (keyword source), #5 (Team owner), and
#6 (sync cadence).

| #   | Decision                                           | Default until decided              | Needed by |
| --- | -------------------------------------------------- | ---------------------------------- | --------- |
| 7   | Final command names/options parity                 | Mirror old bot                     | Chunk 4.4 |
| 8   | Open-source license (repo goes public post-launch) | MIT unless owner prefers otherwise | Phase 5   |
