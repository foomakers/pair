// US-521 T-8: `pair-implement-batch` and `pair-loop` do NOT honour the autonomy model until #524. A declared
// `## Autonomy`, or any new argument, is REFUSED with `autonomy-not-supported-until-#524` — never a run that
// silently ignores a gate — and with none of them the two workflows start exactly as before (default off).
// Runs the real workflow sources with stubbed sandbox primitives: the refusal fires before any agent runs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

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
  await runBatch({ cards: [STORY], policyText: POLICY }).catch(e => assert.doesNotMatch(String(e.message), POINTER))
  await runLoop({ policyText: POLICY }).catch(e => assert.doesNotMatch(String(e.message), POINTER))
})

// ── US-521 r1-g3 (r0-4): the refusal is reachable from EVERY batch launch ───────────────────────
// The Workflow sandbox has no filesystem and no shell (the batch's own CYCLE_HOOKS_NOTICE says so): the
// batch cannot read tech/automation.md, and an extra up-front reader dispatch would change the call
// sequence every batch suite pins. So the caller's own Read IS the input, exactly as `pair-loop` takes
// it (`policyText`): a launch without it is refused — a declared `## Autonomy` can never be silently
// ignored by a caller that simply did not pass the text. `''` is a valid read: the file is absent.
const LEGACY = '## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\nrisk:green\n'
const NO_AGENT = /no agent may run/

// The instruction a launcher needs to RECOVER correctly (read the file, never pass "" to silence the refusal):
// policyText is REQUIRED, it is the verbatim Read of .pair/adoption/tech/automation.md, "" only when that file
// does not exist, and why — the Workflow sandbox cannot read files. Checked on the launch surface and the refusal.
function instructs(text) {
  const t = String(text)
  return (
    /policyText/.test(t) &&
    /\bREQUIRED\b/.test(t) &&
    t.includes('.pair/adoption/tech/automation.md') &&
    /verbatim/i.test(t) &&
    /(""|'')[^.]*\b(only when|only if)\b[^.]*\b(does not exist|is absent|is missing)\b/i.test(t) &&
    /sandbox[^.]*\b(cannot|can't|has no)\b[^.]*\b(read|file|filesystem)/i.test(t)
  )
}

test('G3-B1: a batch launched with only {cards} (no policyText) is refused before any agent runs, naming policyText, the #524 pointer and the recovery instruction', async () => {
  await assert.rejects(runBatch({ cards: [STORY] }), e => POINTER.test(e.message) && instructs(e.message) && !NO_AGENT.test(e.message))
})

test('G3-B2: the `stories` alias without policyText is refused the same way', async () => {
  await assert.rejects(runBatch({ stories: [STORY] }), e => POINTER.test(e.message) && instructs(e.message) && !NO_AGENT.test(e.message))
})

// G3-M1 — the launch surface. `meta` must stay a pure literal (the registry parses it statically), so it is
// evaluated here as one: the field that states "REQUIRED args shape" (whenToUse — the line the Workflow tool
// lists next to the description) must carry the same instruction, in BOTH copies of the batch.
function metaOf(file) {
  const code = readFileSync(new URL(file, import.meta.url), 'utf8')
  const open = code.indexOf('export const meta = {')
  assert.ok(open > -1, `${file}: meta literal`)
  const close = code.indexOf('\n}\n', open)
  return new Function(`return (${code.slice(code.indexOf('{', open), close + 2)})`)()
}
for (const file of ['./pair-implement-batch.js', '../../packages/knowledge-hub/dataset/.workflows/pair-implement-batch.js']) {
  test(`G3-M1: ${file} — the launch surface names policyText as REQUIRED, what it is and why`, { skip: !existsSync(new URL(file, import.meta.url)) && 'dataset copy not present beside this tree' }, () => {
    const meta = metaOf(file)
    const surface = meta.whenToUse
    assert.match(surface, /REQUIRED args shape/)
    assert.ok(instructs(surface), `whenToUse does not instruct policyText: ${surface.slice(0, 200)}…`)
  })
}

test('G3-B6: a non-string policyText is refused naming policyText, before any agent runs', async () => {
  for (const bad of [42, null, { text: AUTONOMY_POLICY }, ['## Autonomy']])
    await assert.rejects(runBatch({ cards: [STORY], policyText: bad }), e => /policyText/.test(e.message) && !NO_AGENT.test(e.message), JSON.stringify(bad))
})

test('G3-B4: legacy-only project (`## Eligibility` + `## Auto-Advance` risk:green) is NOT refused — the batch reaches its first dispatch', async () => {
  await assert.rejects(runBatch({ cards: [STORY], policyText: LEGACY }), NO_AGENT)
})

test('G3-B5: no automation.md (policyText "") is NOT refused — the batch reaches its first dispatch', async () => {
  await assert.rejects(runBatch({ cards: [STORY], policyText: '' }), NO_AGENT)
})

test('G3-B7: `## Autonomy` declared ALONGSIDE the legacy sections is refused (the legacy sections do not shadow it)', async () => {
  await assert.rejects(runBatch({ cards: [STORY], policyText: `${LEGACY}\n## Autonomy\n\nmerge: when; has: cost:red\n` }), POINTER)
})

test('the batch description still says it NEVER merges; pair-loop keeps its `--autoAdvance` merge call unchanged', () => {
  assert.match(BATCH, /Stops at PR-ready|NEVER merges|never merges/i)
  assert.match(LOOP, /--autoAdvance '\$\{JSON\.stringify\(policy\.autoAdvance\.tiers\)\}'/)
  assert.doesNotMatch(LOOP, /--mergeGate/)
})
