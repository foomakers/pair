import { validateLayoutOption, parseSkipRegistriesOption } from '#registry'

/**
 * Configuration for kb-validate command
 */
export interface KbValidateCommandConfig {
  command: 'kb-validate'
  path?: string
  layout?: 'source' | 'target'
  strict?: boolean
  ignoreConfig?: boolean
  skipRegistries?: string[]
  /**
   * Glob patterns (US-188) marking a missing internal link target as OPTIONAL:
   * pattern-matched misses are warnings instead of errors, so a KB validated in
   * isolation does not fail on links into a codebase that is not checked out.
   * Merged (union) with `link_validation.optional_link_patterns` from config.
   */
  optionalLinkPatterns?: string[]
}

interface ParseKbValidateOptions {
  path?: string
  layout?: string
  strict?: boolean
  ignoreConfig?: boolean
  skipRegistries?: string
  optionalLinkPatterns?: string
}

/**
 * Parse kb-validate command options into KbValidateCommandConfig.
 *
 * Extracts KB path for validation. If not provided, uses current directory.
 *
 * @param options - Raw CLI options from Commander.js
 * @returns Typed KbValidateCommandConfig with optional KB path
 */
export function parseKbValidateCommand(
  options: ParseKbValidateOptions,
  args: string[] = [],
): KbValidateCommandConfig {
  if (args.length > 0) {
    throw new Error(
      `Command 'kb-validate' does not accept positional arguments: ${args.join(', ')}`,
    )
  }

  const { path, layout, strict, ignoreConfig, skipRegistries, optionalLinkPatterns } = options

  const validatedLayout = validateLayoutOption(layout)
  const parsedSkipRegistries = parseSkipRegistriesOption(skipRegistries)
  const parsedOptionalLinkPatterns = parseCommaSeparatedList(optionalLinkPatterns)

  return {
    command: 'kb-validate',
    ...(path && { path }),
    ...(validatedLayout && { layout: validatedLayout }),
    ...(strict !== undefined && { strict }),
    ...(ignoreConfig !== undefined && { ignoreConfig }),
    ...(parsedSkipRegistries !== undefined && { skipRegistries: parsedSkipRegistries }),
    ...(parsedOptionalLinkPatterns !== undefined && {
      optionalLinkPatterns: parsedOptionalLinkPatterns,
    }),
  }
}

/**
 * Splits a comma-separated CLI value into trimmed, non-empty entries.
 * `undefined` in (flag absent) ⇒ `undefined` out: the flag being absent and the
 * flag being empty are different states downstream (absent = no CLI contribution).
 *
 * Not `parseSkipRegistriesOption`: that one deliberately does NOT trim (a registry
 * name is matched verbatim against config keys), while a glob typed as
 * `"a/**, b/**"` must not become the pattern `" b/**"`, which matches nothing.
 */
function parseCommaSeparatedList(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined
  return value
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0)
}
