import type { FileSystemService } from '@pair/content-ops'
import chalk from 'chalk'
import type { RunCommandConfig } from './parser'

/**
 * Handles `pair run` — the execution adapter (US-451).
 *
 * Scaffold stage (T-1): the flag surface is parsed and reported. Engine resolution (T-2),
 * skill resolution (T-4), the perimeter (T-5), autonomy (T-6), the stream reader (T-7), the
 * policy reader (T-8) and the re-invocation loop (T-9) land on top of this entry point.
 *
 * Returns the process exit code; a failed iteration must never read as success.
 */
export async function handleRunCommand(
  config: RunCommandConfig,
  _fs: FileSystemService,
): Promise<number> {
  console.log(chalk.bold('pair run'))
  console.log(`  Invocation:  ${config.invocation.kind}`)
  console.log(`  Engine:      ${config.engine ?? '(unresolved — schema default applies)'}`)
  console.log(`  Autonomy:    ${config.autonomous ? 'explicit opt-in' : 'confirmations active'}`)
  return 0
}
