# Decision: Adopt the native TypeScript compiler

## Date

2026-11-26

## Status

Active

## Category

Tooling Preference

## Context

[#757](https://github.com/foomakers/pair/issues/757) requires a stable
native compiler for workspace checks and reference builds. TypeScript
7.0.2 provides the compiler and omits the legacy JavaScript compiler API.
See the [TypeScript 7 release notes](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).

## Decision

Pin TypeScript 7.0.2 in the workspace catalog. Pair it with Microsoft's
`@typescript/typescript6` 6.0.2 in workspaces that load the JavaScript API.
That package exposes `tsc6`, so those workspaces can resolve `tsc` to
the native binary. Keep the Oxlint compatibility plugin on TypeScript
5.4.5 within `@pair/oxlint-config`, within the plugin's supported peer
range. Keep path mappings relative to their declaring project config.

## Alternatives Considered

- Using only TypeScript 7 leaves Next 15, `ts-node`, ncc and compiler API tools without the API their existing entry points need.
- Retaining JavaScript TypeScript for workspace compiler commands defers the native cutover required by the story.

## Consequences

The compiler version seen by each workspace's `tsc` is independent of
its JavaScript imports. Retire each compatibility dependency when its
consumers can run with the native compiler. The maintainer owns that
replay. The Oxlint peer can be retired with the compatibility plugin or
updated when the plugin's supported range changes.

## Adoption Impact

[Tech stack](../tech/tech-stack.md) records the compiler and the scoped
compatibility dependencies. [Migration evidence](../../../docs/engineering/typescript-migration-757.md)
records the checks and rollback.
