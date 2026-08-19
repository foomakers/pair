/**
 * Resolution of kb-validate's optional link patterns (US-188) from the two
 * places they can be declared: the project config
 * (`link_validation.optional_link_patterns`) and the `--optional-link-patterns`
 * CLI flag.
 */

/** The `link_validation` section of `pair.config.json` / `config.json`. */
export interface LinkValidationConfig {
  optional_link_patterns?: string[]
}

/**
 * Union of config-declared and CLI-declared patterns, config first, deduplicated.
 *
 * Union — not override — on purpose (AC-2): the config states what this KB always
 * tolerates, the flag adds what this particular run tolerates; making the flag
 * replace the config would silently re-break every link the project already
 * declared optional.
 *
 * Defensive by design: `Config` carries an index signature, so anything can sit
 * under `link_validation`. A section of the wrong shape is ignored (empty result)
 * rather than thrown on — a config typo must not take the validator down.
 */
export function resolveOptionalLinkPatterns(
  loadedConfig: unknown,
  cliPatterns: string[] | undefined,
): string[] {
  return [...new Set([...readConfigPatterns(loadedConfig), ...(cliPatterns ?? [])])]
}

function readConfigPatterns(loadedConfig: unknown): string[] {
  if (typeof loadedConfig !== 'object' || loadedConfig === null) return []

  const section = (loadedConfig as Record<string, unknown>)['link_validation']
  if (typeof section !== 'object' || section === null) return []

  const patterns = (section as Record<string, unknown>)['optional_link_patterns']
  if (!Array.isArray(patterns)) return []

  return patterns.filter(
    (pattern): pattern is string => typeof pattern === 'string' && pattern.trim().length > 0,
  )
}
