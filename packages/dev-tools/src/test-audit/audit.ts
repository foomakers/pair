/**
 * test-audit classification + report (US-613 F4–F8 accounting, AC1–AC4).
 * Pure functions over (inventory, baseline, config): same input ⇒ same bytes.
 * A signal without a supported tool is `not measured`: it never classifies and never justifies removal.
 */
import { execFileSync } from 'child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

import { REPO_ROOT } from '../quality-gates/repo-root'

import { rerunBaseline, type CompactBaseline } from './baseline'
import {
  TEST_FILE_RE,
  NOT_MEASURED,
  parseTests,
  buildInventory,
  type Level,
  type TestRecord,
} from './inventory'

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
  /** Stages that each re-run the full suite on the same head: cost = repeat runs, not duplicate cases. */
  repeatedGates: string[]
  /** Confirmed U6 cases (evidence from seeded random-order runs); `issue` is the tracking issue once filed. */
  quarantine: { id: string; class: 'U6'; evidence: string; issue: string | null }[]
}

export function loadConfig(file: string): Config {
  const c = JSON.parse(readFileSync(file, 'utf8'))
  for (const k of [
    'maxLevelGrowthPct',
    'minMutationScoreOnDiffPct',
    'minUniqueKillsPerNewTest',
    'maxMockAssertionRatio',
    'maxSnapshotLines',
    'maxTestToCodeRatio',
  ])
    if (typeof c[k] !== 'number' || !Number.isFinite(c[k]))
      throw new Error(`${file}: ${k} must be a number, got ${JSON.stringify(c[k])}`)
  if (!['report-only', 'block-cheap', 'block-full'].includes(c.rollout))
    throw new Error(
      `${file}: rollout must be report-only | block-cheap | block-full, got ${JSON.stringify(c.rollout)}`,
    )
  for (const k of ['criticalModules', 'repeatedGates'])
    if (!Array.isArray(c[k])) throw new Error(`${file}: ${k} must be an array`)
  c.quarantine ??= []
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
export const PROTECTED_RE =
  /#\d+|\bUS-\d+|\bregression\b|\bsecurity\b|\bcontract\b|\brequirement\b|a11y|accessib/i
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

export type Confirmations = Record<
  string,
  { class: string; verdict: 'confirmed' | 'dismissed'; reason: string }
>

type Found = { classes: string[]; signals: Partial<Record<string, string>> }

/** U4's mock ratio only nominates; a written-rule confirmation (internal collaborator mocked) makes it a class. */
function u4Signal(r: TestRecord, cfg: Config, confirmations: Confirmations): Found {
  const none: Found = { classes: [], signals: {} }
  if (!(r.mocks > 0 && r.mocks > cfg.maxMockAssertionRatio * r.assertions)) return none
  const c = confirmations[r.test_id]
  const sig = `mocks=${r.mocks} > ${cfg.maxMockAssertionRatio}*assertions=${r.assertions}`
  if (c?.class === 'U4' && c.verdict === 'confirmed')
    return { classes: ['U4'], signals: { U4: `${sig}; confirmed: ${c.reason}` } }
  if (c?.verdict === 'dismissed')
    return { classes: [], signals: { 'U4-dismissed': `${sig}; dismissed: ${c.reason}` } }
  return { classes: [], signals: { 'U4-candidate': `${sig}; unconfirmed` } }
}

function u6Signal(id: string, cfg: Config, statuses: string | undefined): Found {
  const q = cfg.quarantine.find(x => x.id === id)
  if (q) return { classes: ['U6'], signals: { U6: q.evidence } }
  if (statuses && new Set(statuses).size > 1)
    return { classes: ['U6'], signals: { U6: `status differs across runs: ${statuses}` } }
  return { classes: [], signals: {} }
}

function detect(
  r: TestRecord,
  t: [number, string] | undefined,
  cfg: Config,
  cf: Confirmations,
): Found {
  const u2: Found =
    r.assertions === 0 && !r.skipped
      ? { classes: ['U2'], signals: { U2: 'assertions=0' } }
      : { classes: [], signals: {} }
  const parts = [u2, u4Signal(r, cfg, cf), u6Signal(r.test_id, cfg, t?.[1])]
  return {
    classes: parts.flatMap(p => p.classes),
    signals: Object.assign({}, ...parts.map(p => p.signals)),
  }
}

export function classify(
  records: TestRecord[],
  baseline: CompactBaseline | undefined,
  cfg: Config,
  confirmations: Confirmations = {},
): ReportRecord[] {
  return records.map(r => {
    const t = timingOf(baseline, r.module)[r.test_id]
    const { classes, signals } = detect(r, t, cfg, confirmations)
    const prot = isProtected(r.test_id)
    const top = CLASS_ORDER.concat('U6').find(c => classes.includes(c))
    const act = prot || !top ? undefined : top
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
      // no mutant × test / per-test coverage matrix and no unique-kills tool: these signals are never computed
      unmeasured: ['U1', 'U3', 'U5', 'U7', 'U8'],
      protected: prot,
      action: act ? (ACTION_OF[act] ?? 'keep') : 'keep',
      pr: act ? (PR_OF[act] ?? null) : null,
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
export const total = (c: Counts): number =>
  Object.values(c).reduce((a, m) => a + m.unit + m.integration + m.e2e, 0)

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
    throw new Error(
      `reconciliation: ${total(rec.before)} - ${total(rec.removed)} + ${total(rec.added)} != ${total(rec.remaining)}`,
    )
  return rec
}

export interface Report {
  base_rev: string
  reconciliation: Reconciliation
  classes: Record<string, number>
  records: ReportRecord[]
  removed_ids: string[]
  rewritten_ids: string[]
  added_ids: string[]
}

export interface ReportInput {
  baseRev: string
  before: TestRecord[]
  current: TestRecord[]
  baseline: CompactBaseline | undefined
  cfg: Config
  rewrittenIds?: string[]
  confirmations?: Confirmations
}

export function buildReport(i: ReportInput): Report {
  const { before, current, rewrittenIds = [] } = i
  const records = classify(before, i.baseline, i.cfg, i.confirmations)
  const cur = new Set(current.map(r => r.test_id))
  const was = new Set(before.map(r => r.test_id))
  const classes: Record<string, number> = {}
  for (const r of records) for (const c of r.classes) classes[c] = (classes[c] ?? 0) + 1
  return {
    base_rev: i.baseRev,
    reconciliation: reconcile(records, current, rewrittenIds),
    classes,
    records,
    removed_ids: records.filter(r => !cur.has(r.test_id)).map(r => r.test_id),
    rewritten_ids: rewrittenIds,
    added_ids: current.filter(r => !was.has(r.test_id)).map(r => r.test_id),
  }
}

const COLS: (keyof Reconciliation)[] = [
  'before',
  'audited',
  'unnecessary',
  'protected',
  'removed',
  'rewritten',
  'added',
  'remaining',
  'unmeasured',
]

/** One full-suite wall time (sum of per-package medians) × the stages that each repeat it. Derived, not measured per stage. */
export function repeatCost(
  baseline: CompactBaseline,
  gates: string[],
): { suite_ms: number; stages: number; repeated_ms: number } {
  const suite_ms = Object.values(baseline.packages).reduce((a, p) => a + p.wall_ms_median, 0)
  return { suite_ms, stages: gates.length, repeated_ms: suite_ms * gates.length }
}

const LEVELS: Level[] = ['unit', 'integration', 'e2e']
const ALL_CLASSES = ['U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7', 'U8']
const UNMEASURED_CLASSES = ['U1', 'U3', 'U5', 'U7', 'U8']

function reconciliationSection(rec: Reconciliation): string[] {
  const mods = [...new Set(COLS.flatMap(c => Object.keys(rec[c])))].sort()
  const cell = (c: keyof Reconciliation, m: string, l: Level): number => rec[c][m]?.[l] ?? 0
  const rows = mods.flatMap(m =>
    LEVELS.filter(l => COLS.some(c => cell(c, m, l))).map(
      l => `| ${m} | ${l} | ${COLS.map(c => cell(c, m, l)).join(' | ')} |`,
    ),
  )
  return [
    '## Reconciliation by module and level',
    '',
    `| module | level | ${COLS.join(' | ')} |`,
    `| --- | --- | ${COLS.map(() => '---:').join(' | ')} |`,
    ...rows,
    `| **total** | | ${COLS.map(c => total(rec[c])).join(' | ')} |`,
    '',
    '`before − removed + added = remaining`. `unnecessary` = classified and not protected; `unmeasured` = at least one class signal has no supported tool.',
    '',
  ]
}

const classesSection = (rep: Report): string[] => [
  '## Classes (confirmed by deterministic signal)',
  '',
  '| class | tests |',
  '| --- | ---: |',
  ...ALL_CLASSES.map(
    c => `| ${c} | ${rep.classes[c] ?? (UNMEASURED_CLASSES.includes(c) ? NOT_MEASURED : 0)} |`,
  ),
  '',
]

function baselineSection(baseline: CompactBaseline): string[] {
  const rows = Object.entries(baseline.packages)
    .sort()
    .map(([p, v]) => {
      const cov = v.runs.find(r => r.coverage)?.coverage
      return `| ${p} | ${Object.keys(v.tests).length} | ${v.wall_ms_median} | ${cov?.lines ?? NOT_MEASURED} | ${cov?.branches ?? NOT_MEASURED} | ${NOT_MEASURED} |`
    })
  return [
    '## Baseline (F0)',
    '',
    `Runner: ${baseline.tool['runner']}. Mutation: ${baseline.tool['mutation']} (no supported tool installed). Per-test coverage: ${baseline.tool['per_test_coverage']}.`,
    '',
    '| package | tests | wall ms (median of runs) | line cov % | branch cov % | mutation score |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...rows,
    '',
  ]
}

function costSection(baseline: CompactBaseline, cfg: Config): string[] {
  const c = repeatCost(baseline, cfg.repeatedGates)
  return [
    '## Repeated gate runs vs duplicate cases',
    '',
    `One full suite run: ${c.suite_ms} ms (sum of per-package median wall time, 3 baseline runs). Stages that each re-run it on the same head: ${cfg.repeatedGates.join(', ')} → ${c.stages} runs, ${c.repeated_ms} ms (derived: runs × measured median; per-stage wall time is not measured).`,
    '',
    `This cost is **repeat execution**, not duplicate test cases: duplicates are counted only by U3 (unique kills = 0 and unique coverage = 0), which is ${NOT_MEASURED} here. Removing a test case lowers each repeat run; it does not remove a repeated stage.`,
    '',
    'Reuse of a stage result is allowed only under the same evidence identity and custody: `cycle-state.mjs test-identity` (command + cwd + env keys + toolchain + head tree) must match, and the run must come from the verified PR head.',
    '',
  ]
}

function cleanupSection(rep: Report, cfg: Config | undefined): string[] {
  const q = cfg?.quarantine ?? []
  const none =
    ' — removal needs a confirmed signal; the removable classes (U1, U3, U5, U7, U8) are not measured and U2 candidates were rewritten'
  return [
    '## Cleanup applied',
    '',
    `- Removed: ${rep.removed_ids.length}${rep.removed_ids.length ? ` (${rep.removed_ids.join('; ')})` : none}.`,
    `- Rewritten (U2, explicit assertion added, same id): ${rep.rewritten_ids.length}${rep.rewritten_ids.map(i => `\n  - \`${i}\``).join('')}`,
    `- Quarantined (U6): ${q.length}${q.map(x => `\n  - \`${x.id}\` — ${x.evidence}; tracking issue: ${x.issue ?? 'pending (not created by the implementer)'}`).join('')}`,
    '- Permitted exceptions used: none (no U8 removal, so no mutation-score exception; no U5/U8 branch-coverage reduction).',
    `- Unmeasured: mutation score per module and U1, U3, U5, U7 (unique kills), U8 — ${NOT_MEASURED}: no supported tool installed, nothing removed on those classes.`,
    '',
  ]
}

const esc = (s: string): string => s.replace(/\|/g, '\\|')

const flaggedSection = (rep: Report): string[] => [
  '## Flagged tests',
  '',
  '| test | classes | signal | protected | action |',
  '| --- | --- | --- | --- | --- |',
  ...rep.records
    .filter(r => r.classes.length)
    .map(
      r =>
        `| \`${esc(r.test_id)}\` | ${r.classes.join(', ')} | ${esc(Object.values(r.signals).join('; '))} | ${r.protected} | ${r.action} |`,
    ),
  '',
  `Removed: ${rep.removed_ids.length}. Added by this story: ${rep.added_ids.length}.`,
  '',
]

export function renderMarkdown(
  rep: Report,
  baseline: CompactBaseline | undefined,
  cfg?: Config,
): string {
  return [
    '# Test audit report',
    '',
    `Base revision: \`${rep.base_rev}\`. Regenerate: \`pnpm --filter @pair/dev-tools test-audit\`.`,
    '',
    ...reconciliationSection(rep.reconciliation),
    ...classesSection(rep),
    ...(baseline ? baselineSection(baseline) : []),
    ...(baseline && cfg ? costSection(baseline, cfg) : []),
    ...cleanupSection(rep, cfg),
    ...flaggedSection(rep),
  ].join('\n')
}

function planSection(rep: Report, c: string): string[] {
  const rs = rep.records.filter(r => r.classes.includes(c) && !r.protected && r.action !== 'keep')
  const prot = rep.records.filter(r => r.classes.includes(c) && r.protected)
  const head = `## ${c}${PR_OF[c] ? ` — ${PR_OF[c]}` : ''}`
  if (!rs.length && !prot.length) {
    const unsupported = CLASS_ORDER.includes(c) && !PR_OF[c]
    return [
      head,
      '',
      unsupported ? `not measured: no ${c} signal available.` : 'no candidates.',
      '',
    ]
  }
  return [
    head,
    '',
    ...rs.map(r => `- ${r.action} \`${r.test_id}\` — ${r.signals[c]}`),
    ...prot.map(r => `- protected, kept \`${r.test_id}\` — ${r.signals[c]}`),
    '',
  ]
}

export function renderRemovalPlan(rep: Report): string {
  return [
    '# Removal plan',
    '',
    'Commits inside the single PR, safest class first (U6 is quarantined, never removed). Mutation score and branch coverage must not fall: not measured here (no mutation tool) — removals are limited to classes with a deterministic static signal.',
    '',
    ...[...CLASS_ORDER, 'U6'].flatMap(c => planSection(rep, c)),
  ].join('\n')
}

/** A renamed test is the same test: map new ids back to the baseline id so it is neither removed nor added. */
export function applyRenames(records: TestRecord[], renames: Record<string, string>): TestRecord[] {
  const back = new Map(Object.entries(renames).map(([from, to]) => [to, from]))
  return records.map(r => (back.has(r.test_id) ? { ...r, test_id: back.get(r.test_id)! } : r))
}

const git = (cwd: string, ...a: string[]): string =>
  execFileSync('git', a, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 })

/** Static inventory of the tree at `rev` — the audited "before" set. */
export function inventoryAt(root: string, rev: string): TestRecord[] {
  return git(root, 'ls-tree', '-r', '--name-only', rev)
    .split('\n')
    .filter(f => TEST_FILE_RE.test(f))
    .flatMap(f => parseTests(f, git(root, 'show', `${rev}:${f}`)))
}

export function main(root = REPO_ROOT, rebaseline = false): void {
  if (rebaseline) rerunBaseline(root)
  const dir = join(root, 'test-audit')
  const cfg = loadConfig(join(root, 'docs/testing/test-policy.config.json'))
  const bf = join(dir, 'baseline.json')
  const baseline: CompactBaseline | undefined = existsSync(bf)
    ? JSON.parse(readFileSync(bf, 'utf8'))
    : undefined
  const baseRev = baseline?.base_rev ?? git(root, 'merge-base', 'origin/main', 'HEAD').trim()
  const files = git(root, 'ls-files').split('\n').filter(Boolean)
  const rf = join(dir, 'renamed.json')
  const renames: Record<string, string> = existsSync(rf) ? JSON.parse(readFileSync(rf, 'utf8')) : {}
  const current = applyRenames(buildInventory(root, files).tests, renames)
  const mf = join(dir, 'rewritten.json')
  const rewritten: string[] = existsSync(mf) ? JSON.parse(readFileSync(mf, 'utf8')) : []
  const cf = join(dir, 'confirmations.json')
  const confirmations: Confirmations = existsSync(cf) ? JSON.parse(readFileSync(cf, 'utf8')) : {}
  const rep = buildReport({
    baseRev,
    before: inventoryAt(root, baseRev),
    current,
    baseline,
    cfg,
    rewrittenIds: rewritten,
    confirmations,
  })
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'report.json'), JSON.stringify(rep) + '\n')
  writeFileSync(join(dir, 'report.md'), renderMarkdown(rep, baseline, cfg))
  writeFileSync(join(dir, 'removal-plan.md'), renderRemovalPlan(rep))
  console.log(
    `audit: ${total(rep.reconciliation.before)} before, ${total(rep.reconciliation.remaining)} remaining → ${dir}`,
  )
}

if (require.main === module) main(REPO_ROOT, process.argv.includes('--baseline'))
