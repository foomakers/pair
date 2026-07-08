# Decision: Husky as Default Git Hook Manager

## Date

2026-07-08

## Status

Active

## Category

Tooling Preference

## Context

Story #232 ("Shared lint/format config guideline + setup-gates provisioning") extends `pair-capability-setup-gates` to provision Git hooks (pre-commit lint/type-check, pre-push lint) alongside shared lint/format config packages. This requires a KB-wide default hook manager so `setup-gates` has a deterministic choice when a project has no hook manager on disk yet.

During #232's refinement session this was resolved as an open question (**Q11**) and recorded only in the story body's "Refinement Session Insights" ("Q11 decided — husky default with adoption override") — never formalized as a decision record. The story's own Acceptance Criteria and Business Rules reference "decision Q11" and "D21" as if a durable record existed, creating a dangling citation. This ADL closes that gap.

## Decision

**Husky is the KB default Git hook manager.** `pair-capability-setup-gates` installs husky (`.husky/pre-commit`, `.husky/pre-push`, `"prepare": "husky install"`) when provisioning hooks on a project with no hook manager already detected on disk.

This follows **D21** ("Adoption = solo delta" — convention over configuration): the default lives entirely in the KB, so a project that accepts husky writes nothing extra to its adoption files. A project may override the hook manager by recording the override in [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md); `setup-gates` reads that override before defaulting to husky, and an already-detected on-disk hook manager (Step 1.3 of `SKILL.md`) takes precedence over both.

## Alternatives Considered

- **lefthook**: faster (Go binary, no Node dependency), but adds a non-JS toolchain requirement to every bootstrapped project — inconsistent with the KB's JS/TS-first reference implementation (`tools/*` shared config packages already assume a Node toolchain).
- **simple-git-hooks**: minimal footprint, but lacks husky's `prepare` lifecycle integration and is less commonly known, raising onboarding friction for contributors already familiar with husky from this monorepo's own tooling.
- **No default (always ask)**: rejected — contradicts D21's convention-over-configuration principle; would force every bootstrap to answer a question with an obvious, low-stakes default.

## Consequences

- `pair-capability-setup-gates` (both the dataset source and the installed mirror) provisions husky by default; no adoption file changes are required for projects that accept the default.
- Projects that already use a different hook manager, or that explicitly record an override in `way-of-working.md`, are unaffected — `setup-gates` defers to that choice.
- Non-JS projects degrade to a documentation pointer (see [shared-config-packages.md](../../../.pair/knowledge/guidelines/code-design/quality-standards/shared-config-packages.md) § Non-JS / Polyglot Projects) — husky provisioning is skipped, not forced.

## Adoption Impact

- No mandatory change to any project's adoption files — the husky default requires zero adoption footprint (D21).
- [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) gains an optional "Hook manager" override field, used only when a project deviates from husky.
- `pair-capability-setup-gates` `SKILL.md` (dataset + installed mirror) documents this decision inline (Notes section: "Hook manager default: husky (decision D21/Q11)").
