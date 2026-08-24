import { ENGINE_IDS, isEngineId, type EngineId } from './engines'

/**
 * The perimeter's scope components, expressed with `pair-next`'s OWN frozen parameter names
 * (ADR-017 §1). The driver adds no scoping concept of its own (AC8).
 */
export interface RunScopeOptions {
  root?: string
  filter?: string
}

/**
 * What the engine is asked to run: a skill (named, or resolved by the cascade in T-4) or a
 * verbatim prompt. Discriminated, never an optional bag — a run is one or the other.
 */
export type RunInvocationRequest =
  | { kind: 'skill'; name?: string }
  | { kind: 'prompt'; text: string }

/**
 * The default per-iteration wall-clock bound, in seconds.
 *
 * A MECHANICAL hang guard, not a policy parameter (AC8): the edge-case table forbids an
 * unbounded wait when a headless engine asks for input it can never receive. Policy
 * (eligibility, stop predicate, parallelism, audit) is read from `tech/automation.md` and
 * nothing here duplicates it.
 */
export const DEFAULT_ITERATION_TIMEOUT_SECONDS = 1800

export interface RunCommandConfig {
  command: 'run'
  /** Present only when `--engine` was passed; resolution precedence lives in T-2. */
  engine?: EngineId
  invocation: RunInvocationRequest
  scope: RunScopeOptions
  /** Present only when `--cwd` was passed; otherwise the process working directory. */
  cwd?: string
  /** Present only when `--max-iterations` was passed; the policy supplies the cap otherwise. */
  maxIterations?: number
  /** Explicit opt-in — never inferable from configuration (AC6). */
  autonomous: boolean
  /** Explicit operator authorization to run in a project the engine does not trust (AC6). */
  approveProjectTrust: boolean
  iterationTimeoutSeconds: number
  /** Resolve, print and exit without spawning anything. */
  dryRun: boolean
}

interface ParseRunOptions {
  engine?: string
  skill?: string
  prompt?: string
  root?: string
  filter?: string
  cwd?: string
  maxIterations?: string | number
  autonomous?: boolean
  approveProjectTrust?: boolean
  iterationTimeout?: string | number
  dryRun?: boolean
}

function parsePositiveInteger(flag: string, raw: string | number): number {
  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${flag} must be a positive integer (received: ${String(raw)})`)
  }
  return value
}

function optionalText(value: string | undefined, flag: string): string | undefined {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  if (trimmed.length === 0) throw new Error(`${flag} was passed with an empty value`)
  return trimmed
}

/** `--skill` and `--prompt` are one choice, not two independent flags. */
function resolveInvocation(options: ParseRunOptions): RunInvocationRequest {
  const skill = optionalText(options.skill, '--skill')
  const { prompt } = options
  if (skill !== undefined && prompt !== undefined) {
    throw new Error('--skill and --prompt are mutually exclusive: pass one, not both')
  }
  if (prompt === undefined) return { kind: 'skill', ...(skill && { name: skill }) }
  if (prompt.trim().length === 0) throw new Error('--prompt was passed with an empty value')
  return { kind: 'prompt', text: prompt }
}

function resolveEngineFlag(engine: string | undefined): EngineId | undefined {
  if (engine === undefined) return undefined
  if (!isEngineId(engine)) {
    throw new Error(`Unknown engine '${engine}'. Supported engines: ${ENGINE_IDS.join(', ')}`)
  }
  return engine
}

function resolveScope(options: ParseRunOptions): RunScopeOptions {
  const root = optionalText(options.root, '--root')
  const filter = optionalText(options.filter, '--filter')
  return { ...(root && { root }), ...(filter && { filter }) }
}

/**
 * Parses `pair run` options into a typed config. PURE — no filesystem, no PATH probe, no
 * spawn: every resolution (engine, skill, policy) happens later, in modules that take their
 * probes injected.
 *
 * Two defaults are load-bearing and asserted by tests: `autonomous` and
 * `approveProjectTrust` are FALSE with no flags, so the parser can never pre-empt AC6.
 */
export function parseRunCommand(options: ParseRunOptions, args: string[] = []): RunCommandConfig {
  if (args.length > 0) {
    throw new Error(`Command 'run' does not accept positional arguments: ${args.join(', ')}`)
  }

  const engine = resolveEngineFlag(options.engine)
  const cwd = optionalText(options.cwd, '--cwd')

  return {
    command: 'run',
    ...(engine && { engine }),
    invocation: resolveInvocation(options),
    scope: resolveScope(options),
    ...(cwd && { cwd }),
    ...(options.maxIterations !== undefined && {
      maxIterations: parsePositiveInteger('--max-iterations', options.maxIterations),
    }),
    autonomous: options.autonomous === true,
    approveProjectTrust: options.approveProjectTrust === true,
    iterationTimeoutSeconds:
      options.iterationTimeout === undefined
        ? DEFAULT_ITERATION_TIMEOUT_SECONDS
        : parsePositiveInteger('--iteration-timeout', options.iterationTimeout),
    dryRun: options.dryRun === true,
  }
}
