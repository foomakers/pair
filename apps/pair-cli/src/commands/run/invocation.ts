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
  /**
   * The SCOPE of the run — the epic, story or card the work is bounded to.
   *
   * A slot, not a spelling: `pair-loop` and `pair-next` name it `--root`, `pair-process-refine-story`
   * and `pair-process-plan-tasks` name it `--story`, and `SKILL_PARAMETERS` is what maps the slot
   * onto each skill's own word for it. The driver never invents the name (D18) — it renders the one
   * the skill's `## Arguments` table declares, or the run does not scope at all.
   */
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
 * Which of those parameters each skill actually declares, and under WHICH NAME — as DATA.
 *
 * `pair-loop` declares `--root`, `--predicate`, `--iteration` (its SKILL.md Arguments table)
 * and reads the eligibility filter from `tech/automation.md` itself — so the driver must NOT
 * pass it a `--filter` it never declared. `pair-next` declares `--root` and `--filter`.
 *
 * The two `pair-process-*` rows are the workflows the KB catalog recommends mapping a tag to
 * (`automation-policy.md` § "The workflows a mapping can name"), and they spell the scope
 * `$story`, never `--root`. Rendering `--root <card>` at them is not a harmless extra argument:
 * both skills' Step 0 reads "if `$story` is not provided, select the highest-priority story from
 * the backlog", so an unrecognised scope makes the agent work a DIFFERENT card while the audit
 * trail and the on-issue `DISPATCH-RECORD:` both name the card that was tagged. The row is what
 * keeps the run and its record talking about the same card; `invocation.test.ts` pins every name
 * here against the skills' own `## Arguments` tables in the dataset corpus.
 */
export const SKILL_PARAMETERS: Readonly<Record<string, SkillParameterMap>> = Object.freeze({
  'pair-loop': { root: '--root', predicate: '--predicate', iteration: '--iteration' },
  'pair-next': { root: '--root', filter: '--filter' },
  'pair-process-refine-story': { root: '--story' },
  'pair-process-plan-tasks': { root: '--story' },
})

/**
 * How this skill names the run's scope, or `undefined` when the driver has no declaration for it.
 *
 * Deliberately does NOT fall back to `UNKNOWN_SKILL_PARAMETERS`: the fallback exists so an operator
 * driving an arbitrary skill by hand still gets a perimeter, and "probably `--root`" is an
 * acceptable guess when a human is watching the invocation. On a tag-driven dispatch nobody is, and
 * the card the trigger fired on is the only thing the run is about — so `dispatch.ts` HALTs on a
 * mapped workflow this returns `undefined` for, rather than guessing on an unattended run.
 */
export function scopeParameterFor(skill: string): string | undefined {
  return SKILL_PARAMETERS[skill]?.root
}

/**
 * The workflows a `## Workflows` mapping may name — the KB catalog, as DATA.
 *
 * A SEPARATE declaration from `SKILL_PARAMETERS`, not a subset read off it, because the two answer
 * different questions. The argument table answers "how does this skill spell its scope", and it
 * carries a `pair-next` row because `--skill pair-next --root 212` is a legitimate hand-driven run.
 * This set answers "may a tag route a card here", and `pair-next` is not an answer to it: a card
 * dispatched to it takes the card's exclusive lock, writes `event=start … workflow=pair-next` and
 * gets a `DISPATCH-RECORD:` comment posted on it, for a run that prints a next-action
 * recommendation and changes nothing.
 *
 * Deriving one from the other is what let those four rows quietly become the mappable set while
 * every operator surface — the HALT message below, the KB catalog table, the tutorial, ADR-024 —
 * said three. `invocation.test.ts` asserts set EQUALITY against the catalog table in the dataset,
 * in both directions: a workflow documented as mappable but missing here HALTs a board on a
 * mapping copied verbatim out of the guideline, and a workflow here but not in the catalog is
 * accepted by a driver that every document says refuses it.
 */
export const DISPATCHABLE_WORKFLOWS: ReadonlySet<string> = Object.freeze(
  new Set(['pair-loop', 'pair-process-refine-story', 'pair-process-plan-tasks']),
)

/**
 * How a DISPATCHED card reaches this workflow, or `undefined` when a tag may not route to it.
 *
 * Both halves matter and both are refusals: a skill outside the catalog, and a catalogued skill the
 * driver holds no scoping row for. Either way `dispatch.ts` HALTs rather than guessing — see
 * `scopeParameterFor` for why an unattended run gets no "probably `--root`".
 */
export function dispatchScopeParameterFor(skill: string): string | undefined {
  return DISPATCHABLE_WORKFLOWS.has(skill) ? scopeParameterFor(skill) : undefined
}

/**
 * A skill this driver has no parameter declaration for still gets the two FROZEN scoping
 * parameters (ADR-017 §1) and nothing else — the perimeter must travel with every invocation
 * (AC5), and inventing arguments for an unknown skill is exactly what BR1 forbids.
 */
const UNKNOWN_SKILL_PARAMETERS: SkillParameterMap = { root: '--root', filter: '--filter' }

/**
 * Skills that read `## Eligibility` from `tech/automation.md` THEMSELVES.
 *
 * The third answer to "what happens to the eligibility label on this invocation", and the reason
 * it is a set rather than the negation of "declares `--filter`": `pair-loop` declares no `--filter`
 * because it reads the policy file (its SKILL.md Step 0), while `pair-process-refine-story`
 * declares none because the label plays no part in refining ONE story. Reporting the second as
 * "applied by the skill itself" would print a perimeter nobody applies — the same class of untrue
 * perimeter line round 1's finding 1 removed, one skill over.
 */
const POLICY_READING_SKILLS: ReadonlySet<string> = Object.freeze(new Set(['pair-loop']))

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

/** HOW the eligibility label reaches the selection on this invocation — see `Perimeter`. */
export type FilterDelivery = 'argument' | 'read-by-skill' | 'none'

/**
 * Which of the three, for one resolved invocation.
 *
 * - `argument` — the skill declares `--filter`, so the driver passes it (`pair-next`);
 * - `read-by-skill` — the skill reads `## Eligibility` from the policy file itself (`pair-loop`);
 * - `none` — neither: a verbatim `--prompt`, or a workflow scoped to ONE card
 *   (`pair-process-refine-story`). The label is not this run's perimeter, and saying it is would
 *   print a boundary nothing applies.
 *
 * The caller uses this to REFUSE a `--filter` it could not honour, instead of accepting it,
 * dropping it in `buildSkillArgs`, and printing it as the run's perimeter anyway (review round 1,
 * finding 1: the printed label and the cards actually driven could disagree).
 */
export function filterDeliveryFor(invocation: ResolvedInvocation): FilterDelivery {
  if (invocation.kind === 'prompt') return 'none'
  if (parametersFor(invocation.name).filter !== undefined) return 'argument'
  return POLICY_READING_SKILLS.has(invocation.name) ? 'read-by-skill' : 'none'
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
