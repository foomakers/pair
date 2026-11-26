# Decision: Use Oxlint for workspace lint

## Date

2026-11-25

## Status

Active

## Category

Tooling Preference

## Context

[#693](https://github.com/foomakers/pair/issues/693) moves all seven workspace lint routes to Oxlint and preserves their effective policies. The workspace and CI development runtimes include Node 20.

## Decision

Pin Oxlint 1.95.0 and define Pair-owned base and React profiles in JSON. Use native rules where parity checks pass and selected JavaScript rule implementations where the native behavior differs. Keep the React, Hooks and accessibility plugin versions from the baseline. Preserve Brand's base package profile and React direct-file profile.

Keep the `no-var` error and leave the source unchanged for catch-shadowed declarations and bindings read by a hoisted function before initialization. Ordinary safe declarations still autofix. [Maintainer decision](https://github.com/foomakers/pair/issues/693#issuecomment-7172593619)

On 2026-11-26 the maintainer accepted Oxlint writing `const {} = foo` for `var {} = foo`. ESLint writes `let {} = foo`. The pattern binds no names. Both fixes preserve the `no-empty-pattern` error and exit 1.

On 2026-11-26 the maintainer retained the existing Pair direct `--ignore-path` selection when a nested ignore file contains an anchored rule. With `sub/ignore.txt` containing `/match.ts`, Pair expands `.` to explicit relative operands. Both the previous Pair adapter and Oxlint on those operands skip `match.ts` and `sub/match.ts`, and select `sibling.ts`. Native Oxlint on the directory operand selects all three. The ESLint flat CLI rejects this option. This disposition applies to that optional direct invocation.

## Alternatives Considered

- **Cloudflare's standalone preset.** Its rule set, test policy, globals and parser requirements would change the migration scope.
- **Native rules exclusively.** The native TypeScript getter rule missed an existing check and native optional-chaining diagnostics rejected assertions accepted by the baseline.
- **TypeScript config modules.** Oxlint's config loader requires Node 22.18+ for these files. JSON supports CI's Node 20 runtime.

## Consequences

The pinned Oxlint CLI runs the lint entry points. The retained plugins bring their peer dependencies through pnpm. The package wrappers and pre-push guard keep autofix out of the gates. Revert the migration PR to restore the old toolchain and configs together.

## Adoption Impact

The [tech stack](../tech/tech-stack.md) records the linter and compatibility plugins. The [way of working](../tech/way-of-working.md) records gate composition. The [migration evidence](../../../docs/engineering/lint-migration-693.md) records the behavior checks.
