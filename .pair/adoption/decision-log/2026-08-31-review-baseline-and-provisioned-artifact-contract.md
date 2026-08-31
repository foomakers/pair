# Decision: Review re-checks use an immutable baseline and prove provisioned artifacts

## Date

2026-08-31

## Status

Active

## Category

Process Decision

## Context

PR #474 / story #217 ran on `89793d27`, which already required a convergence sweep. In round 4,
the fixer added a CLI installation step and retained a runner invocation, but tested a stub named
`pair` rather than the installed package's declared `pair-cli` bin. Round 5 therefore found the
new functional defect. The generic sweep named distributed representations but did not require an
end-to-end proof across installation, published identity, and invocation. Re-review also rescanned
the whole accumulated PR, so each fix expanded the next review surface.

## Decision

1. Every reviewer return includes the lower-case 40-character SHA it inspected (`reviewedHead`).
   Missing or invalid evidence is retried once then fails closed; it never converges a PR.
2. The initial review remains complete. Each later re-review verifies prior findings plus
   `git diff <reviewedHead>...origin/<branch>` and directly changed producer/consumer boundaries.
   A new blocking finding must come from that delta or boundary; an unchanged surface is not
   re-audited as a new fix round.
3. A fix touching an installed, built, published, named, or invoked artifact maps
   `producer -> published identity -> consumer` and proves it in a clean temporary environment
   using the real artifact. The exact boundary cannot be stubbed, aliased, or faked.

## Alternatives Considered

- **Keep full-PR scans on each round**: rejected — a growing diff makes a re-review another
  independent first review and creates unbounded new scope.
- **Accept findings after a fixed round cap**: rejected — it hides genuine defects rather than
  bounding their cause.
- **Only strengthen source-string tests**: rejected — #217 passed such a test while the published
  CLI contract was broken.

## Consequences

- Re-review is bounded without downgrading Major or Minor findings.
- A caller resuming an older cycle has one fresh full review to establish a new baseline.
- Workflow authors must keep dataset source and root mirror byte-identical; tests cover both.

## Adoption Impact

- `.pair/adoption/tech/way-of-working.md`: records the review baseline and provisioned-artifact
  proof convention.
- `packages/knowledge-hub/dataset/.workflows/pair-implement-batch.js` and its installed mirror:
  enforce the convention.
- Both dry-run copies of `pair-implement-batch.test.mjs`: pin the schema, bounded re-review, and
  real-artifact prompt requirements.
