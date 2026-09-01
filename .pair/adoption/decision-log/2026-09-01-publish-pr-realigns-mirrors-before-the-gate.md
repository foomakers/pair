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
- A non-zero exit from the command **HALTs** before any PR side effect — the same shape as the
  gate-red HALT it now precedes.
- This project declares `mirror-realign-command: pnpm mirrors:regenerate`.

## Alternatives Considered

- **Step in Phase 2, after the push (the card's proposal)**: unreachable on drift, because Phase 1
  HALTs first; and it would leave the gate's verdict describing a tree the PR does not contain.
- **Hardcode `pnpm mirrors:regenerate` in the skill**: makes a repo-specific script part of a
  distributed corpus. Every adopter would get a step that fails or does nothing.
- **Let the gate apply the fix itself**: declined already, by ADL
  [2026-07-31-pre-push-gate-is-check-only.md](./2026-07-31-pre-push-gate-is-check-only.md) — the
  gate reports, it never writes. This decision keeps that rule intact: the writer is an explicit,
  separately-committed step, not a hook side effect.
- **Fold the realignment into `pnpm format`**: the other option that ADL left open, and declined
  with it — formatting must stay formatting, and must not reach outside format scope.

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
  (`pnpm mirrors:regenerate`) and state the absent-⇒-skipped default.
- `packages/knowledge-hub/dataset/.skills/capability/publish-pr/SKILL.md`: Phase 1 renamed and
  extended, `Adoption Inputs` gains the key, `Output Format` gains the conditional `Mirrors:` row,
  `HALT Conditions` gains the command-failed HALT, `Graceful Degradation` gains the absent-key skip.
  The generated `.claude/skills/pair-capability-publish-pr/**` mirror is regenerated, never
  hand-ported.
