import type { EngineDefinition } from './engines'

/**
 * Autonomy and project trust (US-451 T-6) — two INDEPENDENT decisions, both default OFF.
 *
 * *Autonomy* is "run without confirmations". *Trust approval* is "run where the engine does not
 * trust this project", which authorizes executing arbitrary repository code. Collapsing them
 * into one flag is what AC6 forbids: they have different blast radii, and neither is derivable
 * from `pair.config.json` — a committed file must never be able to grant either.
 *
 * Everything engine-specific here is read from the ENGINE MAP, never branched on per engine.
 */

/** Whether the engine considers this project trusted. Read-only, injected. */
export type ProjectTrustProbe = (store: string, projectPath: string) => boolean | undefined

export interface AutonomyDecision {
  readonly autonomous: boolean
  /** Engine args carrying the posture — empty when confirmations stay active. */
  readonly args: readonly string[]
  /** Lines to print, so the posture the run actually took is never implicit. */
  readonly notes: readonly string[]
}

export interface AutonomyInput {
  engine: EngineDefinition
  /** `--autonomous`. */
  autonomous: boolean
  /** `--approve-project-trust`. */
  approveProjectTrust: boolean
  /** The directory the iterations run in — the path whose trust is in question. */
  cwd: string
  isProjectTrusted?: ProjectTrustProbe
}

/**
 * Resolves the run's posture, or FAILS LOUDLY.
 *
 * Two failure modes, both deliberate:
 * - an engine with NO confirmation mechanism (`always-on`) invoked without `--autonomous`:
 *   pretending confirmations are active for it would be a lie the operator cannot see through;
 * - a project the engine does not trust, with no `--approve-project-trust`: the driver never
 *   auto-approves and never writes the engine's trust store.
 */
export function resolveAutonomy(input: AutonomyInput): AutonomyDecision {
  const notes: string[] = []
  const args = resolveAutonomyArgs(input, notes)
  applyTrustPosture(input, notes)
  return { autonomous: input.autonomous, args, notes }
}

function resolveAutonomyArgs(input: AutonomyInput, notes: string[]): readonly string[] {
  const { autonomy } = input.engine

  if (autonomy.kind === 'always-on') {
    if (!input.autonomous) {
      throw new Error(
        `Engine '${input.engine.id}' cannot run with confirmations active: ${autonomy.note}. ` +
          `Pass --autonomous to accept that explicitly, or choose another engine.`,
      )
    }
    notes.push(`Autonomy: explicit opt-in (${autonomy.note})`)
    return []
  }

  if (!input.autonomous) {
    notes.push('Autonomy: confirmations active (default — no autonomy flag passed)')
    return []
  }
  notes.push(`Autonomy: explicit opt-in (${autonomy.autonomyArgs.join(' ')})`)
  return autonomy.autonomyArgs
}

function applyTrustPosture(input: AutonomyInput, notes: string[]): void {
  const trust = input.engine.projectTrust

  if (trust.kind !== 'provisioned') {
    notes.push(`Project trust: nothing to approve — ${trust.note}`)
    return
  }

  const decision = input.isProjectTrusted?.(trust.store, input.cwd)
  if (decision === true) {
    notes.push(`Project trust: already trusted in ${trust.store}`)
    return
  }

  if (!input.approveProjectTrust) {
    throw new Error(
      `Engine '${input.engine.id}' does not trust this project (${input.cwd}): ${trust.note}. ` +
        `The driver never auto-approves trust and never writes ${trust.store} — provision it ` +
        `(pi's own /trust, or /pair-capability-setup-harness), or pass --approve-project-trust ` +
        `to run anyway, knowing project-local resources may be ignored.`,
    )
  }

  notes.push(
    `Project trust: NOT trusted in ${trust.store}; running under an explicit ` +
      `--approve-project-trust (the driver wrote nothing)`,
  )
}

/**
 * The hang guard for headless mode (AC6 edge case): stdin is CLOSED, so an engine that asks for
 * input gets EOF and terminates instead of waiting forever, and the iteration is bounded by a
 * wall-clock timeout on top. Mechanical, not policy — see `DEFAULT_ITERATION_TIMEOUT_SECONDS`.
 */
export const HEADLESS_STDIN = 'ignore' as const
