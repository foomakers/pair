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
//            --attended <true|false> --boundary <B0|B1|B2> [--labels '<JSON array>' | --dir <run dir> --story <n> [--repo <o/n>]] [--source <s>]
//            (--story reads the card's CURRENT labels itself: an agent never interpolates host data into a shell line)
//   escalate --dir <run dir> --story <n> --boundary <B0|B1|B2> --gate '<JSON>' --source <s>
//            (--conditions '<JSON array>' | --openQuestion <text> | --openQuestionFromCard true) [--assumptionsFile <path>] [--repo <o/n>]
//   complete --dir <run dir> --story <n> --gate '<JSON>' --source <s> [--state <board Ready state>] [--attended <true|false>]
//            [--refinedAutonomously <true|false>] [--repo <o/n>]
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseGate, escalationConditions, gateToString, conditionError, GATE_MODES } from './autonomy-policy.mjs'
import { assertRunOwnsStory } from './run-guard.mjs'

export const ROUTES = ['run-interactive', 'run-autonomous', 'skip-needs-human', 'skip-escalated', 'escalate', 'nothing-to-prepare']
export const BOUNDARIES = ['B0', 'B1', 'B2']
export const READINESS = ['draft', 'refined-no-breakdown', 'ready']
export const NEEDS_REVIEW = 'needs-review'
export const ESCALATION_MARKER = story => `<!-- pair:prepare-escalation #${story} -->`
export const PROVENANCE_RE = /Prepared autonomously under prepare: .+ \(.+\)/
const BREAKDOWN_HEADING_RE = /^##\s+Task Breakdown\s*$/m
const CHECKLIST_ITEM_RE = /^\s*[-*]\s+\[[ xX]\]\s+\S/m
// A condition is a gate's own output (`has:<label>`, `lacks:<label>`, `labels-unreadable`): it is checked with the shared
// `conditionError` grammar (autonomy-policy.mjs) — every label the gate accepts, spaces included, nothing that could become a
// shell fragment. It travels as JSON argv, never through a shell.
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
  // `needs-review` = a human has not looked at this card since an escalation: never re-picked unattended, whatever its
  // readiness (the loop skips it the same way). An attended run, or `complete` with `attended: true`, clears it.
  if (!attended && Array.isArray(labels) && labels.includes(NEEDS_REVIEW)) return { route: 'skip-escalated', condition: `has:${NEEDS_REVIEW}`, ...base }
  if (readiness === 'ready') return { route: 'nothing-to-prepare', ...base }
  if (gate.mode === 'always') return { route: attended ? 'run-interactive' : 'skip-needs-human', ...base }
  if (gate.mode === 'never') return { route: 'run-autonomous', ...base }
  if (!Array.isArray(labels)) return { route: 'escalate', conditions: ['labels-unreadable'], condition: 'labels-unreadable', ...base }
  const conditions = escalationConditions(gate, labels)
  return conditions.length ? { route: 'escalate', conditions, condition: conditions.join(', '), ...base } : { route: 'run-autonomous', ...base }
}

// ── open questions ──────────────────────────────────────────────────────────────────────────
// `## Open Questions` lists what only a human can decide; an entry is ANSWERED when its list marker is a ticked
// checkbox (`- [x]`, the answer going under `## Assumptions`) or when the WHOLE entry is `none` (case-insensitive, optional trailing period — `- None of the tiers fit…?` is a question). Anything else is open and
// escalates; a continuation line (indented) belongs to the entry above it. (Mirrored by pair-cli's card-prepare.ts.)
const ANSWERED_ENTRY_RE = /^\s*(?:[-*]\s+\[[xX]\]|(?:[-*]\s*)?none\s*\.?\s*$)/i
export function openQuestionOf(body) {
  const m = /^##\s+Open Questions\s*$/m.exec(String(body ?? ''))
  if (!m) return undefined
  const rest = String(body).slice(m.index + m[0].length)
  const next = /^##\s/m.exec(rest)
  const entries = []
  for (const line of (next ? rest.slice(0, next.index) : rest).split('\n')) {
    if (!line.trim()) continue
    if (/^\s+\S/.test(line) && entries.length) entries[entries.length - 1] += ` ${line.trim()}`
    else entries.push(line.trim())
  }
  const open = entries.filter(e => !ANSWERED_ENTRY_RE.test(e))
  return open.length ? open.join(' ').slice(0, 500) : undefined
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
    `Whatever refinement already wrote stays in the card body for review. ${openQuestion ? `Answer the entries under \`## Open Questions\` in the card body (tick an answered one \`- [x]\` and record the answer under \`## Assumptions\`; an unanswered question escalates again), then remove the \`${NEEDS_REVIEW}\` label` : `Remove the \`${NEEDS_REVIEW}\` label`} (or run the card attended through the prepare gate: an attended completion clears it) to make it workable again.`,
  ].join('\n')
}

export function escalate({ hosts, story, repo, boundary, gate, source, conditions, openQuestion, openQuestionFromCard, assumptions }) {
  if (openQuestionFromCard === true) {
    const found = openQuestionOf(String(hosts.pm.readCard(story, { repo }).body ?? ''))
    if (found === undefined) throw new Error('no open question on the card: `## Open Questions` is absent, empty or fully answered')
    openQuestion = found
  }
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

export function hasTaskBreakdown(body) {
  const m = BREAKDOWN_HEADING_RE.exec(String(body ?? ''))
  if (!m) return false
  const rest = String(body).slice(m.index + m[0].length)
  const next = /^##\s/m.exec(rest)
  return CHECKLIST_ITEM_RE.test(next ? rest.slice(0, next.index) : rest)
}

function clearNeedsReview(hosts, story, repo) {
  try {
    const r = hosts.pm.unlabelCard({ id: story, label: NEEDS_REVIEW, repo })
    return { cleared: r?.confirmed === true, ...(r?.confirmed === true ? {} : { error: r?.error ?? 'label removal not confirmed' }) }
  } catch (e) {
    return { cleared: false, error: e?.message ?? String(e) }
  }
}

export function complete({ hosts, story, repo, gate, source, state = 'Ready', attended = false, refinedAutonomously = true }) {
  const labels = readLabels({ pm: hosts.pm, story, repo })
  let d
  try {
    d = decide({ gate, labels: labels ?? undefined, readiness: 'refined-no-breakdown', attended: attended === true, boundary: 'B2', source })
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
  if (!hasTaskBreakdown(body)) return { completed: false, reason: 'breakdown-missing: the body has no `## Task Breakdown` section with at least one checklist item' }
  // The autonomous-provenance evidence is owed only by a refinement the agent ran in THIS prepare: a card a human refined
  // (it enters at B1) has no `## Assumptions` to show — and nothing autonomous to disclose.
  if (refinedAutonomously !== false) {
    const section = assumptionsSection(body)
    if (!section) return { completed: false, reason: 'assumptions-missing: the body has no non-empty `## Assumptions` section' }
    if (!PROVENANCE_RE.test(body)) return { completed: false, reason: 'provenance-missing: the body has no `Prepared autonomously under prepare: <value> (<source>)` Notes line' }
  }
  const board = hosts.pm.setBoardState({ id: story, state, repo })
  if (board?.confirmed !== true) return { completed: false, reason: `board-not-confirmed: ${board?.error ?? 'state write not confirmed'}`, board }
  // An attended completion IS the human look the label waits for: it clears `needs-review` (reported, never fatal).
  const cleared = attended === true && labels?.includes(NEEDS_REVIEW) ? clearNeedsReview(hosts, story, repo) : undefined
  return { completed: true, state, board, ...(cleared ? { needsReview: cleared } : {}) }
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────
const FLAGS = {
  decide: ['gate', 'labels', 'readiness', 'attended', 'boundary', 'source', 'dir', 'story', 'repo'],
  escalate: ['dir', 'story', 'boundary', 'gate', 'source', 'conditions', 'openQuestion', 'openQuestionFromCard', 'assumptionsFile', 'repo'],
  complete: ['dir', 'story', 'gate', 'source', 'state', 'attended', 'refinedAutonomously', 'repo'],
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
    if (opts.story !== undefined) {
      if (opts.labels !== undefined) throw new Error('--labels and --story are mutually exclusive')
      if (!/^\d+$/.test(opts.story)) throw new Error(`--story must be a number, got ${JSON.stringify(opts.story)}`)
      if (opts.dir === undefined) throw new Error('--dir is required with --story')
      out.opts.story = Number(opts.story)
    }
    return out
  }
  if (cmd === 'complete' && opts.attended !== undefined) {
    if (!['true', 'false'].includes(opts.attended)) throw new Error('--attended must be true | false')
    out.opts.attended = opts.attended === 'true'
  }
  if (cmd === 'complete' && opts.refinedAutonomously !== undefined) {
    if (!['true', 'false'].includes(opts.refinedAutonomously)) throw new Error('--refinedAutonomously must be true | false')
    out.opts.refinedAutonomously = opts.refinedAutonomously === 'true'
  }
  need('dir', 'story')
  if (!/^\d+$/.test(opts.story)) throw new Error(`--story must be a number, got ${JSON.stringify(opts.story)}`)
  out.opts.story = Number(opts.story)
  need('source')
  if (cmd === 'escalate') {
    need('boundary')
    if (!BOUNDARIES.includes(opts.boundary)) throw new Error(`--boundary must be ${BOUNDARIES.join(' | ')}`)
    if (opts.openQuestionFromCard !== undefined && opts.openQuestionFromCard !== 'true') throw new Error('--openQuestionFromCard must be true')
    if ([opts.conditions, opts.openQuestion, opts.openQuestionFromCard].filter(v => v !== undefined).length !== 1) throw new Error('exactly one of --conditions, --openQuestion or --openQuestionFromCard is required')
    if (opts.openQuestionFromCard !== undefined) out.opts.openQuestionFromCard = true
    if (opts.conditions !== undefined) {
      let c
      try {
        c = JSON.parse(opts.conditions)
      } catch {
        throw new Error('--conditions must be a JSON array of conditions')
      }
      if (!Array.isArray(c) || !c.length || c.some(x => conditionError(x) !== null)) throw new Error('--conditions must be a non-empty JSON array of `has:`/`lacks:` conditions (any label the gate grammar accepts, spaces included)')
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
      if (opts.story !== undefined) opts.labels = readLabels({ pm: (await import('./host/index.mjs')).bindHosts({ dir: opts.dir }).pm, story: opts.story, repo: opts.repo }) ?? undefined
      process.stdout.write(JSON.stringify(decide({ gate: opts.gate, labels: opts.labels, readiness: opts.readiness, attended: opts.attended, boundary: opts.boundary, source: opts.source })) + '\n')
      process.exit(0)
    }
    assertRunOwnsStory({ dir: opts.dir, story: opts.story, repo: opts.repo })
    const HOSTS = await import('./host/index.mjs')
    const hosts = HOSTS.bindHosts({ dir: opts.dir })
    const out =
      cmd === 'escalate'
        ? escalate({ hosts, story: opts.story, repo: opts.repo, boundary: opts.boundary, gate: gateToString(opts.gate), source: opts.source, conditions: opts.conditions, openQuestion: opts.openQuestion, openQuestionFromCard: opts.openQuestionFromCard, assumptions: opts.assumptionsFile && existsSync(opts.assumptionsFile) ? readFileSync(opts.assumptionsFile, 'utf8') : '' })
        : complete({ hosts, story: opts.story, repo: opts.repo, gate: opts.gate, source: opts.source, ...(opts.state ? { state: opts.state } : {}), ...(opts.attended !== undefined ? { attended: opts.attended } : {}), ...(opts.refinedAutonomously !== undefined ? { refinedAutonomously: opts.refinedAutonomously } : {}) })
    process.stdout.write(JSON.stringify(out) + '\n')
    process.exit(0)
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e.message }) + '\n')
    process.exit(2)
  }
}
