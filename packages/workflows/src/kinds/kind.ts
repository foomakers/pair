import type { JsonSchema } from '../schema'
import type { KindName } from '../grammar'

/** What a kind of step receives, accepts and must return. The kind reference page is generated from these objects. */
export interface StepKind {
  readonly name: KindName
  /** The pair skill a step of this kind runs when it has no `uses`. */
  readonly defaultUses?: string
  /** What the step receives: launch arguments, or outputs of earlier steps with the same name. */
  readonly inputs: JsonSchema
  /** What the step must return when it is `ok`, besides the common fields. */
  readonly outputs: JsonSchema
  /** The options the step accepts under `with`. */
  readonly with: JsonSchema
  /** The documented cases in which the step returns `needs-human`. */
  readonly escalations: readonly string[]
}

export const STEP_STATUSES = ['ok', 'failed', 'needs-human'] as const
export type StepStatus = (typeof STEP_STATUSES)[number]

/** The result every step returns, whatever its kind. */
export const COMMON_RESULT: JsonSchema = {
  type: 'object',
  required: ['status', 'summary'],
  properties: {
    status: { enum: STEP_STATUSES },
    summary: { type: 'string', description: 'One line: what the step did.' },
    reason: { type: 'string', description: 'Why, when the status is not `ok`.' },
  },
}
