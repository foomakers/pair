# Decision: Test co-location for multi-module tests — root-of-call-chain, not a standalone file

## Date

2026-07-08

## Status

Active

## Category

Convention Adoption

## Context

The existing co-location rule (`file-structure.md`: "Always co-locate test files with implementation") only covers the 1:1 case — one module, one sibling test file. It has no guidance for a test that exercises more than one module together (e.g. an integration test driving two collaborating command handlers end-to-end). Found in #238: `apps/pair-cli/src/commands/update/idempotent-skill-registry.test.ts` tested both `update/handler.ts`'s `handleUpdateCommand` and `install/handler.ts`'s `handleInstallCommand` from a standalone file matching neither, alongside the two directories' own pre-existing `handler.test.ts` siblings.

## Decision

A test spanning multiple modules is placed in the test file already co-located with the *root* module of the call chain it verifies — the module whose exported entry point the test is actually asserting on, even if the test also drives other modules as setup or as part of the same flow. No standalone integration-test file is created for the combination.

Applied to `idempotent-skill-registry.test.ts`: its `update`-focused cases (idempotency across repeated runs, prefix change, removed-skill reference) moved into `update/handler.test.ts` (root: `handleUpdateCommand`); its `install`-only cases (external KB via `--source`, name collision) moved into `install/handler.test.ts` (root: `handleInstallCommand`). The standalone file was deleted.

This does not apply to end-to-end/page-level tests (named after the user flow or page they exercise, e.g. `landing.e2e.test.ts`) or content/asset-validation tests (named after the asset they validate, e.g. `agents-md.test.ts`, which has no single source module to co-locate against) — both are pre-existing, distinct categories this decision leaves untouched.

**Amendment (2026-07-12, PR #311 review)**: the e2e exemption above was descriptive ("named after the user flow") but not mechanically checkable — a reviewer could not verify compliance without judgment. Made explicit with three checkable criteria, all of which must hold for a `*.e2e.test.ts` file to qualify:

1. **Named after a real flow**: the file name corresponds to an identifiable user-facing flow or CLI command, not an arbitrary grouping of convenience.
2. **Additive, not sole coverage**: every module/command the e2e file exercises also has its own co-located unit test file covering its non-integration behavior — the e2e file must be additive cross-cutting coverage, never the only coverage for a module.
3. **Genuine cross-module interaction**: the file exercises more than one command/module with a real interaction between them. An e2e-named file touching exactly one module with no cross-module flow is a signal it should be a regular unit test in that module's own test file instead, not evidence for the exemption.

## Alternatives Considered

- **Keep standalone integration-test files, named after the scenario**: Rejected. Scales into a parallel "integration tests" file tree that duplicates or drifts from the sibling `handler.test.ts` files already covering the same root modules, and breaks the "one root module → one test file" discoverability the co-location rule exists for.
- **One `integration.test.ts` per command directory**: Rejected. Adds a second file per directory with no clearer ownership than the existing `handler.test.ts` — the root-of-call-chain rule gives an unambiguous single destination without adding a new file-naming pattern.

## Consequences

- `file-structure.md`'s Co-location Rules section gains an explicit rule for the multi-module case, closing the gap this decision was prompted by.
- Future integration-style tests in this codebase (and any project adopting this KB) have an unambiguous placement rule instead of ad hoc naming per author.

## Adoption Impact

- `packages/knowledge-hub/dataset/.pair/knowledge/guidelines/code-design/code-organization/file-structure.md` (+ root mirror `.pair/knowledge/guidelines/code-design/code-organization/file-structure.md`): Co-location Rules section extended with the multi-module case and its two exceptions.
- `apps/pair-cli/src/commands/update/idempotent-skill-registry.test.ts`: deleted; its cases moved into `update/handler.test.ts` and `install/handler.test.ts`.
