import { resolveEngineBinary } from './path-probe'
import { DEFAULT_ENGINE_ID, ENGINES, type EngineDefinition, type EngineId } from './engines'

/**
 * Which level of the cascade produced the engine — printed verbatim, never inferred by the
 * reader of the output. AC1 is about the run being able to SAY where its engine came from.
 */
export type EngineSource = '--engine' | 'pair.config.json' | 'schema default'

export interface ResolvedEngine {
  readonly engine: EngineDefinition
  readonly source: EngineSource
  /** The executable plus its headless/stream args, exactly as it will be spawned. */
  readonly commandLine: string
}

/** Whether an executable can be found on PATH. Injected so tests stay hermetic. */
export type ExecutableProbe = (command: string) => boolean

/**
 * Resolves the active engine by the precedence `--engine` > `pair.config.json` > schema
 * default. Pure: no PATH probe, no spawn (see `assertEngineAvailable`).
 */
export function resolveEngine(input: {
  flag?: EngineId | undefined
  declared?: EngineId | undefined
}): ResolvedEngine {
  const [id, source]: [EngineId, EngineSource] = input.flag
    ? [input.flag, '--engine']
    : input.declared
      ? [input.declared, 'pair.config.json']
      : [DEFAULT_ENGINE_ID, 'schema default']

  const engine = ENGINES[id]
  return { engine, source, commandLine: [engine.command, ...engine.headlessArgs].join(' ') }
}

/**
 * The transparency line printed BEFORE anything is executed (AC1): what will run, and which
 * level of the cascade won. It names the winner, so a surprising engine is visible at the top
 * of the output rather than inferred from a failure later.
 */
export function describeEngineResolution(resolved: ResolvedEngine): string {
  return `Engine: ${resolved.engine.id} — \`${resolved.commandLine}\` (from ${resolved.source})`
}

/**
 * Fails with an ACTIONABLE message when the resolved executable is not on PATH: the message
 * names the resolved command AND the level that produced it, because "engine not found" with
 * neither is unactionable when the engine came from a config file the operator did not write.
 */
export interface EngineBinaryLookup {
  readonly fs: { existsSync(path: string): boolean }
  readonly repoRoot: string
  readonly declaredBin?: Readonly<Record<string, string>> | undefined
}

/**
 * Resolves the executable to spawn, or throws naming the one thing the operator can do about it.
 *
 * Returns the ENGINE with its `command` replaced by what was actually found, so everything
 * downstream (arg building, spawn) uses the resolved path without knowing how it was resolved.
 */
export function assertEngineAvailable(
  resolved: ResolvedEngine,
  probe: ExecutableProbe,
  lookup?: EngineBinaryLookup,
): EngineDefinition {
  const setupHint =
    resolved.engine.setup === undefined
      ? ''
      : ` To install or verify it, run ${resolved.engine.setup}.`
  if (lookup === undefined) {
    if (probe(resolved.engine.command)) return resolved.engine
    throw new Error(
      `Engine '${resolved.engine.id}' is not installed or not on PATH: ` +
        `\`${resolved.engine.command}\` could not be found (resolved from ${resolved.source}). ` +
        `Install it, or pass --engine with one of the others.${setupHint}`,
    )
  }
  const found = resolveEngineBinary({
    id: resolved.engine.id,
    command: resolved.engine.command,
    fs: lookup.fs as never,
    repoRoot: lookup.repoRoot,
    declaredBin: lookup.declaredBin,
    probe,
  })
  if (found === undefined) {
    throw new Error(
      `Engine '${resolved.engine.id}' could not be located: \`${resolved.engine.command}\` is not ` +
        `on PATH, and is not in this repository's \`node_modules/.bin\` either (engine resolved ` +
        `from ${resolved.source}). Install it, pass --engine with one of the others, or declare ` +
        `where it lives: {"engine": {"id": "${resolved.engine.id}", "bin": {"${resolved.engine.id}": "/path/to/${resolved.engine.command}"}}} ` +
        `in pair.config.json.${setupHint}`,
    )
  }
  return { ...resolved.engine, command: found.command }
}
