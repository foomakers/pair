const PACKAGE_NAME_REGEX = /^[a-z0-9][a-z0-9._-]*$/
const SEMVER_REGEX =
  /^\d+\.\d+\.\d+(-[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?(\+[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?$/

/**
 * Validate package name.
 * Must be lowercase, start with alphanumeric, only contain [a-z0-9._-].
 * Returns true on valid, error string on invalid (compatible with @inquirer/prompts validate).
 */
export function validatePackageName(input: string): true | string {
  if (!input || !input.trim()) return 'Package name is required'
  if (!PACKAGE_NAME_REGEX.test(input)) {
    return 'Package name must be lowercase, start with a letter or number, and only contain [a-z0-9._-]'
  }
  return true
}

/**
 * Validate semver version string.
 * Returns true on valid, error string on invalid.
 */
export function validateVersion(input: string): true | string {
  if (!input || !input.trim()) return 'Version is required'
  if (!SEMVER_REGEX.test(input)) {
    return 'Version must be valid semver (e.g., 1.0.0, 0.1.0-beta.1)'
  }
  return true
}

/**
 * Factory for required field validators.
 * Returns a validate function that rejects empty/whitespace strings.
 */
export function validateRequired(fieldName: string): (input: string) => true | string {
  return (input: string) => {
    if (!input || !input.trim()) return `${fieldName} is required`
    return true
  }
}

/**
 * Parse comma-separated tags input into trimmed string array.
 * Filters empty entries.
 */
export function parseTagsInput(input: string): string[] {
  if (!input || !input.trim()) return []
  return input
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)
}
