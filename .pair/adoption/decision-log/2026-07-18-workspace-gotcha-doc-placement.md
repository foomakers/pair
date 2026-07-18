# Decision: cross-cutting monorepo-tooling gotchas live centrally in `DEVELOPMENT.md`, not per-package README

## Date

2026-07-18

## Status

Active

## Category

Convention Adoption

## Context

PR #344 documented that `pnpm --filter @pair/knowledge-hub test` fails to resolve the `@pair/content-ops` workspace import on a fresh checkout/worktree, because `pnpm --filter` runs a package's own script directly and bypasses turbo's `dependsOn` graph (unlike root `pnpm build`/`pnpm test`, which go through `turbo build`/`turbo test`). The note was added only to `packages/knowledge-hub/README.md`.

PR #344's review (consolidated into PR #342 per repo-owner direction to avoid proliferating small PRs) found that `apps/pair-cli` has the exact same exposure — it also depends on `@pair/content-ops` (workspace:*) and imports it across 30+ production `src/` files, not just tests — but `pair-cli`'s own README/Troubleshooting section didn't mention it, since a contributor hitting the symptom there has no reason to look in `knowledge-hub`'s README. The review also asked a broader question: no convention existed for whether this class of note (generic to any workspace package with a turbo `dependsOn` build step) belongs per-package or centrally.

## Decision

Cross-cutting monorepo-tooling gotchas — friction that stems from a generic characteristic of the build/tooling setup (e.g. `pnpm --filter` bypassing turbo's `dependsOn` graph) rather than from a specific package's own logic — are documented once, centrally, in `DEVELOPMENT.md`'s existing `## Turbo Caching` section. Each affected package's README carries only a short pointer (symptom + one-line fix command + link to `DEVELOPMENT.md`), not a full re-derivation of the explanation.

Rationale: the root cause here is not knowledge-hub-specific or pair-cli-specific — it's a property of any workspace package that depends on another workspace package with its own build step. Documenting it per-package means every future affected package re-discovers and re-writes the same explanation (as literally happened: `pair-cli` has the identical exposure and was undocumented until this decision). `DEVELOPMENT.md`'s `Turbo Caching` section is the one place a "per-package `pnpm --filter`" contributor would naturally look — centralizing there, with per-package pointers, keeps one canonical explanation and N one-line breadcrumbs instead of N full copies drifting independently.

## Alternatives Considered

- **Per-package README only (status quo)**: Rejected — leads to silent, repeated rediscovery of the same generic gotcha on every affected package (already happened once for `pair-cli`), with no single place to update if the root cause or fix changes.
- **A new dedicated troubleshooting doc**: Rejected as unnecessary — `DEVELOPMENT.md` already exists, is already the contributor-facing dev-setup doc, and already has a `Turbo Caching` section that is the natural home for this specific gotcha; no new file is justified for one entry.

## Consequences

- `DEVELOPMENT.md`'s `Turbo Caching` section is now the canonical explanation of the `pnpm --filter`-bypasses-turbo-`dependsOn` gotcha; `packages/knowledge-hub/README.md` and `apps/pair-cli/README.md` were both updated to a short pointer + fix command referencing it (this PR).
- A future workspace package that gains a `dependsOn` build-time dependency on another workspace package gets the same treatment: a one-line pointer in its own README, not a full copy of the explanation — `DEVELOPMENT.md` is updated instead if the affected-package list changes.
- This convention applies only to *generic* tooling/monorepo friction, not package-specific behavior — a package's own bugs/quirks still belong exclusively in that package's own README.

## Adoption Impact

- `.pair/adoption/tech/way-of-working.md` — added a bullet under Quality Gates recording this convention and pointing to this ADL.
- No other adoption file changes required — this is a documentation-organization convention, not a tech-stack, architecture, or infrastructure fact.
