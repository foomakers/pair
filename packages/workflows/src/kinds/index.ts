import type { KindName, Step } from '../grammar'
import { violations } from '../schema'
import { approval } from './approval'
import { fix } from './fix'
import { gate } from './gate'
import { generic } from './generic'
import { implement } from './implement'
import { agentResultSchema, COMMON_RESULT, type StepKind, type StepStatus } from './kind'
import { merge } from './merge'
import { refineStory, planTasks } from './refinement'
import { review } from './review'

export {
  agentResultSchema,
  COMMON_RESULT,
  MAX_HANDOFF_WORDS,
  STEP_STATUSES,
  type StepKind,
  type StepStatus,
} from './kind'

/** Every kind of grammar v1, by name. */
export const kindByName: Readonly<Record<KindName, StepKind>> = {
  implement,
  review,
  fix,
  generic,
  gate,
  approval,
  merge,
  'refine-story': refineStory,
  'plan-tasks': planTasks,
}

/** Explicit names are literal. Only a kind default follows the installation's naming convention. */
export function skillForStep(
  step: Pick<Step, 'skill' | 'kind'>,
  installed: (name: string) => string | undefined,
  override?: string,
) {
  const name = step.kind === 'loop' ? undefined : kindByName[step.kind].defaultSkill
  return override ?? step.skill ?? (name === undefined ? undefined : (installed(name) ?? name))
}

/** Whether the workflow needs a session conversation for this step. */
export function interactiveOf({
  kind,
  interactive,
}: Pick<Step, 'interactive'> & { kind?: Step['kind'] }): boolean {
  return (
    kind !== 'loop' &&
    (interactive ?? (kind === undefined ? false : kindByName[kind].defaultInteractive))
  )
}

/** The names of the fields a kind declares in `inputs` or `outputs`. */
export const fieldsOf = (schema: StepKind['inputs']): readonly string[] =>
  Object.keys(schema.properties ?? {})

/** A step's result: the common fields, then the outputs its kind declares. */
export interface StepResult {
  readonly status: StepStatus
  readonly summary: string
  readonly reason?: string
  readonly detail?: string
  readonly handoff?: string
  readonly [output: string]: unknown
}

/** The reasons of a failure the host or the validator wrote: the agent returned no result of the kind to hold to its outputs. */
const HOST_REASONS: readonly string[] = [
  'no-result',
  'unsafe-value',
  'invalid-result',
  'invalid-input',
]

/** The outputs of `kind` as `result` must carry them: all required of an `ok` step and, when the kind has a `rule`, of a `failed` one the agent returned. */
const outputsOf = (kind: StepKind, { status, reason }: StepResult): StepKind['outputs'] =>
  status === 'ok' ||
  (status === 'failed' && kind.rule !== undefined && !HOST_REASONS.includes(reason ?? ''))
    ? kind.outputs
    : { ...kind.outputs, required: [] }

/**
 * `value` as the result of a step of `kind`, or — when it breaks the contract — a `failed` result with
 * reason `invalid-result` naming each field and its violation. An `ok` result that breaks the rule of
 * its kind is `invalid-result` too, and keeps its outputs. The host and engine can record outcomes
 * outside the kind's agent contract, such as host gate failures or invalid agent results.
 */
export function checkResult(
  kind: StepKind,
  value: unknown,
  source: 'agent' | 'engine' = 'engine',
): { valid: boolean; result: StepResult } {
  const common = violations(source === 'agent' ? agentResultSchema(kind) : COMMON_RESULT, value)
  const result = value as StepResult
  const found = common.length > 0 ? common : violations(outputsOf(kind, result), value)
  const invalid = {
    status: 'failed',
    reason: 'invalid-result',
    summary: `the result does not match the ${kind.name} contract`,
  } as const
  if (found.length > 0) {
    const detail = found.map(one => `${one.path.join('.') || 'result'}: ${one.problem}`).join('; ')
    const handoff = common.length === 0 ? result.handoff : undefined
    return {
      valid: false,
      result: { ...invalid, detail, ...(handoff === undefined ? {} : { handoff }) },
    }
  }
  const broken = result.status === 'ok' ? kind.rule?.broken(result) : undefined
  return broken === undefined
    ? { valid: true, result }
    : { valid: false, result: { ...result, ...invalid, detail: broken } }
}

export function settle(
  kind: StepKind,
  value: unknown,
  source: 'agent' | 'engine' = 'engine',
): StepResult {
  return checkResult(kind, value, source).result
}

/**
 * The cells of one table row (GFM): a bare `|` ends a cell, `\|` is a pipe of its cell, any other
 * escape pair is kept as written. A row is one line, so a newline stands for the cell boundary.
 */
const cells = (row: string): string[] =>
  row
    .trim()
    .replace(/\\(.)|\|/g, (pair, escaped) => (escaped === '|' ? '|' : escaped ? pair : '\n'))
    .replace(/^\n|\n$/g, '')
    .split('\n')
    .map(cell => cell.trim())

/** A cell written as inline code, without its backticks. */
const code = (cell = ''): string => cell.replace(/^`|`$/g, '')

/**
 * The Custom Gate Registry of `way-of-working.md`: gate key → command.
 * A registry with no `Key` column, or no registry at all, has no keys.
 */
export function readGateRegistry(text: string): Readonly<Record<string, string>> {
  const lines = text.split('\n')
  const start = lines.findIndex(line => /^#+\s+Custom Gate Registry\s*$/.test(line))
  if (start < 0) return {}
  const rest = lines.slice(start + 1)
  const next = rest.findIndex(line => /^#+\s/.test(line))
  const table = (next < 0 ? rest : rest.slice(0, next)).filter(line => line.trim().startsWith('|'))
  const header = cells(table[0] ?? '')
  const [key, command] = [header.indexOf('Key'), header.indexOf('Command')]
  if (key < 0 || command < 0) return {}
  return Object.fromEntries(
    table
      .slice(2)
      .map(cells)
      .map(row => [code(row[key]), code(row[command])])
      .filter(([name]) => name),
  ) as Record<string, string>
}

/** The keys of each target, in row order. A blank Target belongs to every target; no Target column, no target. */
export function readGateTargets(text: string): Readonly<Record<string, readonly string[]>> {
  const lines = text.split('\n')
  const start = lines.findIndex(line => /^#+\s+Custom Gate Registry\s*$/.test(line))
  if (start < 0) return {}
  const rest = lines.slice(start + 1)
  const next = rest.findIndex(line => /^#+\s/.test(line))
  const table = (next < 0 ? rest : rest.slice(0, next)).filter(line => line.trim().startsWith('|'))
  const header = cells(table[0] ?? '')
  const [key, target] = [header.indexOf('Key'), header.indexOf('Target')]
  if (key < 0 || target < 0) return {}
  const rows = table
    .slice(2)
    .map(cells)
    .map(row => ({
      key: code(row[key]),
      targets: (row[target] ?? '')
        .split(',')
        .map(t => code(t.trim()))
        .filter(Boolean),
    }))
    .filter(row => row.key)
  const names = [...new Set(rows.flatMap(row => row.targets))]
  return Object.fromEntries(
    names.map(name => [
      name,
      rows
        .filter(row => row.targets.length === 0 || row.targets.includes(name))
        .map(row => row.key),
    ]),
  )
}
