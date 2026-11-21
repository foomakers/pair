import type { KindName } from '../grammar'
import type { Configuration, Entry } from './schema'

export type Field = 'engine' | 'model' | 'effort'
export type Source = 'step' | 'kind' | 'defaults'

/** What a step launches with, and where each value came from (design §2). */
export interface ResolvedSettings {
  readonly engine: string
  readonly model?: string
  readonly effort?: string
  readonly sources: Readonly<Partial<Record<Field, Source>>>
}

/** Per field: `steps.<id>`, then `kinds.<kind>`, then `defaults`. */
export function settingsFor(
  configuration: Configuration,
  step: { readonly id: string; readonly kind: KindName },
): ResolvedSettings {
  const layers: readonly (readonly [Source, Entry | undefined])[] = [
    ['step', configuration.steps?.[step.id]],
    ['kind', configuration.kinds?.[step.kind]],
    ['defaults', configuration.defaults],
  ]
  const pick = (field: Field): { value: string; source: Source } | undefined => {
    for (const [source, entry] of layers) {
      const value = entry?.[field]
      if (value !== undefined) return { value, source }
    }
    return undefined
  }
  const [engine, model, effort] = [pick('engine'), pick('model'), pick('effort')]
  return {
    engine: engine?.value ?? configuration.defaults.engine,
    ...(model && { model: model.value }),
    ...(effort && { effort: effort.value }),
    sources: {
      ...(engine && { engine: engine.source }),
      ...(model && { model: model.source }),
      ...(effort && { effort: effort.source }),
    },
  }
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
