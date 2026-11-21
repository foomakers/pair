import type { Step } from '../grammar'
import type { Configuration, Entry } from './schema'

export type Field = 'engine' | 'model' | 'effort'
/** `alias`: the configuration's `aliases`; `workflow`: the workflow's default for the alias. */
export type Source = 'step' | 'alias' | 'workflow' | 'defaults'

/** What a step launches with, and where each value came from (design §2). */
export interface ResolvedSettings {
  readonly engine: string
  readonly model?: string
  readonly effort?: string
  readonly sources: Readonly<Partial<Record<Field, Source>>>
}

/** Per field: `steps.<id>`, then `aliases.<alias>`, then the workflow's default for the alias, then `defaults`. */
export function settingsFor(
  configuration: Configuration,
  step: Pick<Step, 'id' | 'alias'>,
  declared?: Readonly<Record<string, Entry>>,
): ResolvedSettings {
  const alias = step.alias ?? ''
  const layers: readonly (readonly [Source, Entry | undefined])[] = [
    ['step', configuration.steps?.[step.id]],
    ['alias', configuration.aliases?.[alias]],
    ['workflow', declared?.[alias]],
    ['defaults', configuration.defaults],
  ]
  const values: Partial<Record<Field, string>> = {}
  const sources: Partial<Record<Field, Source>> = {}
  for (const field of ['engine', 'model', 'effort'] as const) {
    for (const [source, entry] of layers) {
      const value = entry?.[field]
      if (value === undefined) continue
      values[field] = value
      sources[field] = source
      break
    }
  }
  // `defaults.engine` is required: the engine always resolves.
  return { ...values, engine: values.engine ?? configuration.defaults.engine, sources }
}

/** One printed line per step: each value with its source. */
export function describeSettings(stepId: string, settings: ResolvedSettings): string {
  const show = (field: Field): string => {
    const value = settings[field]
    return value === undefined
      ? ''
      : ` ${field}=${value} (${settings.sources[field] ?? 'defaults'})`
  }
  return `${stepId}:${show('engine')}${show('model')}${show('effort')}`
}
