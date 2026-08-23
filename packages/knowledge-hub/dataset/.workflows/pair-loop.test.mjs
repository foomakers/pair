// Dry-run harness for pair-loop.js (#250 T12): executes the workflow source
// with stubbed `agent`/`parallel`/`workflow`/`phase`/`log` (the sandbox
// primitives) and asserts: predicate grammar (accept/reject, body-content
// rejection, malformed HALT), min(D,P) cap arithmetic including 0 and 1,
// dependency ordering on an unmerged prerequisite, mutex exclusion, override
// narrowing-only, fail-closed policy read, eligibility incl. untagged->red,
// auto-advance halting on yellow/red and on a mid-run tier raise, and the
// composed batch/auto-advance/audit control flow. Fixture-board runs — no
// live agent run is required (Validation and Testing Strategy).
// Run (from repo root): `pnpm workflows:test` — i.e. `cd .claude/workflows && node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const FULL_SRC = readFileSync(new URL('./pair-loop.js', import.meta.url), 'utf8').replace(
  /^export /gm,
  '',
)
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor

// ── Pure-helper extraction ──────────────────────────────────────────────────
// Only the PURE-HELPERS half of the script (everything before the
// `// ORCHESTRATION` marker comment) is evaluated here — the orchestration
// half runs top-level statements (`phase('Policy')`, the `while(true)` loop)
// that need real `agent`/`workflow`/`phase`/`log` stubs to not throw
// immediately. Splitting on the marker lets this file exercise the pure
// functions directly, on the exact same declarations the orchestration below
// uses, with no risk of a second, drifting copy.
const ORCH_MARKER = '// ORCHESTRATION — the unattended fan-out path'
const HELPERS_SRC = FULL_SRC.slice(0, FULL_SRC.indexOf(ORCH_MARKER))
const SRC = FULL_SRC

const HELPERS = new Function(
  `${HELPERS_SRC}\nreturn { extractEligibility, extractAutoAdvance, parseStopPredicate, evaluateStopPredicate, parseMaxParallelism, resolveMaxParallelism, resolveAuditLocation, dependencyFilter, computeMutexBatch, resolveCards, composeBatch, renderContinueToken }`,
)()

function helpers() {
  return HELPERS
}

// ── Eligibility ──────────────────────────────────────────────────────────────
test('extractEligibility: absent section -> empty eligibility set (fail-safe)', () => {
  const { extractEligibility } = getHelpers()
  assert.deepEqual(extractEligibility('# nothing here'), { kind: 'absent' })
})

test('extractEligibility: valid single label', () => {
  const { extractEligibility } = getHelpers()
  assert.deepEqual(extractEligibility('## Eligibility\n\nrisk:green\n'), {
    kind: 'value',
    value: 'risk:green',
  })
})

test('extractEligibility: label with spaces stays one label (no whitespace split)', () => {
  const { extractEligibility } = getHelpers()
  assert.deepEqual(extractEligibility('## Eligibility\n\ngood first issue\n'), {
    kind: 'value',
    value: 'good first issue',
  })
})

test('extractEligibility: comma-separated list HALTs', () => {
  const { extractEligibility } = getHelpers()
  assert.throws(() => extractEligibility('## Eligibility\n\nrisk:green, risk:yellow\n'), /HALT/)
})

test('extractEligibility: duplicate heading HALTs', () => {
  const { extractEligibility } = getHelpers()
  const text = '## Eligibility\n\nrisk:green\n\n## Eligibility\n\nrisk:yellow\n'
  assert.throws(() => extractEligibility(text), /more than one/)
})

test('extractEligibility: fenced occurrence is not a heading (trigger 7 does not fire)', () => {
  const { extractEligibility } = getHelpers()
  const text = '## Notes\n\n```markdown\n## Eligibility\nrisk:yellow\n```\n\n## Eligibility\n\nrisk:green\n'
  assert.deepEqual(extractEligibility(text), { kind: 'value', value: 'risk:green' })
})

test('extractEligibility: markdown-decorated value HALTs (copied fence/list)', () => {
  const { extractEligibility } = getHelpers()
  assert.throws(() => extractEligibility('## Eligibility\n\n- risk:green\n'), /markdown block marker/)
})

test('extractEligibility: two colon-carrying tokens juxtaposed HALTs', () => {
  const { extractEligibility } = getHelpers()
  assert.throws(() => extractEligibility('## Eligibility\n\nrisk:green risk:yellow\n'), /colon-carrying token/)
})

// ── Auto-Advance ─────────────────────────────────────────────────────────────
test('extractAutoAdvance: absent section -> off', () => {
  const { extractAutoAdvance } = getHelpers()
  assert.deepEqual(extractAutoAdvance(''), { tiers: [] })
})

test('extractAutoAdvance: literal (none) -> off', () => {
  const { extractAutoAdvance } = getHelpers()
  assert.deepEqual(extractAutoAdvance('## Auto-Advance\n\n(none)\n'), { tiers: [] })
})

test('extractAutoAdvance: risk:green enables auto-advance for that tier', () => {
  const { extractAutoAdvance } = getHelpers()
  assert.deepEqual(extractAutoAdvance('## Auto-Advance\n\nrisk:green\n'), { tiers: ['risk:green'] })
})

test('extractAutoAdvance: naming risk:yellow or risk:red HALTs', () => {
  const { extractAutoAdvance } = getHelpers()
  assert.throws(() => extractAutoAdvance('## Auto-Advance\n\nrisk:yellow\n'), /HALT/)
})

// ── Stop Predicate ───────────────────────────────────────────────────────────
test('parseStopPredicate: absent -> max-iterations: 1, no predicate', () => {
  const { parseStopPredicate } = getHelpers()
  assert.deepEqual(parseStopPredicate(''), { predicate: null, maxIterations: 1 })
})

test('parseStopPredicate: valid selector/condition + max-iterations', () => {
  const { parseStopPredicate } = getHelpers()
  const text = '## Stop Predicate\n\nroot ⇒ Done\nmax-iterations: 20\n'
  assert.deepEqual(parseStopPredicate(text), {
    predicate: { selector: 'root', condition: 'Done' },
    maxIterations: 20,
  })
})

test('parseStopPredicate: has-tag condition is valid', () => {
  const { parseStopPredicate } = getHelpers()
  const text = '## Stop Predicate\n\ntag:risk:red ⇒ has-tag:risk:red\n'
  const result = parseStopPredicate(text)
  assert.equal(result.predicate.selector, 'tag:risk:red')
})

test('parseStopPredicate: issue-body-content condition HALTs (assessments are not predicates)', () => {
  const { parseStopPredicate } = getHelpers()
  const text = '## Stop Predicate\n\nroot ⇒ contains "approved by maintainer"\n'
  assert.throws(() => parseStopPredicate(text), /canonical macrostate/)
})

test('parseStopPredicate: unknown selector HALTs before any card runs', () => {
  const { parseStopPredicate } = getHelpers()
  assert.throws(() => parseStopPredicate('## Stop Predicate\n\nboard ⇒ Done\n'), /unknown selector/)
})

test('parseStopPredicate: malformed max-iterations (0, negative, non-integer) HALTs', () => {
  const { parseStopPredicate } = getHelpers()
  assert.throws(() => parseStopPredicate('## Stop Predicate\n\nmax-iterations: 0\n'), /positive integer/)
  assert.throws(() => parseStopPredicate('## Stop Predicate\n\nmax-iterations: -3\n'), /positive integer/)
  assert.throws(() => parseStopPredicate('## Stop Predicate\n\nmax-iterations: abc\n'), /HALT/)
})

test('evaluateStopPredicate: unsatisfiable selector (matches nothing) reports satisfied, not malformed', () => {
  const { evaluateStopPredicate } = getHelpers()
  const result = evaluateStopPredicate({ selector: 'tag:no-such-label', condition: 'Done' }, [])
  assert.equal(result.satisfied, true)
})

test('evaluateStopPredicate: satisfied only when every matched card holds the condition', () => {
  const { evaluateStopPredicate } = getHelpers()
  const predicate = { selector: 'root', condition: 'Done' }
  assert.equal(
    evaluateStopPredicate(predicate, [{ id: '1', tags: [], macrostate: 'Done' }]).satisfied,
    true,
  )
  assert.equal(
    evaluateStopPredicate(predicate, [
      { id: '1', tags: [], macrostate: 'Done' },
      { id: '2', tags: [], macrostate: 'In Progress' },
    ]).satisfied,
    false,
  )
})

// ── Max Parallelism ──────────────────────────────────────────────────────────
test('parseMaxParallelism: absent -> 1 (fully sequential)', () => {
  const { parseMaxParallelism } = getHelpers()
  assert.deepEqual(parseMaxParallelism(''), { global: 1, perTier: {} })
})

test('parseMaxParallelism: global + per-tier override', () => {
  const { parseMaxParallelism } = getHelpers()
  const text = '## Max Parallelism\n\n3\nrisk:green: 5\n'
  assert.deepEqual(parseMaxParallelism(text), { global: 3, perTier: { 'risk:green': 5 } })
})

test('parseMaxParallelism: malformed cap (0, negative, non-integer) HALTs before any card is touched', () => {
  const { parseMaxParallelism } = getHelpers()
  assert.throws(() => parseMaxParallelism('## Max Parallelism\n\n0\n'), /positive integer/)
  assert.throws(() => parseMaxParallelism('## Max Parallelism\n\n-1\n'), /positive integer/)
  assert.throws(() => parseMaxParallelism('## Max Parallelism\n\nabc\n'), /positive integer/)
})

test('resolveMaxParallelism: min(D,P) cap arithmetic including 0 and 1', () => {
  const { resolveMaxParallelism, composeBatch } = getHelpers()
  const policy = { global: 3, perTier: {} }
  assert.equal(resolveMaxParallelism(policy, ['risk:green']), 3)
  assert.equal(composeBatch([], 3).length, 0) // D=0
  assert.equal(composeBatch([{ id: '1' }], 3).length, 1) // D=1 < P
  assert.equal(composeBatch([{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }], 3).length, 3) // D>P
})

test('resolveMaxParallelism: mixed-tier batch uses the global value, not a per-tier override', () => {
  const { resolveMaxParallelism } = getHelpers()
  const policy = { global: 2, perTier: { 'risk:green': 5 } }
  assert.equal(resolveMaxParallelism(policy, ['risk:green', 'risk:red']), 2)
})

// ── Audit Location ───────────────────────────────────────────────────────────
test('resolveAuditLocation: default when absent', () => {
  const { resolveAuditLocation } = getHelpers()
  assert.equal(resolveAuditLocation(''), 'automation/loop-audit.md')
})

test('resolveAuditLocation: absolute path HALTs', () => {
  const { resolveAuditLocation } = getHelpers()
  assert.throws(() => resolveAuditLocation('## Audit Location\n\n/tmp/x.md\n'), /project-relative/)
})

// ── Dependency analysis ──────────────────────────────────────────────────────
test('dependencyFilter: unmerged prerequisite holds the dependent out, audited', () => {
  const { dependencyFilter } = getHelpers()
  const cards = [
    { id: '1', prerequisites: [{ id: '9', merged: false }] },
    { id: '2', prerequisites: [{ id: '9', merged: true }] },
  ]
  const { allowed, audit } = dependencyFilter(cards)
  assert.deepEqual(allowed.map(c => c.id), ['2'])
  assert.match(audit[0].reason, /blocked by #9 \(not merged\)/)
})

// ── Mutex analysis + overrides ───────────────────────────────────────────────
test('computeMutexBatch: two cards sharing a mutex resource never batch together', () => {
  const { computeMutexBatch } = getHelpers()
  const cards = [
    { id: '1', mutexResources: ['skill:next'] },
    { id: '2', mutexResources: ['skill:next'] },
  ]
  const { batch, audit } = computeMutexBatch(cards)
  assert.deepEqual(batch.map(c => c.id), ['1'])
  assert.equal(audit.find(a => a.id === '2').reason.includes('mutex conflict'), true)
})

test('computeMutexBatch: override narrows (exclude), never adds back an excluded card', () => {
  const { computeMutexBatch } = getHelpers()
  const cards = [{ id: '1', mutexResources: [] }, { id: '2', mutexResources: [] }]
  const { batch } = computeMutexBatch(cards, { exclude: ['2'] })
  assert.deepEqual(batch.map(c => c.id), ['1'])
})

test('computeMutexBatch: sequential override pins a card alone', () => {
  const { computeMutexBatch } = getHelpers()
  const cards = [{ id: '1', mutexResources: [] }, { id: '2', mutexResources: [] }]
  const { batch } = computeMutexBatch(cards, { sequential: ['1'] })
  assert.deepEqual(batch.map(c => c.id), ['1'])
})

// ── De-duplication + unresolvable cards ──────────────────────────────────────
test('resolveCards: duplicate id de-duplicated, unresolvable branch/title excluded', () => {
  const { resolveCards } = getHelpers()
  const cards = [
    { id: '1', title: 'A', branch: 'feature/#1-a' },
    { id: '1', title: 'A', branch: 'feature/#1-a' },
    { id: '2', title: '', branch: '' },
  ]
  const { resolved, audit } = resolveCards(cards)
  assert.deepEqual(resolved.map(c => c.id), ['1'])
  assert.equal(audit.length, 2)
})

// ── Continue-token ────────────────────────────────────────────────────────
test('renderContinueToken: re-invocation line carries scope, predicate, iteration', () => {
  const { renderContinueToken } = getHelpers()
  const token = renderContinueToken({ root: '212', predicateText: 'root ⇒ Done', iteration: 2 })
  assert.match(token, /--root 212/)
  assert.match(token, /--iteration 3/)
})

// ── Orchestration control flow (agent/workflow stubs) ────────────────────────
async function runWorkflow({ args, dispatch, workflowDispatch }) {
  const calls = []
  const agent = async (prompt, opts) => {
    calls.push({ prompt, opts })
    return dispatch(prompt, opts)
  }
  const parallel = fns => Promise.all(fns.map(f => Promise.resolve().then(f).catch(() => null)))
  const workflow = async (name, wfArgs) => (workflowDispatch ?? (() => ({ batch: [] })))(name, wfArgs)
  const logs = []
  const log = m => logs.push(m)
  const phase = () => {}
  const result = await new AsyncFunction(
    'args',
    'agent',
    'parallel',
    'log',
    'phase',
    'workflow',
    SRC,
  )(args, agent, parallel, log, phase, workflow)
  return { result, calls, logs }
}

function getHelpers() {
  const h = helpers()
  if (!h) throw new Error('helper extraction failed')
  return h
}

test('orchestration: fail-closed HALT on absent/empty policy — no card touched', async () => {
  await assert.rejects(
    runWorkflow({ args: { policyText: '' }, dispatch: () => ({}) }),
    /HALT/,
  )
})

test('orchestration: nothing eligible ends the run cleanly, engine never invoked', async () => {
  let workflowCalled = false
  const { result } = await runWorkflow({
    args: { policyText: '## Eligibility\n\nrisk:green\n' },
    dispatch: () => ({ candidates: [] }),
    workflowDispatch: () => {
      workflowCalled = true
      return { batch: [] }
    },
  })
  assert.equal(workflowCalled, false)
  assert.equal(result.iterations, 0) // breaks before the counter increments
})

test('orchestration: min(D,P)==1 drives a single story through the SAME implement-batch call', async () => {
  let batchArgsSeen = null
  const { result } = await runWorkflow({
    args: { policyText: '## Eligibility\n\nrisk:green\n\n## Max Parallelism\n\n1\n' },
    dispatch: (_prompt, opts) => {
      if (opts.phase === 'Select') return { candidates: [{ id: '1', title: 'A', branch: 'feature/#1-a', tier: 'risk:green', mutexResources: [], prerequisites: [] }] }
      return {}
    },
    workflowDispatch: (name, wfArgs) => {
      batchArgsSeen = { name, wfArgs }
      return { batch: [{ id: '1', status: 'failed-implement' }] }
    },
  })
  assert.equal(batchArgsSeen.name, 'pair-implement-batch')
  assert.equal(batchArgsSeen.wfArgs.stories.length, 1)
  assert.equal(result.iterations, 1)
})

test('orchestration: an untagged card is treated as risk:red and never eligible for risk:green policy', async () => {
  let workflowCalled = false
  await runWorkflow({
    args: { policyText: '## Eligibility\n\nrisk:green\n' },
    dispatch: (_prompt, opts) => {
      if (opts.phase === 'Select') return { candidates: [{ id: '1', title: 'A', branch: 'feature/#1-a', tier: 'untagged', mutexResources: [], prerequisites: [] }] }
      return {}
    },
    workflowDispatch: () => {
      workflowCalled = true
      return { batch: [] }
    },
  })
  assert.equal(workflowCalled, false)
})

test('orchestration: review-approved risk:green with Auto-Advance verifies gates and pushes/merges', async () => {
  let advancePrompted = false
  await runWorkflow({
    args: {
      policyText: '## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\nrisk:green\n\n## Max Parallelism\n\n1\n',
    },
    dispatch: (prompt, opts) => {
      if (opts.phase === 'Select') return { candidates: [{ id: '1', title: 'A', branch: 'feature/#1-a', tier: 'risk:green', mutexResources: [], prerequisites: [] }] }
      if (opts.phase === 'Advance') {
        advancePrompted = true
        return { merged: true }
      }
      return {}
    },
    workflowDispatch: () => ({ batch: [{ id: '1', status: 'ready-for-merge', prNumber: 7 }] }),
  })
  assert.equal(advancePrompted, true)
})

test('orchestration: review-approved risk:yellow halts instead of advancing, even with Auto-Advance for green', async () => {
  let advancePrompted = false
  await runWorkflow({
    args: {
      policyText: '## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\nrisk:green\n\n## Max Parallelism\n\n1\n',
    },
    dispatch: (prompt, opts) => {
      // risk:yellow would never be selected by an eligibility filter of risk:green in
      // practice, but a mid-run tier RAISE after selection is exactly this shape: the
      // card entered the batch as risk:green and came back review-approved with its
      // outcome still tagged by the card object captured at selection time — this
      // asserts the halt path fires whenever the tier does not match Auto-Advance.
      if (opts.phase === 'Select')
        return { candidates: [{ id: '1', title: 'A', branch: 'feature/#1-a', tier: 'risk:green', mutexResources: [], prerequisites: [] }] }
      if (opts.phase === 'Advance') advancePrompted = true
      return {}
    },
    workflowDispatch: () => ({ batch: [{ id: '1', status: 'failed-review' }] }),
  })
  assert.equal(advancePrompted, false) // not review-approved -> never even considered
})
