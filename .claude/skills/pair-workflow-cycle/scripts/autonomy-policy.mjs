#!/usr/bin/env node
// autonomy-policy.mjs — the ONE owner of the autonomy model (US-521, ADR-027): selection (`filter`,
// `assignee`, `status`, `root`), a target (`until`) and two same-shaped gates (`prepare`, `merge`).
// Declared once in `tech/automation.md` `## Autonomy`, or passed per invocation; resolved here and
// honoured by `cycle-state.mjs`, `cycle-merge.mjs`, `pair-cli run` and `/pair-next`. A consumer relays
// the decision, it never re-derives it (D18; `pair-cli` owns no cycle rule — US-487).
//
// Pure functions + a CLI. `parse`, `resolvePolicy` and `decide` read no file, spawn no process and
// import no host adapter; only the CLI reads the adoption file it is pointed at, and binds the PM adapter
// to judge a `root` (US-572: the bound adapter's parseCardRef, never a digit rule).
//
//   node autonomy-policy.mjs resolve --adoption <tech/automation.md> [--args '<json>'] [--surface interactive|unattended] [--json]
//     → { ok, effective: { key: { value, source } }, lines: [...], warnings: [...], errors: [...] }
//   node autonomy-policy.mjs decide --policy '<json {until, merge}>' --boundary <stage:<step>|merge>
//                                   [--labels '<JSON array>']
//     → { decision: proceed | await-human | escalate | stop-at-target, conditions?, reason }
//
// Exit 0 when an answer was produced (errors are data inside it), 2 on a usage error.
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// US-575: `autoRecoveryRounds` / `maxFixRounds` — the run's two budgets before a card is parked `needs-human`.
export const KEYS = ['preset', 'filter', 'assignee', 'status', 'root', 'until', 'prepare', 'merge', 'autoRecoveryRounds', 'maxFixRounds']
export const UNTIL_VALUES = ['ready', 'pr', 'merged']
// US-576: a gate reads the way it behaves — `hold-always | hold-never | hold-when`. The bare `always | never | when`
// are deprecated aliases (accepted with a warning). The parsed gate keeps the bare token as its internal `mode`
// (every consumer compares that), `gateToString` prints the `hold-*` form.
export const GATE_MODES = ['always', 'never', 'when']
export const GATE_NAMES = GATE_MODES.map(m => `hold-${m}`)
// US-576: named presets — the values a preset supplies when no explicit key declares them. `custom` supplies none.
export const PRESETS = {
  full: { filter: '*', prepare: 'hold-never', merge: 'hold-never', until: 'merged' },
  'escalate-red': { filter: '*', prepare: 'hold-never', merge: 'hold-when; has: risk:red', until: 'merged' },
  supervised: { filter: '*', prepare: 'hold-always', merge: 'hold-always', until: 'merged' },
  custom: {},
}
export const PRESET_NAMES = Object.keys(PRESETS)
// `filter: *` — every card in scope, untagged included.
export const FILTER_ALL = '*'
export const DECISIONS = ['proceed', 'await-human', 'escalate', 'stop-at-target']
export const SOURCES = ['argument', 'adoption', 'preset', 'default']
// The one precedence sentence every consumer states (conformance test pins it).
export const PRECEDENCE_SENTENCE = 'Precedence: argument > argument preset > explicit adoption key (`## Autonomy`, then translated legacy sections) > adoption preset > KB default — every effective value is printed with its source.'

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

// An escalation condition as the gate grammar yields it (`has:<label>`, `lacks:<label>`, or a bare marker like
// `labels-unreadable`): the label part obeys `labelError`, so any label the grammar accepts — spaces included — is accepted
// and nothing that could become a shell fragment (quote, `$(`, backtick, control, `;|&<>\\`) ever is.
export function conditionError(value) {
  if (typeof value !== 'string') return 'is not a string'
  return labelError(value.replace(/^(has|lacks):\s*/, ''))
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

// A gate: `<hold-always|hold-never|hold-when>[; has: a,b][; lacks: c]`. has/lacks only with `hold-when`.
// `always | never | when` still parse, with a `warnings` entry naming the new form.
export function parseGate(key, raw) {
  const text = String(raw ?? '').trim()
  if (text.length === 0) return { errors: [err(key, 'is empty (expected <hold-always|hold-never|hold-when>[; has: …][; lacks: …])')] }
  const [nameRaw, ...clauses] = text.split(';').map(s => s.trim())
  const alias = GATE_MODES.includes(nameRaw)
  if (!alias && !GATE_NAMES.includes(nameRaw)) return { errors: [err(key, `mode ${JSON.stringify(nameRaw)} is not one of ${GATE_NAMES.join(' | ')}`)] }
  const modeRaw = nameRaw.replace(/^hold-/, '')
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
      errors.push(err(key, `\`${m[1]}:\` is valid only with \`hold-when\` (got \`${nameRaw}\`)`))
      continue
    }
    const list = parseList(`${key} ${m[1]}`, m[2])
    if (list.errors) errors.push(...list.errors)
    else gate[m[1]] = list.value
  }
  if (!errors.length && modeRaw === 'when' && gate.has.length === 0 && gate.lacks.length === 0) errors.push(err(key, '`hold-when` needs at least one `has:` or `lacks:` list'))
  if (errors.length) return { errors }
  return alias ? { value: gate, warnings: [`\`${key}: ${nameRaw}\` is deprecated — write \`${key}: ${gateToString(gate)}\``] } : { value: gate }
}

// A gate is `mode` + `has[]` + `lacks[]`; a relayed one may drop the empty arrays — every consumer reads it through here.
// A relayed `hold-*` mode is read as its internal token.
export const normalizeGate = g => (g && typeof g === 'object' ? { ...g, ...(typeof g.mode === 'string' ? { mode: g.mode.replace(/^hold-/, '') } : {}), has: Array.isArray(g.has) ? g.has : [], lacks: Array.isArray(g.lacks) ? g.lacks : [] } : g)

export const gateToString = g => {
  const n = normalizeGate(g)
  return n.mode === 'when' ? ['hold-when', n.has.length ? `has: ${n.has.join(',')}` : null, n.lacks.length ? `lacks: ${n.lacks.join(',')}` : null].filter(Boolean).join('; ') : `hold-${n.mode}`
}

// US-572: the SHAPE every card id has on every tracker (`572`, `IN-01`, `01-01-001`, `ENG-123`): no separator,
// no `..`, no whitespace, nothing absolute, bounded; a leading `#` is dropped. Which ids EXIST is the bound
// adapter's `parseCardRef`. → { id } | { error }. host/adapter-kit.mjs keeps the same rule (pinned equal by a test).
export const CARD_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
export function checkCardId(ref) {
  const id = String(ref ?? '').replace(/^#/, '')
  return CARD_ID_RE.test(id) && !id.includes('..') && id.length <= 120 ? { id } : { error: `${JSON.stringify(String(ref ?? ''))} is not a card id (no "/", "..", whitespace or absolute path)` }
}

// ── one key's value ─────────────────────────────────────────────────────────────────────────
export function parseValue(key, raw) {
  switch (key) {
    case 'preset': {
      const v = String(raw ?? '').trim()
      return Object.hasOwn(PRESETS, v) ? { value: v } : { errors: [err('preset', `${JSON.stringify(v)} is not a known preset (known: ${PRESET_NAMES.join(' | ')})`)] }
    }
    case 'filter': {
      if (String(raw ?? '').trim() === FILTER_ALL) return { value: [FILTER_ALL] }
      const list = parseList('filter', raw, { validate: v => (v === FILTER_ALL ? '`*` (every card) stands alone — it cannot be combined with labels' : labelError(v)) })
      return list
    }
    case 'status':
      return parseList('status', raw, { validate: v => (v.length === 0 ? 'is empty' : v.length > 40 || !/^[A-Za-z][A-Za-z0-9 _-]*$/.test(v) ? 'is not a macrostate name' : null) })
    case 'assignee': {
      const v = String(raw ?? '').trim()
      if (v === '@me') return { value: v }
      if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\[bot\])?$/.test(v)) return { errors: [err('assignee', `${JSON.stringify(v)} is neither @me nor a login`)] }
      return { value: v }
    }
    case 'root': {
      // US-572: an opaque card id — its shape here; whether the bound tracker knows it, in the CLI (parseCardRef).
      const r = checkCardId(String(raw ?? '').trim())
      return r.error ? { errors: [err('root', r.error)] } : { value: r.id }
    }
    case 'until': {
      const v = String(raw ?? '').trim()
      return UNTIL_VALUES.includes(v) ? { value: v } : { errors: [err('until', `${JSON.stringify(v)} is not one of ${UNTIL_VALUES.join(' | ')}`)] }
    }
    case 'autoRecoveryRounds':
    case 'maxFixRounds': {
      const v = String(raw ?? '').trim()
      return /^\d{1,3}$/.test(v) ? { value: Number(v) } : { errors: [err(key, `${JSON.stringify(v)} is not a whole number of rounds (0 parks at once)`)] }
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
    // US-576: a table row (the preset table the template ships) documents, it never declares.
    if (line.startsWith('|')) continue
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
    if (r.warnings) warnings.push(...r.warnings)
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
  // Same values as cycle-state.mjs POLICY_DEFAULTS (a parity test pins them).
  autoRecoveryRounds: 5,
  maxFixRounds: 10,
}

export const SURFACES = ['unattended', 'interactive']

export function resolvePolicy({ args = {}, adoptionText = '', surface = 'unattended' } = {}) {
  const parsed = parse(adoptionText)
  const errors = [...parsed.errors]
  const warnings = [...parsed.warnings]
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
    if (r.warnings) warnings.push(...r.warnings.map(w => `argument ${w}`))
  }
  const preset = fromArgs.preset ?? parsed.autonomy.preset
  const presetValues = Object.fromEntries(Object.entries(PRESETS[preset] ?? {}).map(([k, raw]) => [k, parseValue(k, raw).value]))
  for (const key of KEYS) {
    if (Object.hasOwn(fromArgs, key)) effective[key] = { value: fromArgs[key], source: 'argument' }
    // An argument preset is an argument: it beats every adoption key; only an argument key beats it.
    else if (fromArgs.preset !== undefined && Object.hasOwn(presetValues, key)) effective[key] = { value: presetValues[key], source: `preset ${preset}` }
    else if (Object.hasOwn(parsed.autonomy, key)) effective[key] = { value: parsed.autonomy[key], source: 'adoption' }
    else if (parsed.translated[key]) effective[key] = { value: parsed.translated[key].value, source: `adoption (translated from ${parsed.translated[key].from})` }
    else if (Object.hasOwn(presetValues, key)) effective[key] = { value: presetValues[key], source: `preset ${preset}` }
    else effective[key] = { value: DEFAULTS[key], source: 'default' }
    // An explicit key that contradicts the preset wins — named, never silent.
    if (Object.hasOwn(presetValues, key) && !effective[key].source.startsWith('preset') && JSON.stringify(effective[key].value) !== JSON.stringify(presetValues[key])) warnings.push(`\`${key}: ${display(key, effective[key].value)}\` (${effective[key].source}) overrides \`preset: ${preset}\` (\`${key}: ${display(key, presetValues[key])}\`) — the key wins`)
  }
  // Selection is scoped by surface. A `filter` that comes ONLY from the legacy `## Eligibility` translation is the
  // unattended-loop eligibility (pair-cli run, /pair-loop, batch): an interactive run sets it aside. An explicit
  // `--root` is never excluded by an inherited (adoption) filter on an INTERACTIVE run (unattended runs keep the filter together with the root); an explicit `--filter` argument still narrows.
  const notes = []
  if (!SURFACES.includes(surface)) errors.push(err('surface', `${JSON.stringify(surface)} is not one of ${SURFACES.join(' | ')}`))
  if (surface === 'interactive' && effective.filter.source.startsWith('adoption (translated')) {
    notes.push(`filter: legacy \`## Eligibility\` (${display('filter', effective.filter.value)}) set aside for this interactive run — it governs unattended runs only`)
    effective.filter = { value: undefined, source: 'default' }
  } else if (surface === 'interactive' && effective.root.source === 'argument' && effective.filter.source.startsWith('adoption')) {
    notes.push(`filter: adoption filter (${display('filter', effective.filter.value)}) not applied — the explicit root #${effective.root.value} is never excluded by an inherited filter`)
    effective.filter = { value: undefined, source: 'default' }
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
  }).concat(notes)
  const policy = { until: effective.until.value, merge: normalizeGate(effective.merge.value), prepare: normalizeGate(effective.prepare.value), autoRecoveryRounds: effective.autoRecoveryRounds.value, maxFixRounds: effective.maxFixRounds.value, ...(legacyActive ? { legacyTiers: legacyMerge.legacyTiers } : {}) }
  // `active`: the run declared its own target or merge gate (argument or `## Autonomy`). Legacy-only and
  // nothing-declared runs are NOT active — consumers keep today's code path, byte for byte.
  const active = ['until', 'merge'].some(k => effective[k].source === 'argument' || effective[k].source === 'adoption' || effective[k].source.startsWith('preset'))
  return { ok: errors.length === 0, active, effective, policy, lines, warnings, errors, translated: Object.fromEntries(Object.entries(parsed.translated).map(([k, t]) => [k, { from: t.from, equivalent: `${k}: ${display(k, t.value)}` }])) }
}

// ── the decision — pure ─────────────────────────────────────────────────────────────────────
// boundary: { kind: 'stage', stage } before a stage dispatch, or { kind: 'merge' } at `ready-for-merge`.
// Escalation wins over every proceed, and the gate is evaluated ONLY under `until: merged`.
export function escalationConditions(gate, labels) {
  if (!gate || gate.mode !== 'when') return []
  gate = normalizeGate(gate)
  const have = new Set((labels ?? []).map(String))
  return [...gate.has.filter(l => have.has(l)).map(l => `has:${l}`), ...gate.lacks.filter(l => !have.has(l)).map(l => `lacks:${l}`)]
}

// The labels a gate is decided on: the card's, with its `risk:*` replaced by the PR's CURRENT tier — the review classifies
// the diff and writes the PR's `risk:*` (confirm or raise), so after the review the PR is authoritative and a card still tagged
// `risk:green` does not hide a raise. `prLabels` absent (no PR yet) ⇒ the card's labels. A PR carrying NO tier keeps the card's
// until the merge boundary (publish-pr copies none), where an untagged PR is `risk:red` (pr-states.md fail-safe); several tiers
// are `risk:red` everywhere. Unreadable card labels stay unreadable (`undefined`).
const RISK_SHAPE = /^risk:[a-z][a-z0-9-]*$/i
export function effectiveLabels({ labels, prLabels, atMerge = false } = {}) {
  if (!Array.isArray(labels)) return undefined
  if (!Array.isArray(prLabels)) return labels
  const risk = [...new Set(prLabels.map(String).filter(l => l.startsWith('risk:')))]
  if (!risk.length && !atMerge) return labels
  const tier = risk.length === 1 && RISK_SHAPE.test(risk[0]) ? risk[0] : 'risk:red'
  return [...labels.map(String).filter(l => !l.startsWith('risk:')), tier]
}

export function decide({ boundary, labels: cardLabels, prLabels, policy } = {}) {
  const labels = effectiveLabels({ labels: cardLabels, prLabels, atMerge: boundary?.kind === 'merge' })
  const until = policy?.until ?? 'pr'
  const gate = normalizeGate(policy?.merge ?? DEFAULTS.merge)
  // Fail closed: a gate that is not a known mode, or a `when` with no condition, is never read as "proceed".
  if (!GATE_MODES.includes(gate?.mode)) throw new Error(`merge gate mode ${JSON.stringify(gate?.mode ?? null)} is not one of ${GATE_NAMES.join(' | ')}`)
  if (gate.mode === 'when' && gate.has.length === 0 && gate.lacks.length === 0) throw new Error('merge gate `hold-when` needs at least one `has:` or `lacks:` condition')
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
  if (kind === 'merge') return gate.mode === 'always' ? { decision: 'await-human', stage, reason: 'merge: hold-always — parked awaiting a human' } : { decision: 'proceed', stage }
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
async function cli(argv) {
  const [cmd, ...rest] = argv
  const opts = {}
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--json') continue
    if (!rest[i]?.startsWith('--') || rest[i + 1] === undefined) throw new Error(`bad argument: ${rest[i]}`)
    opts[rest[i].slice(2)] = rest[++i]
  }
  if (cmd === 'resolve') {
    const adoptionText = opts.adoption && existsSync(opts.adoption) ? readFileSync(opts.adoption, 'utf8') : ''
    const out = resolvePolicy({ args: opts.args ? JSON.parse(opts.args) : {}, adoptionText, surface: opts.surface })
    const root = out.effective.root?.value
    if (root !== undefined) {
      // US-572: the root is a card of the BOUND PM tool — its parseCardRef decides, never a digit rule.
      let why = null
      try {
        const pm = (await import('./host/index.mjs')).bindHosts({ from: opts.adoption ? dirname(opts.adoption) : process.cwd() }).pm
        if (!pm.parseCardRef(root)) why = `${JSON.stringify(root)} is not a ${pm.id} card (parseCardRef)`
      } catch (e) {
        why = e.message
      }
      if (why) Object.assign(out, { ok: false, errors: [...out.errors, err('root', why)] })
    }
    return out
  }
  if (cmd === 'decide') {
    if (!opts.policy || !opts.boundary) throw new Error('--policy and --boundary are required')
    const boundary = opts.boundary === 'merge' ? { kind: 'merge' } : { kind: 'stage', stage: opts.boundary.replace(/^stage:/, '') }
    return decide({ boundary, labels: opts.labels ? JSON.parse(opts.labels) : undefined, prLabels: opts.prLabels ? JSON.parse(opts.prLabels) : undefined, policy: JSON.parse(opts.policy) })
  }
  throw new Error(`unknown command: ${cmd} (expected resolve | decide)`)
}
if (isMain()) {
  try {
    process.stdout.write(JSON.stringify(await cli(process.argv.slice(2))) + '\n')
    process.exit(0)
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e.message }) + '\n')
    process.exit(2)
  }
}
