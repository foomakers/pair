# Decision: the manual CLI artifact ships without type declarations, and says so

## Date

2026-08-12

## Status

Active

## Category

Tooling Preference

## Context

`scripts/workflows/release/package-manual.sh` builds the manual (zip) release artifact for `@pair/pair-cli` and, as its last packaging step, runs `dts-bundle-generator` to emit `bundle-cli/index.d.ts`. Against this repo's current TypeScript the generator dies with `TypeError: Cannot read properties of undefined (reading 'getCurrentDirectory')`; the script caught that and printed `Warning: dts-bundle-generator failed, skipping types`, then continued.

Until now that warning was visible only to whoever ran `pnpm smoke-tests` locally. Story #400 put the smoke suite in CI, so `00-create-install-package.sh` — a scenario that reports `✅ PASS` — now publishes the failure twice in **every** PR's job log. A tolerated warning inside a green row is the exact shape #400 exists to remove: a reader cannot tell at a glance whether the new job's log is trustworthy. The review of PR #424 raised it as an open question rather than a blocker: *is the artifact meant to ship type declarations at all?*

Two facts settle it. The artifact's entry point is `bin/pair-cli` (a shell wrapper over `bundle-cli/index.js`); it is installed and **executed**, never `import`ed — nothing in the smoke suite, the install docs or the release flow consumes it as a library. And the emitted `package.json` set `types: 'bundle-cli/index.d.ts'` **unconditionally**, before the generator ran — so on every failure the artifact advertised a file it did not contain.

## Decision

**The manual CLI artifact deliberately does not ship bundled type declarations.** `index.d.ts` is a best-effort nicety, not part of the artifact's contract.

Three consequences are implemented in `package-manual.sh`:

1. The generator step stays **best-effort** and its message states the outcome as intended rather than as a swallowed failure: `Note: type declarations not bundled — the manual artifact is an executable CLI (bin/), not an importable library, so types are optional here.`
2. The emitted `package.json` **omits `types`** whenever `bundle-cli/index.d.ts` is absent, so the artifact never advertises a file it does not contain. Consistency is asserted by the packaging smoke scenario (`00-create-install-package.sh`), not left to the reader.
3. The `dts-bundle-generator` incompatibility itself is **not** fixed here and is **not** silently accepted as unknown: it is a known upstream/TS-version breakage on an optional output. Making it fatal would turn an optional nicety into a release blocker.

The artifact's contract is therefore: `bin/pair-cli` + `bundle-cli/index.js` + docs. Types are not in it.

## Alternatives Considered

- **Fix `dts-bundle-generator` and keep types in the contract**: this would make a genuine packaging defect out of a step nothing consumes. The artifact has no importable entry point, so the `.d.ts` would be generated for no reader — and, once in the contract, its next breakage becomes a release blocker.
- **Make the failure fatal (`exit 1`)**: honest about the current state, but it blocks the manual release on an output nobody uses. Rejected for the same reason as above.
- **Leave the warning as-is**: rejected — this is precisely the "tolerated warning inside a green row" family #400 removes, and it is now printed on every PR. It also left `types` pointing at a missing file, which is a real (if small) artifact defect rather than a cosmetic one.
- **Drop the `dts-bundle-generator` step entirely**: rejected for now — when the generator works it produces a harmless nicety, and removing the step would discard the option silently. Best-effort keeps it available without promising it.

## Consequences

- The manual artifact's `package.json` no longer claims `types` when the file is missing; when generation succeeds, `types` is present exactly as before. Nothing about the executable path changes.
- The CI smoke log stops reading like a swallowed failure: the line now says the artifact is an executable CLI and types are optional here.
- Packaging invariants are asserted, not documented: `00-create-install-package.sh` fails if `package.json` declares `types` while `bundle-cli/index.d.ts` is absent (or vice versa) — so the two can no longer drift.
- If the artifact ever gains an importable entry point, this decision must be revisited **first**: types would move into the contract and the generator failure would become a genuine defect.

## Adoption Impact

- `.pair/adoption/tech/infrastructure.md` — records the manual CLI artifact's contract (executable, not importable; no bundled type declarations) alongside the other release/deploy facts.
- No change to `tech-stack.md`: `dts-bundle-generator` stays a dev dependency, used best-effort.
