# Phase 2: The Read Path (DRAFT)

_DRAFT — being written as Phase 2 happens; publish (rename with date, add to
the blog README) when Gate B lands. Sections marked TODO await the Gate B
run._

---

## TODO: intro

_Phase 2 in one line: teach the deployed Worker to answer `/card`. Chunks
2.1–2.4 landed 2026-07-05; Gate B ("a human in the test guild types `/card`
and gets a card embed back") pending._

## TODO: 2.1 — the router that cannot crash

_Total function; two error disciplines (ephemeral apology for commands,
silent empty list for autocomplete); registry pattern._

## TODO: 2.2 — the repository with no escape hatch

_Version filter by construction; LIKE injection-safety falling out of name
normalization; the staged-doppelganger isolation test._

## TODO: 2.3 — /card and the resolution ladder

_Token → id → name; the "ADR-01 Jeri" id-shaped-name fall-through; snapshot
contracts; sanitizing echoed input._

## TODO: 2.4 — registration script

_Deploy-time script, never in the Worker; Node 24 native TS, zero new
runtime deps._

## The lockfile that lied (a Windows story, third occurrence)

Chunk 2.4 needed exactly one new dev dependency — `@types/node`, so the
registration script could typecheck its use of `process`. The most boring
install imaginable. The lockfile diff said otherwise: **25 deletions**. For
a types-only _addition_, deletions are wrong on their face.

Here's the mechanism, because this bug family will outlive us all. Packages
like esbuild, workerd, and rollup — all in this project's toolchain via
wrangler and vitest — ship their native binaries as **platform-specific
optional dependencies**: `@esbuild/win32-x64` on the dev machine,
`@esbuild/linux-x64` on CI, plus WASM fallback helpers like `@emnapi/*`. A
correct lockfile lists _every_ platform's variant so that any machine can
install from it.

But when you run `npm install <new-package>` on Windows, npm rebuilds its
picture of the dependency tree partly from what's physically in
`node_modules` — where the Linux and macOS variants naturally aren't,
because Windows never installs them. Under the right conditions, npm
concludes those entries are stale and quietly prunes them while writing the
update. Nothing fails locally; Windows never needed them. The commit looks
innocent. Then CI on Linux runs `npm ci` — which installs exactly what the
lockfile says, that being its entire job — and breaks, one platform and one
commit away from the cause.

This was the project's **third** time. The git history tells a compact
learning story: on July 4th a session first tried hand-restoring the
dropped entries (don't — you can't reconstruct integrity hashes by hand),
then learned the real remedy and wrote it into TECH-DESIGN §4: delete
`package-lock.json` and `node_modules`, fresh `npm install` — a from-scratch
resolve queries the registry for full cross-platform metadata and writes a
complete lockfile. So when it struck today, the response was mechanical: a
before/after grep showed `@emnapi` references dropped from 14 to 9,
regenerate, verify 14 restored, and CI's Linux `npm ci` supplied the real
proof, in green.

One bit of slapstick on the way: the `rm -rf node_modules` failed with
"device or resource busy" — six zombie `wrangler dev` processes from
earlier chunks were still holding file handles. Windows file locking,
making a cameo in its own incident.

The recurrence outlook is the interesting part. **Per install-event, treat
it as expected behavior, not bad luck** — three-for-three on this machine.
Per _month_, the exposure is low by design: the zero-runtime-dependency
policy makes new packages rare (each needs a written DECISIONS
justification anyway), the toolchain is complete for the roadmap, and
there's no auto-update bot creating surprise lockfile churn. The realistic
future trigger is a toolchain upgrade months from now, likely by someone
who didn't live through this — which is why the defense is written
procedure plus a CI backstop rather than anyone's memory. Today added one
refinement: after any install on Windows, check the lockfile diff
_immediately_ — an addition that produces deletions is the tell, and
catching it pre-push beats catching it in a red CI run.

(If installs ever become frequent: run them in WSL or CI, or switch to
pnpm, whose lockfile model is largely immune. Neither is worth the churn
for a few-times-a-year event with a five-minute documented recovery.)

## TODO: Gate B — First Playable

_The manual script in the test guild; production D1 population; deploy;
what a human saw._

## TODO: scoreboard & reflections
