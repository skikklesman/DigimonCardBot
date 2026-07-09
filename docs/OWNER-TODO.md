# Owner TODO — human actions & things to check on

> The roadmap tracks the _project's_ work; this file tracks **yours** — the
> operator/owner actions no code can do. Check items off as you do them;
> add new ones as they come up. (Claude: append here when a chunk creates a
> human follow-up, and prune completed sections.)

## Anytime (no deadline, browser is enough)

- [x] **Resync production so card images use the CDN** **Done 7/8 by Claude Opus** (chunk 4.11): the
      image host moved from `raw.githubusercontent.com` (429-rate-limited →
      intermittent blank `/card` images) to jsDelivr. The image URL is
      **materialized into D1**, not computed at read time, so the fix only
      reaches production after a resync rewrites the stored `image_url`
      values. Either trigger `POST /admin/resync` (bearer `RESYNC_TOKEN`, the
      route proven against production) once the chunk is deployed, or just let
      the Monday sync cron do it — until then, live `/card` still serves the
      old raw URLs. Verify after: `/card EX12-047` (Amaterasumon, the
      reported case) shows its image reliably.

- [x] **Judge review of the keyword glossary** (`src/data/keywords.ts`,
      chunk 4.1): the owner is an **official Digimon TCG judge** — review
      all ~45 definitions for rules accuracy (they were compiled from card
      text + community sources, phrased as reminder text, numbers as "N"),
      correct anything imprecise, and supply verified text for the four
      deliberate omissions: `Training`, `Guard`, `Assembly`,
      `Arts Digivolve`. Edit the file directly or dictate corrections in a
      session; either way the dataset-integrity tests (`npm test`) validate
      formatting automatically. Note the review in DECISIONS.md when done —
      "judge-reviewed" is a quality stamp worth recording.

- [ ] **Spot-check the /set dates** (`src/data/releases.ts`, chunk 4.2;
      the command was renamed from /release in 4.9): ~71 sets with EN
      release dates, all pulled from official Bandai product pages on
      2026-07-06 — but a second pair of eyes on a handful you know cold
      (BT-14? the special boosters?) is cheap insurance, same as the
      keyword review. Conventions to know: earliest regional EN date
      wins (ST-11), `YYYY-MM` = announced month only. Note the review in
      DECISIONS.md when done. The same data now also drives the
      /release upcoming-forecast, so a wrong future date is doubly
      visible.
- [ ] **Watch for official EN listings of the announced 2026-12+ sets**
      (chunk 4.9 finding): the old bot forecast BT-27 "Ignition of X",
      ST-25/ST-26 (Digimon Alysion decks), EX-14, BT-28, and ST-27 —
      but none have official EN product pages yet (checked
      world.digimoncard.com + en.digimoncard.com, 2026-07-07; community
      sources say December 2026 onward). Our dataset only takes
      officially posted dates, so when Bandai publishes each listing,
      add its one-liner to `src/data/releases.ts` and the /release
      forecast picks it up automatically. You likely hear about these
      announcements before any webpage does.

- [x] **Enable CI auto-deploys:** **Done 7/9 by Owner** create a Cloudflare API token
      (dash.cloudflare.com → My Profile → API Tokens → template
      _"Edit Cloudflare Workers"_) and add it to the GitHub repo as the
      `CLOUDFLARE_API_TOKEN` Actions secret (repo → Settings → Secrets and
      variables → Actions). The CI job picks it up automatically on the
      next push — no code change. Until then deploys stay manual and CI
      only smoke-checks production.
- [ ] **Vault the resync token:** the `RESYNC_TOKEN` value sits on its line
      in `.dev.vars` on the dev machine (generated remotely 2026-07-06,
      never displayed in any transcript). Copy it into your password
      manager next to the webhook URL.
- [ ] **External uptime ping** _(upgraded from optional 2026-07-06)_: point
      a free pinger (e.g. UptimeRobot) at `GET /health` on the Worker.
      `/health` now returns **503 when card data goes stale**, so a plain
      "is it 200?" ping catches endpoint-down, Cloudflare account problems,
      AND a silently dead cron trigger — the one failure the webhook alerts
      can't report, because they run inside the cron itself (TESTING.md §7,
      DECISIONS.md 2026-07-06). Five browser-minutes. _Upgraded again
      2026-07-07: the Jul 7 cron miss (diagnosed same day as a
      cron-dialect quirk — see the soak section) is exactly this failure
      class happening for real: a cron that silently isn't scheduled when
      you think it is, and only a staleness probe notices — do this
      before Gate C, not before launch._
- [x] **Optional — alert webhook in GitHub:** **Done 7/9 by Owner** add `SYNC_ALERT_WEBHOOK` as a
      repo Actions secret (same URL as the Worker secret) so the Monday
      source-contract job pings your alert channel on failure instead of
      relying on GitHub's failure email.

## During the 3.6 soak (starts when the cron lands)

- [x] **Check the dashboard for the missed Jul 7 cron** _(done
      2026-07-07 — mystery solved, and it's neither a skip nor a crash:
      the dashboard shows "Next: **Mon**, 13 Jul" for `0 6 * * 2`,
      revealing that **Cloudflare numbers cron weekdays from 1 = Sunday**,
      so our `2` means Monday, not Unix cron's Tuesday. The Jul 7 fire
      was never scheduled; the "re-registered <2h before fire time"
      theory is retired. Owner call: keep the de-facto Monday schedule —
      no redeploy, docs/comments updated instead; DECISIONS.md
      2026-07-07.)_
- [x] **Wed Jul 8, after ~06:05 UTC — verify the recovery cron fired** **Done 7/8 by Owner**
      (owner call 2026-07-07: option 1, one-off recovery cron). A
      temporary second trigger `0 6 8 7 *` was deployed 2026-07-07
      16:17 UTC. (The "<2h re-registration" skip theory was retired by
      the cron-dialect diagnosis the same evening — Jul 7 was never
      scheduled; DECISIONS.md 2026-07-07. Later deploys re-registered
      the same triggers; that's harmless.) Check `GET /health`: success
      looks like **`activeVersion: 4`** and a `lastSuccessfulSync` of
      ~2026-07-08T06:00. (v3 is already consumed — the 4.6 session's
      post-migration resync at 18:53 UTC Jul 7 bumped v2→v3, per the
      4.6 roadmap note. Traced and confirmed 2026-07-08.)
      **Fired** → Gate C's two automated runs become Jul 8 + Jul 13 (the
      weekly trigger fires **Mondays** — cron-dialect diagnosis,
      DECISIONS.md 2026-07-07); remove the temp trigger from
      wrangler.toml (delete the one-off entry + its comment), redeploy,
      and confirm only `0 6 * * 2` (Mondays) remains. Any session can do
      this on request. **Skipped again** → a trigger that misses a
      dead-center scheduled fire is a real Cloudflare problem (the
      dialect quirk explains Jul 7, not a Jul 8 miss); escalate to a
      real investigation next session before trusting the Jul 13 run.
- [x] **Re-register commands for the 4.9 rename** _(done 2026-07-07 —
      registered and verified in the soak guilds)_.
- [x] **Add the 2nd soak guild** _(done 2026-07-06 — installed,
      registered, verified)_ (chunk 3.6.1 — do this EARLY in the week
      so the extra traffic counts): ① authorize the app in guild 2 via the
      OAuth2 install link with **only** the `applications.commands` scope
      (no `bot` scope — this bot never has a server member); ② append the
      guild id to `DISCORD_TEST_GUILD_ID` in `.dev.vars`, comma-separated
      (`<current-id>,<guild-2-id>` — id via right-click the server with
      developer mode on); ③ `npm run register` — the script now registers
      every listed guild; ④ verify `/card`, `/alt`, `/keyword`, `/release`
      and autocomplete respond in guild 2, then check 3.6.1 off in the
      roadmap.
- [ ] **Use the bot daily in the test guild** — a few `/card` and `/alt`
      lookups per day for 7 consecutive days; variety beats volume
      (autocomplete picks, free text, an ID, a typo). This is Gate C
      criterion #4. Once guild 2 is live, spread some of the daily use
      there too.
- [x] **After the 4.7 deploy — `npm run register`, then spot-check
      `/banlist`** **Done 7/8 by Owner** (once): the new command needs one registration run to
      appear in the soak guilds. Expect three sections — **Banned** (3:
      BT2-090, BT5-109, EX5-065), **Restricted to 1** (50), **Choice
      restriction** (5, each line naming its related cards) — matching the
      official page linked in the embed title. Judge-eye the section
      wording while you're there; it lives in `BANLIST_SECTIONS` in
      `src/interactions/embeds.ts`.
- [x] **Spot-check the 4.6 restriction flag** **Done 7/8 by Owner** (once, any soak day):
      `/card BT2-090` (Matt Ishida) should show **⚠️ Banned** under the
      title; `/card BT20-037` (Chaosmon: Valdur Arm) should say it
      "cannot be in a deck with Taomon (BT17-035) or Sakuyamon
      (X Antibody) (EX8-037)" — related cards named since the 4.6.1
      deploy; and any everyday
      card no warning line at all. Judge-eye the wording while you're
      there — it's in `src/interactions/embeds.ts` (`RESTRICTION_LINES`),
      and the partner map is `src/data/restrictions.ts` if a pairing
      reads wrong.
- [ ] **Glance at the alert channel daily** — silence is expected; anything
      that appears is soak findings.
- [ ] **After the first two automated crons** (expected Jul 8 one-off +
      Jul 13, the first weekly Monday fire), confirm two ✅ automated
      syncs happened (`/health` timestamp refreshes, or the Cloudflare
      dashboard cron log) — Gate C criterion #2.

## Launch-phase (Phase 5 — before the old bot dies 2026-07-31)

- [ ] **Discord bot verification** (HANDOFF §12; gate detail verified
      2026-07-07, DECISIONS.md): needs your government ID (Stripe Identity),
      review takes ~5 days. The single hardest deadline dependency.
      **You can't start it early** — the "App Verification" tab only
      appears at **>75 servers**; **100 servers** is the hard freeze. That
      leaves a narrow **75→100 window**: submit the moment the tab appears,
      and **throttle invites to stay under 100** until the badge lands (a
      fast rollout can hit 100 during the ~5-day review and freeze). Prep
      the two items below now so submission is instant at 75.
- [ ] **Pre-draft the verification checklist answers** (do anytime before
      75 servers): the App Verification form asks what the bot does and how
      it stores data. Draft answers are ready to paste in
      [DISCORD-VERIFICATION.md](DISCORD-VERIFICATION.md) — review/tweak them
      once, so 5.3 is copy-paste-submit.
- [ ] **License + public README** (DECISIONS open decision): pick a license
      (MIT is the path of least resistance) before flipping the repo
      public.
- [ ] **Community announcement plan**: where/when to tell the old bot's
      communities, invite link distribution.

---

_Completed items: move them to the bottom with a date if they're worth
remembering, otherwise delete._
