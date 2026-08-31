import { assertLabelValue, isMarkdownWrapper, policyHalt, sectionLines } from './policy-sections'
import { idSafetyFailure, isSafeId } from './prompt-safety'

/**
 * `## Workflows` — the tag→workflow mapping (US-217 T-1), read from `tech/automation.md`.
 *
 * The schema is owned by
 * `.pair/knowledge/guidelines/collaboration/automation/automation-policy.md` and applied here,
 * never re-invented. What this module does is PARSE and VALIDATE; what it deliberately does not do
 * is decide anything about a card — routing lives in `dispatch.ts`, and the two rules that need a
 * board or an installed skill set (an unknown workflow, a card carrying two mapped tags) belong
 * there because they cannot be answered from the file alone.
 *
 * **Zero merit logic (D18).** A tag is an OPAQUE routing key: this module never parses a family out
 * of it, never orders tiers, never reads a classification criterion. It matches label strings, which
 * is the whole of its decision surface.
 */

/** One declared route: the label a card may carry, and the workflow it routes to. */
export interface WorkflowRoute {
  readonly tag: string
  /** A skill name — the entry point of a composition of existing skills, resolved when installed. */
  readonly workflow: string
}

export interface WorkflowMapping {
  readonly routes: readonly WorkflowRoute[]
  /** `Precedence:`'s ordered tags, when declared. Absent ⇒ a multi-tag card HALTs at routing. */
  readonly precedence?: readonly string[]
}

/** The arrow is `⇒`, and ONLY `⇒` — the same one `## Stop Predicate` documents. */
const ENTRY = /^(.+?)\s*⇒\s*(.+)$/
/** The near-miss worth naming explicitly rather than reporting as "matches neither grammar". */
const ASCII_ARROW = /^(.+?)\s*=>\s*(.+)$/
const PRECEDENCE = /^Precedence:\s*(.*)$/

/**
 * Reads the mapping, or `undefined` when the project declares none.
 *
 * Absent section ⇒ absent mapping, SILENTLY: automation is opt-in (D21), so a project that never
 * wrote this section has simply not opted in, and that is never an error. A present-but-empty
 * section is the opposite case — a half-written declaration — and HALTs, exactly as `## Eligibility`
 * does, because the two mean different things and a consumer must not collapse them.
 */
export function readWorkflowMapping(markdown: string): WorkflowMapping | undefined {
  const lines = sectionLines(markdown, 'Workflows')
  if (lines === undefined) return undefined
  if (lines.length === 0) {
    policyHalt('`## Workflows` is present but empty (a half-written declaration)')
  }

  const routes: WorkflowRoute[] = []
  let precedence: string[] | undefined

  for (const line of lines) {
    const declared = PRECEDENCE.exec(line)
    if (declared) {
      if (precedence !== undefined) {
        policyHalt(
          '`## Workflows` carries more than one `Precedence:` line, but it takes one order',
        )
      }
      precedence = readPrecedence(declared[1]!)
      continue
    }
    routes.push(readRoute(line, routes))
  }

  if (routes.length === 0) {
    policyHalt('`## Workflows` declares a `Precedence:` order but no `<tag> ⇒ <workflow>` entry')
  }
  assertPrecedenceIsDeclared(precedence, routes)

  return { routes, ...(precedence !== undefined && { precedence }) }
}

/** `<tag> ⇒ <workflow>` — a label on the left, an installable skill name on the right. */
function readRoute(line: string, declaredSoFar: readonly WorkflowRoute[]): WorkflowRoute {
  const match = ENTRY.exec(line)
  if (!match) {
    // FIRST, and before the arrow spelling: the schema displays this very declaration inside a
    // ```markdown fence, so the commonest way to get here is a paste that brought the fence with it
    // — and that line is not a route at all. Reporting it as a grammar failure sends the maintainer
    // hunting for a malformed entry in a wrapper, and fixing an ASCII arrow inside the fence would
    // only earn a second HALT on the same paste. `## Eligibility` already names this cause, from
    // the same list, so both readers of the file say the same thing about the same mistake.
    if (isMarkdownWrapper(line)) {
      policyHalt(
        `\`## Workflows\` line \`${line}\` is a copied markdown wrapper, not a declaration`,
      )
    }
    // Named separately from "matches neither grammar": an ASCII arrow is a spelling mistake with an
    // obvious fix, and reporting it as an unrecognised line sends the maintainer hunting.
    if (ASCII_ARROW.test(line)) {
      policyHalt(
        `\`## Workflows\` line \`${line}\` uses \`=>\`, but the documented arrow is \`⇒\` (U+21D2) ` +
          `— the same form \`## Stop Predicate\` requires`,
      )
    }
    policyHalt(
      `\`## Workflows\` line \`${line}\` matches neither \`<tag> ⇒ <workflow>\` nor \`Precedence: <tag>, …\``,
    )
  }

  const tag = match[1]!.trim()
  const workflow = match[2]!.trim()
  // The routing key is a LABEL on the host, so it gets the label slot's rules — the same ones
  // `## Eligibility` applies, from the same place.
  assertLabelValue('`## Workflows` tag', tag)
  if (declaredSoFar.some(route => route.tag === tag)) {
    policyHalt(
      `\`## Workflows\` declares the tag \`${tag}\` twice — one card would route to two workflows, ` +
        `and picking one silently is what this HALT exists to prevent`,
    )
  }
  // A workflow name is spliced into the agent prompt AND used as a path segment by the installed-
  // skill probe, so it gets `--skill`'s own rule rather than the looser free-text one.
  if (!isSafeId(workflow)) {
    policyHalt(idSafetyFailure(`\`## Workflows\` workflow for \`${tag}\``, workflow))
  }
  return { tag, workflow }
}

/** `Precedence: <tag>, <tag>, …` — an ORDER, so duplicates and unknown tags are both HALTs. */
function readPrecedence(raw: string): string[] {
  const tags = raw
    .split(',')
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0)
  if (tags.length === 0) {
    policyHalt('`## Workflows` declares an empty `Precedence:` line, but it takes at least one tag')
  }
  const duplicate = tags.find((tag, index) => tags.indexOf(tag) !== index)
  if (duplicate !== undefined) {
    policyHalt(
      `\`## Workflows\` lists \`${duplicate}\` twice in \`Precedence:\`, but it is an order`,
    )
  }
  return tags
}

/**
 * Every precedence entry must name a declared tag.
 *
 * A `Precedence:` naming a tag with no route is dead configuration that reads as a working
 * tie-break: the card carrying that tag would fall through to the HALT the line was written to
 * avoid. Refusing it at read time costs a typo; accepting it costs an unattended run.
 */
function assertPrecedenceIsDeclared(
  precedence: readonly string[] | undefined,
  routes: readonly WorkflowRoute[],
): void {
  if (precedence === undefined) return
  const undeclared = precedence.filter(tag => !routes.some(route => route.tag === tag))
  if (undeclared.length > 0) {
    policyHalt(
      `\`## Workflows\` lists ${undeclared.map(tag => `\`${tag}\``).join(', ')} in \`Precedence:\`, ` +
        `but no \`<tag> ⇒ <workflow>\` entry declares ${undeclared.length > 1 ? 'them' : 'it'}`,
    )
  }
}
