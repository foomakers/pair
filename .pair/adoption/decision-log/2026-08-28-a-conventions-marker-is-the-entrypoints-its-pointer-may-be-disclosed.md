# Decision: a convention's MARKER belongs to the entrypoint; its POINTER may be disclosed to a sibling

## Date

2026-08-28

## Status

Active

## Category

Convention Adoption

## Context

Story #251 adds a corpus-wide obligation: each of the twelve skills representing a [catalogued process step](../../knowledge/guidelines/technical-standards/ai-development/step-catalogue.md) declares its step id inline and points at the [process-profile gate](../../knowledge/guidelines/technical-standards/ai-development/skill-conventions/process-profile-gate.md). Both halves are checked by `skills:conformance`.

`/pair-process-brainstorm` carries a **fixed progressive-disclosure byte budget** on its entrypoint (28 KiB, measured on the installed mirror — `brainstorm-phases.test.ts`), with ~194 B of headroom on `main`. The pointer's own relative path to the convention is ~117 B, so no meaningful delta fits: a corpus-wide obligation collided with a per-skill budget. The budget's own instruction is explicit — *"raise the budget only together with another disclosure split"*.

Three ways out were on the table, and only one is consistent with what the budget exists for: the budget bounds **the file an assistant loads**, and it is enforced precisely so that new material gets disclosed rather than accumulated.

## Decision

**The marker is the entrypoint's obligation; the pointer is the skill's.**

- `<!-- process-step: id=… -->` must appear in `SKILL.md` itself. An assistant loading the entrypoint has to be able to tell which step it is holding — that fact cannot be one indirection away.
- The **convention pointer** (and any prose around it) may live in `SKILL.md` **or in any markdown disclosed beside it** in the skill's own directory. `checkStepMarkers` resolves the obligation over the whole skill directory, which is the mirror of the rule `checkApprovalSignalInSubDocs` already applies in the other direction (a sub-doc's round is checked against its owning `SKILL.md`).

Applied: `/pair-process-brainstorm` keeps a marker plus a one-line pointer in `SKILL.md`, and its half of the convention — the composed-step degradation bullet and the direct-invocation gate — lives in `degradation.md`, the sibling that already owns "a composition brainstorm expects is missing". The budget was **not** raised (installed mirror: 28,643 B of 28,672).

## Alternatives Considered

- **Raise `BUDGET_BYTES`**: rejected. The guard's stated contract is that growth is paid for with a disclosure, and this story is exactly the kind of systematic growth it was written to catch. Raising it here would retire the guard the first time it bit.
- **Disclose an existing brainstorm section (`## HALT Conditions`) to free room**: rejected. HALT conditions are normative, not reference material — the opposite of what belongs behind an indirection — and six existing conformance assertions slice that section out of `SKILL.md`, so the change would have been a brainstorm refactor carried inside an unrelated story.
- **Exempt brainstorm from the convention**: rejected. The whole point of the catalogue is that no step is silently ungoverned; an exemption would put one step outside the profile with nothing saying so.
- **Shorten the block until it fits (~194 B)**: rejected as a false economy. The path alone is ~117 B, leaving room for a bare link and no sentence — the pointer would satisfy the grep and teach nothing.

## Consequences

- Adding this convention to a skill under a byte budget has a documented route that does not weaken either the budget or the convention.
- The guard now reads every markdown in a skill's directory for the pointer, so a skill's disclosed reference files are part of its conformance surface — consistent with how the approval-round check already treats them.
- Brainstorm's entrypoint has ~29 B of headroom left. The next addition to that file must disclose something; that is the guard working, and it is stated here so the next author does not read it as this story's oversight.
- The generic rule is worth more than the instance: any future corpus-wide obligation faces the same collision, and the marker/pointer split is the answer.

## Adoption Impact

None. This is a KB/tooling convention: it changes `packages/knowledge-hub/src/tools/skills-conformance-check.ts` (`checkStepMarkers`) and the layout of `dataset/.skills/process/brainstorm/`, not any adopted decision. Recorded here because a reviewer reading `brainstorm/SKILL.md` will find a delta shaped unlike the other eleven and needs the reason.
