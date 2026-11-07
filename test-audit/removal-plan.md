# Removal plan

Commits inside the single PR, safest class first (U6 is quarantined, never removed). Mutation score and branch coverage must not fall: not measured here (no mutation tool) — removals are limited to classes with a deterministic static signal.

## U2 — audit/U2-no-assertions

- remove `apps/pair-cli/src/commands/dispatcher.test.ts::dispatchCommand() - real handlers integration > dispatches update-link command` — assertions=0
- remove `apps/pair-cli/src/kb-manager/cache-manager.test.ts::cache-manager > restoreCachedKB is no-op when no backup exists` — assertions=0
- remove `apps/pair-cli/src/kb-manager/cache-manager.test.ts::cache-manager > removeBackupKB is no-op when no backup exists` — assertions=0
- remove `apps/pair-cli/src/registry/operations.test.ts::distributeToSecondaryTargets > handles empty targets array` — assertions=0
- remove `apps/pair-cli/src/registry/skill-refs.test.ts::rewriteSkillRefsInTarget > no-op when target does not exist` — assertions=0
- remove `apps/pair-cli/src/registry/skill-refs.test.ts::detectOrphanedSkillReferences > does nothing when there are no orphaned names` — assertions=0
- remove `packages/content-ops/src/ops/link-rewriter.test.ts::rewriteLinksInFile > warns on unresolvable links but does not fail` — assertions=0
- protected, kept `apps/website/app/a11y-report.ct.test.tsx::<dynamic>` — assertions=0
- protected, kept `apps/website/app/a11y-report.ct.test.tsx::@a11y-report pages > landing page` — assertions=0
- protected, kept `apps/website/app/a11y-report.ct.test.tsx::@a11y-report pages > privacy page` — assertions=0
- protected, kept `packages/brand/src/components/a11y-report.ct.test.tsx::<dynamic>` — assertions=0
- protected, kept `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Button > primary` — assertions=0
- protected, kept `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Button > secondary` — assertions=0
- protected, kept `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Button > ghost` — assertions=0
- protected, kept `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Button > outline` — assertions=0
- protected, kept `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Button > as="a"` — assertions=0
- protected, kept `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Button > disabled` — assertions=0
- protected, kept `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Card > default` — assertions=0
- protected, kept `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Card > glow` — assertions=0
- protected, kept `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Card > glass` — assertions=0
- protected, kept `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Logo > favicon` — assertions=0
- protected, kept `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Logo > navbar` — assertions=0
- protected, kept `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Logo > full` — assertions=0
- protected, kept `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Callout > info` — assertions=0
- protected, kept `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Callout > warning` — assertions=0
- protected, kept `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Callout > tip` — assertions=0
- protected, kept `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Callout > with title` — assertions=0

## U3

not measured: no U3 signal available.

## U8

not measured: no U8 signal available.

## U5

not measured: no U5 signal available.

## U1

not measured: no U1 signal available.

## U4 — audit/U4-change-detector

no candidates.

## U7

not measured: no U7 signal available.

## U6 — audit/U6-quarantine

- quarantine `packages/dev-tools/src/quality-gates/sync-version-in-docs.test.ts::readGitignoreExcludes > returns [] when no .gitignore exists at root` — failed in 6/10 seeded random-order runs (seeds 201-210): shared tmp root written by a sibling test
- quarantine `packages/knowledge-hub/src/tools/skills-conformance-check.test.ts::checkStepMarkers > fails when neither the skill nor a disclosed sibling points at the gate convention` — failed in 4/10 seeded random-order runs (seeds 201-210): shared fixture root mutated across tests
- quarantine `packages/knowledge-hub/src/tools/skills-conformance-check.test.ts::checkStepMarkers > accepts the convention pointer in a DISCLOSED SIBLING (progressive disclosure)` — failed in 6/10 seeded random-order runs (seeds 201-210): shared fixture root mutated across tests
