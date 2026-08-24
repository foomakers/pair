import type { FileSystemService } from '@pair/content-ops'
import chalk from 'chalk'
import { loadConfigWithOverrides, readEngineDeclaration } from '#config'
import type { RunCommandConfig } from './parser'
import { assertEngineAvailable, describeEngineResolution, resolveEngine } from './resolve-engine'
import { createExecutableProbe } from './path-probe'
import { ENGINE_IDS, isEngineId } from './engines'

/**
 * The engine the project's own `pair.config.json` declares, if any.
 *
 * A malformed block THROWS rather than degrading to the default: an operator whose typo was
 * silently ignored would have no way to tell a working configuration from a broken one.
 */
function declaredEngine(fs: FileSystemService, projectRoot: string) {
  const loaded = loadConfigWithOverrides(fs, { projectRoot })
  const outcome = readEngineDeclaration(loaded.config, ENGINE_IDS)
  if (outcome.errors.length > 0) {
    throw new Error(`pair.config.json is invalid:\n  - ${outcome.errors.join('\n  - ')}`)
  }
  return isEngineId(outcome.engine) ? outcome.engine : undefined
}

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
  const projectRoot = config.cwd ?? fs.currentWorkingDirectory()
  const engine = resolveEngine({
    flag: config.engine,
    declared: declaredEngine(fs, projectRoot),
  })

  console.log(chalk.bold('pair run'))
  console.log(`  ${describeEngineResolution(engine)}`)
  console.log(`  Invocation: ${config.invocation.kind}`)
  console.log(`  Autonomy:   ${config.autonomous ? 'explicit opt-in' : 'confirmations active'}`)

  assertEngineAvailable(engine, createExecutableProbe(fs))
  return 0
}
