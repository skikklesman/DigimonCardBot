# Known bugs

Latent or deferred bugs we've chosen not to fix yet. Each entry says why it's
parked and what would make it matter again. Fix → delete the entry (git keeps
the history).

## Open

### Registry lookups walk the prototype chain on attacker-controlled keys

- **Found:** 2026-07-08, code review of chunk 4.10 (message components).
- **Symptom:** `route()` indexes its handler maps with a key taken straight
  from the interaction — `registry.commands[name]`,
  `registry.autocomplete[name]`, and (new in 4.10)
  `registry.components[namespace]`
  ([src/interactions/router.ts](../src/interactions/router.ts)). These are
  plain object literals, so a crafted key that names an `Object.prototype`
  member resolves to an inherited value instead of `undefined`. `name` /
  `namespace` = `"constructor"` returns the `Object` constructor (a truthy
  function): the `if (!handler)` guard passes, we call it, and it returns a
  non-response object — Discord gets a malformed payload. `"__proto__"`
  returns `Object.prototype` (not callable): for commands/components the
  resulting throw is caught into the friendly error; autocomplete would
  likewise degrade to an empty list.
- **Why parked:** worst realistic outcome is a **malformed-but-non-crashing**
  response to a deliberately malformed, signed request — no crash, no data
  exposure, no unhandled throw escaping `route()`. Discord never sends these
  keys; only a holder of a valid request signature could.
- **Fix (deferred, ~1 line × 3):** guard each lookup with
  `Object.hasOwn(map, key)` before use, or build the three registry maps with
  `Object.create(null)`. Do all three together — the flaw predates 4.10 in the
  command/autocomplete lookups; 4.10 only added a third instance. No behaviour
  change for real traffic, so it's pure hardening.
- **Revisit when:** touching the router's dispatch again, or any hardening/
  fuzz pass (chunk 4.5 is the natural home).

<!-- Fixed 2026-07-08 (chunk 4.10 branch): "Dual cards missing the Option side
in effect" — composeEffect now folds both optionCardColourRequirement (labeled
[Option Requirement]) and optionCardEffect (labeled [Option]). Live data
self-heals on the next weekly sync after deploy. -->
