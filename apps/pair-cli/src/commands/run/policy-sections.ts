/**
 * The reading primitives every `tech/automation.md` section shares (US-217 T-1).
 *
 * Extracted from `automation-policy.ts` when `## Workflows` became the seventh section of the same
 * file: two readers of one file that each carried their own "what is a section, and what is a HALT
 * message" would be two answers to a question the schema asks once
 * (`.pair/knowledge/guidelines/collaboration/automation/automation-policy.md`). Nothing here decides
 * what a section MEANS — that stays with the reader that owns the section.
 */

import { isSafePromptText, promptSafetyFailure } from './prompt-safety'

export const POLICY_PATH = '.pair/adoption/tech/automation.md'

/** A HALT on the policy read: the message names the file and the offending value. */
export function policyHalt(detail: string): never {
  throw new Error(`${POLICY_PATH} — ${detail}. Fix the adoption file, then re-run.`)
}

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
export function sectionLines(markdown: string, heading: string): string[] | undefined {
  const bodies = sectionBodies(markdown, heading)
  if (bodies.length === 0) return undefined
  if (bodies.length > 1) {
    policyHalt(
      `carries ${bodies.length} \`## ${heading}\` headings, but exactly one declaration is read`,
    )
  }
  return bodies[0]!.map(line => line.trim()).filter(line => line.length > 0)
}

// The schema's list, plus a leading SINGLE backtick: an inline-code paste is the same copied-wrapper
// mistake as a fence, and tier 1 already rejected it (US-451 round 7, minor 1).
const MARKDOWN_BLOCK_MARKERS = ['`', '-', '*', '+', '>', '#']
const GITHUB_LABEL_CAP = 50

/**
 * The shape rules a value must satisfy to BE a label on the host — applied identically wherever the
 * schema puts a label (`## Eligibility`'s single value, and each routing key of `## Workflows`).
 *
 * ONE implementation, because the guideline states them once: two copies would let the same string
 * be a valid eligibility filter and an invalid routing key (or the reverse) with nothing comparing
 * the two. `source` is the section that declared it, so every message stays adoption-fix actionable.
 */
export function assertLabelValue(source: string, value: string): void {
  // A STANDALONE token, as the schema says and tier 1 matches — `\b` made `area:OR-tools` a HALT,
  // rejecting a legitimate label (US-451 round 7, minor 1).
  if (value.includes(',') || /(^|\s)(AND|OR|NOT)(\s|$)/.test(value)) {
    policyHalt(`${source} declares \`${value}\`, but the declaration takes exactly one label`)
  }
  if (MARKDOWN_BLOCK_MARKERS.some(marker => value.startsWith(marker))) {
    policyHalt(
      `${source} declares \`${value}\`, which is a copied markdown wrapper, not a bare label`,
    )
  }
  if (value.length > GITHUB_LABEL_CAP) {
    policyHalt(
      `${source} declares a ${value.length}-character value, longer than the host's label cap (${GITHUB_LABEL_CAP})`,
    )
  }
  if (value.split(/\s+/).filter(token => token.includes(':')).length > 1) {
    policyHalt(`${source} declares \`${value}\`, which juxtaposes several labels on one line`)
  }
  // The guideline's SEPARATE content MUST, layered on top of the shape triggers rather than widening
  // them: this value reaches an agent prompt, so it may never be a command fragment.
  if (!isSafePromptText(value)) policyHalt(promptSafetyFailure(source, value))
}
