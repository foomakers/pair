# Decision: no affected-only pre-push; rely on turbo cache and parallel gate

## Date

2026-11-11

## Status

Active

## Category

Tooling Preference

## Context

Card #625 measured pre-push at 166 s. The card proposed an affected-only pre-push (B7).

## Decision

- Keep the full `quality-gate` on pre-push; do not add affected-only selection.
- Turbo already caches `test`/`lint`/`ts:check` per package, so untouched packages replay.
- Gate runs `turbo`, `workflows:test` and `format:check` concurrently (`scripts/dev/parallel.mjs`).
- Measured (#625): warm 44 s, cold ~130 s (pair-cli or knowledge-hub changed).

## Alternatives Considered

- Affected-only selection (git diff to packages): rejected; duplicates turbo's cache, risks a false green on cross-package inputs (knowledge-hub asserts repo-wide artifacts).

## Consequences

The ≤ 1 min push limit holds warm, not cold. Revisit if cold pushes dominate; next lever is cutting pair-cli CPU (about 450 s of test time).
