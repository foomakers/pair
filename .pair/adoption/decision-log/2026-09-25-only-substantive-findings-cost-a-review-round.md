# Decision: Only substantive findings cost a review round

## Date

2026-09-25

## Status

Active

## Category

Process Decision

## Context

On #514 (PR #515) the review loop stopped converging after the code was approved: each documentation-only delta review re-read the whole decision log, found one more stale sentence, and every fix opened another round. Six delta reviews followed the last code approval; none of those findings changed behaviour.

## Decision

- A finding **blocks** only when it is substantive: behaviour, correctness, security, or a documentation statement that would lead someone to do the wrong thing.
- A **cosmetic** finding (wording, style, a stale phrase with no practical effect) is recorded as a non-blocking note (severity `Questions`) and never triggers another fix-and-review round.
- A **delta review** judges only the lines its delta changed; anything it notices elsewhere is a note, not a new round.

This is a review-judgment rule for this project; it does not change the `## Blocking Severities` floor, which still decides which *severities* block.

## Alternatives Considered

- **Raise the blocking floor to `Major`.** Rejected: a Minor finding can be substantive (a wrong instruction in a skill), and the floor cannot tell substance from cosmetics.
- **Skip reviews on documentation-only deltas.** Rejected: a documentation statement can still mislead; the maintainer wants the review, only a converging one.

## Consequences

- Positive: review rounds end when the substance is right; cosmetic residue is visible as notes instead of costing cycles.
- Negative: the reviewer must classify substance vs cosmetics and say why; a misclassified finding is caught by the next substantive review or by the maintainer at the merge gate.
