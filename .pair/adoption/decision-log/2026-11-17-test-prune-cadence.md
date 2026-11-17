# Decision: test-prune cadence — manual-only recommended (proposed)

## Date

2026-11-17

## Status

Proposed — awaiting the maintainer's choice on #627 (AC3: unanswered stays proposed). Not adopted: no adoption file changes until a choice is recorded here.

## Category

Process Decision

## Context

#613, #625 and #626 built and ran the test-audit tooling. #627 asks for an evidence-based prune cadence. Comparison of four options (changed-tests-only, release, manual-only, nightly/CI) by trigger, scope, elapsed time, cost, risk, touched files, effort, suites reached and placement: [`docs/testing/test-prune-cadence-options.md`](../../../docs/testing/test-prune-cadence-options.md) (comparison revision `a453ad7f`).

Evidence and limits:

- Only measured run: #626 content-ops mutation, 20m38s at `21f14940`; 457 candidate signals in 49 files (451 zero unique kills, 6 never killed); two Stryker worker crashes, one mutant error. No candidate passed protection review.
- `test-audit/baseline.json` (`base_rev f0799084`) is **stale**; no fresh baseline was run (machine load). Every elapsed-time cell beyond the 20m38s sample is `not measured` or extrapolated.
- No changed-test selector exists: `analyze-test-prune` takes `$module`, `mutation.ts --module`, `redundancy.ts --modules`. The closest scope is #648 AC-17's affected-package `turbo --filter=...[<round base>]`, which a changed-tests option must reuse.
- Audit covers Vitest `MODULES` only; `workflows:test` and `dev-scripts:test` (node `--test`) are `not measured` under every option.

## Decision

Recommendation (not adopted): **manual-only** — the maintainer requests a module audit on demand, outside the delivery cycle. Rationale: one noisy single-module sample and 457 unreviewed signals do not justify recurring cost; an in-cycle run would spend #650 AC-19 in-run time with no measured payoff.

Constraints that hold for any option:

- Analysis changes no production code or tests; mutation runs in a disposable worktree.
- Candidates are review signals, never removal verdicts: each needs protection review (owner-approved behavior, cited regression, contract/spec test) and human approval. No automatic deletion; no unique kill alone proves redundancy.
- An in-cycle option requires #652's closed step set to be extended (a profile cannot add an unknown step), must not invalidate #648's `testIdentity` gate reuse, and counts against #650 AC-19. Release, manual-only and nightly run outside the cycle and add no step or stop.
- An unattended run waiting for this choice parks on #646's existing `STOP_CATALOG` `escalated` row; no new row.
- ADL 2026-11-11 (no affected-only pre-push) is unaffected.

## Alternatives Considered

- **Changed-tests-only (in-cycle)**: highest effort; blocked by #648 and #652; adds per-round cost against #650 AC-19; worker failures could stall delivery.
- **Release**: plausible later; needs a fresh fixed-revision baseline and reviewed protections first.
- **Nightly/CI**: plausible later; recurring compute and triage on noisy signals; output must never gate merges or delete tests.

## Consequences

- Until the maintainer chooses, no cadence is adopted and the card stays open.
- If manual-only is chosen: decision only, no code/CI change, tests added/removed 0/0; set Status to Active and add the adoption delta below.
- If an executable option is chosen: it ships in the #627 PR with behavior-first tests, re-sized and re-classified (in-cycle → `risk:red`, `Blocked by #648, #652`).
- Revisit triggers: a clean mutation run with reviewed protections and measured module/suite wall time at a fixed revision; repeated manual audits showing stable benefit; a node:test mutation tool adopted.

## Adoption Impact

None while Proposed. On acceptance: `adoption/tech/way-of-working.md` gains a test-prune cadence line naming the chosen option and the constraints above.
