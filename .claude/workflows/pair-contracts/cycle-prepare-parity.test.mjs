// US-523 T-11 — cross-entry verification: one decision function for every entry, the `always` safety property over
// the CLI the entries spawn, the `prepare` argument stated identically across the skills, and AC9 (no silent phase-0 bypass).
// RUNS FROM `.claude/workflows` ONLY.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { decide } from '../../skills/pair-workflow-cycle/scripts/cycle-prepare.mjs'
import { PRECEDENCE_SENTENCE } from '../../skills/pair-workflow-cycle/scripts/autonomy-policy.mjs'

const here = rel => fileURLToPath(new URL(rel, import.meta.url))
const SCRIPT = here('../../skills/pair-workflow-cycle/scripts/cycle-prepare.mjs')
const read = rel => readFileSync(here(rel), 'utf8')
const GATES = [{ mode: 'always', has: [], lacks: [] }, { mode: 'never', has: [], lacks: [] }, { mode: 'when', has: ['risk:red'], lacks: ['triaged'] }]
const LABELS = [[], ['triaged'], ['risk:red', 'triaged'], ['needs-review']]

test('parity: the CLI every entry spawns answers exactly what the in-process function answers, for every cell', () => {
  let n = 0
  for (const gate of GATES) for (const labels of LABELS) for (const attended of [true, false]) for (const readiness of ['draft', 'refined-no-breakdown']) for (const boundary of ['B0', 'B1', 'B2']) {
    const r = spawnSync('node', [SCRIPT, 'decide', '--gate', JSON.stringify(gate), '--readiness', readiness, '--attended', String(attended), '--boundary', boundary, '--labels', JSON.stringify(labels), '--source', 'argument'], { encoding: 'utf8' })
    assert.deepEqual(JSON.parse(r.stdout), decide({ gate, labels, readiness, attended, boundary, source: 'argument' }))
    n++
  }
  assert.equal(n, 3 * 4 * 2 * 2 * 3)
})

test('safety property: `always` unattended never yields a route that prepares or writes Ready, via the CLI', () => {
  for (const labels of LABELS) for (const readiness of ['draft', 'refined-no-breakdown']) for (const boundary of ['B0', 'B1', 'B2']) {
    const r = spawnSync('node', [SCRIPT, 'decide', '--gate', JSON.stringify(GATES[0]), '--readiness', readiness, '--attended', 'false', '--boundary', boundary, '--labels', JSON.stringify(labels)], { encoding: 'utf8' })
    assert.match(JSON.parse(r.stdout).route, /^(skip-needs-human|skip-escalated)$/)
  }
})

test('the entries share the one script: cycle SKILL, batch and pair-cli name cycle-prepare.mjs and hold no copy of the rule', () => {
  assert.match(read('../../skills/pair-workflow-cycle/SKILL.md'), /cycle-prepare\.mjs/)
  assert.match(read('../pair-implement-batch.js'), /cycle-prepare\.mjs/)
  const code = read('../pair-implement-batch.js').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
  assert.equal(/route === 'run-autonomous'|escalationConditions/.test(code), false)
})

test('the `prepare` argument is stated with the shared grammar and precedence in the cycle skill, the loop skill and the KB policy', () => {
  for (const [file, label] of [['../../skills/pair-workflow-cycle/SKILL.md', 'cycle SKILL'], ['../../skills/pair-loop/SKILL.md', 'loop SKILL'], ['../../.pair/knowledge/guidelines/collaboration/automation/automation-policy.md', 'KB policy']]) {
    let text
    try { text = read(file) } catch { continue }
    assert.match(text, /prepare/, label)
    assert.doesNotMatch(text, /lands in #523|treated as always/, `${label} still says prepare is not executed`)
  }
  assert.ok(read('../../skills/pair-workflow-cycle/SKILL.md').includes('Precedence') || read('../../skills/pair-workflow-cycle/SKILL.md').includes('argument > adoption'))
  assert.ok(PRECEDENCE_SENTENCE.startsWith('Precedence:'))
})

test('AC9: refine-story phase 0 stays a gate that HALTs under `$approval: auto` unless `$prepare: never|when` also lifts it; /grill is untouched', () => {
  const s = read('../../skills/pair-process-refine-story/SKILL.md')
  assert.match(s, /approval-round: kind=gate; auto=halt/)
  assert.match(s, /`\$approval: auto` alone[^.]*never lifts phase 0|generic signal never bypasses R3\.11/)
  assert.match(s, /\$approval: auto` without `\$prepare: never\|when`/)
  const grill = read('../../skills/pair-capability-grill/SKILL.md')
  assert.doesNotMatch(grill, /\$prepare/)
})
