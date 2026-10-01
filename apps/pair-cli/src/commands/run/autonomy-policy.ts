import { existsSync } from 'fs'
import { join } from 'path'
import { POLICY_PATH, policyHalt } from './policy-sections'
import {
  createCycleScriptsBridge,
  locateCycleScripts,
  type AutonomyResolution,
  type CycleScriptsLocation,
} from './cycle-scripts'
import type { RunCommandConfig } from './parser'
import { mainCheckout } from './cycle-wiring'
import type { FileSystemService } from '@pair/content-ops'
import type { Config } from '#registry'

/**
 * The autonomy policy of `run --card` (US-521, ADR-027) — READ through the shared script, never derived.
 *
 * `autonomy-policy.mjs resolve` owns the grammar, the legacy translation, the precedence
 * (argument > adoption > KB default) and every error; this module only spawns it, turns its `errors` into
 * the policy HALT every other adoption read uses, and prints what the script returned. pair-cli holds no
 * autonomy rule (US-487, D18): a second copy here would be the drift the verbatim-relay test pins.
 */

export const AUTONOMY_SCRIPT = 'autonomy-policy.mjs'

export type AutonomyResolver = (input: {
  readonly location: CycleScriptsLocation
  readonly main: string
  readonly cwd: string
  readonly args: Readonly<Record<string, string>>
}) => AutonomyResolution | undefined

/** The autonomy arguments this invocation passed — raw strings, under the script's own key names. */
export function autonomyArgumentsOf(config: RunCommandConfig): Record<string, string> {
  return { ...(config.autonomy ?? {}) }
}

/** Default resolver: the installed script. An installation without it resolves nothing (today's path). */
export const spawnAutonomyResolver: AutonomyResolver = ({ location, main, cwd, args }) => {
  if (!existsSync(join(location.scriptsDir, AUTONOMY_SCRIPT))) {
    if (Object.keys(args).length > 0) {
      throw new Error(
        `skill-outdated: ${AUTONOMY_SCRIPT} is not installed next to the cycle scripts, so ` +
          `${Object.keys(args)
            .map(key => `--${key}`)
            .join(', ')} cannot be resolved — run \`pair update\` and re-run.`,
      )
    }
    return undefined
  }
  return createCycleScriptsBridge(location, cwd).autonomyResolve({
    adoption: join(main, POLICY_PATH),
    args,
  })
}

/**
 * The resolution, or a HALT naming every offending key — before any card is touched. `undefined` only
 * when the script is not installed and nothing was passed (the legacy path, byte for byte).
 */
export function resolveAutonomyPolicy(
  resolver: AutonomyResolver,
  input: Parameters<AutonomyResolver>[0],
): AutonomyResolution | undefined {
  const resolution = resolver(input)
  if (resolution === undefined) return undefined
  if (!resolution.ok) {
    policyHalt(
      `the autonomy policy is malformed: ${resolution.errors
        .map(error => `\`${error.key}\` ${error.reason}`)
        .join('; ')}`,
    )
  }
  return resolution
}

/** The transparency block: every effective value and its source, then warnings and translations — verbatim. */
export function describeAutonomy(resolution: AutonomyResolution): string[] {
  return [
    'Autonomy (argument > adoption > KB default):',
    ...resolution.lines.map(line => `  ${line}`),
    ...Object.values(resolution.translated).map(
      t => `  translated from ${t.from} — the \`## Autonomy\` equivalent is \`${t.equivalent}\``,
    ),
    ...resolution.warnings.map(warning => `  ! ${warning}`),
  ]
}

/**
 * The ONE resolution at the `run` entry (r0-2/r0-3) — before the route is chosen, so a malformed policy HALTs
 * on every route (DoR fallback, dry run, `--pr`, mapped, unattended skip) before anything is touched, and the
 * effective values are printed once. `undefined` only when the cycle scripts are not installed and nothing
 * autonomy-related was passed (the legacy path, byte for byte).
 */
export function resolveRunAutonomy(input: {
  readonly resolver: AutonomyResolver
  readonly config: RunCommandConfig
  readonly projectConfig: Config
  readonly fs: FileSystemService
  readonly cwd: string
}): AutonomyResolution | undefined {
  const args = autonomyArgumentsOf(input.config)
  let location: CycleScriptsLocation
  try {
    location = locateCycleScripts(input.fs, input.projectConfig, input.cwd)
  } catch (error) {
    if (Object.keys(args).length > 0) throw error
    return undefined
  }
  let main = input.cwd
  try {
    main = mainCheckout(input.cwd)
  } catch {
    // no git repository behind cwd: the policy is read from cwd itself
  }
  const resolution = resolveAutonomyPolicy(input.resolver, {
    location,
    main,
    cwd: input.cwd,
    args,
  })
  if (resolution !== undefined)
    for (const line of describeAutonomy(resolution)) console.log(`  ${line}`)
  return resolution
}

/** A selection value the adoption declared (`## Autonomy`, source `adoption` exactly), never an argument or default. */
export function adoptionSelection(
  resolution: AutonomyResolution | undefined,
  key: 'filter' | 'assignee' | 'status' | 'root',
): string | undefined {
  const entry = resolution?.effective?.[key]
  if (entry === undefined || entry.source !== 'adoption' || entry.value === undefined)
    return undefined
  return Array.isArray(entry.value) ? entry.value.join(',') : String(entry.value)
}
