/**
 * `## Blocking Severities` — the delivery cycle's own adoption key (US-514 T-1), distinct from
 * `AutomationPolicy` above: this one is read by the CYCLE (review-phase / red-verify, both
 * realizations) rather than by `pair-loop`, and it decides which finding/contract-gap severities
 * BLOCK rather than which cards an unattended run may pick up.
 *
 * `.pair/adoption/` is delta-only (ADR-018 / D21): a project declares this section only to differ
 * from the KB default, which is "every severity blocks" — pair itself declares nothing.
 *
 * ```markdown
 * ## Blocking Severities
 *
 * Critical, Major
 * max-dispatches: 40 block
 * ```
 *
 * - **First line**: a comma-separated list of severities, each one of `Critical | Major | Minor`
 *   (`Questions` is never blocking by definition and is never declared here). Absent section ⇒ the
 *   KB default, `Critical, Major, Minor` — today's behaviour, unchanged.
 * - **Optional second line**: `max-dispatches: <positive integer> [warn|block]` — an optional
 *   ceiling on a run's published handoffs. `warn` is the default mode when omitted: the cycle
 *   prints a warning naming the count and continues. `block` stops the run with the typed reason
 *   `max-dispatches`. Absent line ⇒ no ceiling.
 * - **Malformed** (an unrecognised severity, an empty list, a badly-shaped or non-positive
 *   `max-dispatches`) ⇒ HALT (`automation-policy-malformed`) naming the file and the offending
 *   line — never a silent fallback to the default (ADR-018).
 */

import type { FileSystemService } from '@pair/content-ops'
import { join } from 'path'
import { policyHalt, POLICY_PATH, sectionLines } from './policy-sections'

export { POLICY_PATH } from './policy-sections'

/** The KB default — pair itself declares nothing, so this IS pair's own policy. */
export const DEFAULT_BLOCKING_SEVERITIES = ['Critical', 'Major', 'Minor'] as const
const VALID_SEVERITIES = new Set<string>(DEFAULT_BLOCKING_SEVERITIES)
const VALID_MODES = new Set(['warn', 'block'])

export interface MaxDispatches {
  readonly n: number
  readonly mode: 'warn' | 'block'
}

export interface BlockingSeverityPolicy {
  readonly blockingSeverities: readonly string[]
  readonly maxDispatches?: MaxDispatches
}

function readSeverities(first: string): string[] {
  const severities = first
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
  if (severities.length === 0) {
    policyHalt('`## Blocking Severities` declares an empty severity list')
  }
  for (const s of severities) {
    if (!VALID_SEVERITIES.has(s)) {
      policyHalt(
        `\`## Blocking Severities\` names an unknown severity \`${s}\` — expected one of ` +
          `Critical | Major | Minor`,
      )
    }
  }
  return severities
}

function readMaxDispatches(rest: readonly string[]): MaxDispatches | undefined {
  if (rest.length === 0) return undefined
  if (rest.length > 1) {
    policyHalt('`## Blocking Severities` carries more than one `max-dispatches` line')
  }
  const line = rest[0]!
  const match = /^max-dispatches:\s*(-?\d+)(?:\s+(\S+))?\s*$/.exec(line)
  if (!match) {
    policyHalt(
      `\`## Blocking Severities\` line \`${line}\` is not \`max-dispatches: <positive integer> [warn|block]\``,
    )
  }
  const n = Number(match[1])
  if (!Number.isInteger(n) || n <= 0) {
    policyHalt(`\`## Blocking Severities\` \`max-dispatches\` must be a positive integer, got \`${match[1]}\``)
  }
  const modeToken = match[2]
  if (modeToken !== undefined && !VALID_MODES.has(modeToken)) {
    policyHalt(`\`## Blocking Severities\` \`max-dispatches\` mode must be warn | block, got \`${modeToken}\``)
  }
  return { n, mode: (modeToken as 'warn' | 'block' | undefined) ?? 'warn' }
}

/** Pure: markdown text → the policy. Throws on a malformed declaration (never a silent default). */
export function readBlockingSeverities(markdown: string): BlockingSeverityPolicy {
  const lines = sectionLines(markdown, 'Blocking Severities')
  if (lines === undefined || lines.length === 0) {
    return { blockingSeverities: [...DEFAULT_BLOCKING_SEVERITIES] }
  }
  const severities = readSeverities(lines[0]!)
  const maxDispatches = readMaxDispatches(lines.slice(1))
  return { blockingSeverities: severities, ...(maxDispatches !== undefined && { maxDispatches }) }
}

/**
 * Absent file ⇒ the same KB default as an absent section — `.pair/adoption/` is optional (D21),
 * and a project on neither state has simply not opted out of "every severity blocks".
 */
export function resolveBlockingSeverities(
  fs: FileSystemService,
  projectRoot: string,
): BlockingSeverityPolicy {
  const path = join(projectRoot, POLICY_PATH)
  if (!fs.existsSync(path)) return { blockingSeverities: [...DEFAULT_BLOCKING_SEVERITIES] }
  return readBlockingSeverities(fs.readFileSync(path))
}

/**
 * The AC10 transparency block's dispatch-ceiling line (US-514 T-3): the declared `max-dispatches`
 * with its mode, or `none` when the project declares no ceiling at all — never a number nobody
 * declared (the pre-T-3 line printed a hard-coded 40 whether or not a project wanted a ceiling).
 */
export function describeMaxDispatches(policy: BlockingSeverityPolicy): string {
  if (policy.maxDispatches === undefined) return 'none'
  return `${policy.maxDispatches.n} (${policy.maxDispatches.mode})`
}
