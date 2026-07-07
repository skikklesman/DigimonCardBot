# Known bugs

Latent or deferred bugs we've chosen not to fix yet. Each entry says why it's
parked and what would make it matter again. Fix → delete the entry (git keeps
the history).

## Open

### Dual cards missing the Option side in `effect` (data bug)

- **Found:** 2026-07-07, user testing during the Gate C soak.
- **Symptom (retired):** the pre-4.8 `/card` text embed showed no Option-side
  text for dual cards. That display path was removed in chunk 4.8
  (image-first), so nothing user-visible is wrong today.
- **Root cause (still live):** the sync adapter's `composeEffect`
  ([src/sync/adapter/digimoncard-app.ts](../src/sync/adapter/digimoncard-app.ts),
  `EFFECT_SUPPLEMENTS`) folds `dualEffect`, `aceEffect`, `linkEffect`, etc.
  into `effect`, but never folds `optionCardEffect` (or
  `optionCardColourRequirement`) — both are listed as *known* upstream fields
  and then dropped. So the Option side of a dual card is absent from the
  stored `effect` in D1, not just from the old embed.
- **Revisit when:** anything renders or searches card *text* again — a text
  toggle on `/card`, effect-text search, or if 4.6/4.7 ever quote effect text.
  The fix is small (add `optionCardEffect` to the fold + adapter test with a
  dual-card fixture); data self-heals on the next weekly sync after deploy.
