import { spawnSync } from 'child_process'
import { join } from 'path'
import type { FileSystemService } from '@pair/content-ops'
import type { Config } from '#registry'
import type { EngineDefinition } from './engines'
import { isEngineId, type EngineId } from './engines'
import type { ResolvedInvocation } from './resolve-skill'
import { readInstalledSkill } from './skill-probe'
import { locateCycleScripts } from './cycle-scripts'

/**
 * US-488 — the workflow profile, as `pair-cli run --card` consumes it.
 *
 * NO resolution logic lives here: the cascade, the collision/unresolved HALTs, the model-class
 * lookup and the `context` validation are `workflow-profile.mjs`'s — the ONE shared resolver the
 * in-session coordinator runs too — spawned in a child process like every other cycle script
 * (nothing installed is evaluated inside pair-cli). This module types its answer and derives the
 * per-stage values the driver spawns with.
 */

export const WORKFLOW_PROFILE_SCRIPT = 'workflow-profile.mjs'

/** Ask the shared resolver to map an installed skill's process-step marker. */
export function resolveProfileStage(scriptsDir: string, skillText?: string): string {
  if (!skillText?.includes('process-step:')) return 'defaults'
  const result = spawnSync(
    'node',
    [join(scriptsDir, WORKFLOW_PROFILE_SCRIPT), 'stage-for', '--skill-text', skillText],
    { encoding: 'utf8' },
  )
  try {
    const parsed = JSON.parse(result.stdout) as { stage?: string; error?: string }
    if (parsed.error) throw new Error(parsed.error)
    if (parsed.stage) return parsed.stage
  } catch (error) {
    throw new Error(
      `profile-invalid: stage mapping failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  throw new Error('profile-invalid: stage mapping returned no stage')
}

type Sourced<T> = { readonly value: T; readonly source: string }

export interface ResolvedStage {
  readonly engine: Sourced<string>
  readonly model: Sourced<string> & {
    readonly resolved: { readonly id: string | null; readonly line: string }
  }
  readonly effort: Sourced<string>
  readonly context: Sourced<string>
}

export interface ResolvedWorkflowProfile {
  readonly name: string
  /** `--workflow-config` | `argument` | `pair.config.json` | `KB default`. */
  readonly source: string
  readonly sourceDetail: string
  readonly hash: string
  readonly stages: Readonly<Record<string, ResolvedStage>>
  /** The transparency block, printed once before the first dispatch (AC6). */
  readonly table: readonly string[]
  /** `cycle-state.mjs`'s own `contextPolicy` for this profile — admissible transitions only. */
  readonly contextPolicy: Readonly<Record<string, string>>
  readonly notes: readonly string[]
  readonly profile?: {
    readonly defaults?: Readonly<Record<string, unknown>>
    readonly stages?: Readonly<Record<string, Readonly<Record<string, unknown>>>>
  }
}

/** Validate the resolved run before any stage can dispatch. */
export function validateProfileRun(
  profile: ResolvedWorkflowProfile,
  input: {
    readonly commandLine: boolean
    readonly engineFlag?: EngineId
    readonly runEngine?: EngineId | undefined
  },
): void {
  if (!profile.profile) return
  const declared = profile.profile?.stages ?? {}
  const stages = Object.keys(declared).length ? Object.keys(declared) : ['defaults']
  for (const stage of stages) {
    const selected = profile.stages[stage]
    if (!selected) continue
    const wanted = selected.engine.value
    if (input.engineFlag && wanted !== 'default' && wanted !== input.engineFlag)
      throw new Error(
        `profile-invalid: stages.${stage}.engine '${wanted}' contradicts --engine '${input.engineFlag}'; remove --engine or set it to '${wanted}'`,
      )
    if (input.commandLine && !input.engineFlag && wanted === 'default')
      throw new Error(
        `profile-invalid: stages.${stage}.engine 'default' has no engine for a command-line profile; set stages.${stage}.engine or pass --engine`,
      )
    const engine = wanted === 'default' ? (input.engineFlag ?? input.runEngine) : wanted
    if (!isEngineId(engine)) continue
    const model = selected.model.resolved.id
    if (model !== null && !modelFitsEngine(engine, model))
      throw new Error(
        `profile-invalid: stages.${stage}.model '${model}' cannot run on engine '${engine}'; choose a model for ${engine} or change stages.${stage}.engine`,
      )
  }
}

function modelFitsEngine(engine: EngineId, model: string): boolean {
  if (engine === 'claude') return /^(claude-|sonnet$|opus$|haiku$)/.test(model)
  if (engine === 'codex') return model.startsWith('gpt-')
  return model.includes('/')
}

export interface ProfileRequest {
  readonly root: string
  readonly profile?: string | undefined
  readonly workflowConfig?: string | undefined
  /** The card's `risk:*` tag, when it carries one (resolves a model class). */
  readonly tier?: string | undefined
}

/** Spawns `workflow-profile.mjs resolve` and relays its `{halt, detail}` as `<halt>: <detail>`. */
export function resolveWorkflowProfile(
  scriptsDir: string,
  request: ProfileRequest,
): ResolvedWorkflowProfile {
  const script = join(scriptsDir, WORKFLOW_PROFILE_SCRIPT)
  const args = [
    ['root', request.root],
    ['profile', request.profile],
    ['workflow-config', request.workflowConfig],
    ['tier', request.tier],
  ].flatMap(([flag, value]) => (value === undefined ? [] : [`--${flag}`, value]))
  const result = spawnSync('node', [script, 'resolve', ...args], { encoding: 'utf8' })
  const stdout = (result.stdout ?? '').trim()
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(stdout) as Record<string, unknown>
  } catch {
    throw new Error(
      `cycle-state-unreadable: ${script} resolve produced output that is not valid JSON` +
        `${stdout ? `: ${stdout.slice(0, 200)}` : ' (empty stdout)'}` +
        `${result.stderr ? ` — stderr: ${String(result.stderr).slice(0, 200)}` : ''}`,
    )
  }
  if (typeof parsed['halt'] === 'string') {
    throw new Error(`${parsed['halt']}: ${String(parsed['detail'])}`)
  }
  if (typeof parsed['error'] === 'string') throw new Error(parsed['error'])
  return parsed as unknown as ResolvedWorkflowProfile
}

/**
 * A profile flag names the DELIVERY-CYCLE profile: on a card the mapping routes to a workflow, or a
 * Draft card routed to a preparation skill, no cycle runs — so the flag would be accepted and
 * silently ignored. It is refused instead.
 */
export function refuseProfileOffCycle(
  flags: { readonly profile?: string | undefined; readonly workflowConfig?: string | undefined },
  route: string,
): void {
  const flag =
    flags.profile !== undefined
      ? '--profile'
      : flags.workflowConfig !== undefined
        ? '--workflow-config'
        : undefined
  if (flag === undefined) return
  throw new Error(
    `${flag} selects the delivery-cycle workflow profile, but this card routes to ${route}, not the ` +
      'delivery cycle — no stage would use it. Drop the flag, or run a Ready card with no mapped tag.',
  )
}

export interface StageSettings {
  /** Absent ⇒ the run's own engine. */
  readonly engine?: string
  /** Absent ⇒ the engine's own default model (or the run-wide `engine.model`). */
  readonly model?: string
  /** Absent ⇒ the engine's default effort. */
  readonly effort?: string
}

/** Resolve the stage used by a skill, prompt or preparation route before its engine starts. */
export function resolveOffCycleProfile(input: {
  fs: FileSystemService
  config: Config
  cwd: string
  flags: { readonly profile?: string; readonly workflowConfig?: string }
  invocation: ResolvedInvocation
  tier?: string | undefined
  resolve?: typeof resolveWorkflowProfile | undefined
}): { profile: ResolvedWorkflowProfile; stage: string; settings: StageSettings } | undefined {
  if (!workflowProfileRequested(input.flags, input.config)) return undefined
  const scriptsDir = locateCycleScripts(input.fs, input.config, input.cwd).scriptsDir
  const text =
    input.invocation.kind === 'skill'
      ? readInstalledSkill(input.fs, input.config, input.cwd, input.invocation.name)
      : undefined
  const stage = resolveProfileStage(scriptsDir, text)
  const profile = (input.resolve ?? resolveWorkflowProfile)(scriptsDir, {
    root: input.cwd,
    profile: input.flags.profile,
    workflowConfig: input.flags.workflowConfig,
    tier: input.tier,
  })
  return { profile, stage, settings: stageSettings(profile, stage) }
}

/** What one stage (`prepare|validate|implement|green|verify|…`) spawns with. `default` is never sent as a value. */
export function stageSettings(profile: ResolvedWorkflowProfile, stage: string): StageSettings {
  const s = profile.stages[stage]
  if (s === undefined) return {}
  return {
    ...(s.engine.value !== 'default' && { engine: s.engine.value }),
    ...(s.model.resolved.id !== null && { model: s.model.resolved.id }),
    ...(s.effort.value !== 'default' && { effort: s.effort.value }),
  }
}

/**
 * The distinct engines a profile names beyond the run's own default — each checked against the
 * supported ids, so a typo is a load-time `profile-invalid`, never a dispatch-time surprise.
 */
export function stageEngineIds(
  profile: ResolvedWorkflowProfile,
  supported: readonly string[],
): string[] {
  const used: string[] = []
  for (const [stage, s] of Object.entries(profile.stages)) {
    const id = s.engine.value
    if (id === 'default') continue
    if (!supported.includes(id)) {
      throw new Error(
        `profile-invalid: stages.${stage}.engine: unknown engine '${id}' (supported: ${supported.join(', ')})`,
      )
    }
    if (!used.includes(id)) used.push(id)
  }
  return used
}

/**
 * Whether this run asked for a profile at all: a flag, or a `workflowProfiles` block in
 * `pair.config.json`. Neither ⇒ the zero-configuration path — no script is spawned and the run is
 * exactly what it was without this story (AC9, D21).
 */
export function workflowProfileRequested(
  flags: { readonly profile?: string | undefined; readonly workflowConfig?: string | undefined },
  config: Readonly<Record<string, unknown>>,
): boolean {
  return (
    flags.profile !== undefined ||
    flags.workflowConfig !== undefined ||
    config['workflowProfiles'] !== undefined
  )
}

/**
 * US-560 AC3: an `effort` the stage's engine has no verified flag for is never sent — so it is marked
 * `ignored` in the resolved table and named in ONE warning, instead of vanishing silently.
 */
export function markIgnoredEffort(
  profile: ResolvedWorkflowProfile,
  engineOf: (stage: string) => EngineDefinition,
): { table: readonly string[]; warning?: string } {
  const ignored = new Map<string, string>()
  const table = [...profile.table]
  for (const [stage, s] of Object.entries(profile.stages)) {
    const engine = engineOf(stage)
    if (s.effort.value === 'default' || engine.effortArgs) continue
    ignored.set(`${engine.id} (${s.effort.value})`, stage)
    const i = table.findIndex(line => line.trimStart().startsWith(`${stage} `))
    if (i >= 0) table[i] = table[i]!.replace(/(\| effort [^|]*?) \|/, '$1 ignored |')
  }
  if (ignored.size === 0) return { table }
  return {
    table,
    warning: `effort ignored: no verified effort flag for ${[...ignored.keys()].join(', ')} — sent to no engine`,
  }
}
