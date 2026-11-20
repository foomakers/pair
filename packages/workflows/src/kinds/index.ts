import type { KindName } from '../grammar'
import { violations } from '../schema'
import { generic } from './generic'
import { implement } from './implement'
import { COMMON_RESULT, type StepKind, type StepStatus } from './kind'
import { review } from './review'

export { COMMON_RESULT, STEP_STATUSES, type StepKind, type StepStatus } from './kind'

/** Every kind of grammar v1, by name. */
export const kindByName: Readonly<Record<KindName, StepKind>> = { implement, review, generic }

/** The names of the fields a kind declares in `inputs` or `outputs`. */
export const fieldsOf = (schema: StepKind['inputs']): readonly string[] =>
  Object.keys(schema.properties ?? {})

/** A step's result: the common fields, then the outputs its kind declares. */
export interface StepResult {
  readonly status: StepStatus
  readonly summary: string
  readonly reason?: string
  readonly detail?: string
  readonly [output: string]: unknown
}

/** The reasons of a failure the host or the validator wrote: the agent returned no result of the kind to hold to its outputs. */
const HOST_REASONS: readonly string[] = ['no-result', 'unsafe-value', 'invalid-result']

/** The outputs of `kind` as `result` must carry them: all required of an `ok` step and, when the kind has a `rule`, of a `failed` one the agent returned. */
const outputsOf = (kind: StepKind, { status, reason }: StepResult): StepKind['outputs'] =>
  status === 'ok' ||
  (status === 'failed' && kind.rule !== undefined && !HOST_REASONS.includes(reason ?? ''))
    ? kind.outputs
    : { ...kind.outputs, required: [] }

/**
 * `value` as the result of a step of `kind`, or — when it breaks the contract — a `failed` result with
 * reason `invalid-result` naming each field and its violation. An `ok` result that breaks the rule of
 * its kind is `invalid-result` too, and keeps its outputs.
 */
export function settle(kind: StepKind, value: unknown): StepResult {
  const common = violations(COMMON_RESULT, value)
  const result = value as StepResult
  const found = common.length > 0 ? common : violations(outputsOf(kind, result), value)
  const invalid = {
    status: 'failed',
    reason: 'invalid-result',
    summary: `the result does not match the ${kind.name} contract`,
  } as const
  if (found.length > 0) {
    const detail = found.map(one => `${one.path.join('.') || 'result'}: ${one.problem}`).join('; ')
    return { ...invalid, detail }
  }
  const broken = result.status === 'ok' ? kind.rule?.broken(result) : undefined
  return broken === undefined ? result : { ...result, ...invalid, detail: broken }
}

const cells = (row: string): string[] =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map(cell => cell.trim())

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
      .filter(row => row[key])
      .map(row => [row[key], (row[command] ?? '').replace(/^`|`$/g, '')]),
  ) as Record<string, string>
}
