/**
 * test-policy gates G1–G8 (US-613 AC5, Part C). Pure, deterministic: same input ⇒ same result.
 * All thresholds come from docs/testing/test-policy.config.json (`loadConfig`).
 * A signal with no supported tool is `unsupported` (named, never green, never blocking).
 */
import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'
import ts from 'typescript'

import { REPO_ROOT } from '../quality-gates/repo-root'

import { loadConfig, type Config, type Report } from './audit'
import { parseVitestJson } from './baseline'
import {
  TEST_FILE_RE,
  levelOf,
  moduleOf,
  parseTests,
  type Level,
  type TestRecord,
} from './inventory'

export type GateId = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7' | 'G8'
export type Status = 'pass' | 'fail' | 'unsupported'
export interface GateResult {
  id: GateId
  status: Status
  blocking: boolean
  violations: string[]
  detail?: string
}

/** Rollout stages: which gates block. Unsupported/passing gates never block. */
export const BLOCKING: Record<Config['rollout'], GateId[]> = {
  'report-only': [],
  'block-cheap': ['G1', 'G2', 'G3', 'G6'],
  'block-full': ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8'],
}

/** `gate-bypass:<ID>: <reason>` label turns a failure into a counted exception (reason mandatory). */
export const bypassed = (id: GateId, labels: string[]): boolean =>
  labels.some(l => new RegExp(`^gate-bypass:${id}: \\S`).test(l))

const result = (
  id: GateId,
  cfg: Config,
  violations: string[],
  labels: string[],
  detail?: string,
): GateResult => {
  const fail = violations.length > 0 && !bypassed(id, labels)
  return {
    id,
    status: fail ? 'fail' : 'pass',
    blocking: fail && BLOCKING[cfg.rollout].includes(id),
    violations,
    ...(detail ? { detail } : {}),
  }
}
export const unsupported = (id: GateId, detail: string): GateResult => ({
  id,
  status: 'unsupported',
  blocking: false,
  violations: [],
  detail,
})

export interface Quarantined {
  id: string
}

/** G1: every non-skipped test has ≥1 assertion (blocks U2). */
export const g1 = (recs: TestRecord[], cfg: Config, labels: string[] = []): GateResult =>
  result(
    'G1',
    cfg,
    recs.filter(r => r.assertions === 0 && !r.skipped).map(r => r.test_id),
    labels,
  )

const SLEEP = /^(sleep|delay)$/
const PRINT = /^console\.(log|info|debug)$/
const callee = (e: ts.Expression): string =>
  ts.isIdentifier(e)
    ? e.text
    : ts.isPropertyAccessExpression(e)
      ? `${callee(e.expression)}.${e.name.text}`
      : ''

/** Static F1 patterns per file: sleep, print, private spies, inline snapshot over N lines. */
export function forbiddenPatterns(
  file: string,
  source: string,
  maxSnapshotLines: number,
): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const out: string[] = []
  const at = (n: ts.Node): string =>
    `${file}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const c = callee(n.expression)
      if (SLEEP.test(c)) out.push(`${at(n)} sleep`)
      if (PRINT.test(c)) out.push(`${at(n)} print`)
      if (c === 'setTimeout' && n.getText().includes('new Promise')) out.push(`${at(n)} sleep`)
      if (/\.spyOn$/.test(c)) {
        const m = n.arguments[1]
        if (m && ts.isStringLiteralLike(m) && /^[_#]/.test(m.text))
          out.push(`${at(n)} spy on private ${m.text}`)
      }
      if (/\.toMatchInlineSnapshot$/.test(callee(n.expression))) {
        const a = n.arguments[0]
        const lines = a && ts.isStringLiteralLike(a) ? a.text.split('\n').length : 0
        if (lines > maxSnapshotLines)
          out.push(`${at(n)} snapshot ${lines} lines > ${maxSnapshotLines}`)
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

/** G2: no skip/only (quarantined ids exempt), sleep, print, private spies, oversize inline snapshots. */
export function g2(
  recs: TestRecord[],
  sources: Record<string, string>,
  cfg: Config,
  quarantine: Quarantined[] = [],
  labels: string[] = [],
): GateResult {
  const q = new Set(quarantine.map(x => x.id))
  const v = [
    ...recs
      .filter(r => (r.skipped && !q.has(r.test_id)) || r.focused)
      .map(r => `${r.test_id} skip/only`),
    ...Object.entries(sources).flatMap(([f, s]) => forbiddenPatterns(f, s, cfg.maxSnapshotLines)),
  ]
  return result('G2', cfg, v.sort(), labels)
}

/** G3: per-test and per-level budget; level total growth vs baseline ≤ maxLevelGrowthPct. */
export function g3(
  current: Record<string, number>,
  baselineTotals: Partial<Record<Level, number>> | undefined,
  cfg: Config,
  labels: string[] = [],
): GateResult {
  const totals: Record<Level, number> = { unit: 0, integration: 0, e2e: 0 }
  const v: string[] = []
  for (const [id, ms] of Object.entries(current)) {
    const l = levelOf(id.split('::')[0] ?? '')
    totals[l] += ms
    if (ms > cfg.budgets[l].maxTestMs)
      v.push(`${id} ${ms}ms > ${cfg.budgets[l].maxTestMs}ms (${l})`)
  }
  for (const l of ['unit', 'integration', 'e2e'] as Level[]) {
    if (totals[l] > cfg.budgets[l].totalMs)
      v.push(`${l} total ${totals[l]}ms > ${cfg.budgets[l].totalMs}ms`)
    const b = baselineTotals?.[l]
    if (b && totals[l] > b * (1 + cfg.maxLevelGrowthPct / 100))
      v.push(`${l} grew ${(((totals[l] - b) / b) * 100).toFixed(1)}% > ${cfg.maxLevelGrowthPct}%`)
  }
  return result('G3', cfg, v.sort(), labels)
}

export interface StrykerReport {
  files: Record<
    string,
    {
      mutants: {
        id: string
        status: string
        location: { start: { line: number }; end: { line: number } }
        killedBy?: string[]
      }[]
    }
  >
  testFiles?: Record<string, { tests: { id: string; name: string }[] }>
}
export type DiffLines = Record<string, Set<number>>

/** `git diff -U0` hunks → changed (new-side) line numbers per file. */
export function parseDiffLines(diff: string): DiffLines {
  const out: DiffLines = {}
  let file = ''
  for (const line of diff.split('\n')) {
    const f = /^\+\+\+ b\/(.+)$/.exec(line)
    if (f) file = f[1]!
    const h = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(line)
    if (h && file) {
      const start = Number(h[1])
      const n = h[2] === undefined ? 1 : Number(h[2])
      const set = (out[file] ??= new Set())
      for (let i = 0; i < n; i++) set.add(start + i)
    }
  }
  return out
}

const onDiff = (rep: StrykerReport, diff: DiffLines, modules: string[]) =>
  Object.entries(rep.files)
    .filter(([f]) => modules.includes('*') || modules.some(m => f.startsWith(`${m}/`)))
    .flatMap(([f, { mutants }]) =>
      mutants.filter(m => {
        const d = diff[f]
        if (!d) return false
        for (let l = m.location.start.line; l <= m.location.end.line; l++) if (d.has(l)) return true
        return false
      }),
    )

const NO_MUTATION =
  'no supported mutation tool installed (Stryker is not a dependency of this repo); pass --stryker <mutation-report.json> when one is available'

/** G4: mutation score on changed lines (Stryker JSON), ≥ minMutationScoreOnDiffPct. Equivalent/ignored mutants excluded. */
export function g4(
  rep: StrykerReport | undefined,
  diff: DiffLines,
  cfg: Config,
  labels: string[] = [],
): GateResult {
  if (!rep) return unsupported('G4', NO_MUTATION)
  const ms = onDiff(rep, diff, cfg.criticalModules).filter(m =>
    ['Killed', 'Survived', 'Timeout'].includes(m.status),
  )
  if (!ms.length) return result('G4', cfg, [], labels, 'no mutants on the diff')
  const killed = ms.filter(m => m.status !== 'Survived').length
  const pct = (killed / ms.length) * 100
  return result(
    'G4',
    cfg,
    pct < cfg.minMutationScoreOnDiffPct
      ? [`score ${pct.toFixed(1)}% < ${cfg.minMutationScoreOnDiffPct}% (${killed}/${ms.length})`]
      : [],
    labels,
  )
}

/** G5: every added test is the sole killer of ≥ minUniqueKillsPerNewTest diff mutants (blocks U3/U1 at creation). */
export function g5(
  rep: StrykerReport | undefined,
  diff: DiffLines,
  addedIds: string[],
  cfg: Config,
  labels: string[] = [],
): GateResult {
  if (!rep) return unsupported('G5', NO_MUTATION)
  const name = new Map<string, string>()
  for (const [f, { tests }] of Object.entries(rep.testFiles ?? {}))
    for (const t of tests) name.set(t.id, `${f}::${t.name}`)
  const added = new Set(addedIds)
  const unique = new Map<string, number>(addedIds.map(i => [i, 0]))
  for (const m of onDiff(rep, diff, cfg.criticalModules)) {
    const killers = (m.killedBy ?? []).map(k => name.get(k) ?? k)
    if (killers.length === 1 && added.has(killers[0]!))
      unique.set(killers[0]!, (unique.get(killers[0]!) ?? 0) + 1)
  }
  const v = [...unique]
    .filter(([, n]) => n < cfg.minUniqueKillsPerNewTest)
    .map(([id, n]) => `${id} unique_kills=${n}`)
  return result('G5', cfg, v.sort(), labels)
}

/** G6: added/modified tests green in every seeded random-order run (cfg.flakyRuns.pr). */
export function g6(runs: Record<string, string>[], cfg: Config, labels: string[] = []): GateResult {
  if (runs.length < cfg.flakyRuns.pr)
    return unsupported('G6', `${runs.length}/${cfg.flakyRuns.pr} random-order runs executed`)
  const ids = new Set(runs.flatMap(r => Object.keys(r)))
  const v = [...ids]
    .filter(i => runs.some(r => r[i] !== 'passed'))
    .map(i => `${i} ${runs.filter(r => r[i] === 'passed').length}/${runs.length} green`)
  return result('G6', cfg, v.sort(), labels)
}

/** G7: `git diff --numstat` test lines added vs production lines changed; above ratio needs a label. */
export function g7(numstat: string, cfg: Config, labels: string[] = []): GateResult {
  let test = 0
  let prod = 0
  for (const l of numstat.split('\n').filter(Boolean)) {
    const [a = '0', d = '0', f = ''] = l.split('\t')
    if (/^docs\/|\.md$|^test-audit\/|\.json$|\.changeset\//.test(f)) continue
    const lines = (a === '-' ? 0 : Number(a)) + (d === '-' ? 0 : Number(d))
    if (TEST_FILE_RE.test(f) || /\.test\./.test(f)) test += a === '-' ? 0 : Number(a)
    else prod += lines
  }
  const over = prod === 0 ? test > 0 : test / prod > cfg.maxTestToCodeRatio
  return result(
    'G7',
    cfg,
    over ? [`test:prod ${test}:${prod} > ${cfg.maxTestToCodeRatio}:1`] : [],
    labels,
  )
}

/** G8: no new U2/U3 test versus the previous audit. */
export function g8(
  prev: Report | undefined,
  now: Report,
  cfg: Config,
  labels: string[] = [],
): GateResult {
  if (!prev) return unsupported('G8', 'no previous test-audit/report.json to compare with')
  const was = new Set(
    prev.records.filter(r => r.classes.some(c => c === 'U2' || c === 'U3')).map(r => r.test_id),
  )
  const v = now.records
    .filter(r => r.classes.some(c => c === 'U2' || c === 'U3') && !was.has(r.test_id))
    .map(r => `${r.test_id} ${r.classes.join(',')}`)
  return result('G8', cfg, v.sort(), labels)
}

/** Blocking verdict of a run: any blocking failure ⇒ exit 1. Exceptions (bypass labels) are counted. */
export function verdict(
  results: GateResult[],
  labels: string[],
): { exit: 0 | 1; bypasses: string[] } {
  return {
    exit: results.some(r => r.blocking) ? 1 : 0,
    bypasses: labels.filter(l => /^gate-bypass:G[1-8]: \S/.test(l)),
  }
}

export function renderGates(results: GateResult[], cfg: Config, bypasses: string[]): string {
  const lines = [
    `## Test gates — rollout \`${cfg.rollout}\``,
    '',
    '| gate | status | blocking | violations |',
    '| --- | --- | --- | ---: |',
  ]
  for (const r of results)
    lines.push(
      `| ${r.id} | ${r.status}${r.detail ? ` (${r.detail})` : ''} | ${r.blocking} | ${r.violations.length} |`,
    )
  for (const r of results) for (const v of r.violations.slice(0, 20)) lines.push(`- ${r.id}: ${v}`)
  if (bypasses.length)
    lines.push('', `Bypasses (counted in the nightly report): ${bypasses.join('; ')}`)
  return lines.join('\n') + '\n'
}

/** Runs the changed test files `cfg.flakyRuns.pr` times, random order, one seed per run; per-run id → status. */
export function runShuffled(root: string, files: string[], cfg: Config): Record<string, string>[] {
  const byPkg = new Map<string, string[]>()
  for (const f of files) byPkg.set(moduleOf(f), [...(byPkg.get(moduleOf(f)) ?? []), f])
  return Array.from({ length: cfg.flakyRuns.pr }, (_, i) => {
    const run: Record<string, string> = {}
    for (const [pkg, fs] of byPkg) {
      const out = join(root, 'test-audit', '.tmp', `g6-${pkg.replace(/\//g, '_')}-${i}.json`)
      try {
        execFileSync(
          'npx',
          [
            'vitest',
            'run',
            ...fs.map(f => f.slice(pkg.length + 1)),
            '--reporter=json',
            `--outputFile=${out}`,
            '--sequence.shuffle',
            `--sequence.seed=${300 + i}`,
          ],
          { cwd: join(root, pkg), stdio: 'ignore', timeout: 590_000 },
        )
      } catch {
        // failing tests still write the JSON
      }
      for (const [id, t] of Object.entries(
        parseVitestJson(root, JSON.parse(readFileSync(out, 'utf8'))),
      ))
        run[id] = t.status
    }
    return run
  })
}

const git = (cwd: string, ...a: string[]): string =>
  execFileSync('git', a, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 })

/** Value following `key`, undefined when the flag is absent (indexOf -1 must not read argv[0]). */
export const optValue = (argv: string[], key: string): string | undefined => {
  const i = argv.indexOf(key)
  return i < 0 ? undefined : argv[i + 1]
}

/** CLI: `gates.ts [--base origin/main] [--labels a,b] [--durations run.json] [--stryker report.json] [--g6]`. */
export function main(argv: string[], root = REPO_ROOT): number {
  const opt = (k: string): string | undefined => optValue(argv, k)
  const cfg = loadConfig(join(root, 'docs/testing/test-policy.config.json'))
  const base = opt('--base') ?? 'origin/main'
  const labels = (opt('--labels') ?? '').split(',').filter(Boolean)
  const changed = git(root, 'diff', '--name-only', '--diff-filter=AM', `${base}...HEAD`)
    .split('\n')
    .filter(f => TEST_FILE_RE.test(f))
  const sources = Object.fromEntries(changed.map(f => [f, readFileSync(join(root, f), 'utf8')]))
  const recs = changed.flatMap(f => parseTests(f, sources[f]!))
  const quarantine =
    JSON.parse(readFileSync(join(root, 'docs/testing/test-policy.config.json'), 'utf8'))
      .quarantine ?? []
  const diff = parseDiffLines(git(root, 'diff', '-U0', `${base}...HEAD`))
  const stryker: StrykerReport | undefined = opt('--stryker')
    ? JSON.parse(readFileSync(opt('--stryker')!, 'utf8'))
    : undefined
  const results: GateResult[] = [
    g1(recs, cfg, labels),
    g2(recs, sources, cfg, quarantine, labels),
    opt('--durations')
      ? g3(JSON.parse(readFileSync(opt('--durations')!, 'utf8')), undefined, cfg, labels)
      : unsupported('G3', 'pass --durations <{id: ms}.json> from the runner JSON report'),
    g4(stryker, diff, cfg, labels),
    g5(
      stryker,
      diff,
      recs.map(r => r.test_id),
      cfg,
      labels,
    ),
    argv.includes('--g6')
      ? g6(runShuffled(root, changed, cfg), cfg, labels)
      : unsupported(
          'G6',
          'pass --g6 (executes the changed files in random order, flakyRuns.pr times)',
        ),
    g7(git(root, 'diff', '--numstat', `${base}...HEAD`), cfg, labels),
    opt('--g8-from')
      ? g8(
          JSON.parse(readFileSync(opt('--g8-from')!, 'utf8')),
          JSON.parse(readFileSync(join(root, 'test-audit/report.json'), 'utf8')),
          cfg,
          labels,
        )
      : unsupported(
          'G8',
          'nightly: pass --g8-from <previous report.json> after regenerating test-audit/',
        ),
  ]
  const v = verdict(results, labels)
  process.stdout.write(renderGates(results, cfg, v.bypasses))
  return v.exit
}

if (require.main === module) process.exit(main(process.argv.slice(2)))
