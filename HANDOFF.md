# Digimon TCG Lookup Bot — Architecture & Handoff

> Purpose: build a Discord slash-command bot that looks up Digimon TCG cards, to
> replace **DigimonTCGBot** (shutting down July 31). Target scale ~1,000 servers.
> This is community infrastructure: it must be cheap, low-maintenance, and able to
> outlive any single maintainer's attention.

This document is the spec. It records not just *what* to build but *why* each
decision was made, so the implementation doesn't quietly reverse a choice that was
deliberate. Read the "Key decisions" and "Do NOT" sections before writing code.

---

## 1. Goal & context

The bot being replaced is a fan-made card-lookup bot for the Digimon TCG (2020).
Its core commands were `/card`, `/alt`, `/release`, `/keyword`, `/page`. Users type
a card name (or ID like `EX1-066`) and get an embed with the card image and text.
That lookup behavior is the whole product. Everything else is optional polish.

The replacement should feel familiar to that community: fast card lookup by name or
ID, alt-art support, and clean image embeds.

---

## 2. Constraints & scale

- **Scale:** design for ~1,000 servers. This is *small* by Discord standards — no
  sharding is required (sharding is only forced above ~2,500 guilds).
- **Budget:** aim for ~$0/month (or close to it). This is achievable on Cloudflare's free tier.
- **Maintenance:** minimize always-on processes and babysitting. Prefer serverless.
- **Durability:** the card data must refresh as new sets release, without manual
  data entry, and a bad refresh must never take the bot down.

---

## 3. Architecture overview

Two fully independent paths that share exactly one thing: the card cache (a D1
SQLite database). They never interact at runtime.

**Request path** (runs per slash command):
```
Discord  --POST /interactions-->  Worker.fetch()  --read-->  D1 (card cache)
Discord  <----reply-------------  Worker.fetch()
```

**Sync path** (runs on a cron schedule):
```
Cron trigger --> Worker.scheduled() --> fetch card source --> validate
             --> load new version into D1 --> verify --> flip version pointer
```

Both handlers live in **one Cloudflare Worker** (a Worker can export both a `fetch`
handler and a `scheduled` handler), sharing the same D1 binding. One project, one
deploy, one config. The sync writes; the request path only ever reads. Because they
communicate solely through the cache, a broken sync can never break lookups — at
worst, lookups serve slightly stale (but correct) data.

---

## 4. Tech stack & why

| Concern | Choice | Why |
|---|---|---|
| Interaction model | **HTTP Interactions** (not Gateway) | Lookups are stateless and interaction-only. No persistent connection to keep alive; serverless-friendly; needs **zero privileged intents**. |
| Compute | **Cloudflare Workers** | Natural home for HTTP interactions. Scale-to-zero, edge latency, generous free tier. One Worker holds both request + sync handlers. |
| Card cache | **Cloudflare D1 (SQLite)** | Supports both access patterns we need: exact lookup (`WHERE card_id = ?`) and name search (`WHERE search_name LIKE ?`). A KV store can't do search well. |
| Card images | **Not re-hosted** | Store the image URL in D1; let Discord embed it from the source host. No object storage needed unless the source blocks hotlinking (solve later if it happens). |

### Why HTTP interactions over the Gateway (important — do not reverse)

The Gateway requires an always-on process holding a WebSocket open 24/7, plus (for
anything reading message text) the Message Content privileged intent. HTTP
interactions need none of that: Discord POSTs each slash command to our endpoint and
we reply in the HTTP response. This makes the bot serverless, cheaper, and simpler
to verify with Discord.

**Trade-off we accepted:** HTTP interactions can *only* receive
interaction events (slash commands, buttons, modals). They cannot react to plain
messages — so no `[[bracket]]`/`!prefix` text lookups and no auto-posting when a new
set drops. If the community later demands text-prefix commands, that requires a
*separate* small Gateway process with the Message Content intent (and pushes us over
the 10k-user privileged-intent review). Keep the two concerns separable so that can
be bolted on without a rewrite. Default plan is slash-only.

---

## 5. Data model (D1)

Version-pointer design: every card row is tagged with a dataset `version`. New syncs
load rows under the *next* version number alongside the current data; the cutover is
a single write that flips the active version. This makes promotion atomic and
rollback trivial. No separate staging table is required — old and new versions
coexist in the same table until the pointer flips.

```sql
-- Single control table: version pointer + sync health.
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Expected rows:
--   ('active_version', '3')
--   ('last_successful_sync', '2026-07-01T06:00:00Z')

-- One row per printing (card id + variant, e.g. normal vs. Championship-gold).
CREATE TABLE IF NOT EXISTS cards (
  version     INTEGER NOT NULL,               -- dataset version this row belongs to
  card_id     TEXT    NOT NULL,               -- e.g. 'EX1-066'
  variant     TEXT    NOT NULL DEFAULT '0',   -- distinguishes alt-arts / printings
  name        TEXT    NOT NULL,
  search_name TEXT    NOT NULL,               -- normalized lowercase, for LIKE search
  card_type   TEXT,                           -- Digimon / Tamer / Option / Digi-Egg
  color       TEXT,
  level       INTEGER,
  play_cost   INTEGER,
  dp          INTEGER,
  effect      TEXT,
  inherited   TEXT,                           -- inherited / security effect text
  set_name    TEXT,
  rarity      TEXT,
  image_url   TEXT,
  PRIMARY KEY (version, card_id, variant)
);

CREATE INDEX IF NOT EXISTS idx_cards_search ON cards(version, search_name);
```

**Reads always filter on the active version**, e.g.:
```sql
SELECT * FROM cards
WHERE version = (SELECT value FROM meta WHERE key = 'active_version')
  AND search_name LIKE ?;
```

After a successful flip, garbage-collect old versions but keep the immediately prior
one for rollback: `DELETE FROM cards WHERE version < <active_version - 1>`.

---

## 6. Request path — implementation notes

### 6.1 Ed25519 signature verification (get this first)

Every interaction Discord sends is signed. The endpoint **must** verify the
`X-Signature-Ed25519` and `X-Signature-Timestamp` headers against the app's public
key, and must answer Discord's `PING` (type `1`) with a `PONG` (type `1`). Discord
fires a test PING the moment you save the Interactions Endpoint URL in the Developer
Portal — if verification isn't working, **you cannot even save the URL**.

**Milestone 1 is therefore: a stub Worker that verifies signatures and answers PING,
and a successfully saved interactions endpoint.** Build everything else on top of
that.

### 6.2 The 3-second rule

Discord expects a response within 3 seconds. Because everything runs at the edge and
a single-card D1 read is fast, respond **directly** with a `CHANNEL_MESSAGE_WITH_SOURCE`
(type `4`) — no deferral needed. Only use a deferred ack (type `5`) + follow-up
webhook if a handler ever has to reach a slow external service mid-request (the cache
design specifically avoids this).

### 6.3 Response shape

Return an embed containing the card image (`image_url`) and the card text. Handle
"card not found" and "multiple matches" gracefully (e.g. return the closest matches
for the user to disambiguate).

### 6.4 Autocomplete (name suggestions as the user types)

The `card-name` option uses live autocomplete: typing `goldr` should offer
`Goldramon (BT-16)`, `Goldramon (EX3)`, etc. This works over HTTP interactions with no
architecture change — autocomplete is simply a **third interaction type** arriving at
the same endpoint, alongside PING and the command itself. The request handler must
therefore branch on interaction type:

- `PING` (type 1) → `PONG` (type 1)
- `APPLICATION_COMMAND` (type 2) → run the command, reply (type 4)
- `APPLICATION_COMMAND_AUTOCOMPLETE` (type 4) → reply with choices
  (`APPLICATION_COMMAND_AUTOCOMPLETE_RESULT`, type 8)

**Hard constraint — autocomplete cannot be deferred.** Unlike a normal command, there
is no ack-now-follow-up-later option: you must return choices synchronously within the
3-second window. This is exactly why the local D1 cache exists — Discord's own guidance
for API/DB-backed suggestions is to keep a local cache, and a prefix query against D1 at
the edge returns in milliseconds. (This is also why the "call the external card API per
request" option was rejected: autocomplete would have hammered that API on every
debounced keystroke across ~1,000 servers.) Note the interaction is **debounced** by
Discord — it fires on a typing pause, not per keystroke — so volume is manageable.

**Query:** prefix match, index-friendly, capped at 25:
```sql
SELECT card_id, variant, name, set_name FROM cards
WHERE version = (SELECT value FROM meta WHERE key = 'active_version')
  AND search_name LIKE ?     -- bind 'goldr%'  (prefix; uses idx_cards_search)
LIMIT 25;
```
Start with prefix (`goldr%`). Substring (`%goldr%`) is more forgiving but cannot use
the index — only switch if users ask for it.

**Choice construction — label vs. value (important):**
- `name` (the label shown) = human string, e.g. `"Goldramon (BT-16)"` — format as
  `"{name} ({set_name})"` so distinct printings are distinguishable.
- `value` (what Discord submits when picked) = a **stable identifier**, e.g.
  `"{card_id}|{variant}"` — never the display name. This gives the command handler an
  unambiguous "this exact printing" instead of forcing a re-resolve by name.

**Edge cases:**
- Cap at 25. If a prefix matches more, prioritize (exact name-prefix first, then
  broaden) rather than truncating arbitrarily.
- Suggestions are **not enforced** — the user can still submit free text that wasn't in
  the list. So the `/card` command handler (§6.3) must handle a `card-name` value that
  isn't a clean `card_id|variant` hit: fall back to a name search, and return
  not-found / closest-matches if needed.

---

## 7. Command registration (separate, occasional step)

Registering slash commands is **not** a runtime action. It's a standalone script — a
`PUT` to `https://discord.com/api/v10/applications/{app_id}/commands` with the
command definitions — run only when command definitions change.

- Develop against a **single test guild** (guild commands update instantly).
- Switch to **global** registration for launch (global commands can take up to ~1h
  to propagate).
- Keep the script in the repo, but note it runs from a dev machine or CI step, not
  inside the Worker.
- The `card-name` option (and any other name-searched option) must be defined with
  `autocomplete: true` in its command definition — that flag is what makes Discord send
  the autocomplete interactions handled in §6.4. Options with `autocomplete: true`
  cannot also declare static `choices`.

Command set to mirror the old bot: `/card`, `/alt`, `/keyword`, `/release`, `/page`
(final list is an open decision — see §12).

---

## 8. Sync path — robust transform-and-upsert

Treat the incoming feed as guilty until proven innocent. Validation gates come
*before* any write; the live data is never touched until the new dataset has cleared
every check; the final cutover is atomic.

### Defense 1 — fetch defensively
Check HTTP status (a 200 is not guaranteed — could be a 503 or an HTML error page),
set a timeout, and retry a couple of times with backoff on transient failures. If the
fetch never succeeds, **abort**: the live cache is untouched and lookups keep serving
the current data.

### Defense 2 — validate the whole batch before any write
- **Shrink guard (highest value):** compare incoming card count to the current live
  count; refuse the update if it dropped more than ~10%. This single check neutralizes
  the catastrophic cases (empty array, truncated response, error page parsed as junk).
  A legitimate update never removes most of the pool.
- **Per-record validation:** coerce each card into the schema; require at least a
  stable ID and name. Drop/quarantine individual malformed cards but **count** them —
  a spike in drops is itself a signal.
- **Schema-drift detection:** if expected fields are absent across the board, the
  upstream changed format — abort and alert rather than writing nulls everywhere.
- Distinction that matters: *one bad card* → skip it; *the whole feed is wrong* →
  abort the batch.

### Defense 3 — idempotency via upsert on a stable key
Every write is `INSERT ... ON CONFLICT DO UPDATE`, keyed on `(card_id, variant)`
within the new version. Running the sync twice yields the same state as running it
once, so retries are safe. **Never** use an auto-increment row id as identity — that
makes re-runs create duplicates.

### Defense 4 — atomic promote (this beats partial failure)
Load all new rows under the next version number, verify them, then **flip the
`active_version` pointer in a single write**. Readers filter on the active version, so
they never observe a half-written state, no matter how many rows were loaded.
Rollback = flip the pointer back to the prior version.

### Defense 5 — observe & alert
Write `last_successful_sync` on every successful promote. Announce failures to a
private Discord webhook (free, no extra infra). A good abort produces *no visible
change*, so without this a silently failing sync could serve stale data for weeks.
Alert if `last_successful_sync` goes stale past the expected cadence.

### ⛔ Anti-pattern — never do this
`DELETE FROM cards; INSERT ...` on the **live** table. If the insert fails after the
delete, you serve an empty table to every server. The version-pointer design exists
specifically to avoid this.

### Worker-limits escape hatch
A scheduled Worker has a bounded CPU/time budget. A few-thousand-row Digimon pool
should load in one invocation with chunked/batched upserts. If the dataset ever
outgrows a single run, load staging rows across multiple cron runs (each chunk is
idempotent) and flip the pointer only once loading is complete. Cloudflare Queues or
a Durable Object can drive that later — do not add this complexity on day one.

### Optional manual resync
Expose a tiny **authenticated** route on the `fetch` handler that triggers the same
sync logic on demand, for when a set drops and you don't want to wait for the cron.

---

## 9. Card data source

The bot consumes a card *dataset* over a defined boundary; it must not care how the
data was produced, so the source is swappable.

- **Primary candidate:** `niamu/digimon-card-game` — scrapes official Bandai sources
  and produces a normalized card database + JSON:API, multi-language.
- **Alternatives / fallback:** `digimoncard.io` / `digimoncard.dev` community APIs.
- Keep the source behind a small adapter module so swapping it (if one dies) is a
  localized change, not a rewrite.

> ⚠️ Verify the current status, licensing, and rate limits of whichever source you
> choose at build time — these projects change.

---

## 10. Secrets & config

Secrets go in via `wrangler secret put NAME` — **never in the repo**. A committed bot
token is compromised instantly (Discord auto-invalidates tokens it detects on GitHub).

Required secrets:
- `DISCORD_PUBLIC_KEY` — signature verification
- `DISCORD_BOT_TOKEN` — command registration + any follow-up messages
- `DISCORD_APP_ID` — command registration
- `SYNC_ALERT_WEBHOOK` — failure alerts (optional but recommended)
- `ADMIN_RESYNC_TOKEN` — guards the manual-resync route (if implemented)

`wrangler.toml` sketch (bindings + schedule only; no secrets):
```toml
name = "digimon-tcg-bot"
main = "src/index.ts"
compatibility_date = "2026-01-01"

[[d1_databases]]
binding = "DB"
database_name = "cards"
database_id = "<from `wrangler d1 create cards`>"

[triggers]
crons = ["0 6 * * 1"]   # Mondays 06:00 UTC — adjust cadence as desired
```

---

## 11. Cost

At ~1,000 servers doing card lookups, request volume and D1 reads should sit inside
Cloudflare's free tier — realistically **$0/month**. Verify current free-tier limits
at build time, but the design target is zero recurring cost.

---

## 12. Discord verification & rollout (HUMAN actions — not code)

These require a person and, in one case, a government ID. Plan around them.

- **Bot verification is required at 100 servers.** An unverified bot is **frozen from
  joining new servers once it hits 100** until verified. Verification is identity
  verification of the bot owner via Stripe Identity (government ID); if the app is
  owned by a Discord **Team**, verifying the owner verifies the team. Historically a
  ~5-day review.
- **Privileged intents approval is NOT needed.** HTTP interactions use no privileged
  intents, and that approval is now gated on a 10k-user threshold anyway.
- **Sequencing gotcha:** because the bot freezes at server #100, submit for
  verification **before** mass-inviting to ~1,000 servers, or the rollout stalls.

> ⚠️ Re-verify the exact current thresholds and process at rollout time — Discord has
> changed these before.

---

## 13. Build order (milestones)

Execute roughly in this order; each milestone is independently testable.

1. **Stub Worker + signature verification.** Answers PING (type 1) with PONG.
   Save the Interactions Endpoint URL successfully. *(Gate: URL saves.)*
2. **D1 setup.** `wrangler d1 create`, apply the schema, seed the `meta` table with
   `active_version = 0`.
3. **Sync job (populate).** Implement fetch → validate (with shrink guard) → load new
   version → verify → flip pointer → write `last_successful_sync`. Run once to
   populate. *(Gate: cards table has a full, versioned dataset.)*
4. **`/card` read path.** Lookup by name and by ID, filtered on active version;
   return an image embed. Handle not-found and multiple-matches. Handle a
   `card-name` value that came from a free-text entry rather than a picked suggestion.
5. **Autocomplete for `card-name`.** Add the autocomplete interaction branch (§6.4):
   prefix query on `search_name`, ≤25 choices, label = `Name (Set)`, value =
   `card_id|variant`. *(Gate: typing `goldr` offers the Goldramon printings.)*
6. **Register commands to a test guild.** Iterate on the full command set. Remember
   `autocomplete: true` on the `card-name` option.
7. **Additional commands** (`/alt`, `/keyword`, `/release`, `/page`) as scoped.
8. **Observability.** Wire failure alerts to the private webhook; confirm stale-sync
   alerting.
9. **Go global + verify.** Flip command registration to global. Submit for Discord
   bot verification **before** crossing 100 servers. Then roll out.

---

## 14. Open decisions for the human

- **Slash-only vs. future text commands.** Default is slash-only (see §4). Confirm the
  community doesn't hard-require `[[bracket]]`/prefix lookups before committing.
- **Card data source.** niamu vs. digimoncard.io/.dev — pick one, verify its status.
- **Sync cadence.** Weekly is a fine default; tighten around set-release windows.
- **Final command set + names/options.** Mirror the old bot as closely as the
  community expects.
- **Owner/Team for verification.** Decide who holds the verified identity (a Team is
  recommended for community infrastructure so it isn't tied to one person).

---

## 15. Do NOT (guardrails)

- Do **not** switch to the Gateway model or add privileged intents "to be safe" — it
  defeats the serverless/cost/verification design. (§4)
- Do **not** `DELETE FROM cards` then `INSERT` on the live table. Use the version
  pointer. (§8)
- Do **not** commit the bot token or any secret. Use `wrangler secret put`. (§10)
- Do **not** re-host card images without cause. Store the URL. (§4)
- Do **not** write incoming feed data straight to the live cache — it must pass the
  validation gates first. (§8)
- Do **not** trust that a fetch returned good data because it returned 200. (§8)

---

## 16. Re-verify at build time (facts that drift)

- Cloudflare Workers / D1 free-tier limits.
- Discord verification thresholds and process, and the current API version
  (`/api/v10` shown here).
- Status, licensing, and rate limits of the chosen card-data source.
- Discord's current interaction response type numbers and endpoint paths.
