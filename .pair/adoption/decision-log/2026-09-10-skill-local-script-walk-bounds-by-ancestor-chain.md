# Decision: Skill-local script walk bounds by ancestor chain, not a global visited set

## Date

2026-09-10

## Status

Active

## Category

Convention Adoption

## Context

US-482 finding r3-9. `collectLocalScriptEntries` in
`packages/knowledge-hub/src/tools/skills-conformance-check.ts` recursed through a skill's
`scripts/` tree with symlinks followed, bounded by ONE walk-global `visited` set keyed on
`realpathSync(dir)`.

A directory can be reachable under two names — a real `scripts/lib/` and, beside it, a symlink
`scripts/alias -> scripts/lib` that aliases the sibling. Both names really ship: the registry's
bounded flatten installs a twin at each mirrored path, so `pair update` writes both
`pair-<skill>/scripts/lib/util.mjs` and `pair-<skill>/scripts/alias/util.mjs` and each is
independently guardable.

The global set made the two names share one identity, so whichever name `readdirSync` yielded
SECOND was dropped before its entries were ever emitted. The consequence is the one answer a
mirror guard may never give: a drifted twin of a path that genuinely ships was answered with
silence, and which half went silent depended on directory order — one corpus, two answers,
decided by the filesystem.

## Decision

Bound the descent by its own ANCESTOR CHAIN: add the resolved path of a directory on entry,
delete it on exit, and refuse only a directory already open further up the current descent.

This separates the two shapes the global set conflated:

- a sibling ALIAS resolves to a directory that is not an ancestor of the current descent, so it
  is walked — once per relative path under which it ships, each compared against its own twin;
- a true CYCLE (`scripts/lib/loop -> scripts`) resolves to an ancestor of the descent that
  reached it, so it is still refused and the walk still terminates.

The rows assert the ANSWER at each mirrored path, never a walk strategy; this is the strategy
chosen to produce it.

## Alternatives Considered

- **Drop the `visited` set entirely**: rejected — the cheapest way to make both aliased names
  emit, and it makes a true cycle recurse until the stack dies, taking the whole conformance
  gate down with no report at all. Termination is a hard requirement, not a nicety.
- **Keep the global set, order real directories before symlinked ones**: rejected. It satisfies
  the letter of "the answer does not depend on readdir order" and looks correct, but the alias
  is then always second and therefore always dropped: probed on an isolated patched copy, the
  drift-on-real half reports 1 error while the drift-on-alias half falls from 1 error to 0 — it
  buys one silent half with the other.
- **Keep the global set but re-emit an already-visited subtree's entries under its second
  relative path**: admissible, and it yields an identical entry list and identical answers. Not
  chosen because it keeps a second bookkeeping structure to express what the ancestor chain
  already expresses directly.

## Consequences

- Every name under which a directory really ships is compared against its own installed twin,
  in either `readdirSync` order. The gate's answer over a given corpus is now order-independent.
- A directory aliased N times is walked N times. The walk stays bounded (the ancestor chain caps
  depth) and the real corpus holds zero symlinks, ten flat scripts and no sub-directories, so
  there is no measurable cost today.
- The guard's own source comment is the current-state record of the boundary; a future change
  that reintroduces a walk-global set silently reopens the class.

Evidence, gathered at the real producer rather than asserted:

| Claim | Oracle | Command / fixture | Observed |
| --- | --- | --- | --- |
| The defect drops a shipped name | `checkSkillLocalScripts` at `9735d2da` | sealed suite `pnpm --filter @pair/knowledge-hub exec vitest run src/tools/skills-conformance-check.test.ts` | 2 failed \| 122 passed — R30 and R33, each `expected [] to have a length of 1` |
| The ancestor chain answers both halves in both orders | same, at this head | same command | 124 passed (R30, R31, R33, R34 each exactly 1 error; R32 terminates and still names `scripts/lib/util.mjs`) |
| Multiple aliases and a self-alias cycle terminate | same | isolated throwaway probe: `scripts/lib/util.mjs` with `scripts/a1 -> lib`, `scripts/a2 -> lib`, `scripts/lib/self -> lib` | 3 errors — `scripts/a1/util.mjs`, `scripts/a2/util.mjs`, `scripts/lib/util.mjs` — in 2 ms, no throw |

## Adoption Impact

- `packages/knowledge-hub/src/tools/skills-conformance-check.ts` — `collectLocalScriptEntries`
  carries the decision and its rationale in the doc comment that states why the bound is the
  ancestor chain and not a visited set. This source file is the current-state record for the
  guard's traversal semantics.
- No `adoption/tech/` file changes: the decision governs one guard's traversal, not a project-wide
  convention, tool or library. It is recorded here so the choice between the two admissible walk
  strategies is legible without archaeology through the PR.
