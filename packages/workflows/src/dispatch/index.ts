import type { StepLaunch } from '../engine'
import { agentResultSchema, settle, type StepKind, type StepResult } from '../kinds'
import { textsOf, type JsonSchema } from '../schema'

/** How an engine is told to run a skill; the host passes its engine's own style, the package holds no engine table. */
export type InvocationStyle = 'slash' | 'instruction'

export interface MessageOptions {
  readonly style: InvocationStyle
  /** The host's prompt-safety check; every value spliced into the message passes it. */
  readonly isSafeText: (value: string) => boolean
}

/** A schema, in the words the agent reads and the kind reference prints. */
export function describeType(schema: JsonSchema): string {
  if (schema.enum !== undefined) return schema.enum.map(one => JSON.stringify(one)).join(' | ')
  if (schema.type === 'array') return `array of ${describeType(schema.items ?? {})}`
  if (schema.type === 'object') {
    const fields = Object.entries(schema.properties ?? {})
    return fields.length === 0
      ? 'object'
      : `{ ${fields.map(([name, field]) => `${name}: ${describeType(field)}`).join(', ')} }`
  }
  const pattern = schema.pattern === undefined ? '' : ` matching ${schema.pattern}`
  return `${schema.type ?? 'any value'}${pattern}`
}

const fieldLines = (schema: JsonSchema, optional: (name: string) => boolean): string[] =>
  Object.entries(schema.properties ?? {}).map(
    ([name, field]) => `- ${name}: ${describeType(field)}${optional(name) ? ' (optional)' : ''}`,
  )

/** The fixed block that asks for the result, generated from the kind contract. */
export function resultBlock(kind: StepKind): string {
  const schema = agentResultSchema(kind)
  const common = fieldLines(schema, name => !schema.required?.includes(name))
  const outputs = fieldLines(kind.outputs, () => false)
  return [
    'End your turn with one JSON object in a fenced `json` block with these fields:',
    ...common,
    ...outputs,
    ...(outputs.length > 0
      ? [
          `Required when status is "ok"${kind.rule === undefined ? '' : ' or "failed"'}: ${Object.keys(kind.outputs.properties ?? {}).join(', ')}.`,
        ]
      : []),
    ...(kind.rule === undefined ? [] : [kind.rule.text]),
    ...Object.entries(kind.returns).map(([status, when]) => `- "${status}" — ${when}`),
  ].join('\n')
}

const render = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value)

function section(title: string, values: Readonly<Record<string, unknown>>): string[] {
  const lines = Object.entries(values).map(([name, value]) => `- ${name}: ${render(value)}`)
  return lines.length === 0 ? [] : ['', `${title}:`, ...lines]
}

/**
 * The one message a step is launched with: the skill invocation in the engine's style, the step's
 * inputs and options, then the result block of its kind. Throws `unsafe-value` when a value to
 * splice fails the safety check.
 */
export function buildMessage(step: StepLaunch, kind: StepKind, options: MessageOptions): string {
  const unsafe = textsOf([step.uses, step.inputs, step.with])
    .map(([, text]) => text)
    .find(text => !options.isSafeText(text))
  if (unsafe !== undefined)
    throw new Error(`unsafe-value: ${JSON.stringify(unsafe)} cannot be handed to an agent`)
  return [
    options.style === 'slash' ? `/${step.uses}` : `Run the ${step.uses} skill.`,
    ...section('Inputs', step.inputs),
    ...section('Options', step.with),
    '',
    resultBlock(kind),
    '',
    'Execution mode: unattended.',
    ...(kind.handoff === undefined ? [] : [`Handoff: ${kind.handoff}.`]),
  ].join('\n')
}

const FENCED_JSON = /```json[ \t]*\r?\n([\s\S]*?)```/g

const invalid = (kind: StepKind, detail: string): StepResult => ({
  status: 'failed',
  reason: 'invalid-result',
  summary: `the final message carries no ${kind.name} result`,
  detail,
})

/**
 * The step's result, from the agent's final message: its last fenced `json` block, validated
 * against the kind's declared statuses and outputs. Missing or invalid: `failed`, `invalid-result`.
 */
export function readResult(finalMessage: string, kind: StepKind): StepResult {
  const block = [...finalMessage.matchAll(FENCED_JSON)].pop()?.[1]
  if (block === undefined) return invalid(kind, 'no fenced json block in the final message')
  let value: unknown
  try {
    value = JSON.parse(block)
  } catch (error) {
    return invalid(kind, `the last fenced json block is not JSON: ${(error as Error).message}`)
  }
  return settle(kind, value, 'agent')
}
