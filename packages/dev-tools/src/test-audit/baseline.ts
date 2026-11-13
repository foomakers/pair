/**
 * test-audit baseline (US-613 F0/F5): vitest runs per package, random order with recorded seed.
 * Per-test duration + status from the runner's own JSON; coverage from the v8 json-summary.
 * Mutation / per-test coverage: no supported tool installed ⇒ `not measured` (never estimated).
 */
import { execFileSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { dirname, join, relative } from 'path'

import { REPO_ROOT } from '../quality-gates/repo-root'

import { NOT_MEASURED } from './inventory'
import {
  NODE_TEST_SUITES,
  PLAYWRIGHT_SUITES,
  runNodeTest,
  runPlaywrightSuite,
  summarize,
} from './suites'

export interface RunTest {
  status: string
  duration: number
}
export interface Run {
  seed: number
  wall_ms: number
  tests: Record<string, RunTest>
  coverage?: { lines: number; branches: number }
}
interface VitestJson {
  testResults: {
    name: string
    assertionResults: {
      ancestorTitles: string[]
      title: string
      status: string
      duration?: number | null
    }[]
  }[]
}

/** Same id grammar as the static inventory (`file::describe > name`, `#n` on repeats). */
export function parseVitestJson(root: string, json: VitestJson): Record<string, RunTest> {
  const out: Record<string, RunTest> = {}
  for (const f of json.testResults) {
    const file = relative(root, f.name)
    const seen = new Map<string, number>()
    for (const t of f.assertionResults) {
      const id = `${file}::${[...t.ancestorTitles, t.title].join(' > ')}`
      const n = (seen.get(id) ?? 0) + 1
      seen.set(id, n)
      out[n > 1 ? `${id}#${n}` : id] = { status: t.status, duration: t.duration ?? 0 }
    }
  }
  return out
}

export const median = (xs: number[]): number => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

export function runPackage(root: string, pkg: string, seed: number, withCoverage: boolean): Run {
  const cwd = join(root, pkg)
  const dir = join(root, 'test-audit', '.tmp', pkg.replace(/\//g, '_'))
  mkdirSync(dir, { recursive: true })
  const out = join(dir, `run-${seed}.json`)
  const args = [
    'vitest',
    'run',
    '--reporter=json',
    `--outputFile=${out}`,
    '--sequence.shuffle',
    `--sequence.seed=${seed}`,
  ]
  if (withCoverage)
    args.push(
      '--coverage',
      '--coverage.reporter=json-summary',
      `--coverage.reportsDirectory=${dir}/cov`,
    )
  const t0 = Date.now()
  try {
    execFileSync('npx', args, { cwd, stdio: 'ignore', timeout: 590_000 })
  } catch {
    // failing tests exit non-zero but still write the JSON; a missing file is a real failure below
  }
  const wall_ms = Date.now() - t0
  if (!existsSync(out)) throw new Error(`${pkg}: vitest produced no JSON report (seed ${seed})`)
  const run: Run = {
    seed,
    wall_ms,
    tests: parseVitestJson(root, JSON.parse(readFileSync(out, 'utf8'))),
  }
  const cov = join(dir, 'cov', 'coverage-summary.json')
  if (withCoverage && existsSync(cov)) {
    const { total } = JSON.parse(readFileSync(cov, 'utf8'))
    run.coverage = { lines: total.lines.pct, branches: total.branches.pct }
  }
  return run
}

/** Per-test median duration over runs; `flaky` = ran in ≥2 runs with differing status. */
export function aggregate(runs: Run[]): Record<string, { median_ms: number; statuses: string[] }> {
  const ids = new Set(runs.flatMap(r => Object.keys(r.tests)))
  const out: Record<string, { median_ms: number; statuses: string[] }> = {}
  for (const id of ids) {
    const rs = runs.map(r => r.tests[id]).filter((t): t is RunTest => !!t)
    out[id] = { median_ms: median(rs.map(t => t.duration)), statuses: rs.map(t => t.status) }
  }
  return out
}

export const PACKAGES = [
  'apps/pair-cli',
  'apps/website',
  'packages/brand',
  'packages/content-ops',
  'packages/dev-tools',
  'packages/knowledge-hub',
  ...NODE_TEST_SUITES.map(s => s.name),
  ...PLAYWRIGHT_SUITES,
]

/** One run of one suite: vitest package, `node:test` dir or Playwright target, by its name. */
export function runSuite(root: string, pkg: string, seed: number, withCoverage: boolean): Run {
  const node = NODE_TEST_SUITES.find(s => s.name === pkg)
  if (node) return runNodeTest(root, node, seed)
  if (PLAYWRIGHT_SUITES.includes(pkg)) return runPlaywrightSuite(root, pkg, seed)
  return runPackage(root, pkg, seed, withCoverage)
}

const RAW = (root: string) => join(root, 'test-audit', '.tmp', 'raw.json')

/** Appends one run to the (gitignored) raw store; `finalize` compacts it into the versioned baseline. */
export function recordRun(root: string, pkg: string, seed: number, withCoverage: boolean): void {
  const file = RAW(root)
  mkdirSync(dirname(file), { recursive: true })
  const raw: Record<string, Run[]> = existsSync(file)
    ? JSON.parse(readFileSync(file, 'utf8')).packages
    : {}
  ;(raw[pkg] ??= []).push(runSuite(root, pkg, seed, withCoverage))
  writeFileSync(file, JSON.stringify({ packages: raw }))
}

export interface CompactBaseline {
  tool: Record<string, string>
  base_rev: string
  runs_required: number
  packages: Record<
    string,
    { runs: Omit<Run, 'tests'>[]; wall_ms_median: number; tests: Record<string, [number, string]> }
  >
}

const TOOL = {
  runner:
    'vitest 3.2.4 (--sequence.shuffle, recorded seed per run); node:test junit (.claude/workflows, scripts, qa; no shuffle, seed is a label); Playwright json (brand-ct, website-ct, website-e2e)',
  coverage:
    '@vitest/coverage-v8 json-summary, first run per package; absent when the package lacks the provider',
  mutation: NOT_MEASURED,
  per_test_coverage: NOT_MEASURED,
}

/** Per-test `[median_ms, "ppf"]` (one status letter per run: p/f/s/o) instead of every run's full map. */
export function compact(
  raw: Record<string, Run[]>,
  baseRev: string,
  runsRequired = 3,
): CompactBaseline {
  const packages: CompactBaseline['packages'] = {}
  for (const [pkg, runs] of Object.entries(raw)) {
    if (runs.length < runsRequired)
      throw new Error(`${pkg}: ${runs.length}/${runsRequired} baseline runs`)
    const tests: Record<string, [number, string]> = {}
    for (const [id, a] of Object.entries(aggregate(runs)))
      tests[id] = [Math.round(a.median_ms * 100) / 100, a.statuses.map(x => x[0]).join('')]
    packages[pkg] = {
      runs: runs.map(({ tests: _t, ...r }) => r),
      wall_ms_median: median(runs.map(r => r.wall_ms)),
      tests,
    }
  }
  return { tool: TOOL, base_rev: baseRev, runs_required: runsRequired, packages }
}

export const SEEDS = [101, 102, 103]

/** Full F0: every package × 3 seeded runs (coverage on the first), then compact. Slow (minutes). */
export function rerunBaseline(root: string): void {
  rmSync(RAW(root), { force: true })
  for (const pkg of PACKAGES) SEEDS.forEach((seed, i) => recordRun(root, pkg, seed, i === 0))
  finalize(root)
}

export function finalize(root: string): void {
  const raw = JSON.parse(readFileSync(RAW(root), 'utf8')).packages
  const rev = execFileSync('git', ['merge-base', 'origin/main', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim()
  writeFileSync(join(root, 'test-audit', 'baseline.json'), JSON.stringify(compact(raw, rev)) + '\n')
}

if (require.main === module) {
  const [cmd, pkg, seed, cov] = process.argv.slice(2)
  if (cmd === 'finalize') finalize(REPO_ROOT)
  else if (cmd === 'rerun') rerunBaseline(REPO_ROOT)
  else if (cmd === 'run' && pkg && seed)
    recordRun(REPO_ROOT, pkg, Number(seed), cov === '--coverage')
  else if (cmd === 'summary')
    console.log(
      JSON.stringify(
        summarize(JSON.parse(readFileSync(join(REPO_ROOT, 'test-audit', 'baseline.json'), 'utf8'))),
        null,
        2,
      ),
    )
  else
    throw new Error(
      'usage: baseline.ts run <package> <seed> [--coverage] | finalize | rerun | summary',
    )
}
