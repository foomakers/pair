import type { KbHost } from './identity'

/**
 * Configuration for scaffold-kb command
 */
export interface ScaffoldKbCommandConfig {
  command: 'scaffold-kb'
  /** Target directory for the KB repo (default: current directory) */
  path: string
  /** Code host the generated release automation targets */
  host: KbHost
  /** Overwrite scaffold-owned files without asking */
  force: boolean
  /** KB name; derived from the target directory basename when omitted */
  name?: string
}

interface ParseScaffoldKbOptions {
  name?: string
  host?: string
  force?: boolean
}

const HOSTS: readonly KbHost[] = ['github', 'generic']

function validateHost(host: string | undefined): KbHost {
  if (host === undefined) return 'github'
  if ((HOSTS as readonly string[]).includes(host)) return host as KbHost
  throw new Error(`Invalid --host '${host}'. Supported hosts: ${HOSTS.join(', ')}`)
}

/**
 * Parse scaffold-kb command options into ScaffoldKbCommandConfig.
 *
 * @param options - Raw CLI options from Commander.js
 * @param args - Positional arguments; the first one is the target directory
 * @returns Typed ScaffoldKbCommandConfig
 */
export function parseScaffoldKbCommand(
  options: ParseScaffoldKbOptions,
  args: string[] = [],
): ScaffoldKbCommandConfig {
  if (args.length > 1) {
    throw new Error(
      `Command 'scaffold-kb' accepts at most one positional argument: ${args.join(', ')}`,
    )
  }

  return {
    command: 'scaffold-kb',
    path: args[0] ?? '.',
    host: validateHost(options.host),
    force: options.force ?? false,
    ...(options.name && { name: options.name }),
  }
}
