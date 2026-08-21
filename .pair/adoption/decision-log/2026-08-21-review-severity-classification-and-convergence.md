# Decision: Review severity is capped by trigger plausibility, and Minor blocks merge

## Date

2026-08-21

## Status

Active

## Category

Process Decision

## Context

PR #442 (story #225) went through 11 independent-review rounds before converging. Rounds 1-2 found
and fixed genuine functional defects (a broken e2e selector, a BSD/GNU `xargs` exit-code bug, a
missing `gh`-vs-MCP auth check, a wrong Playwright mitigation). Rounds 3-10 found **0 further
Critical/Major** but kept producing Minor findings — and every one of them was fixed, per an
explicit instruction to resolve all Major and Minor findings before merge. The loop did not
converge because each round's fix (a new test helper, a new assertion, a corrected PR-description
number) became new surface for the next round's "be maximally adversarial" instruction: a string-
boundary helper inside a test file could always be hardened against one more hypothetical future
edit (a JSON block reorder, a `describe()` wrapper that does not exist, a key colliding with a
comment) that nobody had a reason to make. Round 11, capped to genuine-defect-only, returned 0
findings — the same code, reviewed with a plausibility filter, converged immediately.

Separately, `.pair/knowledge/how-to/11-how-to-code-review.md`'s existing `TECH DEBT` verdict
("Only minor issues, tracked as debt → Approve PR, create debt items") was the project's actual
default before this incident — Minor was optional ("consider" in `code-review-template.md`). That
default was overridden ad hoc mid-session by an explicit instruction to fix Minors too, without
changing what counted as Minor — which is what let the loop run 8 extra rounds on synthetic
robustness gaps instead of converging after round 2.

## Decision

Two changes, together:

1. **Minor findings block merge, same as Major — the `TECH DEBT` verdict is retired.**
   `code-review-template.md`'s verdict line drops `TECH-DEBT`; `11-how-to-code-review.md`'s
   Review Decisions table drops the `TECH DEBT` row. `APPROVED` now requires 0 open Critical,
   Major, **or** Minor findings. This matches what most contributors actually do in practice
   (nobody wants a "minor issue, tracked as debt" quietly living in the codebase) and removes
   the two-tier ambiguity that made "is this Minor-optional or Minor-mandatory" a per-reviewer
   judgment call.

2. **Severity is capped by how a finding is reached, not by what it would do.** Two tests, applied
   at find-time (by the reviewer, before filing), not at merge-time (by relaxing what already got
   filed):
   - **Realistic-trigger test**: if reproducing the finding requires a contrived edit or input
     nobody has a reason to make — an unmotivated reorder, wrapping code in a construct that does
     not exist today, an adversarial input to a script nothing untrusted feeds — the finding is a
     **Question**, never Critical/Major/Minor, regardless of the severity of the consequence if it
     did happen.
   - **Deliverable vs. test-infrastructure test**: a bug in the shipped code/docs/config is
     Critical/Major/Minor per the normal bar. A robustness gap in a helper that exists only to
     scope a *test's own* assertion is Minor only if a realistic edit to the file it reads would
     hit it; otherwise it is a Question.

Making Minor mandatory (change 1) without also tightening what qualifies as Minor (change 2) would
have reproduced exactly the loop this ADL closes. Both changes ship together.

## Alternatives Considered

- **Keep `TECH DEBT` as the default, only escalate to mandatory-Minor by explicit instruction per
  review**: rejected — this is the status quo that caused the incident. A per-session override
  with no accompanying severity-tightening is what let round 3-10 happen.
- **Cap total review rounds at a fixed number (e.g. 3) regardless of findings**: rejected as the
  primary fix — it would have stopped the loop but at the cost of potentially missing a late-round
  genuine defect (round 8's `run-format.sh` `mktemp` fix, e.g., was a real, if narrow,
  exit-code-contract bug). Classifying correctly at find-time preserves the ability to keep
  reviewing without the reviewer being incentivized to invent findings to justify another round.
- **Leave Minor optional (`consider`) and just tighten the realistic-trigger test**: considered,
  but the user's stated preference (resolve Minors always) is also good engineering practice on its
  own terms — a "tracked as debt" Minor is debt nobody circles back to in practice. Combined with
  the tightened bar, mandatory-Minor no longer implies unbounded review rounds.

## Consequences

- A `pair-reviewer` verdict of `APPROVED` now means 0 open findings at any of Critical/Major/Minor
  — no PR merges with a known, filed, unaddressed Minor.
- Reviewers must apply the two classification tests *before* filing, which asks more discipline of
  the reviewing step but should reduce total review rounds, not increase them: fewer contrived
  scenarios get filed as blocking findings in the first place.
- Existing PRs or historical reviews that used the `TECH DEBT` verdict are not retroactively
  reopened by this decision — it governs review conduct going forward.
- `code-review-verdict-first.test.ts` (or any conformance test asserting the template's verdict
  enum) needs to stop asserting `TECH-DEBT` as a valid verdict value — checked as part of this
  ADL's Adoption Impact.

## Adoption Impact

- `.pair/knowledge/guidelines/collaboration/templates/code-review-template.md` — verdict line
  drops `TECH-DEBT`; "Findings by severity" section relabels Minor as must-fix and adds the two
  classification tests as an inline comment.
- `.pair/knowledge/how-to/11-how-to-code-review.md` — Review Decisions table drops the `TECH DEBT`
  row and adds a "Convergence" subsection stating both changes.
- `packages/knowledge-hub/src/conformance/code-review-verdict-first.test.ts` — if this file asserts
  `TECH-DEBT` as a recognized verdict token, update the accepted-verdict set to
  `APPROVED | CHANGES-REQUESTED` only.
