# Decision: A PR's classification tags come only from the review, never copied from the story

## Date

2026-09-25

## Status

Active

## Category

Process Decision

## Context

`/pair-capability-publish-pr` copied the story's estimated classification tags (`risk:*`, `cost:*`) onto the new PR, and agents often copied the story's other labels with them (e.g. `user story`), so a PR was read as a story by board queries. A copied estimate also hid a missing review classification: a PR looked classified even when no one had classified its diff.

## Decision

- `publish-pr` creates the PR with **no classification tags** and no story labels; the PR carries only its `pr-state:*` label.
- The review classifies the diff (`/pair-capability-classify`, review context — confirm or raise, never lower than the refinement floor read from the story) and writes the PR's `risk:*` / `cost:*`.
- Until then the PR is untagged on purpose and resolves **fail-safe red** in every consumer (quality-model §3.2, tier-aware pipeline), so a missing classification is visible and blocks downstream.

## Alternatives Considered

- **Keep copying the estimate, re-classify in review.** Rejected: the copy makes a skipped classification invisible.
- **Copy only `risk:*`/`cost:*`, never other labels.** Rejected for the same reason; it fixes the `user story` confusion but keeps the blind spot.

## Consequences

- Positive: an unclassified PR is recognisable at a glance and cannot advance; no story label ever lands on a PR.
- Negative: between publish and review the tier-aware pipeline runs at the strictest tier.
