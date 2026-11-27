import type { JsonSchema } from '../schema'
import type { ContextMode, KindName } from '../grammar'

/** What a kind of step receives, accepts and must return. The kind reference page is generated from these objects. */
export interface StepKind {
  readonly name: KindName
  /** The pair skill a step of this kind runs when it has no `skill`. */
  readonly defaultSkill?: string
  /** Whether a step runs in the session conversation unless its own `interactive` overrides it. */
  readonly defaultInteractive: boolean
  /** How the step receives context unless its own `context` overrides it. */
  readonly defaultContext: ContextMode
  /** The boundary the invoked skill returns at, when its direct invocation also handles later phases. */
  readonly handoff?: string
  /** Run by the host, deterministically: no agent, no skill, no token. */
  readonly host?: true
  /** What the step receives: launch arguments, or outputs of earlier steps with the same name. */
  readonly inputs: JsonSchema
  /** What the step must return when it is `ok` — and, for a kind with a `rule`, when it is `failed` — besides the common fields. */
  readonly outputs: JsonSchema
  /** The options the step accepts under `with`. */
  readonly with: JsonSchema
  /** The cases in which the kind returns each declared non-ok status. */
  readonly returns: Readonly<Partial<Record<Exclude<StepStatus, 'ok'>, string>>>
  /**
   * The rule the kind sets on its own result, beyond the schema. It is judged from the outputs, so a
   * `failed` result the agent returns carries them too.
   */
  readonly rule?: ResultRule
}

export interface ResultRule {
  /** The rule, as the launch message and the kind reference state it. */
  readonly text: string
  /** How an `ok` result that matches the schema breaks the rule; `undefined` when it does not. */
  readonly broken: (result: Readonly<Record<string, unknown>>) => string | undefined
}

export const STEP_STATUSES = ['ok', 'failed', 'blocked', 'needs-decision'] as const
export type StepStatus = (typeof STEP_STATUSES)[number]
export const MAX_HANDOFF_WORDS = 800

/** The result every step returns, whatever its kind. */
export const COMMON_RESULT: JsonSchema = {
  type: 'object',
  required: ['status', 'summary'],
  properties: {
    status: { enum: STEP_STATUSES },
    summary: { type: 'string', description: 'One line: what the step did.' },
    reason: { type: 'string', description: 'Why, when the status is not `ok`.' },
    handoff: {
      type: 'string',
      description: `Markdown for the next step, saved as \`handoff.md\` and truncated after ${MAX_HANDOFF_WORDS} words.`,
    },
  },
}

/** The common fields narrowed to the statuses the agent may return for this kind. */
export function agentResultSchema(kind: StepKind): JsonSchema {
  return {
    ...COMMON_RESULT,
    properties: {
      ...COMMON_RESULT.properties,
      status: {
        enum: STEP_STATUSES.filter(
          status => status === 'ok' || Object.hasOwn(kind.returns, status),
        ),
      },
    },
  }
}
