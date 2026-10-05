#!/usr/bin/env node
// cycle-prepare.mjs — the autonomous PREPARE phase's decision and writers (US-523). A SCRIPT, never an
// agent: the rule that says whether a Draft card is prepared by a human, by the agent alone, or not at
// all lives here, once, and every entry (the in-session cycle skill, `pair-cli run --card`, the loop,
// the batch) reaches it through the same commands — the pattern of `cycle-merge.mjs`.
//
// "prepare" here is the PHASE (refinement + task breakdown) run BEFORE the cycle state machine, not the
// cycle's own `prepare` step (red-spec): audit/stage names are `prepare:refine` / `prepare:plan`.
// Boundaries: B0 before refinement, B1 after refinement (classification tags written), B2 after the
// task breakdown. A `refined-no-breakdown` card enters at B1. The gate grammar, parse and any-of
// has/lacks evaluation are #521's (`autonomy-policy.mjs`) — never re-implemented here.
//
// CLI (one JSON object on stdout; exit 0 = a result, 2 = usage error / fail-closed input):
//   decide   --gate '<JSON {mode,has,lacks}>' --readiness <draft|refined-no-breakdown|ready>
//            --attended <true|false> --boundary <B0|B1|B2> [--labels '<JSON array>'] [--source <s>]
//   escalate --dir <run dir> --story <n> --boundary <B0|B1|B2> --gate '<JSON>' --source <s>
//            (--conditions '<JSON array>' | --openQuestion <text>) [--assumptionsFile <path>] [--repo <o/n>]
//   complete --dir <run dir> --story <n> --gate '<JSON>' --source <s> [--state <board Ready state>] [--repo <o/n>]
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseGate, escalationConditions, gateToString, GATE_MODES } from './autonomy-policy.mjs'

export const ROUTES = ['run-interactive', 'run-autonomous', 'skip-needs-human', 'skip-escalated', 'escalate', 'nothing-to-prepare']
export const BOUNDARIES = ['B0', 'B1', 'B2']
export const READINESS = ['draft', 'refined-no-breakdown', 'ready']
export const NEEDS_REVIEW = 'needs-review'
export const ESCALATION_MARKER = story => `<!-- pair:prepare-escalation #${story} -->`
export const PROVENANCE_RE = /Prepared autonomously under prepare: .+ \(.+\)/
const ASSUMPTIONS_HEADING_RE = /^##\s+Assumptions\s*$/m

// ── the decision — pure, no I/O ─────────────────────────────────────────────────────────────
// Fail closed: a gate, readiness, boundary or `attended` that is not one of its values throws — never a route.
// `labels` unreadable (not an array) under a `when` gate escalates, as #521's `decide` does for the merge gate.
export function decide({ gate, labels, readiness, attended, boundary, source } = {}) {
  if (!gate || !GATE_MODES.includes(gate.mode)) throw new Error(`gate must be a prepare gate {mode, has, lacks}, got ${JSON.stringify(gate ?? null)}`)
  if (gate.mode === 'when' && (!Array.isArray(gate.has) || !Array.isArray(gate.lacks))) throw new Error('a `when` gate needs has and lacks arrays')
  if (!READINESS.includes(readiness)) throw new Error(`readiness must be ${READINESS.join(' | ')}, got ${JSON.stringify(readiness ?? null)}`)
  if (!BOUNDARIES.includes(boundary)) throw new Error(`boundary must be ${BOUNDARIES.join(' | ')}, got ${JSON.stringify(boundary ?? null)}`)
  if (typeof attended !== 'boolean') throw new Error(`attended must be a boolean, got ${JSON.stringify(attended ?? null)}`)
  const base = { boundary, gate: gateToString(gate), ...(source !== undefined ? { source } : {}) }
  if (readiness === 'ready') return { route: 'nothing-to-prepare', ...base }
  // a card a human has not looked at since an escalation is never re-picked unattended.
  if (!attended && Array.isArray(labels) && labels.includes(NEEDS_REVIEW)) return { route: 'skip-escalated', condition: `has:${NEEDS_REVIEW}`, ...base }
  if (gate.mode === 'always') return { route: attended ? 'run-interactive' : 'skip-needs-human', ...base }
  if (gate.mode === 'never') return { route: 'run-autonomous', ...base }
  if (!Array.isArray(labels)) return { route: 'escalate', conditions: ['labels-unreadable'], condition: 'labels-unreadable', ...base }
  const conditions = escalationConditions(gate, labels)
  return conditions.length ? { route: 'escalate', conditions, condition: conditions.join(', '), ...base } : { route: 'run-autonomous', ...base }
}

// ── live reads, through the bound adapters ──────────────────────────────────────────────────
function readLabels({ pm, story, repo }) {
  try {
    return (pm.readCard(story, { repo, fields: ['labels'] })?.labels ?? []).map(l => String(l?.name ?? l))
  } catch {
    return null
  }
}

// ── the escalation writer ───────────────────────────────────────────────────────────────────
// Adds `needs-review` (created on first use), upserts ONE marker-keyed comment, writes NO board state.
// Each write is reported on its own: a refused label never suppresses the comment, a failed comment
// never changes the outcome — the card stays Draft and the status is `escalated`.
export function escalationBody({ story, boundary, gate, source, conditions, openQuestion, assumptions }) {
  return [
    ESCALATION_MARKER(story),
    `Autonomous preparation **escalated** at boundary \`${boundary}\` — a human decides; the card stays Draft.`,
    '',
    ...(conditions?.length ? ['Condition(s):', ...conditions.map(c => `- \`${c}\``)] : []),
    ...(openQuestion ? ['Open question (a product decision only a human can make):', `- ${openQuestion}`] : []),
    '',
    `Effective gate: \`prepare: ${gate}\` (source: ${source}).`,
    '',
    'Assumptions recorded so far:',
    assumptions?.trim() ? assumptions.trim() : '(none recorded)',
    '',
    `Whatever refinement already wrote stays in the card body for review. Remove the \`${NEEDS_REVIEW}\` label (or refine the card attended) to make it workable again.`,
  ].join('\n')
}

export function escalate({ hosts, story, repo, boundary, gate, source, conditions, openQuestion, assumptions }) {
  const guard = fn => {
    try {
      return fn()
    } catch (e) {
      return { error: e?.message ?? String(e) }
    }
  }
  const label = guard(() => hosts.pm.labelCard({ id: story, label: NEEDS_REVIEW, repo }))
  const labelOk = label?.confirmed === true
  const post = guard(() => hosts.pm.commentOnCard({ id: story, marker: ESCALATION_MARKER(story), body: escalationBody({ story, boundary, gate: typeof gate === 'string' ? gate : gateToString(gate), source, conditions, openQuestion, assumptions }), repo }))
  return {
    outcome: 'escalated',
    boundary,
    label: { applied: labelOk, ...(labelOk ? {} : { error: label?.error ?? 'label write not confirmed' }) },
    comment: { posted: !post?.error, ...(post?.error ? { error: post.error } : {}) },
  }
}

// ── the completion writer ───────────────────────────────────────────────────────────────────
// Ready is written ONCE, here, after B2. Immediately before writing it re-reads the labels and
// re-runs `decide(B2)` (a race with a human or a tag change escalates instead), and verifies the body
// carries the autonomous-provenance evidence: a non-empty `## Assumptions` section and the Notes
// provenance line. Anything missing ⇒ no Ready (fail closed).
export function assumptionsSection(body) {
  const m = ASSUMPTIONS_HEADING_RE.exec(String(body ?? ''))
  if (!m) return null
  const rest = String(body).slice(m.index + m[0].length)
  const next = /^##\s/m.exec(rest)
  return (next ? rest.slice(0, next.index) : rest).trim()
}

export function complete({ hosts, story, repo, gate, source, state = 'Ready' }) {
  const labels = readLabels({ pm: hosts.pm, story, repo })
  let d
  try {
    d = decide({ gate, labels: labels ?? undefined, readiness: 'refined-no-breakdown', attended: false, boundary: 'B2', source })
  } catch (e) {
    return { completed: false, reason: `invalid-input: ${e.message}` }
  }
  if (d.route === 'escalate' || d.route === 'skip-escalated') {
    const conditions = d.conditions ?? [d.condition]
    return { completed: false, reason: 'escalated-at-B2', route: d.route, conditions, escalation: escalate({ hosts, story, repo, boundary: 'B2', gate: gateToString(gate), source, conditions }) }
  }
  if (d.route !== 'run-autonomous') return { completed: false, reason: `route-${d.route}`, route: d.route }
  let body
  try {
    body = String(hosts.pm.readCard(story, { repo }).body ?? '')
  } catch (e) {
    return { completed: false, reason: `card-unreadable: ${e.message}` }
  }
  const section = assumptionsSection(body)
  if (!section) return { completed: false, reason: 'assumptions-missing: the body has no non-empty `## Assumptions` section' }
  if (!PROVENANCE_RE.test(body)) return { completed: false, reason: 'provenance-missing: the body has no `Prepared autonomously under prepare: <value> (<source>)` Notes line' }
  const board = hosts.pm.setBoardState({ id: story, state, repo })
  if (board?.confirmed !== true) return { completed: false, reason: `board-not-confirmed: ${board?.error ?? 'state write not confirmed'}`, board }
  return { completed: true, state, board }
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────
const FLAGS = {
  decide: ['gate', 'labels', 'readiness', 'attended', 'boundary', 'source'],
  escalate: ['dir', 'story', 'boundary', 'gate', 'source', 'conditions', 'openQuestion', 'assumptionsFile', 'repo'],
  complete: ['dir', 'story', 'gate', 'source', 'state', 'repo'],
}
const gateOf = raw => {
  let g
  try {
    g = JSON.parse(raw)
  } catch {
    throw new Error('--gate must be a JSON gate object {mode, has, lacks}')
  }
  const text = g && typeof g === 'object' ? `${g.mode}${g.has?.length ? `; has: ${g.has.join(',')}` : ''}${g.lacks?.length ? `; lacks: ${g.lacks.join(',')}` : ''}` : ''
  const parsed = parseGate('prepare', text)
  if (parsed.errors) throw new Error(`--gate is invalid: ${parsed.errors.map(e => `${e.key} ${e.reason}`).join('; ')}`)
  return parsed.value
}

export function parseArgs(argv) {
  const [cmd, ...rest] = argv
  if (!FLAGS[cmd]) throw new Error(`unknown command: ${cmd} (expected decide | escalate | complete)`)
  const opts = {}
  for (let i = 0; i < rest.length; i += 2) {
    if (!rest[i]?.startsWith('--') || rest[i + 1] === undefined) throw new Error(`bad argument: ${rest[i]}`)
    opts[rest[i].slice(2)] = rest[i + 1]
  }
  const unknown = Object.keys(opts).filter(k => !FLAGS[cmd].includes(k))
  if (unknown.length) throw new Error(`unknown flag(s) for ${cmd}: ${unknown.map(k => `--${k}`).join(', ')}`)
  const need = (...ks) => {
    for (const k of ks) if (opts[k] === undefined) throw new Error(`--${k} is required`)
  }
  need('gate')
  const out = { cmd, opts: { ...opts, gate: gateOf(opts.gate) } }
  if (opts.repo !== undefined && !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(opts.repo)) throw new Error('--repo must be owner/name')
  if (cmd === 'decide') {
    need('readiness', 'attended', 'boundary')
    if (!['true', 'false'].includes(opts.attended)) throw new Error('--attended must be true | false')
    out.opts.attended = opts.attended === 'true'
    if (opts.labels !== undefined) {
      let labels
      try {
        labels = JSON.parse(opts.labels)
      } catch {
        throw new Error('--labels must be a JSON array of labels')
      }
      if (!Array.isArray(labels) || labels.some(l => typeof l !== 'string')) throw new Error('--labels must be a JSON array of labels')
      out.opts.labels = labels
    }
    return out
  }
  need('dir', 'story')
  if (!/^\d+$/.test(opts.story)) throw new Error(`--story must be a number, got ${JSON.stringify(opts.story)}`)
  out.opts.story = Number(opts.story)
  need('source')
  if (cmd === 'escalate') {
    need('boundary')
    if (!BOUNDARIES.includes(opts.boundary)) throw new Error(`--boundary must be ${BOUNDARIES.join(' | ')}`)
    if ((opts.conditions === undefined) === (opts.openQuestion === undefined)) throw new Error('exactly one of --conditions or --openQuestion is required')
    if (opts.conditions !== undefined) {
      let c
      try {
        c = JSON.parse(opts.conditions)
      } catch {
        throw new Error('--conditions must be a JSON array of conditions')
      }
      if (!Array.isArray(c) || !c.length || c.some(x => typeof x !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:_./-]*$/.test(x))) throw new Error('--conditions must be a non-empty JSON array of label-shaped conditions')
      out.opts.conditions = c
    }
  }
  return out
}

const isMain = () => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}
if (isMain()) {
  try {
    const { cmd, opts } = parseArgs(process.argv.slice(2))
    if (cmd === 'decide') {
      process.stdout.write(JSON.stringify(decide({ gate: opts.gate, labels: opts.labels, readiness: opts.readiness, attended: opts.attended, boundary: opts.boundary, source: opts.source })) + '\n')
      process.exit(0)
    }
    const HOSTS = await import('./host/index.mjs')
    const hosts = HOSTS.bindHosts({ dir: opts.dir })
    const out =
      cmd === 'escalate'
        ? escalate({ hosts, story: opts.story, repo: opts.repo, boundary: opts.boundary, gate: gateToString(opts.gate), source: opts.source, conditions: opts.conditions, openQuestion: opts.openQuestion, assumptions: opts.assumptionsFile && existsSync(opts.assumptionsFile) ? readFileSync(opts.assumptionsFile, 'utf8') : '' })
        : complete({ hosts, story: opts.story, repo: opts.repo, gate: opts.gate, source: opts.source, ...(opts.state ? { state: opts.state } : {}) })
    process.stdout.write(JSON.stringify(out) + '\n')
    process.exit(0)
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e.message }) + '\n')
    process.exit(2)
  }
}
