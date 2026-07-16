# TECH-DIRECTION.md — working agreements

> **Read this before starting a chunk, and again before any commit.**
> [TECH-DESIGN.md](TECH-DESIGN.md) says how the _code_ is shaped; this file
> says how the _work_ is done. It exists to keep us from re-falling into
> pitfalls we've already paid for once. When a new pitfall bites, add an
> entry in the same commit as the fix: what to do, and which pitfall it
> prevents.

---

## 1. Commits go through a message file — never inline `-m`

**Practice:** write every commit message to a `commitmsg.txt` in the
session scratchpad (never inside the repo — it must not risk being
committed), then commit with:

```
git commit -F <scratchpad>\commitmsg.txt
```

**Pitfall prevented:** Windows PowerShell 5.1 mangles multi-line commit
messages passed via `-m` — embedded double quotes split the message into
stray arguments and the commit fails with cryptic `pathspec` errors (or
worse, succeeds with a mutilated message). This has bitten more than once
(established 2026-07-07). The message file sidesteps quoting entirely and
also makes the message reviewable before the commit happens.

Message format stays the same as always: summary line, blank line, body
explaining the why, plus the `Co-Authored-By: Claude …` trailer when
Claude authored the commit.

## 2. Feature work happens on a branch, never on master

**Practice:** every chunk — no matter how small — follows this cycle
(established 2026-07-07):

1. **Branch** from an up-to-date master, named for the chunk:
   `git checkout master && git pull`, then `git checkout -b banlist-dev`
   (the `<topic>-dev` suffix is the convention).
2. **Commit** work on the branch (through the message file, per §1).
   Branch commits are working commits — they can be small and frequent;
   the squash at the end makes the master history clean regardless.
3. **Push** the branch: `git push -u origin banlist-dev`. Every branch
   push runs the CI checks job (typecheck/lint/format/test); the
   deploy + smoke job only ever runs on master pushes, so branch pushes
   are deploy-safe by construction.
4. **Iterate**: more changes → repeat 2–3.
5. **Refresh from master before merging**: on the branch,
   `git merge master` (after updating local master). Resolve any
   conflicts _here in the branch_, never on master, and re-run the test
   gate after resolving.
6. **Squash-merge to master** once green and owner-approved:
   ```
   git checkout master
   git merge --squash banlist-dev
   git commit -F <scratchpad>\commitmsg.txt
   git push
   ```
   `git merge --squash` collapses all branch commits into one staged
   change, so "squash the commits" and "merge to master" are a single
   motion — one chunk, one master commit. (The alternative squash tool,
   `git rebase -i`, is interactive and unavailable in Claude's harness;
   don't reach for it.)
7. **Delete the branch**, local and remote:
   `git branch -D banlist-dev` and `git push origin --delete banlist-dev`.
   (`-D` rather than `-d` because after a squash-merge, git can't tell
   the branch is merged — its commits aren't literally on master.)

**Pitfalls prevented:** half-finished chunks sitting on master (which CI
deploys from, once auto-deploy is enabled); tangled multi-chunk diffs;
conflict resolution performed on the deployable branch.

**Owner checkpoint:** the feedback moment is **before the squash-merge to
master** (step 6) — that's when wording, behavior, and docs get the
owner's eyes. Branch commits (step 2) don't each need a check-in.

## 3. Line endings are LF everywhere — `.gitattributes` enforces it

**Practice:** the repo-root `.gitattributes` (`* text=auto eol=lf`) makes
every checkout produce LF, on Windows too. Don't fight it with
`core.autocrlf` overrides, and don't hand-write CRLF files.

**Pitfall prevented:** the first lap of the branch workflow (2026-07-08)
ended with 16 "modified" files nobody had touched — Windows' default
`autocrlf` conversion rewrote the working tree to CRLF during the
checkout/merge dance, producing phantom diffs (which, at the time, also
failed the since-removed CI format check). The rule still earns its keep
without that check: pinned to LF, the working tree matches what git and CI
see on Linux, so `git status` stays honest and diffs stay real.

## 4. The pre-merge gate (existing rhythm, now written down)

Before any merge to master, all of the following — no exceptions:

- `npm test`, `npm run lint`, `npm run typecheck` all green locally (CI
  re-proves it, but don't lean on CI to find out). **Formatting is not part
  of the gate** — `npm run format` is a tool you may run, never a check that
  can fail a merge or a deploy (DECISIONS 2026-07-15).
- Docs sweep travels **in the same squash commit** as the code: ROADMAP
  checkbox + landed note, DECISIONS.md entry for any non-trivial call,
  OWNER-TODO.md for any new human action, CLAUDE.md's status block.
- User-facing wording (embeds, command descriptions) has had owner
  review — the owner is a Digimon TCG judge; rules-adjacent text is
  their call, not ours.
- Anything deployed gets verified against production reality where a
  read-only check exists (e.g. the D1 volume check before /banlist).
