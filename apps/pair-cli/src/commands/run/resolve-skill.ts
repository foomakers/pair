import type { RunInvocationRequest } from './parser'

/**
 * The cascade's preferred skill and its fallback (AC2).
 *
 * `pair-loop` is the loop engine (#250); `pair-next` is the frozen selector atom (ADR-017 §1)
 * every installation has. Falling back to `pair-next` is what keeps this driver off #250's
 * critical path — it works today and gains `pair-loop` the moment it is installed.
 */
export const PREFERRED_SKILL = 'pair-loop'
export const FALLBACK_SKILL = 'pair-next'

/** Whether a skill is installed. Injected — one filesystem probe per run, never per iteration. */
export type SkillProbe = (name: string) => boolean

export type ResolvedInvocation =
  | { kind: 'skill'; name: string; source: 'cascade' | 'cascade-fallback' | '--skill' | 'mapping' }
  | { kind: 'prompt'; text: string }

/**
 * Resolves WHAT the engine is asked to run — never WHAT to work on (BR1).
 *
 * - `--prompt` bypasses skill resolution entirely (AC3) and runs under the same engine,
 *   perimeter and headless mode.
 * - `--skill <name>` is explicit and NEVER falls back: a named skill that is not installed is
 *   an actionable error, because silently running a different skill than the one asked for is
 *   the one outcome no operator can debug.
 * - No flag ⇒ `pair-loop` when installed, else `pair-next`, and the fallback is STATED.
 */
export function resolveInvocation(
  request: RunInvocationRequest,
  probe: SkillProbe,
): ResolvedInvocation {
  if (request.kind === 'prompt') return request

  if (request.name !== undefined) {
    if (!probe(request.name)) {
      throw new Error(
        `Skill '${request.name}' is not installed (--skill never falls back). ` +
          `Install it with \`pair install\`, or drop --skill to use the ${PREFERRED_SKILL} → ${FALLBACK_SKILL} cascade.`,
      )
    }
    return { kind: 'skill', name: request.name, source: '--skill' }
  }

  if (probe(PREFERRED_SKILL)) return { kind: 'skill', name: PREFERRED_SKILL, source: 'cascade' }
  if (probe(FALLBACK_SKILL))
    return { kind: 'skill', name: FALLBACK_SKILL, source: 'cascade-fallback' }

  throw new Error(
    `Neither ${PREFERRED_SKILL} nor ${FALLBACK_SKILL} is installed: there is no skill to run. ` +
      `Run \`pair install\`, or pass --prompt to run a prompt instead.`,
  )
}

/** The line that makes the resolution (and any fallback) visible before execution (AC2). */
export function describeSkillResolution(resolved: ResolvedInvocation): string {
  if (resolved.kind === 'prompt') return 'Invocation: --prompt (verbatim, no skill resolution)'
  switch (resolved.source) {
    case '--skill':
      return `Invocation: skill ${resolved.name} (from --skill, no fallback)`
    case 'cascade':
      return `Invocation: skill ${resolved.name} (cascade: ${PREFERRED_SKILL} installed)`
    case 'cascade-fallback':
      return `Invocation: skill ${resolved.name} (cascade: ${PREFERRED_SKILL} not installed, falling back)`
    case 'mapping':
      // US-217: the card's tag chose this, not the cascade and not a flag — so the line says which
      // declaration is answerable for what is about to run unattended.
      return `Invocation: skill ${resolved.name} (from the \`## Workflows\` mapping)`
  }
}
