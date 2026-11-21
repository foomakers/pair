import { KIND_NAMES, type KindName } from '../grammar'
import type { JsonSchema } from '../schema'

/** The three settings of a step; each is resolved on its own. */
export interface Entry {
  readonly engine?: string
  readonly model?: string
  readonly effort?: string
}

/** A configuration file (design §1): defaults, then exceptions by kind, then by step id. */
export interface Configuration {
  readonly version: 1
  readonly name: string
  readonly defaults: Entry & { readonly engine: string }
  readonly kinds?: Readonly<Partial<Record<KindName, Entry>>>
  readonly steps?: Readonly<Record<string, Entry>>
  /** Switches the run's telemetry on or off; a flag overrides it. */
  readonly telemetry?: boolean
}

const text = { type: 'string' } as const
const entry: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: { engine: text, model: text, effort: text },
}

export const configurationSchemaV1: JsonSchema = {
  type: 'object',
  required: ['version', 'name', 'defaults'],
  additionalProperties: false,
  properties: {
    version: { const: 1, description: 'The grammar version.' },
    name: { type: 'string', description: 'Equals the file name without its extension.' },
    defaults: { ...entry, required: ['engine'] },
    kinds: {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(KIND_NAMES.map(kind => [kind, entry])),
    },
    steps: { type: 'object', additionalProperties: entry },
    telemetry: { type: 'boolean' },
  },
}
