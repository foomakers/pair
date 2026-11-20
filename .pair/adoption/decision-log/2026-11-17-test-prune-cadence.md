# Decision: test-prune cadence — manual-only

## Date

2026-11-17

## Status

Active — chosen by the maintainer on #627 ([decision](https://github.com/foomakers/pair/issues/627#issuecomment-7039595471), 2026-11-20).

## Category

Process Decision

## Context

Stories #613, #625 and #626 built and ran the test-audit tooling. #627 asks for an evidence-based prune cadence. Comparison of four options (changed-tests-only, release, manual-only, nightly/CI) by trigger, scope, elapsed time, cost, risk, touched files, effort, suites reached and placement: [`docs/testing/test-prune-cadence-options.md`](../../../docs/testing/test-prune-cadence-options.md) (comparison revision `23d1fecb`).

Evidence and limits:

- Only measured run: #626 content-ops mutation, 20m38s at `21f14940`; 457 candidate signals in 49 files (451 zero unique kills, 6 never killed); two Stryker worker crashes, one mutant error. No candidate passed protection review.
- Fresh baseline measured at `23d1fecb` in a disposable worktree (3 runs per suite, uncontrolled load, 3 failing tests noted in the comparison): one plain pass is 322 s for the six Vitest `MODULES` and 537 s for all twelve suites (sums of medians). It times plain test runs, not mutation. The checked-in `test-audit/baseline.json` (`base_rev f0799084`) is **stale** and unused. Mutation wall time beyond the 20m38s sample is `not measured`.
- No changed-test selector exists: `analyze-test-prune` takes `$module`, `mutation.ts --module`, `redundancy.ts --modules`. The closest scope is #648 AC-17's affected-package `turbo --filter=...[<round base>]`, which a changed-tests option must reuse.
- Audit covers Vitest `MODULES` only; `workflows:test` and `dev-scripts:test` (node `--test`) are `not measured` by the mutation audit under every option; the fresh baseline times the `.claude/workflows` and `scripts` suites, which are not those gate commands — the plain wall time of the two gate commands themselves is `not measured`.

## Decision

**Manual-only** is the adopted cadence, chosen by the maintainer ([decision](https://github.com/foomakers/pair/issues/627#issuecomment-7039595471)): the maintainer requests a module audit on demand, outside the delivery cycle; no recurring job, no gate. Rationale: one noisy single-module sample and 457 unreviewed signals do not justify recurring cost; an in-cycle run would spend #650 AC-19 in-run time with no measured payoff.

Constraints that hold for any option:

- Analysis changes no production code or tests; mutation runs in a disposable worktree.
- Candidates are review signals, never removal verdicts: each needs protection review (owner-approved behavior, cited regression, contract/spec test) and human approval. No automatic deletion; no unique kill alone proves redundancy.
- An in-cycle option requires #652's closed step set to be extended (a profile cannot add an unknown step), must not invalidate #648's `testIdentity` gate reuse, and counts against #650 AC-19. Release, manual-only and nightly run outside the cycle and add no step or stop.
- An unattended run waiting for this choice parks on #646's existing `STOP_CATALOG` `escalated` row; no new row.
- ADL 2026-11-11 (no affected-only pre-push) is unaffected.

## Alternatives Considered

- **Changed-tests-only (in-cycle)**: highest effort; blocked by #648 and #652; adds per-round cost against #650 AC-19; worker failures could stall delivery.
- **Release**: plausible later; needs a fresh fixed-revision baseline and reviewed protections first.
- **Nightly/CI**: not adopted now — recurring compute and triage on noisy signals; output must never gate merges or delete tests. The maintainer's preferred next step: revisit it after a clean mutation run with reviewed protections and measured wall time.

## Consequences

- Decision only: no code/CI change, tests added/removed 0/0; no follow-up issue.
- No in-cycle step, gate, stop or CI job is added; #650 AC-19 in-run time is untouched.
- Revisit triggers: a clean mutation run with reviewed protections and measured module/suite wall time at a fixed revision (then nightly/CI is reconsidered first); repeated manual audits showing stable benefit; a node:test mutation tool adopted.

## Adoption Impact

[`adoption/tech/way-of-working.md`](../tech/way-of-working.md) `## Quality Gates` gains the test-prune cadence line: manual-only, with the constraints above. No other adoption file changes.
