# Decision: `/pair-capability-publish-pr` realigns the mirrors BEFORE its gate, through an adoption-declared command

## Date

2026-09-01

## Status

Active

## Category

Process Decision

## Context

Story #419 replaces `pair update` with a dedicated, local, deterministic realignment command
(`pnpm mirrors:regenerate`) as the remedy every mirror-equality guard names, and puts the write at
the point where a commit is still possible: pull-request creation. Two things had to be decided
before the step could be written into `/pair-capability-publish-pr`.

**1. Where in the skill's phase order it runs.** The story's card proposed Phase 2 ("Resolve Merge
Strategy & Prepare Base"), *after* Phase 1's quality gate. That ordering does not survive contact
with the failure it exists for: mirror drift is exactly what turns Phase 1 red, and a red Phase 1
**HALTs** the skill. The remedy would therefore be unreachable in the only case it was added for.
The reverse ordering has a second, independent justification: a gate that ran before the
regeneration judged a tree the PR no longer contains.

**2. Whether the command is named in the skill.** `/pair-capability-publish-pr` ships to every project that installs
the pair corpus. `pnpm mirrors:regenerate` is a script of *this* repository — a skill that hardcoded
it would emit a step no adopter can run, on a repo with no mirrors to realign.

**3. How the skill decides what to stage.** The first draft staged "the generated paths the command
owns", resolved through the owned-path globs this file declares. Review found that unsound: root
`.pair/**` is on that list and holds 117 tracked *authored* files under `.pair/adoption/**`
(`git ls-files .pair/adoption | wc -l` → 117). A contributor who edits
`.pair/adoption/tech/way-of-working.md`, leaves it unstaged and runs the skill — the state this very
PR was in — would have their prose committed under `chore: regenerate mirrors from local dataset`,
contradicting the same phase's "unstaged authored changes must survive the run untouched".

**4. Where a script's own behaviour is tested.** ADL
[2026-07-13-gate-tooling-code-in-tested-modules.md](./2026-07-13-gate-tooling-code-in-tested-modules.md)
forbids black-box `spawnSync`/`exec` of a script inside a vitest unit test and routes CLI-level
verification to `scripts/smoke-tests/`. `scripts/regenerate-mirrors.sh` is a *thin wrapper whose
behaviour is the entire deliverable* — there is no module to extract, because the story's own
constraint is "no new generation logic". `run-format.test.ts` already deviates the same way and the
deviation was nowhere recorded, so the repo's adoption said one thing and two of its test files did
another with nothing telling the next author which wins.

## Decision

**The realignment runs first inside Phase 1, ahead of `/pair-capability-verify-quality`, and the command it runs is
read from the adoption, never named in the skill.**

- Phase 1 is renamed **"Realign Generated Mirrors, then Quality Gate (BLOCKING)"**. The realignment
  is steps 1–4; the gate composition is step 5 onward, unchanged.
- The command comes from `way-of-working.md` → `## Quality Gates` → **`mirror-realign-command`**.
  **Absent ⇒ the whole step is skipped** — the zero-configuration default, not a degradation: a
  project with no generated mirrors has nothing to realign and must not be told to run a script it
  does not have.
- The step commits **only** the generated paths, as **its own commit**, and only when the command
  produced a diff. A no-op is **silent**: no commit, and no output row (the `Mirrors:` row is
  emitted only when a commit was made).
- **The staged set is the command's own effect, not a path glob.** The skill snapshots
  `git status --porcelain` before running the command and again after, and stages exactly the paths
  whose entry appeared, disappeared or changed. A glob is a guess about the command and is wrong
  wherever generated output and authored files share a prefix; the comparison cannot be, because a
  file the run did not touch has an identical entry in both snapshots. Corollary: **no adopter has
  to enumerate owned globs anywhere**, and this file's own list of written trees is descriptive
  only.
- **A thin script whose behaviour IS the deliverable may be exercised from vitest**, black-box,
  against a throwaway fixture — a bounded, documented exception to ADL 2026-07-13, which otherwise
  stands unchanged. Conditions, all of them: the script holds no logic that could be extracted to a
  module (extract it instead, per that ADL); the fixture is disposable and never the real repo; and
  the test asserts observable behaviour (exit status, stderr reason, files on disk), never the
  script's source text. The smoke suite is not the right home for these: `scripts/smoke-tests/`
  exercises the *published* CLI end to end, and these cases deliberately point `TOOLCHAIN_ROOT` at a
  broken tree (no turbo, a failing build, a build that writes no `dist/cli.js`) — situations a smoke
  scenario over a working installation cannot produce. Applies to
  `packages/dev-tools/src/quality-gates/regenerate-mirrors.test.ts` and, retroactively, to
  `run-format.test.ts`, which already had this shape unrecorded.
- A non-zero exit from the command **HALTs** before any PR side effect — the same shape as the
  gate-red HALT it now precedes.
- This project declares `mirror-realign-command: pnpm mirrors:regenerate`.

## Alternatives Considered

- **Step in Phase 2, after the gate (the card's proposal)**: unreachable on drift, because Phase 1
  HALTs first; and it would leave the gate's verdict describing a tree the PR does not contain.
- **Hardcode `pnpm mirrors:regenerate` in the skill**: makes a repo-specific script part of a
  distributed corpus. Every adopter would get a step that fails or does nothing.
- **Let the gate apply the fix itself**: declined already, by ADL
  [2026-07-31-pre-push-gate-is-check-only.md](./2026-07-31-pre-push-gate-is-check-only.md) — the
  gate reports, it never writes. This decision keeps that rule intact: the writer is an explicit,
  separately-committed step, not a hook side effect.
- **Fold the realignment into `pnpm format`**: the other option that ADL left open, and declined
  with it — formatting must stay formatting, and must not reach outside format scope.
- **Stage by owned-path glob (the first draft)**: rejected — see Context 3. The glob covers authored
  files in this repo, and any adopter would have to enumerate its own, correctly, for a rule whose
  failure mode is committing someone else's work.
- **Move the script tests to `scripts/smoke-tests/`**: rejected — see Context 4. The suite would lose
  the broken-toolchain cases outright (a smoke scenario runs against a working install), and vitest
  is where the assertions and the fixture helpers already live.
- **Extract `regenerate-mirrors.sh`'s logic into a module and unit-test that**: rejected — there is
  no logic to extract. The script's content is argument resolution and five fail-loud guards over
  the filesystem and a subprocess; a module wrapping them would be tested through the same
  filesystem fixtures, one indirection further from what actually runs.

## Consequences

- `/pair-capability-publish-pr` commits on the contributor's behalf. That is acceptable **only** under the
  constraints above: generated content, its own commit, named as a *regeneration* (never a "fix" —
  an overwritten hand-edit was restored, not repaired), and never `git add -A`, so unstaged authored
  changes in the working tree survive untouched.
- Drift in a file the branch never touched is committed here too, and reported. Surprising, but
  pushing knowingly stale generated output is worse.
- Running `/pair-capability-publish-pr` twice commits nothing the second time — the command is idempotent.
- A project that adopts the key inherits the behaviour; one that does not sees no change at all.

## Adoption Impact

- `adoption/tech/way-of-working.md` → `## Quality Gates`: declare `mirror-realign-command`
  (`pnpm mirrors:regenerate`), state the absent-⇒-skipped default, mark the written-tree list as
  descriptive rather than a staging rule, and state the writer/checker scope asymmetry (the guards
  check the dataset-sourced mirrors; the command additionally rewrites skill references across the
  whole installed tree, which nothing verifies).
- `adoption/tech/way-of-working.md` → `## Quality Gates` → "Gate & tooling code": record the bounded
  vitest exception above next to the rule it qualifies, so the two are read together.
- [2026-07-13-gate-tooling-code-in-tested-modules.md](./2026-07-13-gate-tooling-code-in-tested-modules.md):
  unchanged in force; its "scripts are never unit-tested" clause gains a pointer to this record's
  bounded exception.
- `packages/knowledge-hub/dataset/.skills/capability/publish-pr/SKILL.md`: Phase 1 renamed and
  extended, `Adoption Inputs` gains the key, `Output Format` gains the conditional `Mirrors:` row,
  `HALT Conditions` gains the command-failed HALT, `Graceful Degradation` gains the absent-key skip.
  The generated `.claude/skills/pair-capability-publish-pr/**` mirror is regenerated, never
  hand-ported.
