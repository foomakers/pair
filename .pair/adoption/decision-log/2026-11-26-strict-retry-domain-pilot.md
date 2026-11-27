# Decision: Enforce the strict retry domain pilot

## Date

2026-11-26

## Status

Active

## Category

Tooling Preference

## Context

[#750](https://github.com/foomakers/pair/issues/750) follows the #693 Oxlint migration and the #748 retry comparison. The historical #693 probe failed because the pinned typed Oxlint runner rejected inherited `baseUrl`. The merged project has no `baseUrl`, and the native switch rule runs on the pinned runner. The JavaScript plugin API still supplies no TypeScript checker to custom rules.

## Decision

Use native Oxlint for syntax and the TypeScript 6.0.3 API from `@typescript/typescript6` 6.0.2 for resolved nullish property checks over the same pilot files. Keep the compiler-checked `never` witness for tagged retry dispatch under native `tsc` 7.0.2. Join legacy findings by verified Git path, rule and model property identity, and require the baseline to shrink when a finding is fixed. Check newly authored model files under `src` in the dedicated model locations or with the model or domain filename suffix. Preserve named boundary DTO exceptions and independently check suppression directives in tracked source.

Use the effective project compiler settings for compiler diagnostics. Domain lint checks nullability on resolved internal properties. Normalize external DTO values at ingress into a type owned by the model. For values the model only carries, use `unknown`. This keeps validation of an external value at the boundary where the model consumes it.

## Alternatives Considered

- A typed Oxlint-only implementation leaves custom JS rules without a checker on the pinned version.
- Immediate workspace-wide promotion would couple the pilot to migration of unrelated modules. Named legacy models retain their reviewed entries while new findings fail the gate.

## Consequences

The lint route and CI use the strict checks. Future migrations inventory boundaries, run in report-only mode, prove behavioral parity and retire fixed entries before widening the strict scope. The retry loop adds zero runtime dependencies.

## Adoption Impact

The [Way of Working](../tech/way-of-working.md) defines the gate and exceptions. The [pilot report](../../../docs/engineering/domain-design-750.md) records verification, timings and rollback.
