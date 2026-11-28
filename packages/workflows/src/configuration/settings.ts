import type { Step } from '../grammar'
import type { Configuration, Entry } from './schema'

export type Field = 'engine' | 'model' | 'effort' | 'skill'
/** `alias`: the configuration's `aliases`; `workflow`: the workflow's default for the alias. */
export type Source = 'step' | 'alias' | 'workflow' | 'defaults'

/** What a step launches with, and where each value came from (design §2). */
export interface ResolvedSettings {
  readonly engine: string
  readonly model?: string
  readonly effort?: string
  readonly skill?: string
  readonly sources: Readonly<Partial<Record<Field, Source>>>
}

function settingsLayers(
  configuration: Configuration,
  step: Pick<Step, 'id' | 'alias'>,
  declared?: Readonly<Record<string, Entry>>,
): readonly (readonly [Source, Entry | undefined])[] {
  const alias = step.alias ?? ''
  return [
    ['step', configuration.steps?.[step.id]],
    ['alias', configuration.aliases?.[alias]],
    ['workflow', configuration['assignment-only'] ? undefined : declared?.[alias]],
    ['defaults', configuration.defaults],
  ]
}

/** Engine, model and effort inherit through aliases and defaults. Skills can be overridden by step id only. */
export function settingsFor(
  configuration: Configuration,
  step: Pick<Step, 'id' | 'alias'>,
  declared?: Readonly<Record<string, Entry>>,
): ResolvedSettings {
  const layers = settingsLayers(configuration, step, declared)
  const values: Partial<Record<Field, string>> & { engine: string } = {
    engine: configuration.defaults.engine,
  }
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
  const skill = configuration.steps?.[step.id]?.skill
  if (skill !== undefined) {
    values.skill = skill
    sources.skill = 'step'
  }
  return { ...values, sources }
}

/** One printed line per step: each value with its source. */
export function describeSettings(stepId: string, settings: ResolvedSettings): string {
  const show = (field: Field): string => {
    const value = settings[field]
    return value === undefined
      ? ''
      : ` ${field}=${value} (${settings.sources[field] ?? 'defaults'})`
  }
  return `${stepId}:${show('engine')}${show('model')}${show('effort')}${show('skill')}`
}
