import { isGitUrl, isRemoteUrl } from '@pair/content-ops'

/**
 * The KB source a command must resolve: its own `--source`, or the program-level `--url`
 * when the command names none.
 *
 * ONE rule, in ONE place, for every command that resolves a KB (install, update, kb-info):
 * a named source travels through the command config's `resolution`, so what the pre-flight
 * fetches and what the command reads can never be two different KBs (US-395). `--url` used
 * to reach resolution only by side effect — the pre-flight wrote the custom archive into
 * the OFFICIAL KB's cache slot, which default resolution then served. Source-identity
 * keying ended that side effect, and without this rule the flag would name a source nothing
 * reads: the official KB downloaded and installed instead, silently, and no install at all
 * behind the firewall the mirror existed for.
 *
 * Precedence: the command's own `--source` wins — it is the more specific flag, and the
 * program-level one applies to every subcommand. An EMPTY `--source` is returned as-is so
 * its "cannot be empty" validation still fires; an empty `--url` is treated as absent,
 * matching the pre-flight's own `url && …` guard.
 */
export function namedSource(options: { source?: string; url?: string }): string | undefined {
  if (options.source !== undefined) return options.source
  return options.url || undefined
}

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
    if (isGitUrl(source)) {
      throw new Error('Cannot use --offline with git repository source')
    }
    if (isRemoteUrl(source)) {
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
