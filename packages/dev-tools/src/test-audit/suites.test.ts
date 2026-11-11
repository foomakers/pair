import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { describe, it, expect } from 'vitest'

import { recordRun } from './baseline'
import { compact } from './baseline'
import {
  NODE_TEST_SUITES,
  runNodeTest,
  PLAYWRIGHT_SUITES,
  parseJunit,
  rowsToTests,
  suiteTypeOf,
  summarize,
} from './suites'

const xml = `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
\t<testsuite name="outer" time="0.5" disabled="0" errors="0" tests="2" failures="1" skipped="0" hostname="h">
\t\t<testcase name="a &amp; b" time="0.25" classname="test" file="/r/qa/x.test.mjs"/>
\t\t<testcase name="boom" time="0.1" classname="test" file="/r/qa/x.test.mjs">
\t\t\t<failure type="testCodeFailure" message="no">stack</failure>
\t\t</testcase>
\t</testsuite>
\t<testcase name="top" time="0.002" classname="test" file="/r/qa/y.test.mjs"/>
\t<testcase name="later" time="0.003" classname="test" file="/r/qa/y.test.mjs"><skipped type="skipped" message="todo"/></testcase>
\t<testcase name="top" time="0.004" classname="test" file="/r/qa/y.test.mjs"/>
</testsuites>`

describe('parseJunit (node:test reporter)', () => {
  it('maps testcases to inventory ids with status and ms, nesting suites, numbering repeats', () => {
    expect(parseJunit('/r', xml)).toEqual({
      'qa/x.test.mjs::outer > a & b': { status: 'passed', duration: 250 },
      'qa/x.test.mjs::outer > boom': { status: 'failed', duration: 100 },
      'qa/y.test.mjs::top': { status: 'passed', duration: 2 },
      'qa/y.test.mjs::later': { status: 'skipped', duration: 3 },
      'qa/y.test.mjs::top#2': { status: 'passed', duration: 4 },
    })
  })
  it('an empty report is an empty run, not an error', () => {
    expect(parseJunit('/r', '<testsuites></testsuites>')).toEqual({})
  })
})

describe('rowsToTests (Playwright rows → run tests)', () => {
  it('keys `file::name`, numbers repeats, keeps status and ms', () => {
    const row = (name: string, status: 'passed' | 'flaky', ms: number) => ({
      target: 't',
      file: 'apps/website/e2e/a.ts',
      name,
      status,
      ms,
    })
    expect(rowsToTests([row('x', 'passed', 5), row('x', 'flaky', 7)])).toEqual({
      'apps/website/e2e/a.ts::x': { status: 'passed', duration: 5 },
      'apps/website/e2e/a.ts::x#2': { status: 'flaky', duration: 7 },
    })
  })
})

describe('suites', () => {
  it('node:test suites cover the three dirs the vitest tool did not', () => {
    expect(NODE_TEST_SUITES.map(s => s.name)).toEqual(['.claude/workflows', 'scripts', 'qa'])
  })
  it('playwright suites are the gate targets, keyed by package name', () => {
    expect(PLAYWRIGHT_SUITES).toEqual([
      'playwright:brand-ct',
      'playwright:website-ct',
      'playwright:website-e2e',
    ])
  })
  it.each([
    ['.claude/workflows', 'node:test'],
    ['scripts', 'node:test'],
    ['qa', 'node:test'],
    ['playwright:website-e2e', 'playwright'],
    ['playwright:brand-ct', 'playwright'],
    ['packages/dev-tools', 'vitest'],
  ])('suite type of package %s is %s', (pkg, type) => {
    expect(suiteTypeOf(pkg)).toBe(type)
  })
})

describe('summarize', () => {
  const run = (seed: number, ms: number, d: number) => ({
    seed,
    wall_ms: ms,
    tests: {
      'apps/a/unit.test.ts::t': { status: 'passed', duration: d },
      'apps/a/e2e/b.e2e.test.ts::t': { status: 'passed', duration: d * 10 },
      'apps/a/integration/c.test.ts::t': { status: 'passed', duration: d * 2 },
    },
  })
  const base = compact(
    {
      'apps/a': [run(1, 100, 1), run(2, 120, 3), run(3, 110, 2)],
      qa: [
        { seed: 1, wall_ms: 7, tests: { 'qa/z.test.mjs::t': { status: 'passed', duration: 4 } } },
        { seed: 2, wall_ms: 9, tests: { 'qa/z.test.mjs::t': { status: 'passed', duration: 6 } } },
        { seed: 3, wall_ms: 8, tests: { 'qa/z.test.mjs::t': { status: 'passed', duration: 5 } } },
      ],
    },
    'rev',
  )
  it('per package: wall median; per file: sum of test medians; per type: vitest split by level', () => {
    const s = summarize(base)
    expect(s.total_ms).toBe(110 + 8)
    expect(s.packages).toEqual({ 'apps/a': 110, qa: 8 })
    expect(s.files['apps/a/e2e/b.e2e.test.ts']).toBe(20)
    expect(s.files['qa/z.test.mjs']).toBe(5)
    expect(s.types).toEqual({
      unit: 2,
      integration: 4,
      e2e: 20,
      'node:test': 5,
    })
  })
})

const qaRepo = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'suites-'))
  mkdirSync(join(root, 'qa'))
  writeFileSync(
    join(root, 'qa', 'a.test.mjs'),
    "import { test, describe } from 'node:test'\nimport assert from 'node:assert'\n" +
      "describe('d', () => { test('ok', () => {}); test('bad', () => assert.fail('x')) })\n",
  )
  execFileSync('git', ['init', '-q'], { cwd: root })
  execFileSync('git', ['add', '.'], { cwd: root })
  return root
}

describe('runNodeTest (real node:test, real git)', () => {
  it('runs the tracked test files of a dir and reduces the junit to a run', () => {
    const root = qaRepo()
    try {
      const run = runNodeTest(root, { name: 'qa', cwd: '.', dir: 'qa' }, 7)
      expect(run.seed).toBe(7)
      expect(run.wall_ms).toBeGreaterThan(0)
      expect(Object.entries(run.tests).map(([id, t]) => [id, t.status])).toEqual([
        ['qa/a.test.mjs::d > ok', 'passed'],
        ['qa/a.test.mjs::d > bad', 'failed'],
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it('recordRun on a fresh root creates the raw store (no vitest package ran first)', () => {
    const root = qaRepo()
    try {
      recordRun(root, 'qa', 101, false)
      const raw = JSON.parse(readFileSync(join(root, 'test-audit', '.tmp', 'raw.json'), 'utf8'))
      expect(Object.keys(raw.packages.qa[0].tests)).toHaveLength(2)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
