import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import { REPO_ROOT } from './repo-root'

type Step = { name?: unknown; run?: unknown; if?: unknown; ['continue-on-error']?: unknown }
type Job = {
  if?: unknown
  permissions?: Record<string, unknown>
  ['runs-on']?: unknown
  steps?: unknown
  strategy?: { ['fail-fast']?: unknown; matrix?: { os?: unknown } }
  ['continue-on-error']?: unknown
  ['timeout-minutes']?: unknown
}
type Workflow = { jobs?: Record<string, Job> }

const workflowText = (): string =>
  readFileSync(join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf-8')
const workflow = (): Workflow => (parse(workflowText()) ?? {}) as Workflow
const smokeJob = (): Job => {
  const job = workflow().jobs?.smoke
  expect(job, 'ci.yml must keep a smoke job').toBeTruthy()
  return job as Job
}
const smokeSteps = (): Step[] => {
  const steps = smokeJob().steps
  expect(Array.isArray(steps), 'smoke job must have steps').toBe(true)
  return steps as Step[]
}

const sourceScenario = (): string =>
  readFileSync(join(REPO_ROOT, 'scripts/smoke-tests/scenarios/source-resolution.sh'), 'utf-8')
const ciTestsList = (): string =>
  readFileSync(join(REPO_ROOT, 'scripts/smoke-tests/lib/ci-tests.sh'), 'utf-8')
const smokeReadme = (): string =>
  readFileSync(join(REPO_ROOT, 'scripts/smoke-tests/README.md'), 'utf-8')

const changedPathsAgainstBase = (): string[] => {
  const tracked = execFileSync('git', ['diff', '--name-only', 'origin/main...HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  })
  const worktree = execFileSync('git', ['diff', '--name-only'], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  })
  return [...new Set(`${tracked}\n${worktree}`.split(/\n+/).filter(Boolean))].sort()
}

describe('smoke CI platform coverage (#135)', () => {
  it('AC1/AC2 converts the smoke job to a linux+macOS matrix without weakening the job', () => {
    const job = smokeJob()
    expect(job.strategy?.['fail-fast']).toBe(false)
    expect(job.strategy?.matrix?.os).toEqual(['ubuntu-latest', 'macos-latest'])
    expect(job['runs-on']).toBe('${{ matrix.os }}')
    expect(job.if).toBe("!(startsWith(github.event.head_commit.message, 'chore: release v'))")
    expect(job.permissions).toEqual({ contents: 'read' })
    expect(job['timeout-minutes']).toBe(15)
    expect(job['continue-on-error']).toBeUndefined()

    const runAllSteps = smokeSteps().filter(
      s => s.run === './scripts/smoke-tests/run-all.sh --ci --cleanup',
    )
    expect(runAllSteps).toHaveLength(1)
    expect(
      smokeSteps()
        .map(s => String(s.if ?? ''))
        .join('\n'),
    ).not.toMatch(/runner\.os|macOS|darwin/i)
    expect(JSON.stringify(job)).not.toMatch(/continue-on-error/)
  })

  it('AC3 keeps source-resolution in the CI-safe list and does not carve out macOS', () => {
    const ciTests = ciTestsList()
    expect(ciTests).toMatch(/CI_TESTS=\([\s\S]*"source-resolution\.sh"[\s\S]*\)/)
    expect(ciTests).not.toMatch(/source-resolution\.sh:.*macos/i)
    expect(workflowText()).not.toMatch(
      /runner\.os\s*!=\s*['"]macOS['"]|macos-latest[\s\S]*continue-on-error/,
    )
  })

  it('AC4 adds real-CLI coverage for installing from a relative local source path', () => {
    const scenario = sourceScenario()
    expect(scenario).toContain('OFFLINE_SAFE=true')
    expect(scenario).toMatch(/Test \d+: Install from local directory \(relative path\)/)
    expect(scenario).toMatch(/run_pair install --source "\.\/[^"]+"/)
    expect(scenario).toMatch(/assert_dir "\.pair"/)
  })

  it('AC5 rejects an existing but structurally invalid source directory with a clear message', () => {
    const scenario = sourceScenario()
    expect(scenario).toMatch(/Test \d+: Error on structurally invalid source directory/)
    const invalidBlock = scenario.slice(scenario.indexOf('structurally invalid source directory'))
    expect(invalidBlock).toMatch(/run_pair install --source/)
    expect(invalidBlock).toMatch(/assert_failure/)
    expect(invalidBlock).toMatch(/assert_output_contains/)
  })

  it('AC6 requires a platform-injected unit test when product path handling changes', () => {
    const changed = changedPathsAgainstBase()
    const productionPathFixes = changed.filter(
      path =>
        (path.startsWith('packages/content-ops/src/') || path.startsWith('apps/pair-cli/src/')) &&
        !path.endsWith('.test.ts'),
    )
    if (productionPathFixes.length === 0) return

    const tests = changed
      .filter(path => path.endsWith('.test.ts'))
      .map(path => readFileSync(join(REPO_ROOT, path), 'utf-8'))
      .join('\n')
    expect(
      tests,
      `product path fixes need platform-injected tests: ${productionPathFixes.join(', ')}`,
    ).toMatch(/platform.*(?:darwin|linux)|(?:darwin|linux).*platform/)
  })

  it('AC7 records macOS cost beside the smoke job and states parallel wall-clock semantics', () => {
    const ci = workflowText()
    const measuredCost = ci.match(/MEASURED COST \(AC7\)[\s\S]*?REVISIT THRESHOLD/)?.[0] ?? ''

    expect(measuredCost).toMatch(
      /ubuntu-latest took \d+m\d+s[\s\S]*Run \d+, job \d+ \(\d{4}-\d{2}-\d{2}\)/,
    )
    expect(measuredCost).toMatch(
      /macos-latest took \d+m\d+s[\s\S]*Run \d+, job \d+ \(\d{4}-\d{2}-\d{2}\)/,
    )
    expect(measuredCost).not.toMatch(/macos-latest is measured by the sibling matrix leg/i)
    expect(measuredCost).toMatch(/matrix legs run in parallel[\s\S]*wall-clock is the slower leg/i)
  })

  it('AC8 documents the CI-safe platforms and the full local suite posture', () => {
    const readme = smokeReadme()
    expect(readme).toMatch(/CI-safe list[\s\S]*ubuntu-latest[\s\S]*macos-latest/i)
    expect(readme).toMatch(/pnpm smoke-tests[\s\S]*full local suite[\s\S]*single-platform/i)
    expect(readme).not.toMatch(/Windows support/i)
  })
})
