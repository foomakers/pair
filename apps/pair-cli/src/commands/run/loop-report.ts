import { adoptionSelection } from './autonomy-policy'
import { describeMergePosture, type AutomationPolicy } from './automation-policy'
import type { AutonomyResolution } from './cycle-scripts'
import { FAIL_SAFE_MAX_ITERATIONS } from './automation-policy'
import { DEFAULT_WATCH_INTERVAL, type RunCommandConfig } from './parser'
import {
  DEFAULT_RETRY_BUDGET,
  type IterationRecord,
  type LoopResult,
  type StopReason,
} from './watch-loop'

/**
 * What the `--parallel` fan-out resolved to run, and the text it prints about it (US-522 AC11, AC12).
 * Pure: no I/O. Every effective value carries the source it came from — the autonomy model's own
 * precedence line (argument > adoption > KB default), restated, never re-derived.
 */

export interface Sourced {
  readonly value: string
  readonly source: string
}

export interface FanOutSelection {
  readonly root?: Sourced
  readonly filter?: Sourced
  readonly assignee?: Sourced
  readonly status?: Sourced
}

export interface LoopValues {
  /** `--watch` or `--max-iterations`: the fan-out re-selects. Off ⇒ today's single batch. */
  readonly loopMode: boolean
  readonly watch: Sourced
  readonly interval: Sourced & { readonly ms: number }
  /** The effective iteration cap, and what bound it. */
  readonly cap: { readonly value: number; readonly bound: string }
  /** The effective stop predicate and where it came from; absent ⇒ none declared. */
  readonly predicate?: Sourced | undefined
}

const flagOr = (
  flag: string | undefined,
  flagName: string,
  adopted: string | undefined,
  other?: Sourced,
) =>
  flag !== undefined
    ? { value: flag, source: flagName }
    : adopted !== undefined
      ? { value: adopted, source: '## Autonomy' }
      : other

/** Root/filter/assignee/status: argument > `## Autonomy` > (filter only) `## Eligibility`. */
export function resolveSelection(
  config: RunCommandConfig,
  policy: AutomationPolicy,
  autonomy: AutonomyResolution | undefined,
): FanOutSelection {
  const { scope } = config
  const pick = (key: 'root' | 'filter' | 'assignee' | 'status', fallback?: Sourced) =>
    flagOr(scope[key], `--${key}`, adoptionSelection(autonomy, key), fallback)
  const eligibility =
    policy.eligibility !== undefined
      ? { value: policy.eligibility, source: '## Eligibility' }
      : undefined
  const root = pick('root')
  const filter = pick('filter', eligibility)
  const assignee = pick('assignee')
  const status = pick('status')
  return {
    ...(root && { root }),
    ...(filter && { filter }),
    ...(assignee && { assignee }),
    ...(status && { status }),
  }
}

/** The effective iteration cap and what bound it (narrow-only: a flag never widens the policy cap). */
function resolveCap(config: RunCommandConfig, policy: AutomationPolicy): LoopValues['cap'] {
  const policyCap = policy.maxIterations
  if (config.watch !== true && config.maxIterations === undefined) {
    return { value: 1, bound: 'one iteration (no --watch, no --max-iterations)' }
  }
  if (config.maxIterations !== undefined) {
    return {
      value: Math.min(config.maxIterations, policyCap),
      bound: `min(--max-iterations ${config.maxIterations}, ## Stop Predicate max-iterations ${policyCap})`,
    }
  }
  const failSafe = policy.stopPredicate === undefined && policyCap === FAIL_SAFE_MAX_ITERATIONS
  return {
    value: policyCap,
    bound: failSafe
      ? `fail-safe ${policyCap} — no \`## Stop Predicate\` declared (--max-iterations can only narrow it)`
      : `## Stop Predicate max-iterations ${policyCap}`,
  }
}

export function resolveLoopValues(config: RunCommandConfig, policy: AutomationPolicy): LoopValues {
  const loopMode = config.watch === true || config.maxIterations !== undefined
  const watch: Sourced =
    config.watch !== undefined
      ? { value: config.watch ? 'on' : 'off', source: config.watch ? '--watch' : '--no-watch' }
      : { value: 'off', source: 'KB default' }
  const interval = config.interval ?? DEFAULT_WATCH_INTERVAL
  return {
    loopMode,
    watch,
    interval: {
      value: interval.text,
      source: config.interval !== undefined ? '--interval' : 'KB default',
      ms: interval.seconds * 1000,
    },
    cap: resolveCap(config, policy),
    predicate:
      config.predicate !== undefined
        ? { value: config.predicate, source: '--predicate' }
        : policy.stopPredicate !== undefined
          ? { value: policy.stopPredicate, source: '## Stop Predicate' }
          : undefined,
  }
}

const show = (s: Sourced | undefined): string =>
  s === undefined ? '(none)' : `${s.value} (${s.source})`

/** The `pair-next` scope line of the header (byte-identical to US-491 for `--root` + `## Eligibility`). */
export function describeScope(selection: FanOutSelection): string {
  const part = (flag: string, s: Sourced | undefined): string =>
    s === undefined
      ? ''
      : ` ${flag} ${s.value}${s.source === '--' + flag.slice(2) ? '' : ` (${s.source})`}`
  // `--root` keeps its US-491 spelling: the flag source is never annotated.
  const root =
    selection.root === undefined
      ? ''
      : ` --root ${selection.root.value}` +
        (selection.root.source === '--root' ? '' : ` (${selection.root.source})`)
  return `pair-next${root}${part('--filter', selection.filter)}${part('--assignee', selection.assignee)}${part('--status', selection.status)}`
}

/** AC12: every effective loop value and where it came from, printed before any selection. */
export function describeLoopValues(
  values: LoopValues,
  selection: FanOutSelection,
  requested: number,
  maxParallelism: number,
): string[] {
  return [
    'Loop (watch loop — each iteration re-selects; precedence: argument > adoption > KB default):',
    `  watch: ${show(values.watch)}`,
    `  interval: ${show(values.interval)}${values.watch.value === 'on' ? '' : ' — used only under --watch'}`,
    `  max-iterations: ${values.cap.value} — ${values.cap.bound}${values.watch.value === 'on' ? '; idle polls count' : ''}`,
    `  parallel: --parallel ${requested} · ## Max Parallelism ${maxParallelism} (the ceiling)`,
    `  root: ${show(selection.root)}`,
    `  filter: ${show(selection.filter)}`,
    `  assignee: ${show(selection.assignee)}`,
    `  status: ${show(selection.status)}`,
    `  stop predicate: ${values.predicate === undefined ? '(none)' : show(values.predicate)} — checked at each iteration boundary, before work: once satisfied the goal is reached and no new work starts; never satisfied by an empty or incomplete snapshot`,
    `  retry budget: ${DEFAULT_RETRY_BUDGET} per failed card (KB default) — then excluded: retry budget exhausted`,
    'Excluded: escalated (until cleared), locked and terminal cards (merged, parked, target reached); a failed card is retried within its budget.',
  ]
}

const humanInterval = (ms: number): string =>
  ms % 60_000 === 0 ? `${ms / 60_000}m` : `${ms / 1000}s`

/** What a satisfied stop predicate was judged on, so the stop is auditable. */
function stopEvidence(record: IterationRecord): string {
  const judged = record.next.kind === 'stop' && record.next.reason === 'stop predicate satisfied'
  return judged && record.predicateEvidence !== undefined ? ` (${record.predicateEvidence})` : ''
}

/** AC11: the ONE line printed per iteration. */
export function renderIterationLine(record: IterationRecord, intervalText: string): string {
  const skipped =
    record.skipped.length === 0
      ? 'none'
      : record.skipped.map(s => `#${s.id} ${s.detail}`).join(', ')
  const retried =
    (record.retried ?? []).length === 0
      ? ''
      : ` · ${record.retried!.map(r => `retried #${r.id} (retry ${r.attempt} of ${r.budget})`).join(', ')}`
  const reclaimed = (record.reclaimed ?? [])
    .map(r => ` · reclaimed stale lock #${r.id} (pid ${r.pid} dead)`)
    .join('')
  const ran =
    record.outcomes.length === 0
      ? 'none'
      : record.outcomes.map(o => `#${o.id} ${o.outcome}`).join(', ')
  const next =
    record.next.kind === 'stop'
      ? `stopping: ${record.next.reason}${stopEvidence(record)}`
      : record.next.kind === 'waiting'
        ? `waiting ${intervalText || humanInterval(record.next.ms)}`
        : 'next iteration'
  return `  Iteration ${record.iteration}/${record.cap}: selected ${record.selected} · skipped ${skipped}${retried}${reclaimed} · ran ${ran}${describePrepare(record.outcomes)} · ${next}`
}

/** US-523: ` · prepare: N prepared, N escalated, N needs-human` — only when a card's prepare phase reported. */
function describePrepare(outcomes: IterationRecord['outcomes']): string {
  const count = (result: string) => outcomes.filter(o => o.prepare === result).length
  const parts = (['prepared', 'escalated', 'needs-human', 'failed'] as const)
    .map(result => [result, count(result)] as const)
    .filter(([, n]) => n > 0)
    .map(([result, n]) => `${n} ${result}`)
  return parts.length === 0 ? '' : ` · prepare: ${parts.join(', ')}`
}

const oneLine = (value: string): string => value.replace(/[\r\n]+/g, ' ').trim()

/** The audit trail's own `<at> key=value …` shape (`renderBatchAuditLine`). */
export function renderLoopAuditLine(
  at: string,
  fields: ReadonlyArray<readonly [string, string]>,
): string {
  return `${at} ${fields.map(([k, v]) => `${k}=${oneLine(v)}`).join(' ')}`
}

/** What each child `run --card` is handed: only the autonomy arguments the operator passed, with the resolved source. */
export function forwardedAutonomy(
  config: RunCommandConfig,
  autonomy: AutonomyResolution | undefined,
): Array<[string, string]> {
  return (['until', 'prepare', 'merge'] as const).flatMap(key => {
    const value = config.autonomy?.[key]
    if (value === undefined) return []
    const source = autonomy?.effective?.[key]?.source ?? 'argument'
    return [[key, `${value} (${source})`] as [string, string]]
  })
}

export function loopStartFields(
  values: LoopValues,
  selection: FanOutSelection,
  requested: number,
  effectiveParallelCeiling: number,
): Array<[string, string]> {
  return [
    ['event', 'loop-start'],
    ['root', selection.root?.value ?? '(none)'],
    ['filter', selection.filter?.value ?? '(none)'],
    ['assignee', selection.assignee?.value ?? '(none)'],
    ['status', selection.status?.value ?? '(none)'],
    ['watch', values.watch.value],
    ['interval', values.interval.value],
    ['max-iterations', String(values.cap.value)],
    ['parallel', String(requested)],
    ['max-parallelism', String(effectiveParallelCeiling)],
  ]
}

/** The loop-start audit fields for the autonomy arguments forwarded to each child (empty when none). */
export function forwardedFields(
  forwarded: ReadonlyArray<readonly [string, string]>,
): Array<[string, string]> {
  return forwarded.map(([k, v]) => [`child-${k}`, v])
}

export function iterationFields(record: IterationRecord): Array<[string, string]> {
  return [
    ['event', 'iteration'],
    ['n', `${record.iteration}/${record.cap}`],
    ['selected', String(record.selected)],
    [
      'skipped',
      record.skipped.length === 0
        ? '(none)'
        : record.skipped.map(s => `${s.id}:${s.reason}`).join(','),
    ],
    ...((record.retried ?? []).length > 0
      ? [
          ['retried', record.retried!.map(r => `${r.id}:${r.attempt}/${r.budget}`).join(',')] as [
            string,
            string,
          ],
        ]
      : []),
    ...((record.reclaimed ?? []).length > 0
      ? [
          ['lock-reclaimed', record.reclaimed!.map(r => `${r.id}:pid${r.pid}`).join(',')] as [
            string,
            string,
          ],
        ]
      : []),
    [
      'ran',
      record.outcomes.length === 0
        ? '(none)'
        : record.outcomes.map(o => `${o.id}:${o.outcome}`).join(','),
    ],
    [
      'next',
      record.next.kind === 'stop'
        ? `stop(${record.next.reason})`
        : record.next.kind === 'waiting'
          ? 'wait'
          : 'continue',
    ],
  ]
}

export function loopEndFields(
  reason: StopReason,
  iterations: number,
  exitCode: number,
  detail?: string,
): Array<[string, string]> {
  return [
    ['event', 'loop-end'],
    ['reason', reason],
    ['iterations', String(iterations)],
    ['exit', String(exitCode)],
    ...(detail !== undefined ? ([['detail', detail]] as Array<[string, string]>) : []),
  ]
}

export function describeLoopEnd(
  result: Pick<LoopResult, 'reason' | 'iterations' | 'selectionError'>,
): string {
  return result.reason === 'selection failed'
    ? `  Loop stopped at iteration ${result.iterations}: selection failed — ${result.selectionError ?? 'unknown'}`
    : `  Loop stopped after ${result.iterations} iteration(s): ${result.reason}`
}

/** The forwarded merge gate's real effect, or the policy's own posture when nothing is forwarded. */
export function describeMergeLine(
  policy: AutomationPolicy,
  forwarded: ReadonlyArray<readonly [string, string]>,
  /** The EFFECTIVE `until` (argument > adoption > default): only `merged` enters the merge stage at all. */
  effectiveUntil?: string,
) {
  const merge = forwarded.find(([k]) => k === 'merge')?.[1]
  if (merge === undefined) return describeMergePosture(policy)
  const until = forwarded.find(([k]) => k === 'until')?.[1]
  const target = effectiveUntil ?? until?.split(' ')[0]
  if (target !== undefined && target !== 'merged') {
    return (
      `Merge: the gate (${merge.replace(/ \(([^()]*)\)$/, ', $1')}) is not evaluated — until is ${target}, no card enters the merge stage` +
      ` (pass --until merged for it to apply)`
    )
  }
  return (
    `Merge: each card merges per its gate (${merge.replace(/ \(([^()]*)\)$/, ', $1')})` +
    (until !== undefined ? `; delivery goes ${until}` : '') +
    ` — #490's signal checks stay mandatory`
  )
}
