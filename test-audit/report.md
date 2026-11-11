# Test audit report

Base revision: `a6d44173199870fba4fc9c0aed46ccacf43c8b8a`. Regenerate: `pnpm --filter @pair/dev-tools test-audit`.

## Reconciliation by module and level

| module | level | before | audited | unnecessary | protected | removed | rewritten | added | remaining | unmeasured |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| .claude/workflows | unit | 1637 | 1637 | 0 | 317 | 0 | 0 | 0 | 1637 | 1637 |
| apps/pair-cli | unit | 2892 | 2892 | 6 | 740 | 0 | 6 | 0 | 2892 | 2892 |
| apps/pair-cli | integration | 3 | 3 | 0 | 0 | 0 | 0 | 0 | 3 | 3 |
| apps/pair-cli | e2e | 10 | 10 | 0 | 7 | 0 | 0 | 0 | 10 | 10 |
| apps/website | unit | 263 | 263 | 0 | 37 | 0 | 0 | 0 | 263 | 263 |
| apps/website | e2e | 41 | 41 | 0 | 2 | 0 | 0 | 0 | 41 | 41 |
| packages/brand | unit | 138 | 138 | 0 | 52 | 0 | 0 | 0 | 138 | 138 |
| packages/content-ops | unit | 748 | 748 | 1 | 52 | 0 | 1 | 0 | 748 | 748 |
| packages/dev-tools | unit | 617 | 617 | 1 | 389 | 0 | 0 | 94 | 711 | 617 |
| packages/knowledge-hub | unit | 3842 | 3842 | 2 | 1287 | 0 | 0 | 0 | 3842 | 3842 |
| qa | unit | 6 | 6 | 0 | 0 | 0 | 0 | 0 | 6 | 6 |
| scripts | unit | 31 | 31 | 0 | 1 | 0 | 0 | 0 | 31 | 31 |
| **total** | | 10228 | 10228 | 10 | 2884 | 0 | 7 | 94 | 10322 | 10228 |

`before − removed + added = remaining`. `unnecessary` = classified and not protected; `unmeasured` = at least one class signal has no supported tool.

## Classes (confirmed by deterministic signal)

| class | tests |
| --- | ---: |
| U1 | not measured |
| U2 | 27 |
| U3 | not measured |
| U4 | 0 |
| U5 | not measured |
| U6 | 3 |
| U7 | not measured |
| U8 | not measured |

## Baseline (F0)

Runner: vitest 3.2.4, --sequence.shuffle with recorded seed per run. Mutation: not measured (no supported tool installed). Per-test coverage: not measured.

| package | tests | wall ms (median of runs) | line cov % | branch cov % | mutation score |
| --- | ---: | ---: | ---: | ---: | ---: |
| apps/pair-cli | 3636 | 111381 | 95.54 | 92.06 | not measured |
| apps/website | 301 | 7704 | 41.7 | 85.98 | not measured |
| packages/brand | 78 | 2688 | 85.04 | 89.28 | not measured |
| packages/content-ops | 771 | 2876 | 92.08 | 88.02 | not measured |
| packages/dev-tools | 874 | 76578 | not measured | not measured | not measured |
| packages/knowledge-hub | 7227 | 5463 | not measured | not measured | not measured |

## Repeated gate runs vs duplicate cases

One full suite run: 206690 ms (sum of per-package median wall time, 3 baseline runs). Stages that each re-run it on the same head: implement (verify-quality), pre-push (quality-gate), review (verify) → 3 runs, 620070 ms (derived: runs × measured median; per-stage wall time is not measured).

This cost is **repeat execution**, not duplicate test cases: duplicates are counted only by U3 (unique kills = 0 and unique coverage = 0), which is not measured here. Removing a test case lowers each repeat run; it does not remove a repeated stage.

Reuse of a stage result is allowed only under the same evidence identity and custody: `cycle-state.mjs test-identity` (command + cwd + env keys + toolchain + head tree) must match, and the run must come from the verified PR head.

## Cleanup applied

- Removed: 0 — removal needs a confirmed signal; the removable classes (U1, U3, U5, U7, U8) are not measured and U2 candidates were rewritten.
- Rewritten (U2, explicit assertion added, same id): 7
  - `apps/pair-cli/src/kb-manager/cache-manager.test.ts::cache-manager > restoreCachedKB is no-op when no backup exists`
  - `apps/pair-cli/src/kb-manager/cache-manager.test.ts::cache-manager > removeBackupKB is no-op when no backup exists`
  - `apps/pair-cli/src/registry/operations.test.ts::distributeToSecondaryTargets > handles empty targets array`
  - `apps/pair-cli/src/registry/skill-refs.test.ts::rewriteSkillRefsInTarget > no-op when target does not exist`
  - `apps/pair-cli/src/registry/skill-refs.test.ts::detectOrphanedSkillReferences > does nothing when there are no orphaned names`
  - `apps/pair-cli/src/commands/dispatcher.test.ts::dispatchCommand() - real handlers integration > dispatches update-link command`
  - `packages/content-ops/src/ops/link-rewriter.test.ts::rewriteLinksInFile > warns on unresolvable links but does not fail`
- Quarantined (U6): 3
  - `packages/dev-tools/src/quality-gates/sync-version-in-docs.test.ts::readGitignoreExcludes > returns [] when no .gitignore exists at root` — failed in 6/10 seeded random-order runs (seeds 201-210): shared tmp root written by a sibling test; tracking issue: pending (not created by the implementer)
  - `packages/knowledge-hub/src/tools/skills-conformance-check.test.ts::checkStepMarkers > fails when neither the skill nor a disclosed sibling points at the gate convention` — failed in 4/10 seeded random-order runs (seeds 201-210): shared fixture root mutated across tests; tracking issue: pending (not created by the implementer)
  - `packages/knowledge-hub/src/tools/skills-conformance-check.test.ts::checkStepMarkers > accepts the convention pointer in a DISCLOSED SIBLING (progressive disclosure)` — failed in 6/10 seeded random-order runs (seeds 201-210): shared fixture root mutated across tests; tracking issue: pending (not created by the implementer)
- Permitted exceptions used: none (no U8 removal, so no mutation-score exception; no U5/U8 branch-coverage reduction).
- Unmeasured: mutation score per module and U1, U3, U5, U7 (unique kills), U8 — not measured: no supported tool installed, nothing removed on those classes.

## Flagged tests

| test | classes | signal | protected | action |
| --- | --- | --- | --- | --- |
| `apps/pair-cli/src/commands/dispatcher.test.ts::dispatchCommand() - real handlers integration > dispatches update-link command` | U2 | assertions=0 | false | remove |
| `apps/pair-cli/src/kb-manager/cache-manager.test.ts::cache-manager > restoreCachedKB is no-op when no backup exists` | U2 | assertions=0 | false | remove |
| `apps/pair-cli/src/kb-manager/cache-manager.test.ts::cache-manager > removeBackupKB is no-op when no backup exists` | U2 | assertions=0 | false | remove |
| `apps/pair-cli/src/registry/operations.test.ts::distributeToSecondaryTargets > handles empty targets array` | U2 | assertions=0 | false | remove |
| `apps/pair-cli/src/registry/skill-refs.test.ts::rewriteSkillRefsInTarget > no-op when target does not exist` | U2 | assertions=0 | false | remove |
| `apps/pair-cli/src/registry/skill-refs.test.ts::detectOrphanedSkillReferences > does nothing when there are no orphaned names` | U2 | assertions=0 | false | remove |
| `apps/website/app/a11y-report.ct.test.tsx::<dynamic>` | U2 | assertions=0 | true | keep |
| `apps/website/app/a11y-report.ct.test.tsx::@a11y-report pages > landing page` | U2 | assertions=0 | true | keep |
| `apps/website/app/a11y-report.ct.test.tsx::@a11y-report pages > privacy page` | U2 | assertions=0 | true | keep |
| `packages/brand/src/components/a11y-report.ct.test.tsx::<dynamic>` | U2 | assertions=0 | true | keep |
| `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Button > primary` | U2 | assertions=0 | true | keep |
| `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Button > secondary` | U2 | assertions=0 | true | keep |
| `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Button > ghost` | U2 | assertions=0 | true | keep |
| `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Button > outline` | U2 | assertions=0 | true | keep |
| `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Button > as="a"` | U2 | assertions=0 | true | keep |
| `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Button > disabled` | U2 | assertions=0 | true | keep |
| `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Card > default` | U2 | assertions=0 | true | keep |
| `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Card > glow` | U2 | assertions=0 | true | keep |
| `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Card > glass` | U2 | assertions=0 | true | keep |
| `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Logo > favicon` | U2 | assertions=0 | true | keep |
| `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Logo > navbar` | U2 | assertions=0 | true | keep |
| `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Logo > full` | U2 | assertions=0 | true | keep |
| `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Callout > info` | U2 | assertions=0 | true | keep |
| `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Callout > warning` | U2 | assertions=0 | true | keep |
| `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Callout > tip` | U2 | assertions=0 | true | keep |
| `packages/brand/src/components/a11y-report.ct.test.tsx::@a11y-report Callout > with title` | U2 | assertions=0 | true | keep |
| `packages/content-ops/src/ops/link-rewriter.test.ts::rewriteLinksInFile > warns on unresolvable links but does not fail` | U2 | assertions=0 | false | remove |
| `packages/dev-tools/src/quality-gates/sync-version-in-docs.test.ts::readGitignoreExcludes > returns [] when no .gitignore exists at root` | U6 | failed in 6/10 seeded random-order runs (seeds 201-210): shared tmp root written by a sibling test | false | quarantine |
| `packages/knowledge-hub/src/tools/skills-conformance-check.test.ts::checkStepMarkers > fails when neither the skill nor a disclosed sibling points at the gate convention` | U6 | failed in 4/10 seeded random-order runs (seeds 201-210): shared fixture root mutated across tests | false | quarantine |
| `packages/knowledge-hub/src/tools/skills-conformance-check.test.ts::checkStepMarkers > accepts the convention pointer in a DISCLOSED SIBLING (progressive disclosure)` | U6 | failed in 6/10 seeded random-order runs (seeds 201-210): shared fixture root mutated across tests | false | quarantine |

Removed: 0. Added by this story: 94.
