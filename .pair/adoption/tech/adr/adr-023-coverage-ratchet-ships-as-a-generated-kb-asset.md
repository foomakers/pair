# ADR-023: The coverage-baseline ratchet ships as a GENERATED KB asset, not as a CLI command

## Status

Accepted — amends [ADR-022](adr-022-coverage-ratchet-exposed-through-the-cli.md) (its Option 4 "expose through the published CLI" is reversed; the single-tested-module invariant it established is kept).

## Date

2026-08-25

## Context

ADR-022 chose to expose the coverage-baseline ratchet through a new published CLI command (`pair-cli coverage-ratchet`) to close story #409's silent no-op without porting the logic to shell. The capability gap is real and this decision does not reopen it. What changed is the maintainer's reading of the **CLI's role**: `apps/pair-cli` exists as *support tooling for the team*, and CI machinery a human will never type does not belong on that surface. Every command added to the CLI is permanent published surface; the ratchet is pipeline plumbing.

The other constraint stands exactly as ADR-022 stated it: one implementation, no drift between what pair runs and what an adopter runs, and no loss of the ~80 white-box assertions over a credential-and-force-push write path (ADL 2026-07-13: gate-tooling logic lives in a tested module). A hand-written bash port fails all three — that rejection remains in force.

## Decision

The ratchet ships as a **generated KB asset**, closing the loop differently:

- The implementation stays where it always was: `packages/knowledge-hub/src/tools/coverage-baseline-ratchet.ts` — typed, linted, unit-tested. No source change.
- A build step (`pnpm --filter @pair/knowledge-hub ratchet:asset`, `src/tools/build-ratchet-asset.ts`) transpiles it with the already-present `typescript` compiler to a self-contained CommonJS file and writes **both** copies:
  - `packages/knowledge-hub/dataset/.pair/knowledge/assets/coverage-ratchet.cjs` — the shipped corpus
  - `.pair/knowledge/assets/coverage-ratchet.cjs` — pair's own installed copy
  The module imports only node builtins, so a single-file transpile is a complete program; CommonJS output keeps its `require.main === module` entrypoint working under plain `node`.
- `/pair-capability-setup-gates` emits `node .pair/knowledge/assets/coverage-ratchet.cjs …` in the adopter's push-triggered workflow — the file `pair install` put there. No npm registry round-trip, no version pin to maintain, no new command.
- Pair's own CI step invokes the same relative path from its installed copy.
- A conformance gate (`conformance/coverage-ratchet-asset.test.ts`) compiles the source fresh and asserts both committed copies match byte-for-byte: editing an asset by hand, or editing the source without regenerating, turns red. The smoke scenario executes the shipped `.cjs` end-to-end.

## Consequences

- **No CLI surface growth**: nothing added to the registry, dispatcher, docs reference or changesets; the CLI keeps its team-support scope.
- **One implementation survives**: the asset is a build artifact of the tested source, so the ADR-022 invariant "no ported copy to drift" holds by construction — now enforced mechanically rather than by convention.
- **Adopters need Node in their pipeline** (as with the CLI option; bash would not have removed any GitHub-specific dependency — `gh` and the event environment are the design).
- The asset must be regenerated whenever the source changes; the drift guard makes forgetting impossible to miss.
