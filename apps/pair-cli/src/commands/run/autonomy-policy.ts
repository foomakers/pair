import { existsSync, mkdirSync, readFileSync, readSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { POLICY_PATH, policyHalt } from './policy-sections'
import {
  createCycleScriptsBridge,
  locateCycleScripts,
  type AutonomyResolution,
  type CycleScriptsLocation,
} from './cycle-scripts'
import type { RunCommandConfig } from './parser'
import { mainCheckoutOrCwd } from './cycle-wiring'
import type { FileSystemService } from '@pair/content-ops'
import type { Config } from '#registry'

/**
 * The autonomy policy of `run --card` (US-521, ADR-027) — READ through the shared script, never derived.
 *
 * `autonomy-policy.mjs resolve` owns the grammar, the legacy translation, the precedence
 * (argument > --preset > adoption > adoption preset > KB default) and every error; this module only spawns it, turns its `errors` into
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
    'Autonomy (argument > --preset > adoption > adoption preset > KB default):',
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
  /** US-576: the preset question on an empty `## Autonomy`; `undefined` answer = non-TTY. */
  readonly askPreset?: PresetAsk
}): AutonomyResolution | undefined {
  const args = autonomyArgumentsOf(input.config)
  let location: CycleScriptsLocation
  try {
    location = locateCycleScripts(input.fs, input.projectConfig, input.cwd)
  } catch (error) {
    if (Object.keys(args).length > 0) throw error
    return undefined
  }
  const main = mainCheckoutOrCwd(input.cwd)
  const resolve = (): AutonomyResolution | undefined =>
    resolveAutonomyPolicy(input.resolver, { location, main, cwd: input.cwd, args })
  const first = resolve()
  const policyFile = join(main, POLICY_PATH)
  const resolution =
    first &&
    settlePresetChoice({
      resolution: first,
      args,
      ask: input.askPreset ?? askPresetOnTty,
      readPolicy: () => (existsSync(policyFile) ? readFileSync(policyFile, 'utf8') : undefined),
      writePolicy: text => {
        mkdirSync(dirname(policyFile), { recursive: true })
        writeFileSync(policyFile, text)
      },
      reresolve: () => resolve() ?? first,
      log: line => console.log(line),
    })
  if (resolution !== undefined)
    for (const line of describeAutonomy(resolution)) console.log(`  ${line}`)
  return resolution
}

/** A selection value the adoption declared (`## Autonomy` key, or its preset — US-576), never an argument or default. */
export function adoptionSelection(
  resolution: AutonomyResolution | undefined,
  key: 'filter' | 'assignee' | 'status' | 'root',
): string | undefined {
  const entry = resolution?.effective?.[key]
  if (
    entry === undefined ||
    entry.value === undefined ||
    (entry.source !== 'adoption' && !entry.source.startsWith('preset '))
  )
    return undefined
  return Array.isArray(entry.value) ? entry.value.join(',') : String(entry.value)
}

/* ------------------------------------------------- US-576 AC5: the preset question */

export const PRESET_CHOICES = ['full', 'escalate-red', 'supervised'] as const
export const PRESET_PROMPT =
  'No autonomy preset declared in `## Autonomy`. Choose full / escalate-red / supervised (Enter = supervised): '

/** Returns the operator's answer, or `undefined` when nobody can answer (non-TTY). */
export type PresetAsk = (question: string) => string | undefined

/** Default: one line from a TTY stdin, read synchronously (the entry is synchronous); non-TTY ⇒ `undefined`. */
// ponytail: byte-at-a-time sync read, enough for one short answer; a readline interface if prompts multiply.
export const askPresetOnTty: PresetAsk = question => {
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) return undefined
  process.stdout.write(question)
  const byte = Buffer.alloc(1)
  let line = ''
  try {
    while (readSync(0, byte, 0, 1, null) === 1 && byte[0] !== 0x0a)
      line += String.fromCharCode(byte[0]!)
  } catch {
    return ''
  }
  return line.replace(/\r$/, '')
}

/** `preset: <name>` under `## Autonomy` — filling an empty section, appending it, or creating the file. */
export function withPresetLine(markdown: string | undefined, preset: string): string {
  const line = `preset: ${preset}`
  if (markdown === undefined) return `# Automation Policy\n\n## Autonomy\n\n${line}\n`
  const heading = /^## Autonomy[ \t]*$/m.exec(markdown)
  if (heading === null) return `${markdown.replace(/\n*$/, '')}\n\n## Autonomy\n\n${line}\n`
  const at = heading.index + heading[0].length
  const rest = markdown.slice(at).replace(/^\n*/, '')
  return `${markdown.slice(0, at)}\n\n${line}\n${rest.length > 0 ? `\n${rest}` : ''}`
}

/**
 * Nothing declared (no `## Autonomy` key or preset, no legacy section) and nothing passed ⇒ ask once.
 * TTY: the answer (Enter = `supervised`) is written as `preset:` and the policy re-resolved from the file.
 * Non-TTY: nothing is written; the run keeps the KB default — every gate held, the supervised behaviour —
 * and says how to set a preset.
 */
export function settlePresetChoice(input: {
  readonly resolution: AutonomyResolution
  readonly args: Readonly<Record<string, string>>
  readonly ask: PresetAsk
  readonly readPolicy: () => string | undefined
  readonly writePolicy: (text: string) => void
  readonly reresolve: () => AutonomyResolution
  readonly log: (line: string) => void
}): AutonomyResolution {
  const { resolution } = input
  const undeclared =
    Object.keys(input.args).length === 0 &&
    Object.keys(resolution.translated ?? {}).length === 0 &&
    Object.values(resolution.effective ?? {}).every(entry => entry.source === 'default')
  if (!undeclared) return resolution
  const answer = input.ask(PRESET_PROMPT)
  if (answer === undefined) {
    input.log(
      `  No autonomy preset declared — running supervised (every gate held). Set one: add \`preset: escalate-red\` ` +
        `under \`## Autonomy\` in ${POLICY_PATH}, or pass --preset <full|escalate-red|supervised>.`,
    )
    return resolution
  }
  const preset = answer.trim() === '' ? 'supervised' : answer.trim()
  if (!(PRESET_CHOICES as readonly string[]).includes(preset))
    policyHalt(`preset ${JSON.stringify(preset)} is not one of ${PRESET_CHOICES.join(' | ')}`)
  input.writePolicy(withPresetLine(input.readPolicy(), preset))
  input.log(`  Wrote \`preset: ${preset}\` to ${POLICY_PATH} (\`## Autonomy\`).`)
  return input.reresolve()
}
