# Decision: Enforce the strict retry domain pilot

## Date

2026-11-26

## Status

Active

## Category

Tooling Preference

## Context

[#750](https://github.com/foomakers/pair/issues/750) follows the #693 Oxlint migration and the #748 retry comparison. The pinned typed Oxlint runner rejects the inherited `baseUrl`. Its JavaScript plugin API also supplies no TypeScript checker to custom rules. The private retry model needs compiler and lint checks for required variants, resolved nullish types and exhaustive dispatch.

## Decision

Use native Oxlint for syntax and TypeScript 5.4.5 for semantic checks over the same pilot files. Dispatch the tagged retry outcomes with a compiler-checked `never` witness. Join legacy findings by verified Git path, rule and model property identity, and require the baseline to shrink when a finding is fixed. Check newly authored model files under `src` in the dedicated model locations or with the model or domain filename suffix. Preserve named boundary DTO exceptions and independently check suppression directives in tracked source.

## Alternatives Considered

- A typed Oxlint-only implementation would require changing inherited TypeScript path settings and still has no checker in the custom JS rules on the pinned version.
- Immediate workspace-wide promotion would couple the pilot to migration of unrelated modules. Named legacy models retain their reviewed entries while new findings fail the gate.

## Consequences

The lint route and CI use the strict checks. Future migrations inventory boundaries, run in report-only mode, prove behavioral parity and retire fixed entries before widening the strict scope. The retry loop adds zero runtime dependencies.

## Adoption Impact

The [Way of Working](../tech/way-of-working.md) defines the gate and exceptions. The [pilot report](../../../docs/engineering/domain-design-750.md) records verification, timings and rollback.
