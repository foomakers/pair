import { existsSync } from 'fs'
import { join } from 'path'
import { POLICY_PATH, policyHalt } from './policy-sections'
import {
  createCycleScriptsBridge,
  type AutonomyResolution,
  type CycleScriptsLocation,
} from './cycle-scripts'
import type { RunCommandConfig } from './parser'

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
