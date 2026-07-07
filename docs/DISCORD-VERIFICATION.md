# Discord App Verification — prep sheet

> Draft answers for the Developer Portal **App Verification** form, so
> submission (roadmap chunk 5.3) is copy-paste-and-go the moment the tab
> unlocks. **The tab only appears at >75 servers**; 100 is the hard freeze
> (DECISIONS.md 2026-07-07). Owner: review and tweak the wording once, then
> leave it here until you cross 75.

## Facts the form will lean on

- **Ownership:** the app is owned by a Discord **Team** (DECISIONS #5), so
  verifying the team owner's identity (Stripe) verifies the app.
- **Interaction model:** HTTP interactions only — no Gateway connection, no
  bot member in any server (installed with `applications.commands` scope
  only). **No privileged intents requested** (HANDOFF §15), so the
  intent-justification prompts should be N/A.
- **What it stores about users:** nothing. See the data-storage answer.

---

## Draft answers

### What does your app do? / Describe your app's features

> DigimonCardBot is a card-lookup bot for the Digimon Trading Card Game. It
> responds to slash commands with card information so players can quickly
> reference cards during discussion and deckbuilding:
>
> - `/card` — look up a card by name or card ID (with autocomplete);
>   replies with the card's image.
> - `/alt` — show a card's alternate-art printings.
> - `/keyword` — explain a rules keyword from a curated glossary.
> - `/set` — look up information about a specific set/release.
> - `/release` — list upcoming Digimon TCG releases.
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

## Companion launch tasks (not part of this form, but reviewers check)

- [ ] **Terms of Service URL** — needed on the app's profile. _(Not written
      yet — DECISIONS open decision; launch-phase task.)_
- [ ] **Privacy Policy URL** — should state plainly that no user data is
      collected/stored (matches the data-storage answer above). _(Not
      written yet.)_
- [ ] **App profile** — description, icon, and links filled in on the
      Developer Portal.

> When the ToS/Privacy pages exist, drop their URLs here so everything for
> 5.3 lives in one place.
