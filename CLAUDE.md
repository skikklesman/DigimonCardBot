# DigimonCardBot — Claude session guide

Discord slash-command bot for Digimon TCG card lookup, replacing DigimonTCGBot
(shuts down 2026-07-31). Cloudflare Worker (HTTP interactions, no Gateway) +
D1 card cache with version-pointer sync. Target: ~1,000 servers, ~$0/month,
minimal maintenance.

## Read these before writing code

1. **[HANDOFF.md](HANDOFF.md)** — the founding spec: architecture, data model,
   sync defenses, and the **§15 Do NOT list**. Decisions recorded there are
   deliberate; do not quietly reverse them. Treat this file as read-mostly.
2. **[docs/ROADMAP.md](docs/ROADMAP.md)** — work chunks, the five gates
   (Scaffolding Up / First Playable / MVP / Feature Complete / Launched), and
   the MVP definition. **Find the first unchecked chunk; that's the current
   work.** Check chunks off as they land.
3. **[docs/TECH-DESIGN.md](docs/TECH-DESIGN.md)** — repo layout, module
   boundaries, conventions, and implementation-level guardrails.
4. **[docs/TESTING.md](docs/TESTING.md)** — test plan; every roadmap chunk
   ships with its tests, no exceptions.
5. **[docs/DECISIONS.md](docs/DECISIONS.md)** — decision log + open questions.
   Append when you make a non-trivial choice; check it before re-debating one.

## Hard rules (summary — full list in HANDOFF §15 and TECH-DESIGN §5)

- HTTP interactions only. Never the Gateway, never privileged intents.
- Never `DELETE`+`INSERT` on live card data — version pointer flip only.
- Every read query filters on `active_version`.
- No secrets in the repo, ever (`wrangler secret put` / `.dev.vars`).
- Feed data passes all validation gates before any write.
- Autocomplete responds synchronously — it cannot be deferred.
- New runtime dependencies require a DECISIONS.md entry.

## Workflow expectations

- Update ROADMAP checkboxes and gate dates in the same commit as the work.
- Tests land with the chunk (see TESTING.md for which layer).
- Facts marked "verify at build time" (HANDOFF §16) really do drift — check
  them when a chunk touches them, and note findings in DECISIONS.md.
