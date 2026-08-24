# Decision: `pair-loop`'s shipped Auto-Advance default is `(none)` — fail-closed, not `risk:green`

## Date

2026-08-23

## Status

Active

## Category

Convention Adoption

## Context

Story #250 (T1) extends `tech/automation.md`'s schema with the four remaining ADR-017 §6
knobs — `## Auto-Advance`, `## Stop Predicate`, `## Max Parallelism`, `## Audit Location` —
alongside the already-shipped `## Eligibility` (#216) and `## Harness and Model Policy`
(#450) sections. `## Auto-Advance` is the switch that lets `pair-loop` itself push and merge
a review-approved, `risk:green` card to the default branch with no human in the loop.

The story's refinement (Assumption 6, resolved by the maintainer 2026-08-13) recorded that
the shipped default for this switch must be **off**, not the recommended-eligibility default
(`risk:green`) some might expect by analogy. This repo's own `way-of-working.md` already
states the same reasoning for `Review enforcement` ("a review that blocks a fresh install
produces a repository nobody can merge into") — and this is that argument's mirror image: a
loop that **merges** on a fresh install is the same failure in the opposite direction, and on
this project specifically, `Review enforcement` is `disabled` and branch protection is
unapplied, so nothing downstream would catch a wrong auto-merge (the quality gate's per-tier
policy is enacted by the loop itself, never delegated to branch protection it cannot count on).

## Decision

`tech/automation.md`'s `## Auto-Advance` section defaults, when absent, to the literal
`(none)` — auto-advance off for every tier, including `risk:green`. A maintainer opts in
explicitly by writing `risk:green` under the heading; nothing widens itself.

This is documented in the KB (`guidelines/collaboration/automation/automation-policy.md`,
`## Auto-Advance` section) as the schema's own fail-safe default — every consumer
(`pair-loop`, #250) reads it the same way, never falls back to `risk:green`, and HALTs rather
than guesses on a malformed value (a tier other than `risk:green`, a duplicate, or a boolean
expression).

## Alternatives Considered

- **Default to `risk:green`** (mirroring `## Eligibility`'s recommended default): rejected —
  eligibility only decides which cards a run may *touch*; auto-advance decides which cards it
  may *merge to `main` unattended*. Those are different blast radii, and the story's own
  Assumption 6 explicitly resolved this project's default to off.
- **No default at all (HALT if the section is absent)**: rejected — `## Auto-Advance` is an
  optional section like every other adoption delta (D21); a project that never writes it must
  stay in the normal manual-merge flow, not have every unattended run HALT.

## Consequences

- `pair-loop`'s dogfood run against this repo's own backlog stops at a review-approved PR for
  every card, including `risk:green` ones, until this repo's own `tech/automation.md` adds
  `## Auto-Advance` with `risk:green` explicitly.
- No adopting project can be surprised by an unattended merge on first install of the loop.

## Adoption Impact

- `.pair/adoption/tech/automation.md` (this project, new file): records this project's actual
  `## Eligibility` / `## Auto-Advance` / `## Stop Predicate` / `## Max Parallelism` /
  `## Audit Location` declarations — auto-advance stays at the shipped `(none)` default for now
  (no override written), consistent with this decision.
