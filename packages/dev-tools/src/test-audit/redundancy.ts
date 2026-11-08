/**
 * test-audit redundancy (US-613 T7): ONE command, ONE report file, every supported level.
 *   - vitest packages: Stryker mutation per module (per-test kills, incremental)
 *   - Playwright e2e/component tests: static fingerprint overlap (no mutation, no browser)
 * The output is the input of a cleanup card: a flat `candidates` list, never an automatic deletion.
 * A level or module that fails is recorded under `errors` and the run goes on.
 */
import { execFileSync } from 'child_process'
import { mkdirSync, writeFileSync } from 'fs'
import { basename, dirname, join, relative, resolve } from 'path'

import { REPO_ROOT } from '../quality-gates/repo-root'

import { DEFAULT_SLICES, mergeSummaries, run as runMutation } from './mutation'
import type { MutationSummary } from './mutation'
import { rowsFor } from './playwright-overlap'
import type { PwRow } from './playwright-overlap'

export const MODULES = [
  'packages/content-ops',
  'packages/brand',
  'packages/dev-tools',
  'packages/knowledge-hub',
  'apps/pair-cli',
  'apps/website',
]

export interface Candidate {
  source: 'mutation' | 'playwright-fingerprint'
  module: string
  file: string
  name: string
  class: string
  kills?: number
  uniqueKills?: number
  containedIn?: string
}
export interface Report {
  generatedAt: string
  revision: string
  mutation: Record<string, { score: number | null; mutants: Record<string, number>; tests: number }>
  playwright: { tests: number; redundant: number; effective: number; noSignal: number }
  totals: { candidates: number; bySource: Record<string, number> }
  candidates: Candidate[]
  errors: { level: string; module: string; message: string }[]
}

export function fromMutation(s: MutationSummary): Candidate[] {
  return s.candidates.map(t => ({
    source: 'mutation',
    module: s.module,
    file: t.file,
    name: t.name,
    class: t.class,
    kills: t.kills,
    uniqueKills: t.uniqueKills,
  }))
}

export function fromPlaywright(rows: PwRow[]): Candidate[] {
  return rows
    .filter(r => r.class === 'redundant')
    .map(r => ({
      source: 'playwright-fingerprint' as const,
      module: r.file.split('/').slice(0, 2).join('/'),
      file: r.file,
      name: r.name,
      class: r.class,
      ...(r.containedIn ? { containedIn: r.containedIn } : {}),
    }))
}

export function parseArgs(argv: string[], root: string) {
  const get = (f: string): string | undefined => {
    const i = argv.indexOf(f)
    return i >= 0 ? argv[i + 1] : undefined
  }
  return {
    out: resolve(root, get('--out') ?? join('test-audit', 'redundancy', 'report.json')),
    modules: get('--modules')?.split(',').filter(Boolean) ?? MODULES,
    concurrency: Number(get('--concurrency') ?? 4),
    skipMutation: argv.includes('--skip-mutation'),
    skipPlaywright: argv.includes('--skip-playwright'),
  }
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** One module = one or more slices (own mutate scope each), merged per test. */
function mutateModule(
  module: string,
  opts: ReturnType<typeof parseArgs>,
  root: string,
): MutationSummary {
  const slices = DEFAULT_SLICES[module] ?? [[]]
  const parts = slices.map((mutate, i) =>
    runMutation(
      {
        module,
        mutate,
        out: join(
          root,
          'test-audit',
          'mutation',
          `${basename(module)}${slices.length > 1 ? `-${i + 1}` : ''}.json`,
        ),
        concurrency: opts.concurrency,
        incremental: true,
      },
      root,
    ),
  )
  return slices.length > 1 ? mergeSummaries(module, parts) : (parts[0] as MutationSummary)
}

export function build(opts: ReturnType<typeof parseArgs>, root: string): Report {
  const errors: Report['errors'] = []
  const mutation: Report['mutation'] = {}
  let candidates: Candidate[] = []
  for (const module of opts.skipMutation ? [] : opts.modules) {
    try {
      const s = mutateModule(module, opts, root)
      mutation[module] = { score: s.score, mutants: s.mutants, tests: s.tests.length }
      candidates = candidates.concat(fromMutation(s))
    } catch (e) {
      errors.push({ level: 'mutation', module, message: message(e) })
    }
  }
  let rows: PwRow[] = []
  try {
    if (!opts.skipPlaywright) rows = rowsFor(root)
  } catch (e) {
    errors.push({ level: 'playwright', module: '*', message: message(e) })
  }
  candidates = candidates.concat(fromPlaywright(rows))
  const n = (c: PwRow['class']) => rows.filter(r => r.class === c).length
  const bySource: Record<string, number> = {}
  for (const c of candidates) bySource[c.source] = (bySource[c.source] ?? 0) + 1
  return {
    generatedAt: new Date().toISOString(),
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    mutation,
    playwright: {
      tests: rows.length,
      redundant: n('redundant'),
      effective: n('effective'),
      noSignal: n('no-signal'),
    },
    totals: { candidates: candidates.length, bySource },
    candidates,
    errors,
  }
}

if (require.main === module) {
  const opts = parseArgs(process.argv.slice(2), REPO_ROOT)
  const report = build(opts, REPO_ROOT)
  mkdirSync(dirname(opts.out), { recursive: true })
  writeFileSync(opts.out, JSON.stringify(report, null, 2) + '\n')
  console.log(
    `redundancy: ${report.totals.candidates} candidates ` +
      `(${JSON.stringify(report.totals.bySource)}) · errors ${report.errors.length}\n` +
      `report: ${relative(REPO_ROOT, opts.out)}`,
  )
}
