import { detectSourceType, SourceType } from '@pair/content-ops'

/**
 * Common CLI options validation.
 * Checks for consistency between related flags (e.g., offline vs remote).
 */
export function validateCommandOptions(
  _command: string,
  options: { source?: string; offline?: boolean },
): void {
  const { source, offline } = options

  if (source !== undefined && source === '') {
    throw new Error('Source path/URL cannot be empty')
  }

  if (offline) {
    if (!source) {
      throw new Error('Offline mode requires explicit --source with local path')
    }
    const sourceType = detectSourceType(source)
    if (sourceType === SourceType.REMOTE_URL) {
      throw new Error('Cannot use --offline with remote URL source')
    }
  }
}

/**
 * Extracts target and source parameters from raw argument array.
 * Supporting legacy parsing needs during refactoring.
 */
export function parseTargetAndSource(args?: string[] | null) {
  if (!Array.isArray(args)) args = []
  const targetIndex = args.indexOf('--target')
  const target = targetIndex >= 0 && args[targetIndex + 1] ? args[targetIndex + 1] : null
  const sourceIndex = args.indexOf('--source')
  const source = sourceIndex >= 0 && args[sourceIndex + 1] ? args[sourceIndex + 1] : null
  return { target, source }
}

/**
 * Parses basic positional arguments for install/update.
 */
export function parseInstallUpdateArgs(args: string[]) {
  if (!args || args.length === 0) {
    return { baseTarget: null, useDefaults: true }
  }

  const baseTarget = args.find(arg => !arg.startsWith('--')) || null
  return { baseTarget, useDefaults: false }
}
