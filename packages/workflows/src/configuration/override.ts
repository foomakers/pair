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

/**
 * Deep-merges `--config-override` over the selected configuration and checks the result like a file.
 * Without a base the override must be a whole configuration, named `override`.
 */
export function applyOverride(base: unknown, overrideText: string, file: string): Overridden {
  let override: unknown
  try {
    override = JSON.parse(overrideText)
  } catch (error) {
    return { problem: `--config-override is not JSON: ${(error as Error).message}` }
  }
  if (!isObject(override)) return { problem: '--config-override must be a JSON object' }
  const seed = base ?? { version: 1, name: 'override' }
  return { parsed: checkConfiguration(merge(seed, override), file), override }
}
