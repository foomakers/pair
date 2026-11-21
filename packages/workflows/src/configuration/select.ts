/** `pair.config.json` → `workflows`: per workflow, a configuration name or a map engine → name. */
export type WorkflowsConfig = Readonly<
  Record<string, { readonly configuration?: string | Readonly<Record<string, string>> }>
>

export interface Selection {
  /** A configuration name, or a file path when `--config` gave one. */
  readonly name: string
  /** Where the choice came from, for the printed line. */
  readonly via: string
}

export interface SelectionInput {
  /** `--config`. */
  readonly flag?: string | undefined
  /** `--engine`, when passed. */
  readonly engineFlag?: string | undefined
  /** The engine the run resolved to: picks the entry of a map when no flag was passed. */
  readonly engine: string
  readonly workflows?: WorkflowsConfig | undefined
  readonly workflow: string
}

/** Order (design §3): `--config`, `workflows.<workflow>`, `workflows.default`, none. Throws on a map without the engine. */
export function selectConfiguration(input: SelectionInput): Selection | undefined {
  if (input.flag !== undefined) return { name: input.flag, via: '--config' }
  const engine = input.engineFlag ?? input.engine
  for (const key of [input.workflow, 'default']) {
    const chosen = input.workflows?.[key]?.configuration
    if (chosen === undefined) continue
    const via = `pair.config.json workflows.${key}`
    if (typeof chosen === 'string') return { name: chosen, via }
    const name = chosen[engine]
    if (name === undefined)
      throw new Error(
        `configuration-not-found: ${via}.configuration has no entry for engine '${engine}' ` +
          `(it has ${Object.keys(chosen).join(', ')}) — add one or pass --config`,
      )
    return { name, via }
  }
  return undefined
}

/** A `--config` value is a path when it says so, a name otherwise. */
export const isConfigurationPath = (value: string): boolean => /[\\/]|\.ya?ml$/.test(value)

/** The first candidate that exists: the project's file is listed before the knowledge base's, so it replaces it entirely (design §1). */
export const firstExisting = (
  candidates: readonly string[],
  exists: (path: string) => boolean,
): string | undefined => candidates.find(exists)
