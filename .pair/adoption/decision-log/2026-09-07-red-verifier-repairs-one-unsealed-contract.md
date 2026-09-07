# Decision: RED verifier repairs one unsealed contract

## Date

2026-09-07

## Status

Active

## Category

Process Decision

## Context

PR #471 proved that the pre-seal verifier can detect an incomplete test contract before GREEN.
Its findings were concrete enough to repair the contract, but the workflow stopped and required
a new manual invocation. Repeating that handoff risks treating a test-only contract defect like
a new product review cycle, even though no source, snapshot or PR state has changed.

## Decision

After the first rejected RED contract, the workflow gives a fresh test-only author the verifier's
measured findings plus the original targets. It must re-prove every retained artifact and returns
a replacement contract with fresh hashes. The verifier independently checks that replacement.

The repair budget is exactly one. A second rejection is `failed-red-contract`; no snapshot, GREEN,
push, review or merge occurs. The exception applies only before sealing. P3 remains terminal and
always requires a fresh run beginning at RED.

## Alternatives Considered

- **Manual re-run with verifier findings in notes**: rejected; it is lossy and makes a deterministic
  test-contract repair depend on orchestrator memory.
- **Unlimited RED repair loop**: rejected; repeated specification failure is a human-visible design
  problem, not work to hide behind retries.
- **Repair after P3**: rejected; source has changed, so this would recreate hidden fix-on-fix loops.

## Consequences

- A complete contract can reach GREEN without an unnecessary manual restart.
- The verifier remains independent and a second incomplete contract still fails closed.
- PR #471 may retry its current RED phase once under this rule; its dirty unsealed test artifacts
  are never production evidence and must be re-proved by the replacement contract.

## Adoption Impact

- `.pair/adoption/tech/way-of-working.md`: records the bounded pre-seal repair.
- `.claude/workflows/pair-implement-batch.js` and dataset mirror: enforce one re-author/re-verify
  pass and fail closed thereafter.
