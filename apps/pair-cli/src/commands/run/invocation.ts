import type { EngineDefinition } from './engines'
import type { ResolvedInvocation } from './resolve-skill'

/**
 * The parameters the driver may pass to a skill — BORROWED, never invented (AC8, D18).
 *
 * `--root`/`--filter` are `pair-next`'s frozen scoping parameters (ADR-017 §1);
 * `--predicate`/`--iteration` are `pair-loop`'s own documented arguments. The driver adds no
 * parameter of its own to any skill: a new one appearing here would be the drift AC8 exists
 * to catch.
 */
export interface SkillArguments {
  root?: string
  filter?: string
  predicate?: string
  iteration?: number
}

type SkillParameterMap = Readonly<Partial<Record<keyof SkillArguments, string>>>

/**
 * Which of those parameters each skill actually declares, as DATA.
 *
 * `pair-loop` declares `--root`, `--predicate`, `--iteration` (its SKILL.md Arguments table)
 * and reads the eligibility filter from `tech/automation.md` itself — so the driver must NOT
 * pass it a `--filter` it never declared. `pair-next` declares `--root` and `--filter`.
 */
export const SKILL_PARAMETERS: Readonly<Record<string, SkillParameterMap>> = Object.freeze({
  'pair-loop': { root: '--root', predicate: '--predicate', iteration: '--iteration' },
  'pair-next': { root: '--root', filter: '--filter' },
})

/**
 * A skill this driver has no parameter declaration for still gets the two FROZEN scoping
 * parameters (ADR-017 §1) and nothing else — the perimeter must travel with every invocation
 * (AC5), and inventing arguments for an unknown skill is exactly what BR1 forbids.
 */
const UNKNOWN_SKILL_PARAMETERS: SkillParameterMap = { root: '--root', filter: '--filter' }

function parametersFor(skill: string): SkillParameterMap {
  return SKILL_PARAMETERS[skill] ?? UNKNOWN_SKILL_PARAMETERS
}

/** The skill's own arguments, in a stable order, dropping anything it does not declare. */
export function buildSkillArgs(skill: string, args: SkillArguments): string[] {
  const parameters = parametersFor(skill)
  const parts: string[] = []
  if (args.root !== undefined && parameters.root) parts.push(parameters.root, args.root)
  if (args.filter !== undefined && parameters.filter) parts.push(parameters.filter, args.filter)
  if (args.predicate !== undefined && parameters.predicate) {
    parts.push(parameters.predicate, args.predicate)
  }
  if (args.iteration !== undefined && parameters.iteration) {
    parts.push(parameters.iteration, String(args.iteration))
  }
  return parts
}

/**
 * The prompt text handed to the engine — ONE argv element, never a shell string.
 *
 * `slash` renders the in-agent slash command; `instruction` renders the portable
 * natural-language form for an engine that discovers skills but has no slash syntax on a
 * one-shot prompt. A `--prompt` run is passed through VERBATIM: the driver never edits an
 * operator's prompt, and the perimeter still binds it mechanically (working directory,
 * iteration cap, autonomy posture, per-iteration timeout).
 */
export function buildPromptText(
  engine: EngineDefinition,
  invocation: ResolvedInvocation,
  args: SkillArguments,
): string {
  if (invocation.kind === 'prompt') return invocation.text

  const skillArgs = buildSkillArgs(invocation.name, args)
  const rendered = [invocation.name, ...skillArgs].join(' ')
  return engine.skillInvocationStyle === 'slash'
    ? `/${rendered}`
    : `Run the ${invocation.name} skill with these arguments: ${skillArgs.join(' ') || '(none)'}`
}
