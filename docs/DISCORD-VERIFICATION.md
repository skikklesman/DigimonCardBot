# Discord App Verification — prep sheet

> Draft answers for the Developer Portal **App Verification** form, so
> submission (roadmap chunk 5.3) is copy-paste-and-go the moment the tab
> unlocks. **The tab only appears at >75 servers**; 100 is the hard freeze
> (DECISIONS.md 2026-07-07, re-confirmed 5.1 on 2026-07-10). Owner: review and
> tweak the wording once, then leave it here until you cross 75.
>
> **Refreshed 2026-07-10** for the current command set (chunk 4.12 retired
> `/alt` into `/card`; `/banlist` added) and the 5.1 drift-fact check.

## Facts the form will lean on

- **Ownership:** the app is owned by a Discord **Team** (DECISIONS #5), so
  verifying the team owner's identity (Stripe) verifies the app. The Stripe
  government-ID check is the one genuinely human, ~5-day step.
- **Interaction model:** HTTP interactions only — no Gateway connection, no
  bot member in any server (installed with `applications.commands` scope
  only). **No privileged intents requested** (HANDOFF §15), so the
  intent-justification prompts are N/A. _(5.1, 2026-07-10: Discord moved
  intent review to a 10,000-**user** threshold in 2026 — but that never
  touches us, because we request no intents at any scale. Bot verification at
  100 **servers** is a separate process and is unchanged.)_
- **What it stores about users:** nothing. See the data-storage answer.

---

## Draft answers

### What does your app do? / Describe your app's features

> DigimonCardBot is a card-lookup bot for the Digimon Trading Card Game. It
> responds to slash commands with card information so players can quickly
> reference cards during discussion and deckbuilding:
>
> - `/card` — look up a card by name or card ID (with autocomplete); replies
>   with the card's image, flags any banned/restricted status, and lets you
>   page through the card's alternate-art printings.
> - `/keyword` — explain a rules keyword from a curated glossary.
> - `/set` — look up information about a specific set/release.
> - `/release` — list upcoming Digimon TCG releases.
> - `/banlist` — list the currently banned and restricted cards.
>
> It uses HTTP interactions only (no Gateway connection) and is not a member
> of any server — it is installed with the `applications.commands` scope
> only. It exists to replace a retiring community bot (DigimonTCGBot) for its
> core card-lookup use case.

### How does your app store or use user data? / Data storage practices

> The bot stores **no user data**. It does not read message content, does
> not log or persist any user identifiers, and performs no analytics on
> users. Each interaction is handled statelessly.
>
> The only data it stores is a **public Digimon TCG card database** (card
> names, text, images, set info), cached in a Cloudflare D1 database and
> refreshed on a weekly schedule from a public community card dataset. No
> personal data is collected, stored, shared, or sold.

### Which Privileged Intents does your app use, and why?

> None. The bot uses HTTP interactions (a signed request/response endpoint)
> and holds no Gateway connection, so it requests no Gateway intents and no
> privileged intents. It has no bot member in servers and never reads
> message content, presence, or member lists.

### Why are you requesting verification?

> To allow the bot to scale past 100 servers. It is replacing a community
> bot that is shutting down, and we expect to be invited to a large number
> of Digimon TCG community servers during rollout.

---

## Required before submitting (these GATE 5.3 — get them ready pre-75)

The verification form itself asks for a **Privacy Policy URL** and a **Terms of
Service URL** on the app profile; without them the submission can't go through.
These are the real long-poles, not the answer wording above — so line them up
before crossing 75 servers, not after.

- [x] **Privacy Policy — drafted** ([docs/PRIVACY.md](PRIVACY.md), 2026-07-10):
      states plainly the bot collects/stores no user data. **Still to do:** fill
      the `[CONTACT]` placeholder, set the effective date to the publish date,
      publish it to a public URL (GitHub raw/Pages once the repo is public, or a
      README section), then paste the URL below.
- [x] **Terms of Service — drafted** ([docs/TERMS.md](TERMS.md), 2026-07-10):
      short, standard as-is/no-warranty/acceptable-use, with the
      not-an-official-rules-source disclaimer. **Still to do:** fill the
      `[JURISDICTION]` and `[CONTACT]` placeholders, publish to a public URL,
      paste it below.
- [ ] **App profile** — description, icon, and links filled in on the Developer
      Portal (human, one-time; uses the "what does your app do" text above).
- [ ] **License + public README** (launch-phase open decision) — the repo goes
      public around launch; the Privacy Policy / ToS can live in it, which folds
      two tasks into one.

> When the ToS/Privacy pages exist, drop their URLs here so everything for 5.3
> lives in one place.

## When the tab unlocks (>75 servers) — submission checklist

1. Fill the app profile (description/icon/links) if not already done.
2. Paste the Privacy Policy + ToS URLs.
3. Paste the "what does your app do" and data-storage answers above.
4. Intents section → **None** (see the intents answer).
5. Complete the **Stripe identity verification** (team owner, government ID) —
   the ~5-day human step; start it the moment the tab appears.
6. Submit, then **throttle invites** so verification clears before server #100
   (5.5 / DECISIONS 2026-07-07).
