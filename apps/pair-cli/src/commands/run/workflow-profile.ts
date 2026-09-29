import { spawnSync } from 'child_process'
import { join } from 'path'

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

export interface StageSettings {
  /** Absent ⇒ the run's own engine. */
  readonly engine?: string
  /** Absent ⇒ the engine's own default model (or the run-wide `engine.model`). */
  readonly model?: string
  /** Absent ⇒ the engine's default effort. */
  readonly effort?: string
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
