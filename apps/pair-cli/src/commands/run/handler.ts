import type { FileSystemService } from '@pair/content-ops'
import chalk from 'chalk'
import type { RunCommandConfig } from './parser'
import { assertEngineAvailable, describeEngineResolution, resolveEngine } from './resolve-engine'
import { createExecutableProbe } from './path-probe'

/**
 * Handles `pair run` — the execution adapter (US-451).
 *
 * Resolution is REPORTED before anything is executed (AC1): the engine, the command line and
 * the level of the cascade that produced it are printed first, so a surprising engine is
 * visible at the top of the run rather than inferred from a failure later.
 *
 * Later tasks compose skill resolution (T-4), the perimeter (T-5), autonomy (T-6), the stream
 * reader (T-7), the policy reader (T-8) and the re-invocation loop (T-9) onto this entry point.
 *
 * Returns the process exit code; a failed iteration must never read as success.
 */
export async function handleRunCommand(
  config: RunCommandConfig,
  fs: FileSystemService,
): Promise<number> {
  const engine = resolveEngine({ flag: config.engine })

  console.log(chalk.bold('pair run'))
  console.log(`  ${describeEngineResolution(engine)}`)
  console.log(`  Invocation: ${config.invocation.kind}`)
  console.log(`  Autonomy:   ${config.autonomous ? 'explicit opt-in' : 'confirmations active'}`)

  assertEngineAvailable(engine, createExecutableProbe(fs))
  return 0
}
