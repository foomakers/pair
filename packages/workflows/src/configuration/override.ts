import { checkConfiguration, type ParsedConfiguration } from './parse'

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Objects merge key by key; anything else in the override replaces. */
function merge(base: unknown, over: unknown): unknown {
  if (!isObject(base) || !isObject(over)) return over
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(over))
    out[key] = key in base ? merge(base[key], value) : value
  return out
}

export type Overridden =
  | { readonly parsed: ParsedConfiguration; readonly override: Record<string, unknown> }
  | { readonly problem: string }

function assignmentOnly(override: Record<string, unknown>): boolean {
  const entries = Object.entries(override)
  return (
    entries.length > 0 &&
    entries.every(([key, value]) => {
      if (key === 'assign') return true
      if (key !== 'steps' || !isObject(value)) return false
      const steps = Object.values(value)
      return (
        steps.length > 0 &&
        steps.every(
          step => isObject(step) && Object.hasOwn(step, 'assign') && Object.keys(step).length === 1,
        )
      )
    })
  )
}

/**
 * Deep-merges `--config-override` over the selected configuration and checks the result like a file.
 * Without a base it must be a whole configuration, or assignment-only with the run's engine.
 */
export function applyOverride(
  base: unknown,
  overrideText: string,
  file: string,
  engine?: string,
): Overridden {
  let override: unknown
  try {
    override = JSON.parse(overrideText)
  } catch (error) {
    return { problem: `--config-override is not JSON: ${(error as Error).message}` }
  }
  if (!isObject(override)) return { problem: '--config-override must be a JSON object' }
  const assignmentOverride = base == null && engine !== undefined && assignmentOnly(override)
  const seed = base ?? {
    version: 1,
    name: 'override',
    ...(assignmentOverride && { defaults: { engine } }),
  }
  const parsed = checkConfiguration(merge(seed, override), file)
  return {
    parsed:
      assignmentOverride && parsed.configuration !== undefined
        ? { ...parsed, configuration: { ...parsed.configuration, 'assignment-only': true } }
        : parsed,
    override,
  }
}
