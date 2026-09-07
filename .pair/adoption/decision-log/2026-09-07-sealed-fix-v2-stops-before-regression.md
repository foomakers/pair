# Decision: Sealed fix v2 stops before regression

## Date

2026-09-07

## Status

Active

## Category

Process Decision

## Context

PR #471 repeatedly closed prior findings then introduced a new defect in the fix itself. The
old loop had a sealed RED snapshot and a post-fix verifier, but its RED contract could omit a
real renderer boundary and P3 could silently launch another RED/GREEN repair. That made the
outer review the first visible detector and made the finding count look divergent.

The Fable run was not an A/B experiment: `args.model` overrode reviewer, RED, GREEN and P3 at
once. A history exception also accepted a list of SHAs but depended on the reviewer splitting a
multi-commit finding into one finding per SHA.

## Decision

Keep Git-sealed RED and read-only P3. Add a read-only RED-contract verifier before sealing. It
reproduces each matrix oracle while source is still red, checks fixture consumption and requires
one typed scope: `behavioral` or `structural`, with one owner and exact allowed paths. A
behavioral contract cannot add, move or split a production module.

P3 is terminal: its first actionable finding returns `failed-preflight`; no hidden second fix
round runs. The next attempt needs a fresh RED contract and seal.

History findings use `kind: "history-subject"` plus all affected full SHAs. The engine, not
reviewer prose, applies a human decision only when every subject is authorized. Model overrides
are role-scoped through `models`; a GREEN-only Fable trial leaves reviewer, RED and P3 defaults
unchanged. Legacy `model` remains a global compatibility override.

## Alternatives Considered

- **More prompt text for the fixer**: rejected; it cannot prove a missing state/renderer boundary.
- **Keep one hidden P3 repair**: rejected; it lets fix-on-fix regressions bypass the fresh RED gate.
- **Use one model override for an A/B trial**: rejected; changing all independent roles confounds
  model quality with workflow quality.

## Consequences

- A bad or incomplete RED contract stops before a local snapshot, source change or push.
- A P3 finding is a diagnostic stop, not another autonomous repair.
- Structural cleanup needs its own RED contract; it cannot ride a behavioral bug fix.
- The 2026-09-04 decision is superseded only for its one-inner-repair rule; sealed custody and
  the 2026-09-05/06 decisions remain in force with these stricter mechanics.

## Adoption Impact

- `.pair/adoption/tech/way-of-working.md`: records terminal P3, pre-seal verification, typed
  scope and engine-applied multi-SHA history decisions.
- `.claude/workflows/pair-implement-batch.js` and dataset mirror: enforce the v2 sequence.
- `.claude/agents/pair-red-contract-verifier.md`, RED/P3/reviewer agents and dataset mirrors:
  define the separated roles and typed history output.
