#!/usr/bin/env node
// autonomy-policy.mjs — the ONE owner of the autonomy model (US-521, ADR-027): selection (`filter`,
// `assignee`, `status`, `root`), a target (`until`) and two same-shaped gates (`prepare`, `merge`).
// Declared once in `tech/automation.md` `## Autonomy`, or passed per invocation; resolved here and
// honoured by `cycle-state.mjs`, `cycle-merge.mjs`, `pair-cli run` and `/pair-next`. A consumer relays
// the decision, it never re-derives it (D18; `pair-cli` owns no cycle rule — US-487).
//
// Pure functions + a CLI. `parse`, `resolvePolicy` and `decide` read no file, spawn no process and
// import no host adapter; only the CLI reads the adoption file it is pointed at.
//
//   node autonomy-policy.mjs resolve --adoption <tech/automation.md> [--args '<json>'] [--json]
//     → { ok, effective: { key: { value, source } }, lines: [...], warnings: [...], errors: [...] }
//   node autonomy-policy.mjs decide --policy '<json {until, merge}>' --boundary <stage:<step>|merge>
//                                   [--labels '<JSON array>']
//     → { decision: proceed | await-human | escalate | stop-at-target, conditions?, reason }
//
// Exit 0 when an answer was produced (errors are data inside it), 2 on a usage error.
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const KEYS = ['filter', 'assignee', 'status', 'root', 'until', 'prepare', 'merge']
export const UNTIL_VALUES = ['ready', 'pr', 'merged']
export const GATE_MODES = ['always', 'never', 'when']
export const DECISIONS = ['proceed', 'await-human', 'escalate', 'stop-at-target']
export const SOURCES = ['argument', 'adoption', 'default']
// The one precedence sentence every consumer states (conformance test pins it).
export const PRECEDENCE_SENTENCE = 'Precedence: argument > adoption (`## Autonomy`, then translated legacy sections) > KB default — every effective value is printed with its source.'

const LABEL_CAP = 50
const MAX_TEXT = 200
const MARKDOWN_MARKERS = ['`', '-', '*', '+', '>', '#']
const STAGE_STEPS = ['prepare', 'validate', 'implement', 'green', 'verify']
// Steps at or past the prepare->implement boundary: `until: ready` never dispatches them.
const PAST_READY = ['implement', 'green', 'verify']

const err = (key, reason) => ({ key, reason })
const hasControl = v => [...v].some(c => { const n = c.codePointAt(0) ?? 0; return n <= 0x1f || (n >= 0x7f && n <= 0x9f) })

// ── element validation: every label / login that can reach argv or a prompt ─────────────────
// The same rules `## Eligibility` and `## Workflows` apply to a label (50-char host cap, markdown
// wrapper, prompt/shell safety) — applied here to EVERY list element.
export function labelError(value) {
  if (typeof value !== 'string' || value.length === 0) return 'is empty'
  if (value.length > LABEL_CAP) return `is ${value.length} characters, longer than the host's label cap (${LABEL_CAP})`
  if (value.includes('`') || value.includes('$(') || hasControl(value) || value.length > MAX_TEXT) return 'contains a character that could turn it into a command fragment (backtick, `$(`, control character)'
  if (MARKDOWN_MARKERS.some(m => value.startsWith(m))) return 'is a copied markdown wrapper, not a bare label'
  if (/\s(AND|OR|NOT)\s|^(AND|OR|NOT)\s|\s(AND|OR|NOT)$/.test(value)) return 'uses a boolean operator — lists are any-of, there is no boolean grammar'
  if (/[;|&<>"'\\]/.test(value)) return 'contains a shell metacharacter'
  return null
}

function parseList(key, raw, { validate = labelError } = {}) {
  const text = String(raw ?? '').trim()
  if (text.length === 0) return { errors: [err(key, 'is an empty list')] }
  const items = text.split(',').map(s => s.trim())
  const errors = []
  for (const item of items) {
    const why = validate(item)
    if (why) errors.push(err(key, `element ${JSON.stringify(item)} ${why}`))
  }
  if (new Set(items).size !== items.length) errors.push(err(key, `lists a label twice (${JSON.stringify(text)})`))
  return errors.length ? { errors } : { value: items }
}

// A gate: `<always|never|when>[; has: a,b][; lacks: c]`. has/lacks only with `when`.
export function parseGate(key, raw) {
  const text = String(raw ?? '').trim()
  if (text.length === 0) return { errors: [err(key, 'is empty (expected <always|never|when>[; has: …][; lacks: …])')] }
  const [modeRaw, ...clauses] = text.split(';').map(s => s.trim())
  if (!GATE_MODES.includes(modeRaw)) return { errors: [err(key, `mode ${JSON.stringify(modeRaw)} is not one of ${GATE_MODES.join(' | ')}`)] }
  const gate = { mode: modeRaw, has: [], lacks: [] }
  const errors = []
  const seen = new Set()
  for (const clause of clauses) {
    const m = /^(has|lacks):\s*(.*)$/.exec(clause)
    if (!m) {
      errors.push(err(key, `clause ${JSON.stringify(clause)} is neither \`has: <labels>\` nor \`lacks: <labels>\``))
      continue
    }
    if (seen.has(m[1])) {
      errors.push(err(key, `declares \`${m[1]}:\` twice`))
      continue
    }
    seen.add(m[1])
    if (modeRaw !== 'when') {
      errors.push(err(key, `\`${m[1]}:\` is valid only with \`when\` (got \`${modeRaw}\`)`))
      continue
    }
    const list = parseList(`${key} ${m[1]}`, m[2])
    if (list.errors) errors.push(...list.errors)
    else gate[m[1]] = list.value
  }
  if (!errors.length && modeRaw === 'when' && gate.has.length === 0 && gate.lacks.length === 0) errors.push(err(key, '`when` needs at least one `has:` or `lacks:` list'))
  return errors.length ? { errors } : { value: gate }
}

export const gateToString = g => (g.mode === 'when' ? ['when', g.has.length ? `has: ${g.has.join(',')}` : null, g.lacks.length ? `lacks: ${g.lacks.join(',')}` : null].filter(Boolean).join('; ') : g.mode)

// ── one key's value ─────────────────────────────────────────────────────────────────────────
export function parseValue(key, raw) {
  switch (key) {
    case 'filter':
      return parseList('filter', raw)
    case 'status':
      return parseList('status', raw, { validate: v => (v.length === 0 ? 'is empty' : v.length > 40 || !/^[A-Za-z][A-Za-z0-9 _-]*$/.test(v) ? 'is not a macrostate name' : null) })
    case 'assignee': {
      const v = String(raw ?? '').trim()
      if (v === '@me') return { value: v }
      if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\[bot\])?$/.test(v)) return { errors: [err('assignee', `${JSON.stringify(v)} is neither @me nor a login`)] }
      return { value: v }
    }
    case 'root': {
      const v = String(raw ?? '').trim().replace(/^#/, '')
      return /^\d+$/.test(v) ? { value: v } : { errors: [err('root', `${JSON.stringify(String(raw ?? ''))} is not an issue number`)] }
    }
    case 'until': {
      const v = String(raw ?? '').trim()
      return UNTIL_VALUES.includes(v) ? { value: v } : { errors: [err('until', `${JSON.stringify(v)} is not one of ${UNTIL_VALUES.join(' | ')}`)] }
    }
    case 'prepare':
    case 'merge':
      return parseGate(key, typeof raw === 'object' && raw !== null ? gateToString({ has: [], lacks: [], ...raw }) : raw)
    default:
      return { errors: [err(key, 'is not a known key')] }
  }
}

// ── the adoption file ───────────────────────────────────────────────────────────────────────
function sectionBodies(markdown, heading) {
  const bodies = []
  let current
  let fenced = false
  for (const raw of String(markdown ?? '').split(/\r?\n/)) {
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
const sectionLines = (markdown, heading) => {
  const bodies = sectionBodies(markdown, heading)
  if (bodies.length === 0) return { lines: undefined }
  if (bodies.length > 1) return { errors: [err(heading, `\`## ${heading}\` heading appears ${bodies.length} times — exactly one declaration is read`)] }
  return { lines: bodies[0].map(l => l.trim()).filter(Boolean) }
}

// `## Eligibility` keeps ITS OWN grammar (the guideline's HALT triggers, in the same order as pair-cli's
// `readEligibility` + `assertLabelValue` + `isSafePromptText`): translating it with the stricter `labelError`
// would HALT a legacy-only project that declares nothing new. A label the legacy reader accepts goes into
// `filter` verbatim; `labelError` stays for the `## Autonomy` keys.
function legacyEligibilityError(lines) {
  if (lines.length === 0) return 'is present but empty (a half-written declaration)'
  if (lines.length > 1) return 'takes exactly one label'
  const v = lines[0]
  if (v.includes(',') || /(^|\s)(AND|OR|NOT)(\s|$)/.test(v)) return `declares \`${v}\`, but the declaration takes exactly one label`
  if (MARKDOWN_MARKERS.some(m => v.startsWith(m))) return `declares \`${v}\`, which is a copied markdown wrapper, not a bare label`
  if (v.length > LABEL_CAP) return `declares a ${v.length}-character value, longer than the host's label cap (${LABEL_CAP})`
  if (v.split(/\s+/).filter(t => t.includes(':')).length > 1) return `declares \`${v}\`, which juxtaposes several labels on one line`
  if (v.length === 0 || v.length > MAX_TEXT || v.includes('`') || v.includes('$(') || hasControl(v)) return 'declares a value that contains a character that could turn it into a command fragment once inlined in an agent prompt (backtick, `$(`, a newline or control character, or over ' + MAX_TEXT + ' characters)'
  return null
}

// `## Eligibility` -> filter; `## Auto-Advance` -> merge. Old sections keep their single-label rule.
function translateLegacy(markdown) {
  const errors = []
  const translated = {}
  const elig = sectionLines(markdown, 'Eligibility')
  if (elig.errors) errors.push(...elig.errors)
  else if (elig.lines !== undefined) {
    const why = legacyEligibilityError(elig.lines)
    if (why) errors.push(err('Eligibility', `\`## Eligibility\` ${why}`))
    else translated.filter = { value: [elig.lines[0]], from: '## Eligibility' }
  }
  const aa = sectionLines(markdown, 'Auto-Advance')
  if (aa.errors) errors.push(...aa.errors)
  else if (aa.lines !== undefined && aa.lines.length > 0) {
    const v = aa.lines[0]
    if (aa.lines.length > 1) errors.push(err('Auto-Advance', '`## Auto-Advance` takes exactly one switch'))
    else if (v === '(none)') translated.merge = { value: { mode: 'always', has: [], lacks: [] }, from: '## Auto-Advance' }
    else {
      const list = parseList('Auto-Advance', v)
      if (list.errors) errors.push(...list.errors)
      else translated.merge = { value: { mode: 'when', has: [], lacks: list.value }, from: '## Auto-Advance', legacyTiers: list.value }
    }
  }
  return { translated, errors }
}

// `parse(policyText)` -> { autonomy: {key: value}, translated: {key: {value, from}}, warnings, errors }
export function parse(policyText) {
  const errors = []
  const warnings = []
  const autonomy = {}
  const sec = sectionLines(policyText, 'Autonomy')
  if (sec.errors) errors.push(...sec.errors)
  for (const line of sec.lines ?? []) {
    const m = /^([A-Za-z][A-Za-z-]*):\s*(.*)$/.exec(line)
    if (!m) {
      errors.push(err('Autonomy', `line ${JSON.stringify(line)} is not \`key: value\``))
      continue
    }
    const [, key, raw] = m
    if (!KEYS.includes(key)) {
      errors.push(err(key, `is not a known \`## Autonomy\` key (known: ${KEYS.join(', ')})`))
      continue
    }
    if (Object.hasOwn(autonomy, key)) {
      errors.push(err(key, 'is declared twice'))
      continue
    }
    const r = parseValue(key, raw)
    if (r.errors) errors.push(...r.errors)
    else autonomy[key] = r.value
  }
  const legacy = translateLegacy(policyText)
  errors.push(...legacy.errors)
  // Coexistence: a legacy section whose translation DIFFERS from a declared key is a HALT naming both;
  // an identical one is only a warning.
  for (const [key, t] of Object.entries(legacy.translated)) {
    if (!Object.hasOwn(autonomy, key)) continue
    const same = JSON.stringify(autonomy[key]) === JSON.stringify(t.value)
    if (same) warnings.push(`\`## Autonomy\` \`${key}\` and \`${t.from}\` declare the same value — drop the legacy section.`)
    else errors.push(err(key, `\`## Autonomy\` \`${key}: ${display(key, autonomy[key])}\` conflicts with \`${t.from}\` (translates to \`${key}: ${display(key, t.value)}\`) — keep one`))
  }
  return { autonomy, translated: legacy.translated, declared: Object.keys(autonomy).length > 0, warnings, errors }
}

function display(key, value) {
  if (key === 'merge' || key === 'prepare') return gateToString(value)
  return Array.isArray(value) ? value.join(',') : String(value ?? '')
}

// ── precedence: argument > adoption > default, every source named ───────────────────────────
const DEFAULTS = {
  filter: undefined,
  assignee: undefined,
  status: undefined,
  root: undefined,
  until: 'pr',
  prepare: { mode: 'always', has: [], lacks: [] },
  merge: { mode: 'always', has: [], lacks: [] },
}

export function resolvePolicy({ args = {}, adoptionText = '' } = {}) {
  const parsed = parse(adoptionText)
  const errors = [...parsed.errors]
  const effective = {}
  const fromArgs = {}
  for (const key of Object.keys(args)) {
    if (!KEYS.includes(key)) {
      errors.push(err(key, 'is not a known autonomy argument'))
      continue
    }
    if (args[key] === undefined || args[key] === null) continue
    const r = parseValue(key, Array.isArray(args[key]) ? args[key].join(',') : args[key])
    if (r.errors) errors.push(...r.errors.map(e => ({ ...e, reason: `argument ${e.reason}` })))
    else fromArgs[key] = r.value
  }
  for (const key of KEYS) {
    if (Object.hasOwn(fromArgs, key)) effective[key] = { value: fromArgs[key], source: 'argument' }
    else if (Object.hasOwn(parsed.autonomy, key)) effective[key] = { value: parsed.autonomy[key], source: 'adoption' }
    else if (parsed.translated[key]) effective[key] = { value: parsed.translated[key].value, source: `adoption (translated from ${parsed.translated[key].from})` }
    else effective[key] = { value: DEFAULTS[key], source: 'default' }
  }
  // A merge gate translated from a legacy `## Auto-Advance <tier>` is the today's-behaviour path: with no
  // `until` declared anywhere, the target is `merged` (legacy sections had no target; the tier switch WAS it).
  const legacyMerge = parsed.translated.merge
  const legacyActive = effective.merge.source.startsWith('adoption (translated') && legacyMerge?.value.mode === 'when'
  if (effective.until.source === 'default' && legacyActive) effective.until = { value: 'merged', source: effective.merge.source }
  const lines = KEYS.map(key => {
    const e = effective[key]
    const v = e.value === undefined ? (key === 'filter' || key === 'status' ? '(all)' : '(none)') : display(key, e.value)
    return `${key}: ${v} (${e.source})`
  })
  const policy = { until: effective.until.value, merge: effective.merge.value, prepare: effective.prepare.value, ...(legacyActive ? { legacyTiers: legacyMerge.legacyTiers } : {}) }
  // `active`: the run declared its own target or merge gate (argument or `## Autonomy`). Legacy-only and
  // nothing-declared runs are NOT active — consumers keep today's code path, byte for byte.
  const active = ['until', 'merge'].some(k => effective[k].source === 'argument' || effective[k].source === 'adoption')
  return { ok: errors.length === 0, active, effective, policy, lines, warnings: parsed.warnings, errors, translated: Object.fromEntries(Object.entries(parsed.translated).map(([k, t]) => [k, { from: t.from, equivalent: `${k}: ${display(k, t.value)}` }])) }
}

// ── the decision — pure ─────────────────────────────────────────────────────────────────────
// boundary: { kind: 'stage', stage } before a stage dispatch, or { kind: 'merge' } at `ready-for-merge`.
// Escalation wins over every proceed, and the gate is evaluated ONLY under `until: merged`.
export function escalationConditions(gate, labels) {
  if (!gate || gate.mode !== 'when') return []
  const have = new Set((labels ?? []).map(String))
  return [...gate.has.filter(l => have.has(l)).map(l => `has:${l}`), ...gate.lacks.filter(l => !have.has(l)).map(l => `lacks:${l}`)]
}

export function decide({ boundary, labels, policy } = {}) {
  const until = policy?.until ?? 'pr'
  const gate = policy?.merge ?? DEFAULTS.merge
  const kind = boundary?.kind === 'merge' ? 'merge' : 'stage'
  const stage = kind === 'merge' ? 'merge' : boundary?.stage
  if (kind === 'stage' && !STAGE_STEPS.includes(stage)) return { decision: 'proceed', reason: `${stage} is not a delivery stage boundary` }
  if (until === 'ready') {
    return kind === 'stage' && PAST_READY.includes(stage)
      ? { decision: 'stop-at-target', target: 'ready', stage, reason: 'until: ready stops at the prepare→implement boundary' }
      : kind === 'merge'
        ? { decision: 'stop-at-target', target: 'ready', stage, reason: 'until: ready never reaches merge' }
        : { decision: 'proceed', stage }
  }
  if (until === 'pr') return kind === 'merge' ? { decision: 'stop-at-target', target: 'pr', stage, reason: 'until: pr never reaches merge, whatever the merge gate says' } : { decision: 'proceed', stage }
  // until: merged — the only value under which the merge gate is evaluated.
  if (gate.mode === 'when' && !Array.isArray(labels)) return { decision: 'escalate', stage, conditions: ['labels-unreadable'], reason: 'the card labels could not be read, so the merge gate cannot be evaluated — fail-safe escalation' }
  const conditions = escalationConditions(gate, labels)
  if (conditions.length) return { decision: 'escalate', stage, conditions, reason: `merge gate condition fired at ${stage}: ${conditions.join(', ')}` }
  if (kind === 'merge') return gate.mode === 'always' ? { decision: 'await-human', stage, reason: 'merge: always — parked awaiting a human' } : { decision: 'proceed', stage }
  return { decision: 'proceed', stage }
}

// US-490 compatibility: the legacy `--autoAdvance '<tiers>'` flag is the gate `merge: when; lacks: <tier>`.
export const gateFromLegacyTiers = tiers => ({ mode: 'when', has: [], lacks: [...tiers] })

// The marker-keyed card comment for an escalation: names the condition(s) and the stage.
export const ESCALATION_MARKER = story => `<!-- pair-autonomy-escalated:#${story} -->`
export function escalationComment({ story, stage, conditions }) {
  return [ESCALATION_MARKER(story), `Autonomous run **escalated** at stage \`${stage}\` — a human decides.`, '', ...conditions.map(c => `- \`${c}\``), '', 'The PR stays open; merging it manually stays possible. Re-invoking the run re-reads the labels and resumes once the condition is gone.'].join('\n')
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────
const isMain = () => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}
function cli(argv) {
  const [cmd, ...rest] = argv
  const opts = {}
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--json') continue
    if (!rest[i]?.startsWith('--') || rest[i + 1] === undefined) throw new Error(`bad argument: ${rest[i]}`)
    opts[rest[i].slice(2)] = rest[++i]
  }
  if (cmd === 'resolve') {
    const adoptionText = opts.adoption && existsSync(opts.adoption) ? readFileSync(opts.adoption, 'utf8') : ''
    return resolvePolicy({ args: opts.args ? JSON.parse(opts.args) : {}, adoptionText })
  }
  if (cmd === 'decide') {
    if (!opts.policy || !opts.boundary) throw new Error('--policy and --boundary are required')
    const boundary = opts.boundary === 'merge' ? { kind: 'merge' } : { kind: 'stage', stage: opts.boundary.replace(/^stage:/, '') }
    return decide({ boundary, labels: opts.labels ? JSON.parse(opts.labels) : undefined, policy: JSON.parse(opts.policy) })
  }
  throw new Error(`unknown command: ${cmd} (expected resolve | decide)`)
}
if (isMain()) {
  try {
    process.stdout.write(JSON.stringify(cli(process.argv.slice(2))) + '\n')
    process.exit(0)
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e.message }) + '\n')
    process.exit(2)
  }
}
