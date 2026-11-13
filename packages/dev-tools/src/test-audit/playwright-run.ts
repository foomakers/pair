/**
 * test-audit playwright run (US-613 T7): actually executes the Playwright suites of the gate
 * (component tests of brand and website, website e2e) with the JSON reporter, and reduces the
 * result to a status and duration per test. `--repeat-each` turns it into a flakiness probe.
 * The e2e suite builds and starts the website itself (its config's webServer): minutes, not seconds.
 */
import { spawnSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

export interface Target {
  name: string
  cwd: string
  args: string[]
}

export const TARGETS: Target[] = [
  {
    name: 'brand-ct',
    cwd: 'packages/brand',
    args: ['--config', 'playwright-ct.config.ts', '--grep-invert', '@a11y-report'],
  },
  {
    name: 'website-ct',
    cwd: 'apps/website',
    args: ['--config', 'playwright-ct.config.ts', '--grep-invert', '@a11y-report'],
  },
  { name: 'website-e2e', cwd: 'apps/website', args: ['--config', 'playwright.e2e.config.ts'] },
]

export type RunStatus = 'passed' | 'failed' | 'flaky' | 'skipped'
export interface RunRow {
  target: string
  file: string
  name: string
  status: RunStatus
  ms: number
}

interface PwTest {
  status: string
  results: { duration: number }[]
}
interface PwSpec {
  title: string
  file: string
  tests: PwTest[]
}
interface PwSuite {
  suites?: PwSuite[]
  specs?: PwSpec[]
}

const STATUS: Record<string, RunStatus> = {
  expected: 'passed',
  unexpected: 'failed',
  flaky: 'flaky',
  skipped: 'skipped',
}

const worst = (a: RunStatus, b: RunStatus): RunStatus => {
  const order: RunStatus[] = ['passed', 'skipped', 'flaky', 'failed']
  return order.indexOf(b) > order.indexOf(a) ? b : a
}

function specRow(target: Target, spec: PwSpec): RunRow {
  const statuses = spec.tests.map(t => STATUS[t.status] ?? 'failed')
  const ms = spec.tests.flatMap(t => t.results).reduce((n, r) => n + r.duration, 0)
  return {
    target: target.name,
    file: `${target.cwd}/${spec.file}`,
    name: spec.title,
    status: statuses.reduce(worst, 'passed'),
    ms: Math.round(ms),
  }
}

export function parseReport(target: Target, report: PwSuite): RunRow[] {
  const walk = (s: PwSuite): RunRow[] => [
    ...(s.specs ?? []).map(sp => specRow(target, sp)),
    ...(s.suites ?? []).flatMap(walk),
  ]
  return walk(report)
}

export interface TargetTotals {
  tests: number
  passed: number
  failed: number
  flaky: number
  skipped: number
  ms: number
}

export function totals(rows: RunRow[]): Record<string, TargetTotals> {
  const out: Record<string, TargetTotals> = {}
  for (const r of rows) {
    const t = (out[r.target] ??= { tests: 0, passed: 0, failed: 0, flaky: 0, skipped: 0, ms: 0 })
    t.tests++
    t[r.status]++
    t.ms += r.ms
  }
  return out
}

export interface RunOptions {
  repeatEach: number
  targets?: string[]
}

/** One target = one `playwright test` process; a failing test still leaves a valid JSON report. */
export function runTarget(root: string, target: Target, repeatEach: number): RunRow[] {
  const dir = mkdtempSync(join(tmpdir(), 'pw-run-'))
  const out = join(dir, 'report.json')
  try {
    const args = ['exec', 'playwright', 'test', ...target.args, '--reporter=json']
    if (repeatEach > 1) args.push('--repeat-each', String(repeatEach))
    spawnSync('pnpm', args, {
      cwd: join(root, target.cwd),
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: out },
      stdio: ['ignore', 'ignore', 'inherit'],
    })
    return parseReport(target, JSON.parse(readFileSync(out, 'utf8')) as PwSuite)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export function runSuites(root: string, o: RunOptions): { rows: RunRow[]; errors: string[] } {
  const rows: RunRow[] = []
  const errors: string[] = []
  for (const t of TARGETS.filter(x => !o.targets || o.targets.includes(x.name))) {
    try {
      rows.push(...runTarget(root, t, o.repeatEach))
    } catch (e) {
      errors.push(`${t.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { rows, errors }
}
