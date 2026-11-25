import { basename, extname } from 'node:path'
import { stringify } from 'yaml'
import { errorAt, nameError, parseStrict, type Lines, type WorkflowError } from '../grammar'
import { violations } from '../schema'
import { configurationSchemaV1, frozenConfigurationSchema, type Configuration } from './schema'

export type ParsedConfiguration =
  | { readonly configuration: Configuration; readonly errors: readonly [] }
  | { readonly configuration?: undefined; readonly errors: readonly WorkflowError[] }

/** Checks a raw value against the schema; `lines` positions the errors (none: line 1). */
export function checkConfiguration(
  value: unknown,
  file: string,
  lines: Lines = {},
  checkName = true,
): ParsedConfiguration {
  const errors = [
    ...violations(checkName ? configurationSchemaV1 : frozenConfigurationSchema, value).map(found =>
      errorAt({ file, lines }, found.path, found),
    ),
    ...(checkName ? nameError(value as { name?: unknown } | null, file, lines) : []),
  ]
  return errors.length > 0 ? { errors } : { configuration: value as Configuration, errors: [] }
}

/** Parses one configuration file under the workflow's rules: YAML 1.2, no anchors, tags or duplicate keys. */
export function parseConfiguration(text: string, file: string): ParsedConfiguration {
  const source = parseStrict(text, file)
  return source.lines === undefined
    ? { errors: source.errors }
    : checkConfiguration(source.value, file, source.lines)
}

/** The file name without its extension: the name a configuration must carry. */
export const nameOfFile = (file: string): string => basename(file, extname(file))

/** The text a frozen copy holds. */
export const configurationText = (configuration: Configuration): string => stringify(configuration)

/** A frozen copy, which carries the name of the file it came from (or `override`), not its own file name. */
export function parseFrozenConfiguration(text: string, file: string): ParsedConfiguration {
  const source = parseStrict(text, file)
  return source.lines === undefined
    ? { errors: source.errors }
    : checkConfiguration(source.value, file, source.lines, false)
}
