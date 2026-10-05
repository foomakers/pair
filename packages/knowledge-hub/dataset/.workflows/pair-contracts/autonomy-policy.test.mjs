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
import { parse, parseGate, resolvePolicy, decide, gateToString, gateFromLegacyTiers, escalationComment, ESCALATION_MARKER, KEYS } from '../../skills/pair-workflow-cycle/scripts/autonomy-policy.mjs'

const CLI = fileURLToPath(new URL('../../skills/pair-workflow-cycle/scripts/autonomy-policy.mjs', import.meta.url))
const section = body => `# Automation\n\n## Autonomy\n\n${body}\n`

// ── AC1: one grammar ───────────────────────────────────────────────────────────────────────
test('gate grammar: always | never | when with has/lacks lists (any-of)', () => {
  assert.deepEqual(parseGate('merge', 'always').value, { mode: 'always', has: [], lacks: [] })
  assert.deepEqual(parseGate('merge', 'never').value, { mode: 'never', has: [], lacks: [] })
  assert.deepEqual(parseGate('merge', 'when; has: cost:red, security:red; lacks: risk:green').value, { mode: 'when', has: ['cost:red', 'security:red'], lacks: ['risk:green'] })
  assert.equal(gateToString(parseGate('merge', 'when; lacks: risk:green').value), 'when; lacks: risk:green')
})

for (const [text, re] of [
  ['always; has: x:y', /valid only with `when`/],
  ['never; lacks: x:y', /valid only with `when`/],
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
    ['merge: always; has: a:b', 'merge', /only with `when`/],
    ['root: abc', 'root', /issue number/],
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
  assert.ok(r.lines.includes('merge: never (adoption)'))
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
  assert.equal(r.lines.find(l => l.startsWith('prepare:')), 'prepare: when; has: needs:refine (argument)')
  assert.equal(resolvePolicy().lines.find(l => l.startsWith('prepare:')), 'prepare: always (default)')
  assert.equal(resolvePolicy({ args: { prepare: 'always; has: a:b' } }).ok, false)
})

test('legacy Auto-Advance tier with no declared until: the target is merged (today behaviour), source translated', () => {
  const r = resolvePolicy({ adoptionText: '## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\nrisk:green\n' })
  assert.equal(r.effective.until.value, 'merged')
  assert.match(r.effective.until.source, /translated from ## Auto-Advance/)
  assert.deepEqual(r.policy.legacyTiers, ['risk:green'])
  assert.equal(r.translated.merge.equivalent, 'merge: when; lacks: risk:green')
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
  assert.deepEqual(imports.sort(), ['node:fs', 'node:url'])
  assert.doesNotMatch(src, /child_process|host\/index|\bgh\b.*spawn/)
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
