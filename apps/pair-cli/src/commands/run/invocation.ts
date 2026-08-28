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
  /**
   * The non-interactive approval signal (ADR-021), borrowed from the skills that declare it.
   *
   * A closed enum, sourced from the driver's own `--autonomous` flag and never from operator text
   * — so it does not extend the prompt-injection surface the borrowed VALUES do. Absent means
   * `interactive` by the signal's own default, which is why the non-autonomous path passes nothing
   * at all rather than passing `interactive` explicitly (US-464 AC2).
   */
  approval?: 'interactive' | 'auto'
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

/**
 * How `approval` is spelled on the wire, once (US-464).
 *
 * Kept beside the family below rather than inlined, so the anti-drift assertion can read every
 * parameter name this driver may spell from ONE place — a flag that only exists inside a function
 * body is a flag that assertion cannot see.
 */
export const APPROVAL_PARAMETER: SkillParameterMap = Object.freeze({ approval: '--approval' })

/**
 * Which skills DECLARE `$approval` — the family ADR-021 converted, as DATA (AC5).
 *
 * Nine `assess-*` members with an approval round plus both `map-*` skills. Deliberately absent:
 * `assess-cost` and `assess-coupling` (no approval round at all — ADR-021's gate is defect-driven,
 * not name-driven, so the corpus carries no argument nothing honours), and every CALLER that merely
 * forwards the signal — `bootstrap`'s quick depth passes `$approval: auto` to this family without
 * declaring it itself, and `refine-story` is ADR-021's untracked residual, which still asks.
 *
 * Adding or removing a member is a one-line data edit here and one in tier 1's own list
 * (`.claude/workflows/pair-loop.js`); `tier-parity.test.ts` fails if the two disagree, and
 * `invocation.test.ts` fails if either disagrees with the skills' own `## Arguments` tables. That
 * corpus check is what keeps a hardcoded list about someone else's declaration honest.
 */
export const APPROVAL_DECLARING_SKILLS: ReadonlySet<string> = Object.freeze(
  new Set([
    'pair-capability-assess-ai',
    'pair-capability-assess-architecture',
    'pair-capability-assess-infrastructure',
    'pair-capability-assess-methodology',
    'pair-capability-assess-observability',
    'pair-capability-assess-pm',
    'pair-capability-assess-security',
    'pair-capability-assess-stack',
    'pair-capability-assess-testing',
    'pair-capability-map-contexts',
    'pair-capability-map-subdomains',
  ]),
)

/**
 * The parameters one skill may receive.
 *
 * `approval` is MERGED onto whatever the skill already had rather than replacing it, and that is
 * the whole reason the family is a separate list instead of eleven `SKILL_PARAMETERS` rows: an
 * explicit row per member would have overridden `UNKNOWN_SKILL_PARAMETERS` and silently cost every
 * one of them the `--root`/`--filter` scoping it receives today — a drift on the NON-autonomous
 * path, which is exactly what AC2 forbids.
 */
function parametersFor(skill: string): SkillParameterMap {
  const declared = SKILL_PARAMETERS[skill] ?? UNKNOWN_SKILL_PARAMETERS
  return APPROVAL_DECLARING_SKILLS.has(skill) ? { ...declared, ...APPROVAL_PARAMETER } : declared
}

/**
 * Whether this invocation can carry `--filter` at all.
 *
 * `pair-loop` declares none — it reads `## Eligibility` from `tech/automation.md` itself — and a
 * verbatim `--prompt` carries no parameters whatsoever. The caller uses this to REFUSE a
 * `--filter` it could not honour, instead of accepting it, dropping it in `buildSkillArgs`, and
 * printing it as the run's perimeter anyway (review round 1, finding 1: the printed label and the
 * cards actually driven could disagree).
 */
export function skillAcceptsFilter(invocation: ResolvedInvocation): boolean {
  if (invocation.kind === 'prompt') return false
  return parametersFor(invocation.name).filter !== undefined
}

/**
 * Renders one borrowed VALUE for a prompt line.
 *
 * The prompt is a single argv element, so there is no shell to quote for — but the line is read by
 * the agent as a command with arguments, and a multi-word value with no delimiters loses its
 * boundary: `--predicate tag:risk:red ⇒ Done --iteration 1` reads as a one-token predicate followed
 * by junk. `pair-loop`'s own SKILL.md renders it `--predicate "<text>"`, and its workflow validates
 * the predicate by CONTENT before any agent starts, so the malformed spelling is either rejected
 * outright or applied as a DIFFERENT stop condition to an unattended run (round 1, finding 2).
 *
 * Single-token values stay bare — quoting `212` or `risk:green` would only add noise — and an
 * embedded quote is escaped rather than allowed to close the value early.
 */
function renderValue(value: string): string {
  if (!/[\s"]/.test(value)) return value
  return `"${value.replace(/(["\\])/g, '\\$1')}"`
}

/**
 * The order borrowed values are rendered in — DATA, so a new one is a row here rather than a fifth
 * hand-written branch in the loop below (which is what tipped this function over the complexity
 * limit when `approval` arrived). Same philosophy as `SKILL_PARAMETERS` and `ENGINES`: the shape of
 * the invocation is a table, not a chain of conditionals.
 */
const PARAMETER_ORDER: readonly (keyof SkillArguments)[] = [
  'root',
  'filter',
  'predicate',
  'iteration',
  'approval',
]

/** The skill's own arguments, in a stable order, dropping anything it does not declare. */
export function buildSkillArgs(skill: string, args: SkillArguments): string[] {
  const parameters = parametersFor(skill)
  const parts: string[] = []
  for (const key of PARAMETER_ORDER) {
    const parameter = parameters[key]
    const value = args[key]
    if (parameter === undefined || value === undefined) continue
    // A number has no delimiter problem and never took quotes; every string value goes through
    // `renderValue`, exactly as each hand-written branch did before this became a loop.
    parts.push(parameter, typeof value === 'number' ? String(value) : renderValue(value))
  }
  return parts
}

/**
 * Whether this invocation will carry `--approval`, and why — for the pre-spawn preview (AC6).
 *
 * Same transparency principle as the engine-resolution line: a surprising posture must be visible
 * BEFORE anything spawns, and "the skill will ask nobody for approval" is exactly that. Returns
 * `undefined` when the resolved skill declares no approval round, because a line about an argument
 * that cannot be passed is noise on every run that does not involve the family.
 */
export function describeApprovalPosture(
  invocation: ResolvedInvocation,
  autonomous: boolean,
): string | undefined {
  if (invocation.kind === 'prompt') return undefined
  if (!APPROVAL_DECLARING_SKILLS.has(invocation.name)) return undefined
  return autonomous
    ? `Approval: --approval auto will be passed (${invocation.name} declares it; --autonomous is set)`
    : `Approval: nothing passed — ${invocation.name} keeps its interactive default (no --autonomous)`
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
