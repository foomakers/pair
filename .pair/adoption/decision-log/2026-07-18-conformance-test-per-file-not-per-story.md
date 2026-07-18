# Decision: Conformance tests in packages/knowledge-hub/src/conformance/ are organized per target KB artifact, not per introducing story

## Date

2026-07-18

## Status

Active

## Category

Convention Adoption

## Context

`packages/knowledge-hub/src/conformance/` holds tests that read raw KB/skill markdown off disk and assert structural/textual claims against it — the substitute for a runtime unit test when the changed artifact is documentation/skill-definition prose, not executable code. The convention for naming and scoping these files had never been written down; each story that added a checkable claim tended to add its own story-named test file (e.g. `record-decision-analysis-log.test.ts` for story #247), even when an earlier story had already added conformance coverage for the very same target file (`pair-capability-record-decision/SKILL.md`). Left unaddressed, every future story touching an already-covered artifact would spawn another story-named file, and the corpus would proliferate into one file per aspect instead of a stable, discoverable home per artifact.

## Decision

Conformance test files are organized **per target KB artifact** (a `SKILL.md`, a guideline doc, a template), not per introducing story. When a new story adds a checkable claim about an artifact that already has a conformance test file, it extends that file's matching `describe` block instead of creating a new file. A new file is only warranted for a genuinely new target artifact, or a genuinely new cross-cutting invariant spanning many artifacts (e.g. `assess-output-only.test.ts`, which intentionally checks one shared rule across ~10 skill files and should stay consolidated rather than being split one-per-file).

Applied retroactively as the first instance: `record-decision-analysis-log.test.ts` renamed to `record-decision.test.ts`, restructured into `describe` blocks per target (`pair-capability-record-decision/SKILL.md`, `analysis-log-template.md`, `decision-records.md`) so a future story's record-decision check has an obvious home.

## Alternatives Considered

- **One test file per introducing story (status quo)**: Rejected. Guarantees proliferation — the same target file accumulates N story-named test files over its lifetime instead of one growing file, making it harder to find all existing coverage for a given artifact before adding more.
- **One test file per single checkable aspect** (e.g. a file per assertion class): Rejected. Over-fragments trivially related checks on the same artifact into many tiny files, the opposite direction of the proliferation problem this decision addresses.

## Consequences

- Before adding a conformance test, check whether a test file already targets the artifact in question; extend it rather than adding a new one.
- Cross-cutting invariant files (checking one rule across many artifacts) remain a deliberate exception and are not split per-file.
- No mass rename of the existing corpus performed now beyond the one instance found in-hand (`record-decision.test.ts`) — other existing files were reviewed and found already reasonably scoped (either single-target or a deliberate cross-cutting check), not a fresh violation.

## Adoption Impact

- [way-of-working.md](../tech/way-of-working.md): Quality Gates section gains a short "Conformance tests" bullet pointing to this ADL.
- No knowledge-base/dataset mirror: sibling ADLs in `adoption/decision-log/` are adoption-only records; the dataset (`packages/knowledge-hub/dataset/`) is a curated sample, not an auto-mirror of adoption, so this decision is not copied there.
