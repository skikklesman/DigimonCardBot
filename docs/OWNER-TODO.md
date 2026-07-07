# Owner TODO — human actions & things to check on

> The roadmap tracks the _project's_ work; this file tracks **yours** — the
> operator/owner actions no code can do. Check items off as you do them;
> add new ones as they come up. (Claude: append here when a chunk creates a
> human follow-up, and prune completed sections.)

## Anytime (no deadline, browser is enough)

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

- [ ] **Spot-check the /release dates** (`src/data/releases.ts`, chunk
      4.2): ~71 sets with EN release dates, all pulled from official Bandai
      product pages on 2026-07-06 — but a second pair of eyes on a handful
      you know cold (BT-14? the special boosters?) is cheap insurance, same
      as the keyword review. Conventions to know: earliest regional EN date
      wins (ST-11), `YYYY-MM` = announced month only. Note the review in
      DECISIONS.md when done.

- [ ] **Enable CI auto-deploys:** create a Cloudflare API token
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
      DECISIONS.md 2026-07-06). Five browser-minutes; worth doing before
      launch.
- [ ] **Optional — alert webhook in GitHub:** add `SYNC_ALERT_WEBHOOK` as a
      repo Actions secret (same URL as the Worker secret) so the Monday
      source-contract job pings your alert channel on failure instead of
      relying on GitHub's failure email.

## During the 3.6 soak (starts when the cron lands)

- [ ] **Add the 2nd soak guild** (chunk 3.6.1 — do this EARLY in the week
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
- [ ] **Glance at the alert channel daily** — silence is expected; anything
      that appears is soak findings.
- [ ] **After the first two Tuesday crons** (expected Jul 7 + Jul 14),
      confirm two ✅ automated syncs happened (`/health` timestamp
      refreshes, or the Cloudflare dashboard cron log) — Gate C
      criterion #2.

## Launch-phase (Phase 5 — before the old bot dies 2026-07-31)

- [ ] **Discord bot verification** (HANDOFF §12): submit in the Developer
      Portal **well before 100 servers** — needs your government ID,
      review takes ~5 days. The single hardest deadline dependency.
- [ ] **License + public README** (DECISIONS open decision): pick a license
      (MIT is the path of least resistance) before flipping the repo
      public.
- [ ] **Community announcement plan**: where/when to tell the old bot's
      communities, invite link distribution.

---

_Completed items: move them to the bottom with a date if they're worth
remembering, otherwise delete._
