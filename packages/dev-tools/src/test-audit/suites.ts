/**
 * test-audit suites (US-625 T-1): the runners the vitest baseline does not cover.
 * `node:test` (`.claude/workflows`, `scripts`, `qa`) through its junit reporter, Playwright through
 * playwright-run. Both reduce to the baseline's `Run` shape, so `compact` / `finalize` stay unchanged.
 * `node:test` has no shuffle: the recorded seed is a run label, not an order.
 */
import { execFileSync, spawnSync } from 'child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, relative } from 'path'

import type { CompactBaseline, Run, RunTest } from './baseline'
import { levelOf, TEST_FILE_RE } from './inventory'
import { TARGETS, runTarget, type RunRow } from './playwright-run'

export interface NodeTestSuite {
  name: string
  cwd: string
  /** Tracked dir whose test files are passed explicitly; absent ⇒ `node --test` discovers in `cwd`. */
  dir?: string
}

export const NODE_TEST_SUITES: NodeTestSuite[] = [
  { name: '.claude/workflows', cwd: '.claude/workflows' },
  { name: 'scripts', cwd: '.', dir: 'scripts' },
  { name: 'qa', cwd: '.', dir: 'qa' },
]

export const PLAYWRIGHT_SUITES = TARGETS.map(t => `playwright:${t.name}`)

export const suiteTypeOf = (pkg: string): 'node:test' | 'playwright' | 'vitest' =>
  pkg.startsWith('playwright:')
    ? 'playwright'
    : NODE_TEST_SUITES.some(s => s.name === pkg)
      ? 'node:test'
      : 'vitest'

// node escapes & < " in attributes (" twice: &amp;quot;), never >; one pass is its exact inverse
const ENTITY: Record<string, string> = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' }
const unescape = (s: string): string =>
  s.replace(/&amp;quot;|&(lt|gt|quot|apos|amp);/g, (_, e?: string) => (e ? ENTITY[e]! : '"'))

const attr = (tag: string | undefined, name: string): string =>
  unescape(new RegExp(`\\s${name}="([^"]*)"`).exec(tag ?? '')?.[1] ?? '')

const MARKER_STATUS: Record<string, string> = { skipped: 'skipped' }
const TAG = /<(\/?)(testsuite|testcase)\b((?:[^>"]|"[^"]*")*?)(\/?)>|<(failure|error|skipped)\b/g

/** node:test junit → same id grammar as the inventory (`file::suite > name`, `#n` on repeats). */
export function parseJunit(root: string, xml: string): Record<string, RunTest> {
  const out: Record<string, RunTest> = {}
  const seen = new Map<string, number>()
  const stack: string[] = []
  let open: { id: string; ms: number; status: string } | undefined
  const flush = (): void => {
    if (open) out[open.id] = { status: open.status, duration: open.ms }
    open = undefined
  }
  const begin = (attrs: string | undefined): void => {
    const base = `${relative(root, attr(attrs, 'file'))}::${[...stack, attr(attrs, 'name')].join(' > ')}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    open = {
      id: n > 1 ? `${base}#${n}` : base,
      ms: Math.round(Number(attr(attrs, 'time')) * 1000),
      status: 'passed',
    }
  }
  for (const [, closing, kind, attrs, selfClose, marker] of xml.matchAll(TAG)) {
    if (marker) {
      if (open) open.status = MARKER_STATUS[marker] ?? 'failed'
      continue
    }
    flush()
    if (kind === 'testsuite') {
      if (closing) stack.pop()
      else if (!selfClose) stack.push(attr(attrs, 'name'))
    } else if (!closing) {
      begin(attrs)
      if (selfClose) flush()
    }
  }
  flush()
  return out
}

export function rowsToTests(rows: RunRow[]): Record<string, RunTest> {
  const out: Record<string, RunTest> = {}
  const seen = new Map<string, number>()
  for (const r of rows) {
    const id = `${r.file}::${r.name}`
    const n = (seen.get(id) ?? 0) + 1
    seen.set(id, n)
    out[n > 1 ? `${id}#${n}` : id] = { status: r.status, duration: r.ms }
  }
  return out
}

function trackedTests(root: string, dir: string): string[] {
  return execFileSync('git', ['ls-files', dir], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(f => TEST_FILE_RE.test(f))
    .map(f => join(root, f))
}

export function runNodeTest(root: string, suite: NodeTestSuite, seed: number): Run {
  const tmp = mkdtempSync(join(tmpdir(), 'node-test-'))
  const out = join(tmp, 'junit.xml')
  const files = suite.dir ? trackedTests(root, suite.dir) : []
  const args = ['--test', '--test-reporter=junit', `--test-reporter-destination=${out}`, ...files]
  try {
    const t0 = Date.now()
    spawnSync('node', args, { cwd: join(root, suite.cwd), stdio: 'ignore', timeout: 590_000 })
    const wall_ms = Date.now() - t0
    // node reports real paths
    const tests = parseJunit(realpathSync(root), readFileSync(out, 'utf8'))
    return { seed, wall_ms, tests }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

export function runPlaywrightSuite(root: string, name: string, seed: number): Run {
  const target = TARGETS.find(t => `playwright:${t.name}` === name)
  if (!target) throw new Error(`unknown playwright suite ${name}`)
  const t0 = Date.now()
  const rows = runTarget(root, target, 1)
  return { seed, wall_ms: Date.now() - t0, tests: rowsToTests(rows) }
}

export interface Summary {
  total_ms: number
  packages: Record<string, number>
  /** Sum of per-test medians — the time spent inside tests, excluding runner start-up. */
  files: Record<string, number>
  /** `unit | integration | e2e` (vitest, by path), `node:test`, `playwright`: sum of test medians. */
  types: Record<string, number>
}

/** Per package (wall median), per file and per suite type (sum of per-test medians). */
export function summarize(b: CompactBaseline): Summary {
  const s: Summary = { total_ms: 0, packages: {}, files: {}, types: {} }
  for (const [pkg, p] of Object.entries(b.packages)) {
    s.packages[pkg] = p.wall_ms_median
    s.total_ms += p.wall_ms_median
    const kind = suiteTypeOf(pkg)
    for (const [id, [ms]] of Object.entries(p.tests)) {
      const file = id.split('::')[0]!
      s.files[file] = (s.files[file] ?? 0) + ms
      const type = kind === 'vitest' ? levelOf(file) : kind
      s.types[type] = (s.types[type] ?? 0) + ms
    }
  }
  return s
}
