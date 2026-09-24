#!/usr/bin/env node
// `## Blocking Severities` — the in-session reader, r1-3.
//
// This is a DELIBERATE port of `apps/pair-cli/src/commands/run/blocking-severities.ts` (US-514
// T-1) into a dependency-free script the cycle SKILL calls directly, instead of an agent
// hand-parsing the section itself in-session: two readers of one schema, kept honest by a parity
// test (`cycle-defaults-parity.test.ts`) that feeds the SAME fixtures to both and asserts equal
// output — including the KB default when the section (or the file) is absent. Change the grammar
// here AND there, together; the parity test is what catches a drift, not memory.
//
// CLI:
//   node blocking-severities.mjs read <automation.md path>   → the policy as JSON, or a HALT (exit 1)
//   node blocking-severities.mjs read-text <markdown string> → same, reading the markdown from argv
//
// Exported for the parity test to call directly (no subprocess needed there).
import { readFileSync, existsSync } from 'node:fs'

export const POLICY_PATH = '.pair/adoption/tech/automation.md'
export const DEFAULT_BLOCKING_FLOOR = 'Minor'
const VALID_SEVERITIES = new Set(['Critical', 'Major', 'Minor'])
const VALID_MODES = new Set(['warn', 'block'])

export function policyHalt(detail) {
  throw new Error(`${POLICY_PATH} — ${detail}. Fix the adoption file, then re-run.`)
}

// A DELIBERATE duplicate of `policy-sections.ts`'s `sectionBodies`/`sectionLines` — the fence/HTML
// comment-blind extraction every `tech/automation.md` reader shares. Parity, not import, because
// this script ships beside the skill with no build step and no cross-package import.
function sectionBodies(markdown, heading) {
  const bodies = []
  let current
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

function sectionLines(markdown, heading) {
  const bodies = sectionBodies(markdown, heading)
  if (bodies.length === 0) return undefined
  if (bodies.length > 1) {
    policyHalt(`carries ${bodies.length} \`## ${heading}\` headings, but exactly one declaration is read`)
  }
  return bodies[0].map(line => line.trim()).filter(line => line.length > 0)
}

function readFloor(first) {
  const trimmed = first.trim()
  if (trimmed.length === 0) policyHalt('`## Blocking Severities` declares an empty floor')
  if (trimmed.includes(',')) {
    policyHalt(`\`## Blocking Severities\` declares a severity LIST (\`${trimmed}\`), not a floor — one severity only, the same rule as \`severityFloor\` / \`--severity-floor\``)
  }
  if (!VALID_SEVERITIES.has(trimmed)) {
    policyHalt(`\`## Blocking Severities\` names an unknown severity \`${trimmed}\` — expected one of Critical | Major | Minor`)
  }
  return trimmed
}

function readMaxDispatches(rest) {
  if (rest.length === 0) return undefined
  if (rest.length > 1) policyHalt('`## Blocking Severities` carries more than one `max-dispatches` line')
  const line = rest[0]
  const match = /^max-dispatches:\s*(-?\d+)(?:\s+(\S+))?\s*$/.exec(line)
  if (!match) policyHalt(`\`## Blocking Severities\` line \`${line}\` is not \`max-dispatches: <positive integer> [warn|block]\``)
  const n = Number(match[1])
  if (!Number.isInteger(n) || n <= 0) {
    policyHalt(`\`## Blocking Severities\` \`max-dispatches\` must be a positive integer, got \`${match[1]}\``)
  }
  const modeToken = match[2]
  if (modeToken !== undefined && !VALID_MODES.has(modeToken)) {
    policyHalt(`\`## Blocking Severities\` \`max-dispatches\` mode must be warn | block, got \`${modeToken}\``)
  }
  return { n, mode: modeToken ?? 'warn' }
}

/** Pure: markdown text → the policy. Throws on a malformed declaration (never a silent default). */
export function readBlockingSeverities(markdown) {
  const lines = sectionLines(markdown, 'Blocking Severities')
  if (lines === undefined) return { blockingFloor: DEFAULT_BLOCKING_FLOOR }
  if (lines.length === 0) policyHalt('`## Blocking Severities` is present but declares no floor')
  const blockingFloor = readFloor(lines[0])
  const maxDispatches = readMaxDispatches(lines.slice(1))
  return { blockingFloor, ...(maxDispatches !== undefined && { maxDispatches }) }
}

/** Absent file ⇒ the same KB default as an absent section (`.pair/adoption/` is optional, D21). */
export function resolveBlockingSeverities(path) {
  if (!existsSync(path)) return { blockingFloor: DEFAULT_BLOCKING_FLOOR }
  return readBlockingSeverities(readFileSync(path, 'utf8'))
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────
const [, , cmd, arg] = process.argv
if (cmd === 'read') {
  try {
    process.stdout.write(JSON.stringify(resolveBlockingSeverities(arg)) + '\n')
    process.exit(0)
  } catch (e) {
    process.stdout.write(JSON.stringify({ halt: String(e.message ?? e) }) + '\n')
    process.exit(1)
  }
} else if (cmd === 'read-text') {
  try {
    process.stdout.write(JSON.stringify(readBlockingSeverities(arg ?? '')) + '\n')
    process.exit(0)
  } catch (e) {
    process.stdout.write(JSON.stringify({ halt: String(e.message ?? e) }) + '\n')
    process.exit(1)
  }
} else if (cmd !== undefined) {
  process.stderr.write(`usage: blocking-severities.mjs read <file> | read-text <markdown>\n`)
  process.exit(2)
}
