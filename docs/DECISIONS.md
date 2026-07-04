# Decision Log

> Append-only. One entry per non-trivial decision, newest at the top. Each
> entry: date, decision, why, and what would make us revisit it. The founding
> architectural decisions live in [HANDOFF.md](../HANDOFF.md) §4 and are not
> repeated here — this log starts where HANDOFF ends.
>
> Open decisions awaiting a human call are tracked in the section at the
> bottom; move them up into the log when resolved.

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

Carried from HANDOFF §14 plus new ones raised by the roadmap:

| # | Decision | Default until decided | Needed by |
|---|---|---|---|
| 1 | Card data source (niamu vs digimoncard.io/.dev) | Evaluate in chunk 1.2 | Chunk 1.2 |
| 2 | `/alt` in MVP or Phase 4? | In MVP (per HANDOFF §1 product goal) | Gate C |
| 3 | What does the old bot's `/page` actually do? | Ask community | Chunk 4.3 |
| 4 | Keyword data source for `/keyword` | Small static dataset in repo | Chunk 4.1 |
| 5 | Discord app owner: Team vs personal | Team (per HANDOFF §14) | Chunk 0.5 |
| 6 | Sync cadence | Weekly Mon 06:00 UTC (HANDOFF §10) | Chunk 3.6 |
| 7 | Final command names/options parity | Mirror old bot | Chunk 4.4 |
| 8 | Open-source license (repo goes public post-launch) | MIT unless owner prefers otherwise | Phase 5 |
