import {
  assignmentSchema,
  entrySchema as entry,
  STEP_ID,
  selectSchema,
  type Assignment,
  type Entry,
} from '../grammar'
import type { CardSelection } from '../select'
import type { JsonSchema } from '../schema'

export type { Entry } from '../grammar'

/** A configuration file (design §1): defaults, then the aliases the workflow declares, then exceptions by step id. */
export interface Configuration {
  readonly version: 1
  readonly name: string
  readonly defaults: Entry & { readonly engine: string }
  readonly aliases?: Readonly<Record<string, Entry>>
  readonly assign?: Assignment
  /** Internal to a frozen assignment-only override that had no selected configuration. */
  readonly 'assignment-only'?: true
  readonly steps?: Readonly<
    Record<string, Entry & { readonly max?: number; readonly assign?: Assignment }>
  >
  /** Switches the run's telemetry on or off; a flag overrides it. */
  readonly telemetry?: boolean
  readonly select?: CardSelection
  readonly parallel?: number
}

export const configurationSchemaV1: JsonSchema = {
  type: 'object',
  required: ['version', 'name', 'defaults'],
  additionalProperties: false,
  properties: {
    version: { const: 1, description: 'The grammar version.' },
    name: { type: 'string', description: 'Equals the file name without its extension.' },
    defaults: { ...entry, required: ['engine'] },
    aliases: { type: 'object', propertyNames: { pattern: STEP_ID }, additionalProperties: entry },
    assign: assignmentSchema,
    steps: {
      type: 'object',
      additionalProperties: {
        ...entry,
        properties: {
          ...entry.properties,
          max: { type: 'integer', minimum: 1 },
          assign: assignmentSchema,
        },
      },
    },
    telemetry: { type: 'boolean' },
    select: selectSchema,
    parallel: { type: 'integer', minimum: 1 },
  },
}

export const frozenConfigurationSchema: JsonSchema = {
  ...configurationSchemaV1,
  properties: { ...configurationSchemaV1.properties, 'assignment-only': { const: true } },
}
