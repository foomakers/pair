/**
 * test-audit classification + report (US-613 F4–F8 accounting, AC1–AC4).
 * Pure functions over (inventory, baseline, config): same input ⇒ same bytes.
 * A signal without a supported tool is `not measured`: it never classifies and never justifies removal.
 */
import { execFileSync } from 'child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

import { REPO_ROOT } from '../quality-gates/repo-root'

import type { CompactBaseline } from './baseline'
import { TEST_FILE_RE, NOT_MEASURED, parseTests, buildInventory, type Level, type TestRecord } from './inventory'

export interface Config {
  budgets: Record<Level, { maxTestMs: number; totalMs: number }>
  maxLevelGrowthPct: number
  minMutationScoreOnDiffPct: number
  minUniqueKillsPerNewTest: number
  flakyRuns: { audit: number; pr: number }
  maxMockAssertionRatio: number
  maxSnapshotLines: number
  maxTestToCodeRatio: number
  rollout: 'report-only' | 'block-cheap' | 'block-full'
  criticalModules: string[]
}

export function loadConfig(file: string): Config {
  const c = JSON.parse(readFileSync(file, 'utf8'))
  for (const k of ['maxLevelGrowthPct', 'minMutationScoreOnDiffPct', 'minUniqueKillsPerNewTest', 'maxMockAssertionRatio', 'maxSnapshotLines', 'maxTestToCodeRatio'])
    if (typeof c[k] !== 'number' || !Number.isFinite(c[k])) throw new Error(`${file}: ${k} must be a number, got ${JSON.stringify(c[k])}`)
  if (!['report-only', 'block-cheap', 'block-full'].includes(c.rollout))
    throw new Error(`${file}: rollout must be report-only | block-cheap | block-full, got ${JSON.stringify(c.rollout)}`)
  if (!Array.isArray(c.criticalModules)) throw new Error(`${file}: criticalModules must be an array`)
  return c as Config
}

export type Action = 'keep' | 'remove' | 'rewrite' | 'quarantine'
export interface ReportRecord {
  test_id: string
  module: string
  level: Level
  duration_ms_median: number | typeof NOT_MEASURED
  assertions: number
  mocks: number
  lines_covered: typeof NOT_MEASURED
  unique_lines: typeof NOT_MEASURED
  mutants_killed: typeof NOT_MEASURED
  unique_kills: typeof NOT_MEASURED
  flaky_runs: string | typeof NOT_MEASURED
  classes: string[]
  signals: Partial<Record<string, string>>
  unmeasured: string[]
  protected: boolean
  action: Action
  pr: string | null
}

/** Regression (issue ref), public-contract, security, documented requirement: never auto-removed. */
export const PROTECTED_RE = /#\d+|\bUS-\d+|\bregression\b|\bsecurity\b|\bcontract\b|\brequirement\b|a11y|accessib/i
export const isProtected = (id: string): boolean => PROTECTED_RE.test(id)

const PR_OF: Record<string, string> = {
  U2: 'audit/U2-no-assertions',
  U4: 'audit/U4-change-detector',
  U6: 'audit/U6-quarantine',
}
const ACTION_OF: Record<string, Action> = { U2: 'remove', U4: 'rewrite', U6: 'quarantine' }
/** F8 order, safest first. */
export const CLASS_ORDER = ['U2', 'U3', 'U8', 'U5', 'U1', 'U4', 'U7']

/** Runs whose status differs from the most common one, over total runs. */
const flakyRuns = (statuses: string): string => {
  const counts = [...new Set(statuses)].map(s => [...statuses].filter(x => x === s).length)
  return `${statuses.length - Math.max(...counts)}/${statuses.length}`
}

type Timing = Record<string, [number, string]>

const timingOf = (b: CompactBaseline | undefined, module: string): Timing =>
  Object.entries(b?.packages ?? {}).find(([pkg]) => pkg === module)?.[1].tests ?? {}

export type Confirmations = Record<string, { class: string; verdict: 'confirmed' | 'dismissed'; reason: string }>

/** U4's mock ratio only nominates; a written-rule confirmation (internal collaborator mocked) makes it a class. */
export function classify(
  records: TestRecord[],
  baseline: CompactBaseline | undefined,
  cfg: Config,
  confirmations: Confirmations = {},
): ReportRecord[] {
  return records.map(r => {
    const t = timingOf(baseline, r.module)[r.test_id]
    const classes: string[] = []
    const signals: Partial<Record<string, string>> = {}
    const unmeasured: string[] = ['U1', 'U3', 'U5', 'U8'] // need the mutant × test / coverage matrix: no supported tool
    if (r.assertions === 0 && !r.skipped) {
      classes.push('U2')
      signals['U2'] = 'assertions=0'
    }
    if (r.mocks > cfg.maxMockAssertionRatio * r.assertions && r.mocks > 0) {
      const c = confirmations[r.test_id]
      const sig = `mocks=${r.mocks} > ${cfg.maxMockAssertionRatio}*assertions=${r.assertions}`
      if (c?.class === 'U4' && c.verdict === 'confirmed') {
        classes.push('U4')
        signals['U4'] = `${sig}; confirmed: ${c.reason}`
      } else if (c?.verdict === 'dismissed') signals['U4-dismissed'] = `${sig}; dismissed: ${c.reason}`
      else signals['U4-candidate'] = `${sig}; unconfirmed`
    }
    if (t && new Set(t[1]).size > 1) {
      classes.push('U6')
      signals['U6'] = `status differs across runs: ${t[1]}`
    }
    if (t && t[0] > cfg.budgets[r.level].maxTestMs) unmeasured.push('U7') // over budget; unique kills not measured
    else if (!t) unmeasured.push('U7')
    const prot = isProtected(r.test_id)
    const top = CLASS_ORDER.concat('U6').find(c => classes.includes(c))
    return {
      test_id: r.test_id,
      module: r.module,
      level: r.level,
      duration_ms_median: t ? t[0] : NOT_MEASURED,
      assertions: r.assertions,
      mocks: r.mocks,
      lines_covered: NOT_MEASURED,
      unique_lines: NOT_MEASURED,
      mutants_killed: NOT_MEASURED,
      unique_kills: NOT_MEASURED,
      flaky_runs: t ? flakyRuns(t[1]) : NOT_MEASURED,
      classes,
      signals,
      unmeasured,
      protected: prot,
      action: prot || !top ? 'keep' : (ACTION_OF[top] ?? 'keep'),
      pr: prot || !top ? null : (PR_OF[top] ?? null),
    }
  })
}

export type Counts = Record<string, Record<Level, number>>
export interface Reconciliation {
  before: Counts
  audited: Counts
  unnecessary: Counts
  protected: Counts
  removed: Counts
  rewritten: Counts
  added: Counts
  remaining: Counts
  unmeasured: Counts
}

const bump = (c: Counts, r: { module: string; level: Level }): void => {
  const m = (c[r.module] ??= { unit: 0, integration: 0, e2e: 0 })
  m[r.level]++
}
const tally = (rs: { module: string; level: Level }[]): Counts => {
  const c: Counts = {}
  rs.forEach(r => bump(c, r))
  return c
}
export const total = (c: Counts): number => Object.values(c).reduce((a, m) => a + m.unit + m.integration + m.e2e, 0)

/**
 * before = inventory at the base revision; remaining = current inventory.
 * removed/added are set differences by stable id; rewritten comes from the applied-cleanup manifest.
 * Throws when before − removed + added ≠ remaining (cannot happen by construction unless ids collide).
 */
export function reconcile(
  before: ReportRecord[],
  current: TestRecord[],
  rewrittenIds: string[],
): Reconciliation {
  const cur = new Set(current.map(r => r.test_id))
  const was = new Set(before.map(r => r.test_id))
  const removed = before.filter(r => !cur.has(r.test_id))
  const added = current.filter(r => !was.has(r.test_id))
  const rw = new Set(rewrittenIds)
  const rec: Reconciliation = {
    before: tally(before),
    audited: tally(before),
    unnecessary: tally(before.filter(r => r.classes.length && !r.protected)),
    protected: tally(before.filter(r => r.protected)),
    removed: tally(removed),
    rewritten: tally(before.filter(r => rw.has(r.test_id))),
    added: tally(added),
    remaining: tally(current),
    unmeasured: tally(before.filter(r => r.unmeasured.length)),
  }
  if (total(rec.before) - total(rec.removed) + total(rec.added) !== total(rec.remaining))
    throw new Error(`reconciliation: ${total(rec.before)} - ${total(rec.removed)} + ${total(rec.added)} != ${total(rec.remaining)}`)
  return rec
}

export interface Report {
  base_rev: string
  reconciliation: Reconciliation
  classes: Record<string, number>
  records: ReportRecord[]
  removed_ids: string[]
  added_ids: string[]
}

export function buildReport(
  baseRev: string,
  before: TestRecord[],
  current: TestRecord[],
  baseline: CompactBaseline | undefined,
  cfg: Config,
  rewrittenIds: string[] = [],
  confirmations: Confirmations = {},
): Report {
  const records = classify(before, baseline, cfg, confirmations)
  const cur = new Set(current.map(r => r.test_id))
  const was = new Set(before.map(r => r.test_id))
  const classes: Record<string, number> = {}
  for (const r of records) for (const c of r.classes) classes[c] = (classes[c] ?? 0) + 1
  return {
    base_rev: baseRev,
    reconciliation: reconcile(records, current, rewrittenIds),
    classes,
    records,
    removed_ids: records.filter(r => !cur.has(r.test_id)).map(r => r.test_id),
    added_ids: current.filter(r => !was.has(r.test_id)).map(r => r.test_id),
  }
}

const COLS: (keyof Reconciliation)[] = ['before', 'audited', 'unnecessary', 'protected', 'removed', 'rewritten', 'added', 'remaining', 'unmeasured']

export function renderMarkdown(rep: Report, baseline: CompactBaseline | undefined): string {
  const rec = rep.reconciliation
  const mods = [...new Set(COLS.flatMap(c => Object.keys(rec[c])))].sort()
  const cell = (c: keyof Reconciliation, m: string, l: Level): number => rec[c][m]?.[l] ?? 0
  const lines = ['# Test audit report', '', `Base revision: \`${rep.base_rev}\`. Regenerate: \`pnpm --filter @pair/dev-tools test-audit\`.`, '']
  lines.push('## Reconciliation by module and level', '', `| module | level | ${COLS.join(' | ')} |`, `| --- | --- | ${COLS.map(() => '---:').join(' | ')} |`)
  for (const m of mods)
    for (const l of ['unit', 'integration', 'e2e'] as Level[])
      if (COLS.some(c => cell(c, m, l))) lines.push(`| ${m} | ${l} | ${COLS.map(c => cell(c, m, l)).join(' | ')} |`)
  lines.push(`| **total** | | ${COLS.map(c => total(rec[c])).join(' | ')} |`, '')
  lines.push('`before − removed + added = remaining`. `unnecessary` = classified and not protected; `unmeasured` = at least one class signal has no supported tool.', '')
  lines.push('## Classes (confirmed by deterministic signal)', '', '| class | tests |', '| --- | ---: |')
  for (const c of ['U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7', 'U8'])
    lines.push(`| ${c} | ${rep.classes[c] ?? (['U1', 'U3', 'U5', 'U7', 'U8'].includes(c) ? NOT_MEASURED : 0)} |`)
  lines.push('')
  if (baseline) {
    lines.push('## Baseline (F0)', '', `Runner: ${baseline.tool['runner']}. Mutation: ${baseline.tool['mutation']} (no supported tool installed). Per-test coverage: ${baseline.tool['per_test_coverage']}.`, '', '| package | tests | wall ms (median of runs) | line cov % | branch cov % |', '| --- | ---: | ---: | ---: | ---: |')
    for (const [p, v] of Object.entries(baseline.packages).sort()) {
      const cov = v.runs.find(r => r.coverage)?.coverage
      lines.push(`| ${p} | ${Object.keys(v.tests).length} | ${v.wall_ms_median} | ${cov?.lines ?? NOT_MEASURED} | ${cov?.branches ?? NOT_MEASURED} |`)
    }
    lines.push('')
  }
  const hit = rep.records.filter(r => r.classes.length)
  lines.push('## Flagged tests', '', '| test | classes | signal | protected | action |', '| --- | --- | --- | --- | --- |')
  for (const r of hit)
    lines.push(`| \`${r.test_id.replace(/\|/g, '\\|')}\` | ${r.classes.join(', ')} | ${Object.values(r.signals).join('; ').replace(/\|/g, '\\|')} | ${r.protected} | ${r.action} |`)
  lines.push('', `Removed: ${rep.removed_ids.length}. Added by this story: ${rep.added_ids.length}.`, '')
  return lines.join('\n')
}

export function renderRemovalPlan(rep: Report): string {
  const lines = ['# Removal plan', '', 'Commits inside the single PR, safest class first (U6 is quarantined, never removed). Mutation score and branch coverage must not fall: not measured here (no mutation tool) — removals are limited to classes with a deterministic static signal.', '']
  for (const c of [...CLASS_ORDER, 'U6']) {
    const rs = rep.records.filter(r => r.classes.includes(c) && !r.protected && (r.action !== 'keep'))
    const prot = rep.records.filter(r => r.classes.includes(c) && r.protected)
    lines.push(`## ${c}${PR_OF[c] ? ` — ${PR_OF[c]}` : ''}`, '')
    if (!rs.length && !prot.length) lines.push(CLASS_ORDER.includes(c) && !PR_OF[c] ? `not measured: no ${c} signal available.` : 'no candidates.', '')
    for (const r of rs) lines.push(`- ${r.action} \`${r.test_id}\` — ${r.signals[c]}`)
    for (const r of prot) lines.push(`- protected, kept \`${r.test_id}\` — ${r.signals[c]}`)
    if (rs.length || prot.length) lines.push('')
  }
  return lines.join('\n')
}

const git = (cwd: string, ...a: string[]): string => execFileSync('git', a, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 })

/** Static inventory of the tree at `rev` — the audited "before" set. */
export function inventoryAt(root: string, rev: string): TestRecord[] {
  return git(root, 'ls-tree', '-r', '--name-only', rev)
    .split('\n')
    .filter(f => TEST_FILE_RE.test(f))
    .flatMap(f => parseTests(f, git(root, 'show', `${rev}:${f}`)))
}

export function main(root = REPO_ROOT): void {
  const dir = join(root, 'test-audit')
  const cfg = loadConfig(join(root, 'docs/testing/test-policy.config.json'))
  const bf = join(dir, 'baseline.json')
  const baseline: CompactBaseline | undefined = existsSync(bf) ? JSON.parse(readFileSync(bf, 'utf8')) : undefined
  const baseRev = baseline?.base_rev ?? git(root, 'merge-base', 'origin/main', 'HEAD').trim()
  const files = git(root, 'ls-files').split('\n').filter(Boolean)
  const current = buildInventory(root, files).tests
  const mf = join(dir, 'rewritten.json')
  const rewritten: string[] = existsSync(mf) ? JSON.parse(readFileSync(mf, 'utf8')) : []
  const cf = join(dir, 'confirmations.json')
  const confirmations: Confirmations = existsSync(cf) ? JSON.parse(readFileSync(cf, 'utf8')) : {}
  const rep = buildReport(baseRev, inventoryAt(root, baseRev), current, baseline, cfg, rewritten, confirmations)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'report.json'), JSON.stringify(rep, null, 2) + '\n')
  writeFileSync(join(dir, 'report.md'), renderMarkdown(rep, baseline))
  writeFileSync(join(dir, 'removal-plan.md'), renderRemovalPlan(rep))
  console.log(`audit: ${total(rep.reconciliation.before)} before, ${total(rep.reconciliation.remaining)} remaining → ${dir}`)
}

if (require.main === module) main()
