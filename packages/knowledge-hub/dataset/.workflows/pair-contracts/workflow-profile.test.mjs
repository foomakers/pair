// US-488 — per-stage engine/model/effort/context profiles: the shared resolver both coordinators
// call (pair-workflow-cycle's skill and `pair-cli run --card`). Every scenario runs the real module
// against real temporary files; the `context` rule is asserted against the REAL cycle-state.mjs table.
// RUNS FROM `.claude/workflows` ONLY (same rule as cycle-state.test.mjs): `pnpm workflows:test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validateProfile, effectiveStage, STAGES, KB_DEFAULT } from '../../skills/pair-workflow-cycle/scripts/workflow-profile.mjs'
import { CONTEXT_TABLE } from '../../skills/pair-workflow-cycle/scripts/cycle-state.mjs'

const errorsOf = p => validateProfile(p).errors

// ── T-1: shape + validator (AC1, AC5) ────────────────────────────────────────────────────────
test('T-1/AC1: a minimal {name, defaults} profile is valid and needs no stages', () => {
  assert.deepEqual(errorsOf({ name: 'min', defaults: { engine: 'pi', model: 'x', effort: 'low', context: 'fresh' } }), [])
})

test('T-1/AC1: a stage entry overrides only the fields it declares; the rest fall back to defaults', () => {
  const p = { name: 'cheap-green', defaults: { engine: 'pi', model: 'big', effort: 'high', context: 'fresh' }, stages: { green: { model: 'small', context: 'reuse' } } }
  assert.deepEqual(errorsOf(p), [])
  assert.deepEqual(effectiveStage(p, 'green'), {
    engine: { value: 'pi', source: 'defaults' },
    model: { value: 'small', source: 'stage' },
    effort: { value: 'high', source: 'defaults' },
    context: { value: 'reuse', source: 'stage' },
  })
  assert.deepEqual(effectiveStage(p, 'verify').model, { value: 'big', source: 'defaults' })
})

test('T-1/AC1: a field neither stage nor defaults declares falls back to the KB default', () => {
  const s = effectiveStage({ name: 'n' }, 'implement')
  assert.deepEqual(s.context, { value: 'fresh', source: 'KB default' })
  assert.deepEqual(s.model, { value: KB_DEFAULT.model, source: 'KB default' })
})

test('T-1: every stage id of the story shape is known', () => {
  assert.deepEqual(STAGES, ['prepare', 'validate', 'implement', 'green', 'verify', 'contract', 'merge'])
})

test('T-1: an unknown stage id is profile-invalid and names the stage', () => {
  const errs = errorsOf({ name: 'p', stages: { verfy: { model: 'x' } } })
  assert.equal(errs.length, 1)
  assert.match(errs[0], /unknown stage 'verfy'/)
})

test('T-1: an unknown top-level key, unknown stage field, bad effort/context value or missing name is rejected', () => {
  assert.match(errorsOf({ name: 'p', extra: 1 })[0], /unknown key 'extra'/)
  assert.match(errorsOf({ name: 'p', stages: { green: { temperature: 1 } } })[0], /stages\.green: unknown field 'temperature'/)
  assert.match(errorsOf({ name: 'p', defaults: { effort: 'turbo' } })[0], /defaults\.effort/)
  assert.match(errorsOf({ name: 'p', defaults: { context: 'maybe' } })[0], /defaults\.context/)
  assert.match(errorsOf({ defaults: {} })[0], /name/)
  assert.match(errorsOf('nope')[0], /object/)
})

test('T-1/AC5: reuse into validate or verify is rejected, naming the stage, before any dispatch', () => {
  for (const stage of ['validate', 'verify']) {
    const errs = errorsOf({ name: 'p', stages: { [stage]: { context: 'reuse' } } })
    assert.equal(errs.length, 1, stage)
    assert.match(errs[0], new RegExp(`stages\\.${stage}\\.context: 'reuse' is not admissible`))
  }
})

test('T-1/AC5: admissibility IS the real cycle-state.mjs table — every transition it allows makes its target stage legal, every other stage is refused', () => {
  const allowedTargets = new Set(CONTEXT_TABLE.reuseAllowed.map(t => t.split('->')[1]))
  for (const stage of STAGES) {
    const errs = errorsOf({ name: 'p', stages: { [stage]: { context: 'reuse' } } })
    assert.equal(errs.length === 0, allowedTargets.has(stage), `${stage}: ${errs.join(';')}`)
  }
})

test('T-1/AC5: a defaults-level reuse is not an error — it applies only where the table admits it', () => {
  const p = { name: 'p', defaults: { context: 'reuse' } }
  assert.deepEqual(errorsOf(p), [])
  assert.equal(effectiveStage(p, 'green').context.value, 'reuse')
  assert.equal(effectiveStage(p, 'verify').context.value, 'fresh')
})

test('T-1: workflow-profile.mjs ships byte-identical in the installed skill and the dataset source', () => {
  const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
  assert.equal(
    read('../../../packages/knowledge-hub/dataset/.skills/workflow/cycle/scripts/workflow-profile.mjs'),
    read('../../skills/pair-workflow-cycle/scripts/workflow-profile.mjs'),
  )
})
