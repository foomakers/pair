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
  return value
}

/* ------------------------------------------------------------- auto-advance */

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

const SELECTOR = /^(root|tag:.+|type:.+)\s*(⇒|=>)\s*(.+)$/
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
      halt(
        `\`## Stop Predicate\` line \`${line}\` matches neither \`<selector> ⇒ <condition>\` nor \`max-iterations: <n>\``,
      )
    }
    assertCondition(match[3]!.trim(), line)
    predicate = line
  }

  return {
    ...(predicate !== undefined && { predicate }),
    maxIterations: maxIterations ?? FAIL_SAFE_MAX_ITERATIONS,
  }
}

/** A condition is a canonical macrostate and/or a `has-tag:` — never issue-body content (D18). */
function assertCondition(condition: string, line: string): void {
  const parts = condition.split(/\s+and\s+/i).map(part => part.trim())
  const valid = parts.every(part => CONDITIONS.includes(part) || part.startsWith('has-tag:'))
  if (!valid) {
    halt(
      `\`## Stop Predicate\` line \`${line}\` names \`${condition}\`, which is not a canonical macrostate (${CONDITIONS.join(', ')}) or \`has-tag:<label>\``,
    )
  }
}

/* --------------------------------------------------------- parallelism/audit */

function readMaxParallelism(markdown: string): number {
  const lines = sectionLines(markdown, 'Max Parallelism')
  if (lines === undefined || lines.length === 0) return FAIL_SAFE_MAX_PARALLELISM
  // Per-tier overrides (`risk:green: 5`) are the loop's business, not the driver's: a single
  // driver process is capped at 1 either way (AC9), so only the global ceiling is read.
  return positiveInteger(lines[0]!, '`## Max Parallelism`')
}

function readAuditLocation(markdown: string): string {
  const lines = sectionLines(markdown, 'Audit Location')
  if (lines === undefined || lines.length === 0) return DEFAULT_AUDIT_LOCATION
  const value = lines[0]!
  if (value.startsWith('/') || /^[a-zA-Z]:[/\\]/.test(value)) {
    halt(
      `\`## Audit Location\` declares the absolute path \`${value}\`; it must be project-relative`,
    )
  }
  return value
}

function positiveInteger(raw: string, what: string): number {
  const value = Number(raw.trim())
  if (!Number.isInteger(value) || value <= 0) {
    halt(`${what} declares \`${raw.trim()}\`, which is not a positive integer`)
  }
  return value
}
