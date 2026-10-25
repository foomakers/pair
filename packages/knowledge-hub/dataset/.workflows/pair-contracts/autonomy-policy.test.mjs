// Tests for the shared autonomy model (US-521): grammar, legacy translation, precedence with sources,
// and the full decision table (until x gate mode x has/lacks outcome x boundary kind).
// RUNS FROM `.claude/workflows` ONLY (the dataset copy's `../../skills/...` imports resolve nowhere).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { PRESETS, PRESET_NAMES, parse, parseGate, resolvePolicy, decide, gateToString, gateFromLegacyTiers, escalationComment, ESCALATION_MARKER, KEYS } from '../../skills/pair-workflow-cycle/scripts/autonomy-policy.mjs'

const CLI = fileURLToPath(new URL('../../skills/pair-workflow-cycle/scripts/autonomy-policy.mjs', import.meta.url))
const section = body => `# Automation\n\n## Autonomy\n\n${body}\n`

// ── AC1: one grammar ───────────────────────────────────────────────────────────────────────
test('gate grammar: always | never | when with has/lacks lists (any-of)', () => {
  assert.deepEqual(parseGate('merge', 'always').value, { mode: 'always', has: [], lacks: [] })
  assert.deepEqual(parseGate('merge', 'never').value, { mode: 'never', has: [], lacks: [] })
  assert.deepEqual(parseGate('merge', 'when; has: cost:red, security:red; lacks: risk:green').value, { mode: 'when', has: ['cost:red', 'security:red'], lacks: ['risk:green'] })
  assert.equal(gateToString(parseGate('merge', 'when; lacks: risk:green').value), 'hold-when; lacks: risk:green')
})

for (const [text, re] of [
  ['always; has: x:y', /valid only with `hold-when`/],
  ['never; lacks: x:y', /valid only with `hold-when`/],
  ['sometimes', /mode "sometimes"/],
  ['', /is empty/],
  ['when', /at least one/],
  ['when; has:', /empty list/],
  ['when; has: a:b, a:b', /twice/],
  ['when; has: a:b; has: c:d', /twice/],
  ['when; foo: a:b', /neither/],
  ['when; has: a:b AND c:d', /boolean/],
  ['when; has: `id`', /command fragment/],
  ['when; has: $(id)', /command fragment/],
  ['when; has: ' + 'x'.repeat(51), /label cap/],
  ['when; has: -x', /markdown wrapper/],
  ['when; has: a;b', /neither/],
]) {
  test(`gate parse error: ${JSON.stringify(text)}`, () => {
    const r = parseGate('merge', text)
    assert.ok(r.errors, 'must be an error')
    assert.match(r.errors.map(e => `${e.key}: ${e.reason}`).join('\n'), re)
    assert.ok(r.errors.every(e => e.key.startsWith('merge')), 'error names the key')
  })
}

test('## Autonomy parses every key; malformed values name the key', () => {
  const p = parse(section('filter: risk:green, risk:yellow\nassignee: @me\nstatus: Draft, Ready\nroot: 12\nuntil: merged\nprepare: never\nmerge: when; has: cost:red'))
  assert.deepEqual(p.errors, [])
  assert.deepEqual(p.autonomy.filter, ['risk:green', 'risk:yellow'])
  assert.equal(p.autonomy.assignee, '@me')
  assert.deepEqual(p.autonomy.status, ['Draft', 'Ready'])
  assert.equal(p.autonomy.root, '12')
  assert.equal(p.autonomy.until, 'merged')
  assert.equal(p.autonomy.prepare.mode, 'never')
  assert.deepEqual(p.autonomy.merge.has, ['cost:red'])
  for (const [body, key, re] of [
    ['until: soon', 'until', /not one of ready \| pr \| merged/],
    ['colour: red', 'colour', /not a known/],
    ['filter:', 'filter', /empty list/],
    ['filter: a:b, a:b', 'filter', /twice/],
    ['until: pr\nuntil: merged', 'until', /twice/],
    ['merge: always; has: a:b', 'merge', /only with `hold-when`/],
    ['root: a/b', 'root', /not a card id/],
    ['assignee: a b', 'assignee', /neither @me nor a login/],
    ['just text', 'Autonomy', /key: value/],
  ]) {
    const e = parse(section(body)).errors
    assert.ok(e.length, body)
    assert.equal(e[0].key, key, body)
    assert.match(e[0].reason, re, body)
  }
})

test('a declaration inside a fenced block is documentation, not a declaration', () => {
  const p = parse('## Notes\n\n```\n## Autonomy\nuntil: merged\n```\n')
  assert.equal(p.declared, false)
  assert.deepEqual(p.errors, [])
})

// ── AC8: legacy sections translated, old HALTs kept ─────────────────────────────────────────
test('legacy translation: Eligibility -> filter, Auto-Advance (none) -> always, tier -> when; lacks', () => {
  const a = parse('## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\n(none)\n')
  assert.deepEqual(a.translated.filter.value, ['risk:green'])
  assert.equal(a.translated.merge.value.mode, 'always')
  const b = parse('## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\nrisk:green\n')
  assert.deepEqual(b.translated.merge.value, { mode: 'when', has: [], lacks: ['risk:green'] })
})

test('legacy: ## Eligibility keeps its one-literal-label rule (a comma is a HALT there)', () => {
  const e = parse('## Eligibility\n\nrisk:green, risk:yellow\n').errors
  assert.match(e[0].reason, /exactly one label/)
})

test('coexistence: a differing translation HALTs naming both; an identical one warns', () => {
  const differ = parse('## Eligibility\n\nrisk:green\n\n## Autonomy\n\nfilter: risk:yellow\n')
  assert.match(differ.errors[0].reason, /## Autonomy.*filter: risk:yellow.*## Eligibility.*filter: risk:green/)
  const same = parse('## Eligibility\n\nrisk:green\n\n## Autonomy\n\nfilter: risk:green\n')
  assert.deepEqual(same.errors, [])
  assert.match(same.warnings[0], /same value/)
  // a legacy section with no `## Autonomy` counterpart key is not a conflict
  assert.deepEqual(parse('## Eligibility\n\nrisk:green\n\n## Autonomy\n\nuntil: pr\n').errors, [])
})

// ── AC2: precedence, always printed with its source ─────────────────────────────────────────
test('precedence: argument > adoption > translated > default, each line carries its source', () => {
  const text = '## Eligibility\n\nrisk:green\n\n## Autonomy\n\nuntil: pr\nmerge: never\n'
  const r = resolvePolicy({ args: { until: 'merged', assignee: '@me' }, adoptionText: text })
  assert.equal(r.ok, true)
  assert.deepEqual(r.effective.until, { value: 'merged', source: 'argument' })
  assert.deepEqual(r.effective.merge, { value: { mode: 'never', has: [], lacks: [] }, source: 'adoption' })
  assert.deepEqual(r.effective.filter, { value: ['risk:green'], source: 'adoption (translated from ## Eligibility)' })
  assert.equal(r.effective.status.source, 'default')
  assert.equal(r.lines.length, KEYS.length)
  assert.ok(r.lines.includes('until: merged (argument)'))
  assert.ok(r.lines.includes('merge: hold-never (adoption)'))
  assert.ok(r.lines.some(l => l === 'filter: risk:green (adoption (translated from ## Eligibility))'))
})

test('nothing declared, nothing passed: defaults only (until pr, gates always) — default off', () => {
  const r = resolvePolicy({})
  assert.equal(r.ok, true)
  assert.equal(r.effective.until.value, 'pr')
  assert.equal(r.effective.merge.value.mode, 'always')
  assert.ok(KEYS.every(k => r.effective[k].source === 'default'))
})

test('prepare is parsed and validated and printed with its value and source, no "treated as always" note (#523 executes it)', () => {
  const r = resolvePolicy({ args: { prepare: 'when; has: needs:refine' } })
  assert.equal(r.lines.find(l => l.startsWith('prepare:')), 'prepare: hold-when; has: needs:refine (argument)')
  assert.equal(resolvePolicy().lines.find(l => l.startsWith('prepare:')), 'prepare: hold-always (default)')
  assert.equal(resolvePolicy({ args: { prepare: 'always; has: a:b' } }).ok, false)
})

test('legacy Auto-Advance tier with no declared until: the target is merged (today behaviour), source translated', () => {
  const r = resolvePolicy({ adoptionText: '## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\nrisk:green\n' })
  assert.equal(r.effective.until.value, 'merged')
  assert.match(r.effective.until.source, /translated from ## Auto-Advance/)
  assert.deepEqual(r.policy.legacyTiers, ['risk:green'])
  assert.equal(r.translated.merge.equivalent, 'merge: hold-when; lacks: risk:green')
  // an explicit until still wins
  assert.equal(resolvePolicy({ args: { until: 'pr' }, adoptionText: '## Auto-Advance\n\nrisk:green\n' }).effective.until.value, 'pr')
})

test('malformed argument HALTs naming the key; unknown argument too', () => {
  const r = resolvePolicy({ args: { until: 'never' } })
  assert.equal(r.ok, false)
  assert.equal(r.errors[0].key, 'until')
  assert.match(r.errors[0].reason, /^argument /)
  assert.equal(resolvePolicy({ args: { bogus: 1 } }).errors[0].key, 'bogus')
})

// ── AC4/5/6: the full decision table ────────────────────────────────────────────────────────
const GATES = {
  always: { mode: 'always', has: [], lacks: [] },
  never: { mode: 'never', has: [], lacks: [] },
  whenHas: { mode: 'when', has: ['cost:red'], lacks: [] },
  whenLacks: { mode: 'when', has: [], lacks: ['risk:green'] },
  whenBoth: { mode: 'when', has: ['cost:red'], lacks: ['risk:green'] },
}
const LABELS = { none: ['risk:green'], has: ['risk:green', 'cost:red'], lacksOnly: ['cost:green'], both: ['cost:red'] }
const STAGES = ['prepare', 'validate', 'implement', 'green', 'verify']

test('decision table: until x gate x labels x boundary (every cell)', () => {
  let cells = 0
  for (const until of ['ready', 'pr', 'merged'])
    for (const [gname, merge] of Object.entries(GATES))
      for (const [lname, labels] of Object.entries(LABELS))
        for (const boundary of [...STAGES.map(stage => ({ kind: 'stage', stage })), { kind: 'merge' }]) {
          cells++
          const d = decide({ boundary, labels, policy: { until, merge } })
          const where = `${until}/${gname}/${lname}/${boundary.stage ?? 'merge'}`
          assert.ok(['proceed', 'await-human', 'escalate', 'stop-at-target'].includes(d.decision), where)
          let expected
          if (until === 'ready') expected = boundary.kind === 'merge' || ['implement', 'green', 'verify'].includes(boundary.stage) ? 'stop-at-target' : 'proceed'
          else if (until === 'pr') expected = boundary.kind === 'merge' ? 'stop-at-target' : 'proceed'
          else {
            const fires = merge.mode === 'when' && (merge.has.some(l => labels.includes(l)) || merge.lacks.some(l => !labels.includes(l)))
            expected = fires ? 'escalate' : boundary.kind === 'merge' ? (merge.mode === 'always' ? 'await-human' : 'proceed') : 'proceed'
          }
          assert.equal(d.decision, expected, where)
        }
  assert.equal(cells, 3 * 5 * 4 * 6)
})

test('escalation names every firing condition, both has and lacks, and the stage', () => {
  const d = decide({ boundary: { kind: 'stage', stage: 'verify' }, labels: ['cost:red'], policy: { until: 'merged', merge: GATES.whenBoth } })
  assert.equal(d.decision, 'escalate')
  assert.deepEqual(d.conditions, ['has:cost:red', 'lacks:risk:green'])
  assert.equal(d.stage, 'verify')
})

test('a card with no labels under `lacks: risk:green` escalates (fail-safe); unreadable labels escalate too', () => {
  assert.equal(decide({ boundary: { kind: 'merge' }, labels: [], policy: { until: 'merged', merge: GATES.whenLacks } }).decision, 'escalate')
  const u = decide({ boundary: { kind: 'merge' }, policy: { until: 'merged', merge: GATES.whenHas } })
  assert.deepEqual([u.decision, u.conditions], ['escalate', ['labels-unreadable']])
})

test('decide is pure: no I/O modules imported by the module', () => {
  const src = readFileSync(CLI, 'utf8')
  const imports = [...src.matchAll(/^import .* from '([^']+)'/gm)].map(m => m[1])
  assert.deepEqual(imports.sort(), ['node:fs', 'node:path', 'node:url'])
  // US-572: only the CLI binds the PM adapter (a dynamic import, to judge `--root`) — never a static one.
  assert.doesNotMatch(src, /child_process|^import .*host\/index|\bgh\b.*spawn/m)
})

test('legacy --autoAdvance tiers translate to `merge: when; lacks: <tier>`', () => {
  assert.deepEqual(gateFromLegacyTiers(['risk:green']), { mode: 'when', has: [], lacks: ['risk:green'] })
})

test('escalation comment is marker-keyed and names condition + stage', () => {
  const c = escalationComment({ story: 7, stage: 'green', conditions: ['has:cost:red'] })
  assert.ok(c.startsWith(ESCALATION_MARKER(7)))
  assert.match(c, /`green`/)
  assert.match(c, /`has:cost:red`/)
})

// ── CLI round trip ──────────────────────────────────────────────────────────────────────────
test('CLI: resolve and decide round-trip JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'autonomy-'))
  const file = join(dir, 'automation.md')
  writeFileSync(file, section('until: merged\nmerge: when; has: cost:red'))
  const r = JSON.parse(spawnSync(process.execPath, [CLI, 'resolve', '--adoption', file, '--args', '{"assignee":"@me"}', '--json'], { encoding: 'utf8' }).stdout)
  assert.equal(r.ok, true)
  assert.equal(r.effective.assignee.source, 'argument')
  const d = spawnSync(process.execPath, [CLI, 'decide', '--policy', JSON.stringify(r.policy), '--boundary', 'stage:green', '--labels', '["cost:red"]'], { encoding: 'utf8' })
  assert.equal(d.status, 0)
  assert.equal(JSON.parse(d.stdout).decision, 'escalate')
  const bad = spawnSync(process.execPath, [CLI, 'nope'], { encoding: 'utf8' })
  assert.equal(bad.status, 2)
})

// Defect (#252 halt): a merge gate relayed without `lacks` (empty arrays dropped) crashed `decide` — `gate.lacks.filter`.
test('gate shape tolerance: a gate missing `lacks` / `has` / both decides, prints and resolves without crashing', () => {
  const labels = ['user story', 'risk:yellow', 'needs-review']
  const noLacks = { mode: 'when', has: ['needs-review'] }
  const noHas = { mode: 'when', lacks: ['risk:green'] }
  assert.deepEqual(decide({ boundary: { kind: 'stage', stage: 'implement' }, labels, policy: { until: 'merged', merge: noLacks } }).conditions, ['has:needs-review'])
  assert.deepEqual(decide({ boundary: { kind: 'stage', stage: 'implement' }, labels, policy: { until: 'merged', merge: noHas } }).conditions, ['lacks:risk:green'])
  assert.equal(decide({ boundary: { kind: 'merge' }, labels, policy: { until: 'merged', merge: { mode: 'never' } } }).decision, 'proceed')
  assert.equal(decide({ boundary: { kind: 'merge' }, labels, policy: { until: 'merged', merge: { mode: 'always' } } }).decision, 'await-human')
  assert.equal(gateToString(noLacks), 'hold-when; has: needs-review')
  assert.equal(gateToString(noHas), 'hold-when; lacks: risk:green')
  assert.equal(gateToString({ mode: 'never' }), 'hold-never')
  assert.equal(gateToString({ mode: 'when' }), 'hold-when')
})

test('gate shape tolerance: resolve output carries complete gates; an object gate with missing arrays parses; an unknown mode errors cleanly', () => {
  const r = resolvePolicy({ args: { until: 'merged', merge: { mode: 'when', has: ['needs-review'] } } })
  assert.equal(r.ok, true)
  assert.deepEqual(r.policy.merge, { mode: 'when', has: ['needs-review'], lacks: [] })
  assert.deepEqual(resolvePolicy({ args: { merge: { mode: 'never' } } }).policy.merge, { mode: 'never', has: [], lacks: [] })
  const bad = resolvePolicy({ args: { merge: { mode: 'sometimes' } } })
  assert.equal(bad.ok, false)
  assert.match(bad.errors[0].reason, /not one of/)
})

test('gate shape tolerance: the CLI decide with the relayed, lacks-less policy answers JSON (the #252 command)', () => {
  const p = spawnSync('node', [CLI, 'decide', '--policy', '{"until":"merged","merge":{"mode":"when","has":["needs-review"]}}', '--boundary', 'stage:implement', '--labels', '["user story","risk:yellow","next-release","surface:loop"]'], { encoding: 'utf8' })
  assert.equal(p.status, 0, p.stderr)
  assert.equal(JSON.parse(p.stdout).decision, 'proceed')
})

test('F1 fail-closed: decide throws on a `when` gate with no conditions or an unknown mode — never proceeds', () => {
  for (const merge of [{ mode: 'when' }, { mode: 'when', has: [], lacks: [] }, { mode: 'sometimes' }]) {
    assert.throws(() => decide({ boundary: { kind: 'merge' }, labels: ['x'], policy: { until: 'merged', merge } }), /gate/)
  }
})

// ── /pair-next eligibility: legacy filter is unattended-only; explicit root is first-class ──
const LEGACY = '## Eligibility\n\nrisk:green\n'
test('interactive: a filter coming ONLY from legacy ## Eligibility is not applied, and the lines say so', () => {
  const r = resolvePolicy({ adoptionText: LEGACY, surface: 'interactive' })
  assert.equal(r.ok, true)
  assert.equal(r.effective.filter.value, undefined)
  assert.ok(r.lines.some(l => /legacy `## Eligibility`.*set aside for this interactive run/.test(l)))
})
test('unattended (default surface): the legacy ## Eligibility filter still applies', () => {
  for (const surface of [undefined, 'unattended']) {
    const r = resolvePolicy({ adoptionText: LEGACY, surface })
    assert.deepEqual(r.effective.filter.value, ['risk:green'])
    assert.match(r.effective.filter.source, /translated from ## Eligibility/)
  }
})
test('interactive: an explicit ## Autonomy filter still applies', () => {
  const r = resolvePolicy({ adoptionText: section('filter: risk:green'), surface: 'interactive' })
  assert.deepEqual(r.effective.filter.value, ['risk:green'])
  assert.equal(r.effective.filter.source, 'adoption')
})
test('unattended: root + inherited adoption filter => filter kept (intersection), also via the CLI as the loop calls it (no --surface)', () => {
  for (const text of [LEGACY, section('filter: risk:green')]) {
    const r = resolvePolicy({ args: { root: '5' }, adoptionText: text })
    assert.equal(r.effective.root.value, '5')
    assert.deepEqual(r.effective.filter.value, ['risk:green'], text)
  }
  const dir = mkdtempSync(join(tmpdir(), 'ap-'))
  const file = join(dir, 'automation.md')
  writeFileSync(file, LEGACY)
  const r = JSON.parse(spawnSync(process.execPath, [CLI, 'resolve', '--adoption', file, '--args', '{"root":"5"}'], { encoding: 'utf8' }).stdout)
  assert.deepEqual(r.effective.filter.value, ['risk:green'])
})
test('interactive: explicit --root is never excluded by an inherited filter (legacy or ## Autonomy); an explicit --filter argument still narrows', () => {
  for (const text of [LEGACY, section('filter: risk:green')]) {
    const r = resolvePolicy({ args: { root: '262' }, adoptionText: text, surface: 'interactive' })
    assert.equal(r.effective.root.value, '262')
    assert.equal(r.effective.filter.value, undefined, text)
    assert.ok(r.lines.some(l => /explicit root #262|set aside/.test(l)))
  }
  const narrowed = resolvePolicy({ args: { root: '262', filter: 'risk:red' }, adoptionText: LEGACY, surface: 'interactive' })
  assert.deepEqual(narrowed.effective.filter.value, ['risk:red'])
  assert.equal(narrowed.effective.filter.source, 'argument')
})
test('unknown surface is an error; CLI --surface interactive sets the legacy filter aside', () => {
  assert.equal(resolvePolicy({ surface: 'bogus' }).ok, false)
  const dir = mkdtempSync(join(tmpdir(), 'ap-'))
  const file = join(dir, 'automation.md')
  writeFileSync(file, LEGACY)
  const run = extra => JSON.parse(spawnSync(process.execPath, [CLI, 'resolve', '--adoption', file, ...extra], { encoding: 'utf8' }).stdout)
  assert.equal(run(['--surface', 'interactive']).effective.filter.value, undefined)
  assert.deepEqual(run([]).effective.filter.value, ['risk:green'])
})

// ── US-575 AC8: the two recovery budgets ─────────────────────────────────────────────────────
test('US-575: autoRecoveryRounds / maxFixRounds — KB defaults 5 / 10 (= cycle-state POLICY_DEFAULTS), adoption overrides, an argument wins, 0 accepted, printed with source', async () => {
  const { POLICY_DEFAULTS } = await import('../../skills/pair-workflow-cycle/scripts/cycle-state.mjs')
  const none = resolvePolicy({})
  assert.deepEqual([none.policy.autoRecoveryRounds, none.policy.maxFixRounds], [POLICY_DEFAULTS.autoRecoveryRounds, POLICY_DEFAULTS.maxFixRounds])
  assert.deepEqual([none.policy.autoRecoveryRounds, none.policy.maxFixRounds], [5, 10])
  assert.equal(none.active, false, 'a budget alone does not activate the autonomy path')
  const r = resolvePolicy({ args: { maxFixRounds: 4 }, adoptionText: section('autoRecoveryRounds: 0\nmaxFixRounds: 7') })
  assert.equal(r.ok, true)
  assert.deepEqual(r.effective.autoRecoveryRounds, { value: 0, source: 'adoption' })
  assert.deepEqual(r.effective.maxFixRounds, { value: 4, source: 'argument' })
  assert.ok(r.lines.includes('autoRecoveryRounds: 0 (adoption)'))
  assert.ok(r.lines.includes('maxFixRounds: 4 (argument)'))
  for (const bad of ['-1', 'five', '1.5', ''])
    assert.match(parse(section(`autoRecoveryRounds: ${bad}`)).errors[0].reason, /whole number of rounds/)
})

// ── US-576: hold-* gate names, presets, filter: * ──────────────────────────────────────────
test('US-576 AC1: hold-always | hold-never | hold-when parse with no warning; bare forms are deprecated aliases with a warning naming the new form', () => {
  assert.deepEqual(parseGate('merge', 'hold-always'), { value: { mode: 'always', has: [], lacks: [] } })
  assert.deepEqual(parseGate('merge', 'hold-never'), { value: { mode: 'never', has: [], lacks: [] } })
  assert.deepEqual(parseGate('merge', 'hold-when; has: risk:red; lacks: a:b'), { value: { mode: 'when', has: ['risk:red'], lacks: ['a:b'] } })
  for (const [alias, now] of [['always', 'hold-always'], ['never', 'hold-never'], ['when; has: risk:red', 'hold-when; has: risk:red']]) {
    const r = parseGate('prepare', alias)
    assert.equal(r.errors, undefined)
    assert.deepEqual(r.warnings, [`\`prepare: ${alias.split(';')[0]}\` is deprecated — write \`prepare: ${now}\``])
  }
  assert.match(parseGate('merge', 'hold-sometimes').errors[0].reason, /not one of hold-always \| hold-never \| hold-when/)
  assert.match(parseGate('merge', 'hold-never; has: a:b').errors[0].reason, /only with `hold-when`/)
  assert.match(parseGate('merge', 'hold-when').errors[0].reason, /at least one/)
  const fromFile = resolvePolicy({ adoptionText: section('merge: never') })
  assert.equal(fromFile.ok, true)
  assert.ok(fromFile.warnings.some(w => /`merge: never` is deprecated — write `merge: hold-never`/.test(w)))
  const fromArg = resolvePolicy({ args: { merge: 'always' } })
  assert.ok(fromArg.warnings.some(w => /^argument `merge: always` is deprecated/.test(w)))
  assert.deepEqual(resolvePolicy({ adoptionText: section('merge: hold-never') }).warnings, [])
})

test('US-576 AC1: a relayed hold-* mode decides like its internal token', () => {
  const labels = ['risk:red']
  assert.equal(decide({ boundary: { kind: 'merge' }, labels, policy: { until: 'merged', merge: { mode: 'hold-never' } } }).decision, 'proceed')
  assert.equal(decide({ boundary: { kind: 'merge' }, labels, policy: { until: 'merged', merge: { mode: 'hold-always' } } }).decision, 'await-human')
  assert.equal(decide({ boundary: { kind: 'merge' }, labels, policy: { until: 'merged', merge: { mode: 'hold-when', has: ['risk:red'] } } }).decision, 'escalate')
})

test('US-576 AC3: filter: * selects everything; * inside a list HALTs', () => {
  assert.deepEqual(parse(section('filter: *')).autonomy.filter, ['*'])
  assert.equal(resolvePolicy({ args: { filter: '*' } }).lines.find(l => l.startsWith('filter:')), 'filter: * (argument)')
  for (const bad of ['*, risk:green', 'risk:green, *']) {
    const r = resolvePolicy({ adoptionText: section(`filter: ${bad}`) })
    assert.equal(r.ok, false, bad)
    assert.match(r.errors[0].reason, /`\*` \(every card\) stands alone/)
    assert.equal(resolvePolicy({ args: { filter: bad } }).ok, false)
  }
})

const EXPECTED_PRESETS = {
  full: { filter: ['*'], prepare: 'hold-never', merge: 'hold-never', until: 'merged' },
  'escalate-red': { filter: ['*'], prepare: 'hold-never', merge: 'hold-when; has: risk:red', until: 'merged' },
  supervised: { filter: ['*'], prepare: 'hold-always', merge: 'hold-always', until: 'merged' },
}
for (const [name, want] of Object.entries(EXPECTED_PRESETS)) {
  for (const [via, input] of [['adoption', { adoptionText: section(`preset: ${name}`) }], ['argument', { args: { preset: name } }]]) {
    test(`US-576 AC4: preset ${name} via ${via} applies the story table, every value sourced \`preset ${name}\``, () => {
      const r = resolvePolicy(input)
      assert.equal(r.ok, true)
      assert.deepEqual(r.effective.preset, { value: name, source: via })
      assert.deepEqual(r.effective.filter, { value: want.filter, source: `preset ${name}` })
      assert.equal(gateToString(r.effective.prepare.value), want.prepare)
      assert.equal(gateToString(r.effective.merge.value), want.merge)
      assert.equal(r.effective.until.value, want.until)
      for (const k of ['prepare', 'merge', 'until']) assert.equal(r.effective[k].source, `preset ${name}`)
      assert.ok(r.lines.includes(`until: merged (preset ${name})`))
      assert.ok(r.lines.includes(`merge: ${want.merge} (preset ${name})`))
      assert.equal(r.active, true)
      assert.deepEqual(r.warnings, [])
    })
  }
}

test('US-576 AC4: preset custom supplies no value; unknown preset HALTs listing the known ones', () => {
  assert.deepEqual(PRESET_NAMES, ['full', 'escalate-red', 'supervised', 'custom'])
  assert.deepEqual(PRESETS.custom, {})
  const c = resolvePolicy({ adoptionText: section('preset: custom\nmerge: hold-never') })
  assert.equal(c.effective.until.source, 'default')
  assert.equal(c.effective.merge.source, 'adoption')
  for (const input of [{ adoptionText: section('preset: yolo') }, { args: { preset: 'yolo' } }]) {
    const r = resolvePolicy(input)
    assert.equal(r.ok, false)
    assert.match(r.errors[0].reason, /"yolo" is not a known preset \(known: full \| escalate-red \| supervised \| custom\)/)
  }
})

test('US-576 AC4: precedence argument key > argument preset > explicit adoption key > adoption preset > default, each with its source', () => {
  const text = section('preset: escalate-red\nuntil: pr')
  const r = resolvePolicy({ adoptionText: text, args: { prepare: 'hold-always' } })
  assert.deepEqual(r.effective.prepare, { value: { mode: 'always', has: [], lacks: [] }, source: 'argument' })
  assert.deepEqual(r.effective.until, { value: 'pr', source: 'adoption' })
  assert.equal(r.effective.merge.source, 'preset escalate-red')
  assert.equal(r.effective.status.source, 'default')
  assert.equal(r.effective.autoRecoveryRounds.source, 'default')
  // an argument preset beats an explicit adoption key and a translated legacy section; an argument key still beats it
  const a = resolvePolicy({ adoptionText: section('merge: hold-always'), args: { preset: 'full' } })
  assert.equal(gateToString(a.effective.merge.value), 'hold-never')
  assert.equal(a.effective.merge.source, 'preset full')
  const legacy = resolvePolicy({ adoptionText: '# A\n\n## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\n(none)\n', args: { preset: 'escalate-red' } })
  assert.deepEqual(legacy.effective.filter.value, ['*'])
  assert.equal(gateToString(legacy.effective.merge.value), 'hold-when; has: risk:red')
  assert.equal(resolvePolicy({ adoptionText: section('merge: hold-always'), args: { preset: 'full', merge: 'hold-always' } }).effective.merge.source, 'argument')
  // an argument preset replaces the adoption preset
  assert.equal(resolvePolicy({ adoptionText: section('preset: supervised'), args: { preset: 'full' } }).effective.merge.source, 'preset full')
})

test('US-576 edge: preset plus a contradicting explicit key — key wins, the warning names both; an agreeing key warns nothing', () => {
  const r = resolvePolicy({ adoptionText: section('preset: escalate-red\nmerge: hold-never') })
  assert.equal(r.ok, true)
  assert.equal(gateToString(r.effective.merge.value), 'hold-never')
  assert.deepEqual(r.warnings, ['`merge: hold-never` (adoption) overrides `preset: escalate-red` (`merge: hold-when; has: risk:red`) — the key wins'])
  assert.deepEqual(resolvePolicy({ adoptionText: section('preset: full\nmerge: hold-never') }).warnings, [])
})

test('US-576: no ## Autonomy keeps the safe default (every gate held, nothing merges unattended)', () => {
  const r = resolvePolicy({})
  assert.equal(r.effective.preset.value, undefined)
  assert.equal(gateToString(r.effective.merge.value), 'hold-always')
  assert.equal(gateToString(r.effective.prepare.value), 'hold-always')
  assert.equal(r.active, false)
})

test('US-576 AC8: a preset table inside ## Autonomy is documentation, not a declaration; the shipped template resolves to escalate-red', () => {
  const tpl = readFileSync(fileURLToPath(new URL('../../../.pair/knowledge/guidelines/collaboration/templates/automation-template.md', import.meta.url)), 'utf8')
  const r = resolvePolicy({ adoptionText: tpl })
  assert.deepEqual(r.errors, [])
  assert.deepEqual(r.effective.preset, { value: 'escalate-red', source: 'adoption' })
  assert.equal(r.effective.merge.source, 'preset escalate-red')
  assert.match(tpl, /\| `full` +\|/)
  assert.deepEqual(parse(section('| preset | merge |\n| --- | --- |\n| `full` | hold-never |\npreset: full')).errors, [])
})

test('US-576 AC9: migration fixture — a legacy ## Eligibility / ## Auto-Advance file and its proposed `preset: custom` + hold-* keys resolve to the same effective policy', () => {
  const legacy = '# A\n\n## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\nrisk:green\n'
  const migrated = section('preset: custom\nfilter: risk:green\nmerge: hold-when; lacks: risk:green\nuntil: merged')
  const a = resolvePolicy({ adoptionText: legacy })
  const b = resolvePolicy({ adoptionText: migrated })
  assert.deepEqual(b.errors, [])
  assert.deepEqual(b.warnings, [])
  for (const k of ['filter', 'prepare', 'merge', 'until']) assert.deepEqual(b.effective[k].value, a.effective[k].value, k)
  assert.equal(a.translated.merge.equivalent, 'merge: hold-when; lacks: risk:green')
})
