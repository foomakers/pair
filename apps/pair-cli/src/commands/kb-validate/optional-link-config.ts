/**
 * Resolution of kb-validate's optional link patterns (US-188) from the two
 * places they can be declared: the project config
 * (`link_validation.optional_link_patterns`) and the `--optional-link-patterns`
 * CLI flag.
 */

/** Patterns accepted from config + CLI, plus what the config declared and this dropped. */
export interface ResolvedOptionalLinkPatterns {
  patterns: string[]
  /** One message per dropped config input, for the caller to log. */
  warnings: string[]
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
 * under `link_validation`. A section of the wrong shape is DROPPED, never thrown
 * on — a config typo must not take the validator down — but it is reported
 * through `warnings`, the same shape `compileOptionalLinkPatterns` uses for a
 * malformed glob: silently ignoring it would surface as "every out-of-tree link
 * is broken", indistinguishable from patterns that simply do not match.
 */
export function resolveOptionalLinkPatterns(
  loadedConfig: unknown,
  cliPatterns: string[] | undefined,
): ResolvedOptionalLinkPatterns {
  const { patterns: configPatterns, warnings } = readConfigPatterns(loadedConfig)
  return {
    patterns: [...new Set([...configPatterns, ...(cliPatterns ?? [])])],
    warnings,
  }
}

function readConfigPatterns(loadedConfig: unknown): ResolvedOptionalLinkPatterns {
  if (typeof loadedConfig !== 'object' || loadedConfig === null) return empty()
  if (!('link_validation' in loadedConfig)) return empty()

  const section = (loadedConfig as Record<string, unknown>)['link_validation']
  if (typeof section !== 'object' || section === null || Array.isArray(section)) {
    return dropped(
      `Config 'link_validation' must be an object, got ${describe(section)}, ignoring it`,
    )
  }

  return readPatternsField(section as Record<string, unknown>)
}

function readPatternsField(section: Record<string, unknown>): ResolvedOptionalLinkPatterns {
  if (!('optional_link_patterns' in section)) {
    // `optionalLinkPatterns` (camelCase) is the plausible typo, and it would
    // otherwise read exactly like "no patterns declared".
    const declared = Object.keys(section)
    return declared.length === 0
      ? empty()
      : dropped(
          `Config 'link_validation' declares no 'optional_link_patterns' (found: ${declared.join(', ')}), no optional link patterns from config`,
        )
  }

  const patterns = section['optional_link_patterns']
  if (!Array.isArray(patterns)) {
    return dropped(
      `Config 'link_validation.optional_link_patterns' must be an array of strings, got ${describe(patterns)}, ignoring it`,
    )
  }

  return acceptStrings(patterns)
}

/** Keeps the non-blank string entries, reporting how many were dropped. */
function acceptStrings(patterns: unknown[]): ResolvedOptionalLinkPatterns {
  const accepted = patterns.filter(
    (pattern): pattern is string => typeof pattern === 'string' && pattern.trim().length > 0,
  )

  const droppedCount = patterns.length - accepted.length
  if (droppedCount === 0) return { patterns: accepted, warnings: [] }

  const detail =
    droppedCount === 1
      ? '1 entry that is not a non-empty string, ignoring it'
      : `${droppedCount} entries that are not non-empty strings, ignoring them`
  return {
    patterns: accepted,
    warnings: [`Config 'link_validation.optional_link_patterns' has ${detail}`],
  }
}

function empty(): ResolvedOptionalLinkPatterns {
  return { patterns: [], warnings: [] }
}

function dropped(warning: string): ResolvedOptionalLinkPatterns {
  return { patterns: [], warnings: [warning] }
}

/** The offending value's shape, named the way a config author would recognize it. */
function describe(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'an array'
  return `a ${typeof value}`
}
