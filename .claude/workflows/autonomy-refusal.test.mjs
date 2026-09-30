// US-521 T-8: `pair-implement-batch` and `pair-loop` do NOT honour the autonomy model until #524. A declared
// `## Autonomy`, or any new argument, is REFUSED with `autonomy-not-supported-until-#524` — never a run that
// silently ignores a gate — and with none of them the two workflows start exactly as before (default off).
// Runs the real workflow sources with stubbed sandbox primitives: the refusal fires before any agent runs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
const src = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/^export /gm, '')
const BATCH = src('pair-implement-batch.js')
const LOOP = src('pair-loop.js')
const POINTER = /autonomy-not-supported-until-#524/

const STORY = { id: '292', title: 'T', branch: 'feat/#292-x' }
const never = async () => {
  throw new Error('no agent may run')
}
const runBatch = args => new AsyncFunction('args', 'agent', 'parallel', 'log', BATCH)(args, never, never, () => {})
const runLoop = args => new AsyncFunction('args', 'agent', 'parallel', 'workflow', 'phase', 'log', LOOP)(args, never, never, never, () => {}, () => {})

const POLICY = '## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\n(none)\n'
const AUTONOMY_POLICY = `${POLICY}\n## Autonomy\n\nuntil: merged\nmerge: never\n`

for (const key of ['until', 'prepare', 'merge', 'assignee', 'status', 'filter']) {
  test(`batch refuses the new argument \`${key}\` with the #524 pointer`, async () => {
    await assert.rejects(runBatch({ cards: [STORY], [key]: 'x' }), POINTER)
  })
  test(`loop refuses the new argument \`${key}\` with the #524 pointer`, async () => {
    await assert.rejects(runLoop({ policyText: POLICY, [key]: 'x' }), POINTER)
  })
}

test('batch refuses a declared `## Autonomy` (policyText), naming the pointer', async () => {
  await assert.rejects(runBatch({ cards: [STORY], policyText: AUTONOMY_POLICY }), POINTER)
})

test('loop refuses a declared `## Autonomy` in policyText before any card is touched', async () => {
  await assert.rejects(runLoop({ policyText: AUTONOMY_POLICY }), /autonomy-not-supported-until-#524/)
})

test('an `## Autonomy` heading inside a fence is documentation, not a declaration', async () => {
  const fenced = `${POLICY}\n## Notes\n\n\`\`\`\n## Autonomy\nuntil: merged\n\`\`\`\n`
  // batch: not refused by the guard (it then fails later for its own reasons, never with the pointer)
  await runBatch({ cards: [STORY], policyText: fenced }).catch(e => assert.doesNotMatch(String(e.message), POINTER))
})

test('default off: no `## Autonomy` and no new argument — the pointer never appears', async () => {
  await runBatch({ cards: [STORY] }).catch(e => assert.doesNotMatch(String(e.message), POINTER))
  await runLoop({ policyText: POLICY }).catch(e => assert.doesNotMatch(String(e.message), POINTER))
})

test('the batch description still says it NEVER merges; pair-loop keeps its `--autoAdvance` merge call unchanged', () => {
  assert.match(BATCH, /Stops at PR-ready|NEVER merges|never merges/i)
  assert.match(LOOP, /--autoAdvance '\$\{JSON\.stringify\(policy\.autoAdvance\.tiers\)\}'/)
  assert.doesNotMatch(LOOP, /--mergeGate/)
})
