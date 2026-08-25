import { join } from 'path'
import type { FileSystemService } from '@pair/content-ops'

/**
 * The automation-policy reader (US-451 T-8) — READ-ONLY, and it BORROWS every parameter.
 *
 * `.pair/adoption/tech/automation.md` is ADR-017 §6's policy home; its schema is owned by
 * `.pair/knowledge/guidelines/collaboration/automation/automation-policy.md` and is applied
 * here, never re-invented. The driver introduces NO policy parameter of its own (AC8, BR2,
 * D18): eligibility, the stop predicate, the parallelism ceiling and the audit location are
 * read with the names and the semantics `pair-loop` already defines, and this file is never
 * written.
 *
 * Fail-safes come from the same guideline: absent file or absent section ⇒ automation off
 * (empty eligibility), `max-iterations: 1`, parallelism `1`, audit `automation/loop-audit.md`.
 * A malformed value HALTs before any card is touched — a malformed policy is a policy that has
 * not been read.
 */

export const POLICY_PATH = '.pair/adoption/tech/automation.md'
export const DEFAULT_AUDIT_LOCATION = 'automation/loop-audit.md'
/** Absent stop-predicate section ⇒ exactly one iteration, never an unbounded run. */
export const FAIL_SAFE_MAX_ITERATIONS = 1
export const FAIL_SAFE_MAX_PARALLELISM = 1

/** `## Auto-Advance`'s fail-closed default: nothing pushes or merges unattended. */
export const AUTO_ADVANCE_OFF = '(none)'

export interface AutomationPolicy {
  /** `## Eligibility`'s single label, verbatim. Absent ⇒ automation is off. */
  readonly eligibility?: string
  /**
   * `## Auto-Advance`'s switch, verbatim — the project's own eligibility tier, or `(none)`.
   *
   * Read but never ACTED on: the driver merges nothing on any path. It is read so the run can say
   * truthfully whether the merge gate is human for THIS policy, instead of claiming it always is
   * (review round 1, finding 3) — when a tier is declared, `pair-loop` itself may push and merge
   * it, exactly as ADR-021 §5 and quality-model §4 describe.
   */
  readonly autoAdvance: string
  /** `## Stop Predicate`'s `<selector> ⇒ <condition>` line, verbatim (passed on, never evaluated here). */
  readonly stopPredicate?: string
  readonly maxIterations: number
  readonly maxParallelism: number
  readonly auditLocation: string
  readonly source: typeof POLICY_PATH | 'fail-safe defaults (policy file absent)'
  readonly warnings: readonly string[]
}

/** A HALT on the policy read: the message names the file and the offending value. */
function halt(detail: string): never {
  throw new Error(`${POLICY_PATH} — ${detail}. Fix the adoption file, then re-run.`)
}

/**
 * The upper bound on any value that reaches an agent prompt. Tier 1's own constant.
 */
const MAX_PROMPT_VALUE_LENGTH = 200

/**
 * Ported VERBATIM from tier 1 (`.claude/workflows/pair-loop.js` — `isSafePromptText`), which got it
 * from #250's round-3 review naming this exact threat (round 4, Major).
 *
 * Every value this reader returns ends up inside an agent prompt that runs `gh` in an unattended,
 * confirmation-free session. The schema's own MUST is two-part: the value is placed in a delimited
 * data slot **and** it is never a command fragment — "delimiting is not validation". The driver
 * borrows the policy's values, so it borrows this check too; anything less means the same
 * `tech/automation.md` HALTs on tier 1 and executes on tier 2, which is the divergence ADR-021
 * exists to forbid.
 *
 * It does NOT restrict SHAPE — a legitimate label may carry spaces (`good first issue`) — only the
 * characters that turn a value into a command once an agent puts it on a line: a backtick, `$(`,
 * control characters or newlines, and an unbounded length.
 */
function isSafePromptText(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_PROMPT_VALUE_LENGTH &&
    !value.includes('`') &&
    !value.includes('$(') &&
    !hasControlCharacters(value)
  )
}

/**
 * Newlines and C0/C1 control characters, checked with a LOOP rather than a control-character regex
 * literal — the same shape, and the same reason, as `config/loader.ts`: this repo's code-hygiene
 * gate flags linter-suppression comments with no exception mechanism, and a loop needs none.
 */
function hasControlCharacters(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true
  }
  return false
}

/** Tier 1's `isLabelShape` — a well-formed `family:tier` label, for `## Auto-Advance`. */
function isLabelShape(value: string): boolean {
  return /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/i.test(value)
}

/** The one message every unsafe value gets, wherever it was declared. */
function assertSafePromptText(section: string, value: string): void {
  if (isSafePromptText(value)) return
  halt(
    `\`## ${section}\` declares \`${value.slice(0, 80)}${value.length > 80 ? '…' : ''}\`, which ` +
      `contains a character that could turn it into a command fragment once inlined in an agent ` +
      `prompt (backtick, \`$(\`, a control character, or over ${MAX_PROMPT_VALUE_LENGTH} characters)`,
  )
}

export function readAutomationPolicy(fs: FileSystemService, projectRoot: string): AutomationPolicy {
  const path = join(projectRoot, POLICY_PATH)
  if (!fs.existsSync(path)) {
    return {
      autoAdvance: AUTO_ADVANCE_OFF,
      maxIterations: FAIL_SAFE_MAX_ITERATIONS,
      maxParallelism: FAIL_SAFE_MAX_PARALLELISM,
      auditLocation: DEFAULT_AUDIT_LOCATION,
      source: 'fail-safe defaults (policy file absent)',
      warnings: [
        `${POLICY_PATH} is absent (a valid, documented state): automation is off — no eligibility ` +
          `filter is declared, so nothing is selected unattended. Pass --filter to scope a run yourself.`,
      ],
    }
  }

  const markdown = fs.readFileSync(path)
  const warnings: string[] = []
  const eligibility = readEligibility(markdown, warnings)
  const stop = readStopPredicate(markdown)

  return {
    ...(eligibility !== undefined && { eligibility }),
    autoAdvance: readAutoAdvance(markdown, eligibility),
    ...(stop.predicate !== undefined && { stopPredicate: stop.predicate }),
    maxIterations: stop.maxIterations,
    maxParallelism: readMaxParallelism(markdown),
    auditLocation: readAuditLocation(markdown),
    source: POLICY_PATH,
    warnings,
  }
}

/**
 * AC9: `max_parallelism > 1` is neither honoured nor silently ignored.
 *
 * One driver process drives one card at a time — the fan-out decision stays `pair-loop`'s, and
 * concurrency comes from running several driver processes. Saying so is the requirement.
 */
export function describeParallelism(policy: AutomationPolicy): string {
  if (policy.maxParallelism <= 1) {
    return `Parallelism: 1 (policy: ${policy.maxParallelism})`
  }
  return (
    `Parallelism: policy declares max ${policy.maxParallelism}, but a single \`pair run\` process ` +
    `drives 1 card at a time — run multiple driver processes for concurrency (the batch decision ` +
    `remains pair-loop's)`
  )
}

/* ------------------------------------------------------------------ sections */

/**
 * The body of a level-2 section, as RENDERED markdown: an occurrence inside a fenced code block
 * is not a heading (the schema documents its own declarations inside fences, so a line scan that
 * ignored fences would read a documentation example as a declaration).
 */
function sectionBodies(markdown: string, heading: string): string[][] {
  const bodies: string[][] = []
  let current: string[] | undefined
  let fenced = false

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('```')) {
      fenced = !fenced
      if (current) current.push(raw)
      continue
    }
    if (!fenced && /^##\s+/.test(line)) {
      if (current) bodies.push(current)
      current = line.replace(/^##\s+/, '') === heading ? [] : undefined
      continue
    }
    if (current) current.push(raw)
  }
  if (current) bodies.push(current)
  return bodies
}

/** The section's non-empty lines, trimmed — the unit every schema rule is stated over. */
function sectionLines(markdown: string, heading: string): string[] | undefined {
  const bodies = sectionBodies(markdown, heading)
  if (bodies.length === 0) return undefined
  if (bodies.length > 1) {
    halt(`carries ${bodies.length} \`## ${heading}\` headings, but exactly one declaration is read`)
  }
  return bodies[0]!.map(line => line.trim()).filter(line => line.length > 0)
}

/* -------------------------------------------------------------- eligibility */

const MARKDOWN_BLOCK_MARKERS = ['```', '-', '*', '+', '>', '#']
const GITHUB_LABEL_CAP = 50

/**
 * `## Eligibility` — exactly one label, validated by the guideline's seven HALT triggers and
 * then passed to the skill VERBATIM. Validating is not transforming.
 */
function readEligibility(markdown: string, warnings: string[]): string | undefined {
  const lines = sectionLines(markdown, 'Eligibility')
  if (lines === undefined) {
    warnings.push(
      `${POLICY_PATH} declares no \`## Eligibility\`: automation is off (fail-safe, never widened to all cards)`,
    )
    return undefined
  }
  if (lines.length === 0) halt('`## Eligibility` is present but empty (a half-written declaration)')
  if (lines.length > 1) {
    halt(`\`## Eligibility\` carries ${lines.length} non-empty lines, but takes exactly one label`)
  }

  const value = lines[0]!
  if (value.includes(',') || /\b(AND|OR|NOT)\b/.test(value)) {
    halt(`\`## Eligibility\` declares \`${value}\`, but the declaration takes exactly one label`)
  }
  if (MARKDOWN_BLOCK_MARKERS.some(marker => value.startsWith(marker))) {
    halt(
      `\`## Eligibility\` declares \`${value}\`, which is a copied markdown wrapper, not a bare label`,
    )
  }
  if (value.length > GITHUB_LABEL_CAP) {
    halt(
      `\`## Eligibility\` declares a ${value.length}-character value, longer than the host's label cap (${GITHUB_LABEL_CAP})`,
    )
  }
  if (value.split(/\s+/).filter(token => token.includes(':')).length > 1) {
    halt(`\`## Eligibility\` declares \`${value}\`, which juxtaposes several labels on one line`)
  }
  // The guideline's SEPARATE content MUST, layered on top of the seven triggers rather than
  // widening them: this value reaches an agent prompt, so it may never be a command fragment.
  assertSafePromptText('Eligibility', value)
  return value
}

/* ------------------------------------------------------------- auto-advance */

/** Tier 1's own two checks on each declared tier: a well-formed label, and safe to inline. */
function assertTierShapes(tiers: readonly string[]): void {
  for (const tier of tiers) {
    if (!isLabelShape(tier)) {
      halt(
        `\`## Auto-Advance\` names \`${tier}\`, which is not a well-formed \`family:tier\` label`,
      )
    }
    assertSafePromptText('Auto-Advance', tier)
  }
}

/**
 * `## Auto-Advance` — a switch, never a gate list.
 *
 * Fail-closed: absent file or absent section ⇒ `(none)`, nothing merges unattended. The only
 * legal non-`(none)` value is the project's OWN `## Eligibility` tier: a card outside the
 * eligibility filter is never selected, so naming any other tier here is unreachable
 * configuration and HALTs rather than being silently ignored.
 */
function readAutoAdvance(markdown: string, eligibility: string | undefined): string {
  const lines = sectionLines(markdown, 'Auto-Advance')
  if (lines === undefined || lines.length === 0) return AUTO_ADVANCE_OFF

  const value = lines[0]!
  if (lines.length > 1) {
    halt(
      `\`## Auto-Advance\` carries ${lines.length} non-empty lines, but takes exactly one switch`,
    )
  }
  if (value === AUTO_ADVANCE_OFF) return value
  if (/\b(AND|OR|NOT)\b/.test(value)) {
    halt(`\`## Auto-Advance\` declares \`${value}\`, but the switch is a tier, not an expression`)
  }
  const tiers = value.split(',').map(tier => tier.trim())
  assertTierShapes(tiers)
  const foreign = tiers.filter(tier => tier !== eligibility)
  if (foreign.length > 0 || new Set(tiers).size !== tiers.length) {
    halt(
      `\`## Auto-Advance\` declares \`${value}\`, which is not this project's \`## Eligibility\` ` +
        `tier (${eligibility ?? 'none declared'}) — a tier outside eligibility is never selected, ` +
        `so it could never advance`,
    )
  }
  return value
}

/**
 * What the run can honestly say about merging (review round 1, finding 3).
 *
 * The DRIVER never merges — that is unconditional and structural (no merge command is
 * constructible on any path). Whether a MERGE happens at all during the run is a different
 * question, and its answer is the policy's: with a tier declared under `## Auto-Advance`, the
 * invoked skill may push and merge that tier itself. The old line claimed "the gate stays human"
 * in both cases, which was false in the second.
 */
export function describeMergePosture(policy: AutomationPolicy): string {
  if (policy.autoAdvance === AUTO_ADVANCE_OFF) {
    return (
      `Merge: the driver never merges, and \`## Auto-Advance\` is ${AUTO_ADVANCE_OFF} — ` +
      `nothing is pushed or merged unattended; every gate stays human (AC10)`
    )
  }
  return (
    `Merge: the driver never merges (AC10), but \`## Auto-Advance\` declares ` +
    `${policy.autoAdvance} — the invoked skill may push and merge that tier itself once its PR ` +
    `is review-approved and its gates are green (ADR-021 §5, quality-model §4)`
  )
}

/* ------------------------------------------------------------ stop predicate */

/**
 * `<selector> ⇒ <condition>` — the arrow is `⇒`, and ONLY `⇒`.
 *
 * The driver borrows this grammar; it does not get to widen it (AC8, BR2, D18). An earlier version
 * also accepted the ASCII `=>`, which was this module inventing schema: `automation-policy.md`
 * §Stop Predicate documents `⇒` alone, and the tier-1 workflow (`.claude/workflows/pair-loop.js`)
 * matches `⇒` alone — so the SAME adoption file ran unattended on tier 2 and HALTed on tier 1,
 * which is exactly the divergence ADR-021's "one capability, three realizations" rules out. The
 * ASCII form is now a HALT with the correct spelling in the message (round 3, Major).
 */
const SELECTOR = /^(root|tag:.+|type:.+)\s*⇒\s*(.+)$/

/** The near-miss worth naming explicitly rather than reporting as "matches neither grammar". */
const ASCII_ARROW = /^(root|tag:.+|type:.+)\s*=>\s*(.+)$/
const CONDITIONS = ['Draft', 'Ready', 'In Progress', 'Done']

/** `## Stop Predicate` — the predicate line (borrowed verbatim) plus its `max-iterations` backstop. */
function readStopPredicate(markdown: string): { predicate?: string; maxIterations: number } {
  const lines = sectionLines(markdown, 'Stop Predicate')
  if (lines === undefined || lines.length === 0) {
    return { maxIterations: FAIL_SAFE_MAX_ITERATIONS }
  }

  let predicate: string | undefined
  let maxIterations: number | undefined

  for (const line of lines) {
    const iterations = /^max-iterations:\s*(.+)$/.exec(line)
    if (iterations) {
      maxIterations = positiveInteger(iterations[1]!, '`## Stop Predicate` max-iterations')
      continue
    }
    const match = SELECTOR.exec(line)
    if (!match) {
      // Named separately from "matches neither grammar": an ASCII arrow is a spelling mistake with
      // an obvious fix, and reporting it as an unrecognised line sends the maintainer hunting.
      if (ASCII_ARROW.test(line)) {
        halt(
          `\`## Stop Predicate\` line \`${line}\` uses \`=>\`, but the documented arrow is \`⇒\` ` +
            `(U+21D2) — the same form the fan-out workflow requires, so the two realizations of the ` +
            `loop read this file identically`,
        )
      }
      halt(
        `\`## Stop Predicate\` line \`${line}\` matches neither \`<selector> ⇒ <condition>\` nor \`max-iterations: <n>\``,
      )
    }
    assertSelector(match[1]!.trim(), line)
    assertCondition(match[2]!.trim(), line)
    // The WHOLE LINE is what `readStopPredicate` returns and what reaches the prompt, so the whole
    // line is what gets content-checked (round 5, Major). Checking the selector payload alone left
    // `root ⇒ has-tag:$(whoami)` through: `/^has-tag:\S+$/` is a SHAPE rule, and `\S+` happily
    // admits a backtick, `$(` or 4000 characters. This exposure is TIER-2-ONLY — tier 1 accepts the
    // same strings but evaluates the predicate in JS and never inlines it — so no parity comparison
    // can catch it; the guard has to be applied here, directly.
    assertSafePromptText('Stop Predicate', line)
    predicate = line
  }

  return {
    ...(predicate !== undefined && { predicate }),
    maxIterations: maxIterations ?? FAIL_SAFE_MAX_ITERATIONS,
  }
}

/**
 * The selector's PAYLOAD is the part an operator writes freely (`tag:<label>`, `type:<issue-type>`),
 * so it is the part that reaches the prompt and therefore the part tier 1 content-checks
 * (`validateSelector`). `root` carries no payload. A payload that is empty, or that could become a
 * command fragment, HALTs here — before it can be rendered into an unattended agent's prompt
 * (round 4, Major).
 */
function assertSelector(selector: string, line: string): void {
  if (selector === 'root') return
  const payload = /^(?:tag|type):(.*)$/.exec(selector)?.[1] ?? ''
  if (payload.length === 0) {
    halt(
      `\`## Stop Predicate\` line \`${line}\` has an empty selector payload — \`tag:\`/\`type:\` needs a label`,
    )
  }
  assertSafePromptText('Stop Predicate', payload)
}

/**
 * A condition is a canonical macrostate and/or a `has-tag:` — never issue-body content (D18).
 *
 * `has-tag:` requires a NON-EMPTY, space-free payload, exactly as tier 1's `/^has-tag:\S+$/` does:
 * `startsWith('has-tag:')` alone accepted a bare `has-tag:` and `has-tag:a b` (round 4, minor 1).
 */
function assertCondition(condition: string, line: string): void {
  const parts = condition.split(/\s+and\s+/i).map(part => part.trim())
  const valid = parts.every(part => CONDITIONS.includes(part) || /^has-tag:\S+$/.test(part))
  if (!valid) {
    halt(
      `\`## Stop Predicate\` line \`${line}\` names \`${condition}\`, which is not a canonical macrostate (${CONDITIONS.join(', ')}) or \`has-tag:<label>\``,
    )
  }
}

/* --------------------------------------------------------- parallelism/audit */

/**
 * `## Max Parallelism` — the global ceiling, validated EXACTLY as tier 1 validates it.
 *
 * Tier 1 (`parseMaxParallelism`) converts the first line with `Number()`, so `1e3` is 1000 and
 * `0x10` is 16 there. Round 4 made this field decimal-only here, which left the driver STRICTER
 * than its schema owner — round 3's divergence mirrored (round 5, minor 2). `max-iterations` keeps
 * the strict form because tier 1 IS strict there; the two fields differ deliberately.
 *
 * Per-tier overrides are VALIDATED even though the driver never applies one (it caps itself at 1
 * per process, AC9): tier 1 HALTs on a malformed override, so silently ignoring it here would make
 * the same file mean two different things again.
 */
function readMaxParallelism(markdown: string): number {
  const lines = sectionLines(markdown, 'Max Parallelism')
  if (lines === undefined || lines.length === 0) return FAIL_SAFE_MAX_PARALLELISM
  const global = numericPositiveInteger(lines[0]!, '`## Max Parallelism` first line')
  for (const line of lines.slice(1)) assertParallelismOverride(line)
  return global
}

/** `<tier>: <positive integer>` — tier 1's own three checks, in its own order. */
function assertParallelismOverride(line: string): void {
  const match = /^(.+?):\s*(-?\d+)\s*$/.exec(line)
  if (!match) {
    halt(`\`## Max Parallelism\` override line \`${line}\` is not \`<tier>: <positive integer>\``)
  }
  const tier = match[1]!.trim()
  if (!isLabelShape(tier)) {
    halt(
      `\`## Max Parallelism\` override key \`${tier}\` is not a well-formed \`family:tier\` label`,
    )
  }
  numericPositiveInteger(match[2]!, `\`## Max Parallelism\` override for \`${tier}\``)
}

function readAuditLocation(markdown: string): string {
  const lines = sectionLines(markdown, 'Audit Location')
  if (lines === undefined || lines.length === 0) return DEFAULT_AUDIT_LOCATION
  // Tier 1's own four checks, in its own order (round 5, minor 1): exactly one line, no absolute
  // path, no segment that escapes the working area, and safe to inline.
  if (lines.length > 1) {
    halt(`\`## Audit Location\` declares ${lines.length} lines, but takes exactly one path`)
  }
  const value = lines[0]!
  if (value.startsWith('/') || /^[a-zA-Z]:[/\\]/.test(value)) {
    halt(
      `\`## Audit Location\` declares the absolute path \`${value}\`; it must be project-relative`,
    )
  }
  if (value.split('/').some(segment => segment === '..')) {
    halt(
      `\`## Audit Location\` declares \`${value}\`, where a path segment escapes the working area; ` +
        `it must stay project-relative`,
    )
  }
  // The path is reported in the run's output and travels with the invocation, so it gets the same
  // content check as every other borrowed value (round 4, Major).
  assertSafePromptText('Audit Location', value)
  return value
}

/**
 * A positive integer as tier 1 reads `## Max Parallelism`: `Number()`, then integer + positive.
 *
 * Deliberately LENIENT — `1e3` is 1000 and `0x10` is 16 here, because that is what tier 1 does with
 * this field. Kept as its own helper next to the strict one so the asymmetry is visible: the two
 * fields are validated differently BY THE SCHEMA OWNER, and matching that is the whole point
 * (round 5, minor 2). Neither helper may be "unified" with the other without changing what a policy
 * file means on one of the two tiers.
 */
function numericPositiveInteger(raw: string, what: string): number {
  const text = raw.trim()
  const value = Number(text)
  if (!Number.isInteger(value) || value <= 0) {
    halt(`${what} declares \`${text}\`, which is not a positive integer`)
  }
  return value
}

/**
 * A positive integer in the strict form tier 1 requires for `max-iterations`: decimal digits only.
 *
 * `Number()` alone was far too permissive for THIS field — it read `1e3` as 1000, `0x10` as 16 and
 * `2.0` as 2, each of which tier 1's `/^max-iterations:\s*(-?\d+)\s*$/` rejects outright, so the
 * same file meant different things to the two realizations (round 4, minor 1).
 */
function positiveInteger(raw: string, what: string): number {
  const text = raw.trim()
  if (!/^-?\d+$/.test(text)) {
    halt(`${what} declares \`${text}\`, which is not a positive integer (decimal digits only)`)
  }
  const value = Number(text)
  if (!Number.isInteger(value) || value <= 0) {
    halt(`${what} declares \`${text}\`, which is not a positive integer`)
  }
  return value
}
