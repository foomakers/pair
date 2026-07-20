# Decision: Risk-tier reduction of pre-merge checks is opt-in; the default is the full check suite on every PR

## Date

2026-07-20

## Status

Active

## Category

Policy Adoption

## Context

Story #258 introduced a tier-aware pre-merge pipeline: `/pair-capability-setup-gates` generated a CI pipeline that read the PR's `risk:*` tag and ran a *reduced* set of checks on lower-risk PRs (a 🟢 PR skipped unit/integration/E2E). As first shipped, that reduction was the **default** — every project adopting the skill got narrower verification on low-risk PRs out of the box.

On review the default was judged unsafe: silently running fewer checks than before (pre-#258 behavior was the full suite on every PR) trades verification for speed *without the project ever asking for it*. Reducing coverage is an optimization a team should opt into deliberately, not inherit.

## Decision

Risk-tier reduction of pre-merge checks is an **opt-in optimization, not the default**.

- **Default (`Pre-merge tiering: disabled`, or the flag absent)**: `/pair-capability-setup-gates` generates a **full-suite** pre-merge pipeline — every PR runs base (install + lint + type + build), unit, integration/E2E, and coverage, plus the unconditional secret-scan. This is the safe, pre-#258 behavior.
- **Opt-in (`Pre-merge tiering: enabled`)**: only when a project sets this flag in `way-of-working.md` does the skill generate the tier-aware pipeline (per `tier-aware-pipeline.md`), which *reduces* checks on lower-risk PRs.
- **Selector mechanism**: a guided-setup question (default **No**, per the guided/quick setup convention, #276) records the choice as the `Pre-merge tiering` adoption flag. Quick setup / non-interactive / CI ⇒ No (full suite), never prompted.
- The tier-aware invariants remain unchanged **when enabled**: tags-only resolution (D18), fail-safe 🔴 for untagged/malformed, `require_suite` explicit failure on a missing suite, secret-scan unconditional at every tier, no classification criteria in the generated config.

## Alternatives Considered

- **Tier-aware as the default (as first shipped in #258)**: Rejected. Silently narrows verification versus prior behavior; a team gets fewer checks on low-risk PRs without deciding to accept that trade-off.
- **Tier-aware always on, no full-suite option**: Rejected. Removes the safe, uniform-coverage baseline entirely; some projects want every PR fully verified regardless of risk tier.
- **A separate skill / flag file rather than a way-of-working entry**: Rejected. The adoption flag lives where every other gate override lives (`way-of-working.md`), consistent with the hook-manager and scanner overrides `/pair-capability-setup-gates` already reads.

## Consequences

- `/pair-capability-setup-gates` defaults to the full-suite pipeline; it emits the tier-aware pipeline only on explicit opt-in.
- `tier-aware-pipeline.md` is framed as an opt-in optimization; without the flag the document does not describe what gets generated.
- The `tier-aware-gate.sh` smoke test continues to verify tier-aware behavior *when enabled*, and additionally locks the opt-in/default-full framing in both the guideline and the skill.
- Existing projects that already adopted tier-aware under #258 keep it only if they set `Pre-merge tiering: enabled`; otherwise a re-run of the skill reverts them to the full suite.

## Adoption Impact

- [way-of-working.md](../tech/way-of-working.md): Quality Gates section gains a `Pre-merge tiering` flag (default `disabled`), mirrored in the dataset adoption template.
- `/pair-capability-setup-gates` SKILL.md (dataset + `.claude/` mirror) and `tier-aware-pipeline.md` (dataset + root mirror) updated to make full-suite the default and tiering the explicit opt-in.
- No standalone dataset copy of this ADL: sibling ADLs in `adoption/decision-log/` are adoption-only records; the dataset is a curated sample, not an auto-mirror of adoption.
