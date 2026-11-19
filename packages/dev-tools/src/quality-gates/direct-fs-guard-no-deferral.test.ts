import { fileSystemService as fs } from '@pair/content-ops'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

import { checkRegistry, REGISTRY_PATH } from './direct-fs-guard'
import { REPO_ROOT } from './repo-root'

// r1-g2 (r0-1): AC2/AC3/AC6 — no effort-based deferral; only reasoned boundary exceptions remain.
const DEFERRED = 'deferred-migration'
const GUIDELINES = [
  '.pair/knowledge/guidelines/testing/unit-testing/mocking-strategies.md',
  'packages/knowledge-hub/dataset/.pair/knowledge/guidelines/testing/unit-testing/mocking-strategies.md',
]
const read = (p: string) => fs.readFile(join(REPO_ROOT, p))
const dep = [{ form: 'import' as const, specifier: 'fs', line: 1 }]
const row = (disposition: string) => ({
  path: 'a.ts',
  disposition,
  reason: 'r',
  decision: 'd',
  testCategory: 't',
})

const ALLOWED = [
  'os-guarantee',
  'standalone-script',
  'type-contract',
  'boundary-adapter',
  'repo-contract',
  'in-flight-churn',
]
const EFFORT = /effort|not migrated in this PR|delivery stage/i
// Reviewed, pinned set of in-scope PRODUCTION paths that may keep a registry row (reasoned boundary
// exceptions). Any other production file in the migration scope must route fs through FileSystemService
// and carry no row — no reason keyword can relabel it in.
const SCOPE =
  /^(?:apps\/pair-cli\/(?:src|scripts)|apps\/website\/lib|packages\/dev-tools\/src|packages\/knowledge-hub\/src\/tools)\//
const TEST_PATH = /\.(?:test|spec)\.[cm]?[jt]sx?$|\/test-utils\//
const EXCEPTION_PRODUCTION = new Set([
  'apps/pair-cli/src/commands/run/fixtures/recovered-custody.ts',
  'packages/dev-tools/src/quality-gates/direct-fs-guard.ts', // repo-contract: the root guard reads real disk
  'apps/pair-cli/src/registry/llms-generation.ts', // type-contract: types only
  'apps/pair-cli/scripts/postbuild.js', // standalone-script: runs before the package is built
  'packages/knowledge-hub/src/tools/mirror-realign.ts', // standalone-script: shipped node-builtins-only .cjs asset (build-realign-asset.ts)
  'packages/knowledge-hub/src/tools/coverage-baseline-ratchet.ts', // standalone-script: shipped node-builtins-only .cjs asset (build-ratchet-asset.ts)
])
// Reviewed, pinned set of in-scope TEST paths that may keep a registry row (real process/OS/repo-contract
// boundaries, type-only fs). Every other in-scope test must use InMemoryFileSystemService and carry no row.
const EXCEPTION_TESTS = new Set([
  'apps/pair-cli/src/commands/run/cycle-recovered-custody-authority.test.ts',
  'apps/pair-cli/src/commands/run/cycle-sibling-recovery.test.ts',
  'apps/pair-cli/src/commands/dispatcher.test.ts',
  'apps/pair-cli/src/commands/install/workflow-presets.test.ts',
  'apps/pair-cli/src/commands/package/link-rewriter.test.ts',
  'apps/pair-cli/src/commands/package/round-trip.test.ts',
  'apps/pair-cli/src/commands/telemetry/telemetry.test.ts',
  'apps/pair-cli/src/commands/tokens/tokens.acceptance.test.ts',
  'apps/pair-cli/src/commands/tokens/tokens.pipe.test.ts',
  'apps/pair-cli/src/kb-manager/git-clone.integration.test.ts',
  'apps/pair-cli/src/registry/atomic-target-race.test.ts',
  'apps/pair-cli/src/registry/atomic-target.test.ts',
  'apps/pair-cli/src/registry/board-authorization-install.test.ts',
  'apps/pair-cli/src/registry/layout.test.ts',
  'apps/pair-cli/src/registry/llms-generation.win32.test.ts',
  'apps/pair-cli/src/registry/symlink-race.test.ts',
  'apps/pair-cli/src/test-utils/cli-entry.ts',
  'apps/website/lib/adoption-files-fences.test.ts',
  'apps/website/lib/ci-docs-staleness-env.test.ts',
  'apps/website/lib/deploy-build-command.test.ts',
  'apps/website/lib/docs-ia.test.ts',
  'apps/website/lib/docs-staleness-check.test.ts',
  'apps/website/lib/source.test.ts',
  'apps/website/lib/turbo-source-order.test.ts',
  'apps/website/lib/whats-new-guard.test.ts',
  'packages/dev-tools/src/quality-gates/ci-staleness-checkout-depth.test.ts',
  'packages/dev-tools/src/quality-gates/delivery-process-docs.test.ts',
  'packages/dev-tools/src/quality-gates/direct-fs-guard-run.test.ts',
  'packages/dev-tools/src/quality-gates/format-workflow-composition.test.ts',
  'packages/dev-tools/src/quality-gates/pre-push-gate-composition.test.ts',
  'packages/dev-tools/src/quality-gates/smoke-ci-platform.test.ts',
  'packages/dev-tools/src/quality-gates/smoke-scenario-modes.test.ts',
  'packages/dev-tools/src/release/deploy-website-workflow.test.ts',
  'packages/dev-tools/src/release/release-concurrency.test.ts',
  'packages/dev-tools/src/release/release-sandbox.test.ts',
  'packages/dev-tools/src/release/release-workflows.test.ts',
  'packages/dev-tools/src/test-audit/inventory.policy.controls.test.ts',
  'packages/knowledge-hub/src/tools/claude-plugin-manifest.test.ts',
  'packages/knowledge-hub/src/tools/mirror-guard.test.ts',
  'packages/knowledge-hub/src/tools/skill-md-mirror.test.ts',
  'packages/knowledge-hub/src/tools/skills-guide-mirror.test.ts',
])
// Reviewed, pinned set of OUT-of-SCOPE paths (not editable by this story) that may keep an exception row.
// A path outside migration SCOPE cannot be migrated here, so it may only be relabeled by being listed.
const EXCEPTION_OUT_OF_SCOPE = new Set([
  'packages/knowledge-hub/src/conformance/fixtures/red-snapshot-r5-mutation.mjs',
  'packages/knowledge-hub/src/conformance/fixtures/red-snapshot-r5-witness.mjs',
  'packages/knowledge-hub/src/conformance/fixtures/red-snapshot-whole-index-probe.mjs',
  'apps/website/scripts/landing-video/github-scroll.mjs',
  'apps/website/scripts/landing-video/login-closing.mjs',
  'packages/content-ops/src/file-system/file-operations.ts',
  'packages/content-ops/src/file-system/file-system-service.test.ts',
  'packages/content-ops/src/file-system/file-system-sync-parity.test.ts',
  'packages/content-ops/src/file-system/file-validations.ts',
  'packages/content-ops/src/file-system/path-containment.test.ts',
  'packages/content-ops/src/ops/copy/copy-symlink-containment.test.ts',
  'packages/content-ops/src/ops/copy/copyPathOps.ts',
  'packages/content-ops/src/ops/movePathOps.ts',
  'packages/content-ops/src/ops/path-operation-helpers.ts',
  'packages/content-ops/src/test-utils/in-memory-fs/in-memory-fs-read.ts',
  'packages/content-ops/src/test-utils/in-memory-fs/in-memory-fs-state.ts',
  'packages/content-ops/src/test-utils/in-memory-fs/in-memory-fs.ts',
  'packages/knowledge-hub/dataset/.pair/knowledge/assets/coverage-ratchet.cjs',
  'packages/knowledge-hub/dataset/.pair/knowledge/assets/mirror-realign.cjs',
  'packages/knowledge-hub/dataset/.skills/capability/publish-pr/scripts/word-limits.mjs',
  'packages/knowledge-hub/dataset/.skills/capability/write-issue/scripts/word-limits.mjs',
  'packages/knowledge-hub/dataset/.skills/next/control-state.mjs',
  'packages/knowledge-hub/dataset/.skills/process/review/scripts/word-limits.mjs',
  'packages/knowledge-hub/src/conformance/adoption-informed-generation.test.ts',
  'packages/knowledge-hub/src/conformance/adr-template.test.ts',
  'packages/knowledge-hub/src/conformance/agent-harness-guides.test.ts',
  'packages/knowledge-hub/src/conformance/agents-md.test.ts',
  'packages/knowledge-hub/src/conformance/analyze-delivery-metrics.test.ts',
  'packages/knowledge-hub/src/conformance/analyze-test-skills-root-scripts.test.ts',
  'packages/knowledge-hub/src/conformance/analyze-test-skills.test.ts',
  'packages/knowledge-hub/src/conformance/approval-signal.test.ts',
  'packages/knowledge-hub/src/conformance/assess-cost.test.ts',
  'packages/knowledge-hub/src/conformance/assess-coupling.test.ts',
  'packages/knowledge-hub/src/conformance/assess-output-only.test.ts',
  'packages/knowledge-hub/src/conformance/assess-security.test.ts',
  'packages/knowledge-hub/src/conformance/automation-eligibility.test.ts',
  'packages/knowledge-hub/src/conformance/autonomous-prepare-skills.test.ts',
  'packages/knowledge-hub/src/conformance/autonomy-arguments.test.ts',
  'packages/knowledge-hub/src/conformance/bootstrap-classification-delta.test.ts',
  'packages/knowledge-hub/src/conformance/bootstrap.test.ts',
  'packages/knowledge-hub/src/conformance/brainstorm-phases.test.ts',
  'packages/knowledge-hub/src/conformance/classify.test.ts',
  'packages/knowledge-hub/src/conformance/code-host-routing.test.ts',
  'packages/knowledge-hub/src/conformance/code-review-verdict-first.test.ts',
  'packages/knowledge-hub/src/conformance/coverage-ratchet-adopter-path.test.ts',
  'packages/knowledge-hub/src/conformance/coverage-ratchet-asset.test.ts',
  'packages/knowledge-hub/src/conformance/cycle-hooks-cwd.test.ts',
  'packages/knowledge-hub/src/conformance/cycle-hooks-schema.test.ts',
  'packages/knowledge-hub/src/conformance/cycle-overview-backlink.test.ts',
  'packages/knowledge-hub/src/conformance/dataset-adoption-no-leak.test.ts',
  'packages/knowledge-hub/src/conformance/definition-of-ready-and-done.test.ts',
  'packages/knowledge-hub/src/conformance/delivery-cycle-process-gaps.test.ts',
  'packages/knowledge-hub/src/conformance/delivery-metrics.test.ts',
  'packages/knowledge-hub/src/conformance/doc-groups.test.ts',
  'packages/knowledge-hub/src/conformance/docs-page-coverage.test.ts',
  'packages/knowledge-hub/src/conformance/headless-stage-execution.test.ts',
  'packages/knowledge-hub/src/conformance/implement-compose-close.test.ts',
  'packages/knowledge-hub/src/conformance/implement-phase-fresh-branch.test.ts',
  'packages/knowledge-hub/src/conformance/implementation-never-files-a-card.test.ts',
  'packages/knowledge-hub/src/conformance/mirror-realign-asset.test.ts',
  'packages/knowledge-hub/src/conformance/mirror-realignment.test.ts',
  'packages/knowledge-hub/src/conformance/output-shapes.test.ts',
  'packages/knowledge-hub/src/conformance/pair-assistant-config-guide.test.ts',
  'packages/knowledge-hub/src/conformance/pair-assistant-install-footprint.test.ts',
  'packages/knowledge-hub/src/conformance/pair-loop-dispatch.test.ts',
  'packages/knowledge-hub/src/conformance/pair-next-autonomy-selection.test.ts',
  'packages/knowledge-hub/src/conformance/pair-next-control-state.test.ts',
  'packages/knowledge-hub/src/conformance/pair-next-scoping.test.ts',
  'packages/knowledge-hub/src/conformance/pm-tool-adapter-contract.test.ts',
  'packages/knowledge-hub/src/conformance/pr-state-flow.test.ts',
  'packages/knowledge-hub/src/conformance/process-profile.test.ts',
  'packages/knowledge-hub/src/conformance/quality-model.test.ts',
  'packages/knowledge-hub/src/conformance/record-decision.test.ts',
  'packages/knowledge-hub/src/conformance/refine-story-draft-to-ready.test.ts',
  'packages/knowledge-hub/src/conformance/review-identity.test.ts',
  'packages/knowledge-hub/src/conformance/review-phase-classifies.test.ts',
  'packages/knowledge-hub/src/conformance/scoped-context-skills.test.ts',
  'packages/knowledge-hub/src/conformance/secret-scanning.test.ts',
  'packages/knowledge-hub/src/conformance/setup-pm.test.ts',
  'packages/knowledge-hub/src/conformance/skills-defects-b.test.ts',
  'packages/knowledge-hub/src/conformance/story-local-markers.test.ts',
  'packages/knowledge-hub/src/conformance/task-progress-feedback.test.ts',
  'packages/knowledge-hub/src/conformance/telemetry-card-final-state.test.ts',
  'packages/knowledge-hub/src/conformance/template-resolution.test.ts',
  'packages/knowledge-hub/src/conformance/template-shrink.test.ts',
  'packages/knowledge-hub/src/conformance/timeouts-section.test.ts',
  'packages/knowledge-hub/src/conformance/to-issues-triage.test.ts',
  'packages/knowledge-hub/src/conformance/verified-writes-contract.test.ts',
  'packages/knowledge-hub/src/conformance/verify-quality.test.ts',
  'packages/knowledge-hub/src/conformance/web-cloud-environment.test.ts',
  'packages/knowledge-hub/src/conformance/workflow-scripts-shape.test.ts',
  'packages/knowledge-hub/src/conformance/working-area.test.ts',
  'scripts/dev/hook-git-env.test.mjs',
  'scripts/dev/rtk-review-hook.mjs',
  'scripts/dev/rtk-review-hook.test.mjs',
  'scripts/dev/rtk-session-path.mjs',
  'scripts/dev/rtk-session-path.test.mjs',
  'scripts/smoke-tests/witnesses/packaged-control-state-615.mjs',
  'scripts/smoke-tests/witnesses/packaged-control-state-build-tree-615.mjs',
])
// Former deferred-migration rows outside SCOPE: each spawns a real process (git/sh/bash/node script) or
// runs a repo script over a real temp tree, so the only honest resolution is a real-boundary exception.
const FORMER_DEFERRED_OUT_OF_SCOPE = [
  'packages/knowledge-hub/src/conformance/cycle-autonomy-active.test.ts',
  'packages/knowledge-hub/src/conformance/github-automation.test.ts',
  'packages/knowledge-hub/src/conformance/macro-phase-modes.test.ts',
  'scripts/dev/delivery-process-overwrite.test.mjs',
  'scripts/dev/sealed-manifest-format.test.mjs',
  'scripts/smoke-tests/lib/run-card-omission.test.js',
]
const REAL_BOUNDARY = ['os-guarantee', 'repo-contract']
const ZONE =
  /^apps\/pair-cli\/src\/commands\/run\/|^packages\/knowledge-hub\/dataset\/\.(skills\/workflow|workflows)\//
const ADAPTER = 'packages/content-ops/src/file-system/file-system-service.ts'

interface Row {
  path: string
  disposition: string
  reason?: string
  decision?: string
  observedOperations?: string[]
}
interface Registry {
  dispositionCounts: Record<string, number>
  rows: Row[]
}
const registry = async (): Promise<Registry> => JSON.parse(await read(REGISTRY_PATH))

describe('direct-fs registry carries no deferral', () => {
  it('has no deferred-migration row', async () => {
    const { rows } = await registry()
    expect(rows.filter(r => r.disposition === DEFERRED)).toEqual([])
  })

  it('has no deferred-migration key in dispositionCounts', async () => {
    expect(Object.keys((await registry()).dispositionCounts)).not.toContain(DEFERRED)
  })

  it('keeps dispositionCounts equal to the rows', async () => {
    const { rows, dispositionCounts } = await registry()
    const counted: Record<string, number> = {}
    for (const r of rows) counted[r.disposition] = (counted[r.disposition] ?? 0) + 1
    expect(dispositionCounts).toEqual(counted)
  })

  it('gives every remaining exception a reason and decision (control)', async () => {
    const { rows } = await registry()
    expect(rows.filter(r => !r.reason || !r.decision)).toEqual([])
  })
})

const isException = (r: Row) =>
  r.disposition !== 'boundary-adapter' && r.disposition !== 'in-flight-churn'
const lacksEvidence = (r: Row): boolean => {
  if (r.disposition === 'boundary-adapter') return r.path !== ADAPTER
  if (r.disposition === 'in-flight-churn') return !ZONE.test(r.path)
  return false
}
/** Out-of-scope exception rows not in the reviewed pinned set (relabeled deferral). */
const unreviewedOutOfScope = (rows: Row[]): string[] =>
  rows
    .filter(r => isException(r) && !SCOPE.test(r.path) && r.disposition !== DEFERRED)
    .filter(
      r => !EXCEPTION_OUT_OF_SCOPE.has(r.path) && !FORMER_DEFERRED_OUT_OF_SCOPE.includes(r.path),
    )
    .map(r => r.path)
/** In-scope rows outside the pinned exception sets (ordinary IO relabeled as an exception). */
const ordinaryRows = (rows: Row[], tests: boolean): string[] =>
  rows
    .filter(r => isException(r) && SCOPE.test(r.path) && TEST_PATH.test(r.path) === tests)
    .filter(r => !(tests ? EXCEPTION_TESTS : EXCEPTION_PRODUCTION).has(r.path))
    .map(r => r.path)

describe('registry rows are reasoned exceptions, not relabeled deferrals', () => {
  it('uses only the guideline dispositions', async () => {
    const { rows } = await registry()
    expect(rows.filter(r => !ALLOWED.includes(r.disposition)).map(r => r.path)).toEqual([])
  })

  it('has no effort-based reason or decision', async () => {
    const { rows } = await registry()
    const hit = rows.filter(r => EFFORT.test(`${r.reason} ${r.decision}`))
    expect(hit.map(r => r.path)).toEqual([])
  })

  it('keeps ordinary production IO out of the registry (pinned exception paths only)', async () => {
    expect(ordinaryRows((await registry()).rows, false)).toEqual([])
  })

  it('keeps ordinary test IO out of the registry (pinned exception tests only)', async () => {
    expect(ordinaryRows((await registry()).rows, true)).toEqual([])
  })

  it('flags an ordinary-IO production file relabeled with a keyword-matching reason', () => {
    const relabeled: Row = {
      path: 'apps/pair-cli/src/kb-manager/git-clone.ts',
      disposition: 'os-guarantee',
      reason: 'Cleanup adjacent to the real git process boundary, bytes on disk.',
      observedOperations: ['rmSync'],
    }
    const pinned: Row = { ...relabeled, path: 'apps/pair-cli/scripts/postbuild.js' }
    expect(ordinaryRows([relabeled, pinned], false)).toEqual([relabeled.path])
  })

  it('flags an ordinary-IO test file relabeled with a keyword-matching reason', () => {
    const relabeled: Row = {
      path: 'apps/pair-cli/src/commands/foo/foo.test.ts',
      disposition: 'os-guarantee',
      reason: 'Real process and symlink semantics on disk.',
      observedOperations: ['writeFileSync'],
    }
    const pinned: Row = { ...relabeled, path: 'apps/pair-cli/src/registry/atomic-target.test.ts' }
    expect(ordinaryRows([relabeled, pinned], true)).toEqual([relabeled.path])
  })

  it('resolves former out-of-scope deferred tests only as real-boundary exceptions', async () => {
    const { rows } = await registry()
    const bad = FORMER_DEFERRED_OUT_OF_SCOPE.filter(
      p => !REAL_BOUNDARY.includes(rows.find(r => r.path === p)?.disposition ?? 'missing'),
    )
    expect(bad).toEqual([])
  })

  it('keeps out-of-scope exception rows inside the reviewed pinned set', async () => {
    expect(unreviewedOutOfScope((await registry()).rows)).toEqual([])
  })

  it('flags an out-of-scope test relabeled outside the reviewed pinned set', () => {
    const relabeled: Row = {
      path: 'scripts/dev/new-feature.test.mjs',
      disposition: 'repo-contract',
      reason: 'Reads the real repo tree on disk.',
      observedOperations: ['readFileSync'],
    }
    const pinned: Row = { ...relabeled, path: FORMER_DEFERRED_OUT_OF_SCOPE[0]! }
    expect(unreviewedOutOfScope([relabeled, pinned])).toEqual([relabeled.path])
  })

  it('keeps type, adapter and in-flight exceptions within their boundary (control)', async () => {
    const { rows } = await registry()
    const kinds = ['type-contract', 'boundary-adapter', 'in-flight-churn']
    expect(rows.filter(r => kinds.includes(r.disposition) && lacksEvidence(r))).toEqual([])
  })
})

describe('guard rejects deferral', () => {
  it('fails a row with an unknown disposition', () => {
    expect(checkRegistry(new Map([['a.ts', dep]]), [row('deferred')])).toEqual([
      expect.stringContaining(`disposition 'deferred'`),
    ])
  })

  it('fails a row using deferred-migration as unresolved', () => {
    expect(checkRegistry(new Map([['a.ts', dep]]), [row(DEFERRED)])).toEqual([
      expect.stringContaining(`disposition '${DEFERRED}' is unresolved`),
    ])
  })

  it('still passes a reasoned boundary exception (control)', () => {
    expect(checkRegistry(new Map([['a.ts', dep]]), [row('os-guarantee')])).toEqual([])
  })
})

describe('guideline no longer codifies deferral (source and mirror)', () => {
  it.each(GUIDELINES)('%s does not list deferred-migration', async p => {
    expect(await read(p)).not.toContain(DEFERRED)
  })

  it('mirror equals source (control)', async () => {
    expect(await read(GUIDELINES[1]!)).toBe(await read(GUIDELINES[0]!))
  })
})
