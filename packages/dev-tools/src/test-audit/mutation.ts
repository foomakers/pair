/**
 * test-audit mutation (US-613 T7): manual Stryker run for ONE module, reduced to a per-test report.
 * Never in the default CI. The output file lists tests that kill no mutant or whose kills are all
 * shared with another test — candidates for a cleanup card, never an automatic deletion.
 * Only mutants inside `--mutate` are judged: a test covering none of them is `out-of-scope`.
 */
import { execFileSync } from 'child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { basename, dirname, join, relative, resolve } from 'path'

import { REPO_ROOT } from '../quality-gates/repo-root'

export interface StrykerMutant {
  status: string
  coveredBy?: string[]
  killedBy?: string[]
}
export interface StrykerReport {
  files: Record<string, { mutants: StrykerMutant[] }>
  testFiles?: Record<string, { tests: { id: string; name: string }[] }>
}
export type TestClass = 'effective' | 'never-kills' | 'redundant' | 'out-of-scope'
export interface TestRow {
  file: string
  name: string
  covered: number
  kills: number
  uniqueKills: number
  class: TestClass
}
export interface MutationSummary {
  module: string
  mutate: string[]
  score: number | null
  mutants: Record<string, number>
  tests: TestRow[]
  candidates: TestRow[]
}

const DETECTED = new Set(['Killed', 'Timeout'])

function tally(mutants: StrykerMutant[]) {
  const covered = new Map<string, number>()
  const kills = new Map<string, number>()
  const unique = new Map<string, number>()
  const bump = (m: Map<string, number>, id: string) => m.set(id, (m.get(id) ?? 0) + 1)
  for (const m of mutants) {
    m.coveredBy?.forEach(id => bump(covered, id))
    m.killedBy?.forEach(id => bump(kills, id))
    const [only, ...rest] = m.killedBy ?? []
    if (only !== undefined && rest.length === 0) bump(unique, only)
  }
  return { covered, kills, unique }
}

function classify(covered: number, kills: number, unique: number): TestClass {
  if (covered === 0) return 'out-of-scope'
  if (kills === 0) return 'never-kills'
  return unique === 0 ? 'redundant' : 'effective'
}

export function analyze(
  report: StrykerReport,
  module: string,
  mutate: string[] = [],
): MutationSummary {
  const mutants = Object.values(report.files).flatMap(f => f.mutants)
  const { covered, kills, unique } = tally(mutants)
  const tests: TestRow[] = Object.entries(report.testFiles ?? {}).flatMap(([file, { tests }]) =>
    tests.map(t => {
      const c = covered.get(t.id) ?? 0
      const k = kills.get(t.id) ?? 0
      const u = unique.get(t.id) ?? 0
      return { file, name: t.name, covered: c, kills: k, uniqueKills: u, class: classify(c, k, u) }
    }),
  )
  const counts: Record<string, number> = {}
  for (const m of mutants) counts[m.status] = (counts[m.status] ?? 0) + 1
  const judged = mutants.filter(m => m.status !== 'Ignored' && m.status !== 'CompileError')
  const detected = judged.filter(m => DETECTED.has(m.status)).length
  return {
    module,
    mutate,
    score: judged.length ? Math.round((detected / judged.length) * 10000) / 100 : null,
    mutants: counts,
    tests,
    candidates: tests.filter(t => t.class === 'never-kills' || t.class === 'redundant'),
  }
}

/** Sources compiled into shipped assets: tests compare asset and source byte for byte, so they stay unmutated. */
export const DEFAULT_MUTATE: Record<string, string[]> = {
  'packages/knowledge-hub': [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/tools/coverage-baseline-ratchet.ts',
    '!src/tools/mirror-realign.ts',
  ],
}

export interface Options {
  module: string
  mutate: string[]
  out: string
  concurrency: number
  incremental: boolean
  analyzeOnly?: string | undefined
}

export function parseArgs(argv: string[], root: string): Options {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const module = get('--module')
  if (!module)
    throw new Error(
      'usage: mutation.ts --module <dir> [--mutate a,b] [--out file] [--concurrency n] [--incremental] [--analyze-only raw.json]',
    )
  const out = get('--out') ?? join('test-audit', 'mutation', `${basename(module)}.json`)
  return {
    module,
    mutate: get('--mutate')?.split(',').filter(Boolean) ?? [],
    out: resolve(root, out),
    concurrency: Number(get('--concurrency') ?? 4),
    incremental: argv.includes('--incremental'),
    analyzeOnly: get('--analyze-only'),
  }
}

const mutateOf = (o: Options): string[] =>
  o.mutate.length ? o.mutate : (DEFAULT_MUTATE[o.module] ?? [])

/** Stryker has no CLI flag for the JSON path: the run is driven by a generated config file. */
export function buildConfig(o: Options, raw: string, tmp: string): Record<string, unknown> {
  return {
    testRunner: 'vitest',
    plugins: ['@stryker-mutator/vitest-runner'],
    coverageAnalysis: 'perTest',
    disableBail: true,
    inPlace: true,
    reporters: ['progress', 'json', 'clear-text'],
    jsonReporter: { fileName: raw },
    tempDirName: tmp,
    concurrency: o.concurrency,
    ...(mutateOf(o).length ? { mutate: mutateOf(o) } : {}),
    ...(o.incremental ? { incremental: true, incrementalFile: `${raw}.incremental.json` } : {}),
  }
}

/** Stryker runs in place; git is the restore. Tracked changes before the run would be lost, so refuse. */
const dirty = (root: string): string =>
  execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
    cwd: root,
    encoding: 'utf8',
  })

function restore(root: string, module: string): void {
  execFileSync('git', ['checkout', '-q', '--', '.'], { cwd: root })
  execFileSync('git', ['clean', '-fdq', '--', module], { cwd: root })
}

export function run(o: Options, root: string): MutationSummary {
  const dir = dirname(o.out)
  mkdirSync(dir, { recursive: true })
  const raw = o.analyzeOnly ? resolve(root, o.analyzeOnly) : o.out.replace(/\.json$/, '.raw.json')
  if (!o.analyzeOnly) {
    if (dirty(root)) {
      throw new Error(
        'worktree has uncommitted tracked changes: commit or stash first (Stryker runs in place and git restores it)',
      )
    }
    const tmp = join(dir, '.tmp')
    const config = join(dir, `${basename(o.module)}.stryker.json`)
    writeFileSync(config, JSON.stringify(buildConfig(o, raw, tmp)))
    const pkg = require.resolve('@stryker-mutator/core/package.json')
    const bin = join(dirname(pkg), 'bin', 'stryker.js')
    try {
      execFileSync(process.execPath, [bin, 'run', config], {
        cwd: resolve(root, o.module),
        stdio: 'inherit',
      })
    } finally {
      rmSync(tmp, { recursive: true, force: true })
      rmSync(config, { force: true })
      restore(root, o.module)
    }
  }
  const summary = analyze(JSON.parse(readFileSync(raw, 'utf8')), o.module, mutateOf(o))
  writeFileSync(o.out, JSON.stringify(summary, null, 2) + '\n')
  return summary
}

if (require.main === module) {
  const o = parseArgs(process.argv.slice(2), REPO_ROOT)
  const s = run(o, REPO_ROOT)
  const n = (c: TestClass) => s.tests.filter(t => t.class === c).length
  console.log(
    `mutation ${s.module}: score ${s.score ?? 'n/a'}% · tests ${s.tests.length} · ` +
      `never-kills ${n('never-kills')} · redundant ${n('redundant')} · out-of-scope ${n('out-of-scope')}\n` +
      `report: ${relative(REPO_ROOT, o.out)}`,
  )
}
