import { RATCHET_DEFAULTS, BASE_BRANCH_ENV, type MeasuredCoverage } from './ratchet'

/**
 * Configuration for the coverage-ratchet command.
 *
 * Field-for-field the module's `RatchetRunOptions` plus the discriminant: the
 * parser is the ONLY place a default is applied or a value rejected, so the
 * module's decision functions never see an unvalidated input.
 */
export interface CoverageRatchetCommandConfig {
  command: 'coverage-ratchet'
  configPath: string
  wowPath: string
  measured: MeasuredCoverage
  baseBranch: string
  remote: string
  marginPp: number
  dryRun: boolean
}

interface ParseCoverageRatchetOptions {
  coverageConfig?: string
  wayOfWorking?: string
  measured?: string
  baseBranch?: string
  remote?: string
  margin?: string
  dryRun?: boolean
}

/**
 * `type=pct,type=pct` → `{ type: pct }`.
 *
 * A comma-separated list rather than a repeatable flag: the command registry
 * declares its options as flag/description pairs, so a variadic collector would
 * need a per-command coercion hook no other command has. The values come from a
 * coverage report, and an EMPTY one (`shared=`) is kept deliberately — it is how
 * a pipeline says "this type produced no usable number", which the ratchet
 * reports as `not-measured` and writes nothing for.
 */
function parseMeasured(raw: string): MeasuredCoverage {
  const measured: MeasuredCoverage = {}
  for (const entry of raw.split(',')) {
    const item = entry.trim()
    if (item === '') continue
    const eq = item.indexOf('=')
    const type = eq === -1 ? item : item.slice(0, eq)
    if (eq === -1 || type === '') {
      throw new Error(`--measured expects <type>=<pct> entries, got '${item}'`)
    }
    measured[type] = item.slice(eq + 1).trim()
  }
  return measured
}

/**
 * A margin that is not a non-negative number would make every `proposed >
 * current` comparison false and the ratchet would silently never raise — a
 * feature that runs, reports nothing and never says why. A bad value is a
 * workflow-authoring bug: reject it here, where the CLI still exits non-zero.
 */
function parseMargin(raw: string): number {
  // `Number('')` is 0, so a blank value would silently mean "no margin at all"
  // instead of "this invocation is malformed".
  const n = raw.trim() === '' ? Number.NaN : Number(raw)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`--margin expects a non-negative number, got '${raw}'`)
  }
  return n
}

/**
 * The measured set, or a loud failure.
 *
 * An invocation with nothing measured can only ever be a no-op, so it is an
 * authoring mistake rather than a legitimate run: say so instead of printing
 * "nothing to commit back" on every push and looking like it worked.
 */
function requireMeasured(raw: string | undefined): MeasuredCoverage {
  if (raw === undefined || raw.trim() === '') {
    throw new Error(
      "--measured is required: pass the coverage the run produced, e.g. --measured 'backend=87.4,frontend=62'",
    )
  }
  return parseMeasured(raw)
}

/**
 * Which branch a write-back is allowed on: the flag, else the environment, else
 * `main`. `||` on the env var, not `??`: a variable set to the empty string is CI
 * saying nothing, not naming a branch called "".
 */
function resolveBaseBranch(flag: string | undefined, env: NodeJS.ProcessEnv): string {
  return flag ?? (env[BASE_BRANCH_ENV] || RATCHET_DEFAULTS.baseBranch)
}

/**
 * Parse the coverage-ratchet options into a `CoverageRatchetCommandConfig`.
 *
 * Everything this function rejects fails the command LOUDLY (non-zero exit),
 * which is the deliberate counterpart to the run itself never failing: once the
 * invocation is well-formed, a refused write is a warning and the coverage
 * gate's verdict is untouched (#372/AC6).
 */
export function parseCoverageRatchetCommand(
  options: ParseCoverageRatchetOptions,
  args: string[] = [],
  env: NodeJS.ProcessEnv = process.env,
): CoverageRatchetCommandConfig {
  if (args.length > 0) {
    throw new Error(
      `Command 'coverage-ratchet' does not accept positional arguments: ${args.join(', ')}`,
    )
  }
  return {
    command: 'coverage-ratchet',
    configPath: options.coverageConfig ?? RATCHET_DEFAULTS.configPath,
    wowPath: options.wayOfWorking ?? RATCHET_DEFAULTS.wowPath,
    measured: requireMeasured(options.measured),
    baseBranch: resolveBaseBranch(options.baseBranch, env),
    remote: options.remote ?? RATCHET_DEFAULTS.remote,
    marginPp:
      options.margin === undefined ? RATCHET_DEFAULTS.marginPp : parseMargin(options.margin),
    dryRun: options.dryRun === true,
  }
}
