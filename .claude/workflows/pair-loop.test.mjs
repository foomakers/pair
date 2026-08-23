// Dry-run harness for pair-loop.js (#250 T12, review round 1 fixes): executes
// the workflow source with stubbed `agent`/`parallel`/`workflow`/`phase`/`log`
// (the sandbox primitives) and asserts: predicate grammar (accept/reject,
// body-content rejection, composite-selector rejection), min(D,P) cap
// arithmetic including 0 and 1 with correct cap-audit reconciliation,
// dependency ordering on an unmerged prerequisite, mutex exclusion (incl. the
// post-sequential-pin deferral), override narrowing-only, fail-closed policy
// read (all five knobs, incl. malformed-shape HALTs), eligibility incl.
// untagged->red, args validation, escalation exclusion across iterations,
// mid-run tier-raise halting auto-advance, and audit-write verification.
// Fixture-board runs — no live agent run is required (Validation and Testing
// Strategy). Run (from repo root): `pnpm workflows:test` — i.e.
// `cd .claude/workflows && node --test`.
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
// half runs top-level statements (`validateArgs(args)`, `phase('Policy')`,
// the `while(true)` loop) that need real `agent`/`workflow`/`phase`/`log`
// stubs to not throw immediately. Splitting on the marker lets this file
// exercise the pure functions directly, on the exact same declarations the
// orchestration below uses, with no risk of a second, drifting copy.
const ORCH_MARKER = '// ORCHESTRATION — the unattended fan-out path'
const HELPERS_SRC = FULL_SRC.slice(0, FULL_SRC.indexOf(ORCH_MARKER))
const SRC = FULL_SRC

const HELPERS = new Function(
  `${HELPERS_SRC}\nreturn { extractEligibility, extractAutoAdvance, parseStopPredicate, evaluateStopPredicate, parseMaxParallelism, resolveMaxParallelism, resolveAuditLocation, dependencyFilter, computeMutexBatch, resolveCards, composeBatch, reconcileCapAudit, renderContinueToken, validateArgs }`,
)()

function getHelpers() {
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

test('extractEligibility: a value carrying a backtick or $( HALTs — content, not just shape (review round 3 Major-1)', () => {
  const { extractEligibility } = getHelpers()
  assert.throws(() => extractEligibility('## Eligibility\n\nrisk:green`whoami`\n'), /command fragment/)
  assert.throws(() => extractEligibility('## Eligibility\n\nrisk:green$(whoami)\n'), /command fragment/)
})

test('extractEligibility: a legitimate spaced label with none of those characters still passes (guideline\'s own allowance preserved)', () => {
  const { extractEligibility } = getHelpers()
  assert.deepEqual(extractEligibility('## Eligibility\n\ngood first issue\n'), { kind: 'value', value: 'good first issue' })
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
  assert.deepEqual(extractAutoAdvance('## Auto-Advance\n\nrisk:green\n', 'risk:green'), { tiers: ['risk:green'] })
})

test('extractAutoAdvance: naming a tier other than the Eligibility value HALTs, with no English-substring heuristic (review round 3 Major-3)', () => {
  const { extractAutoAdvance } = getHelpers()
  // risk:yellow is rejected NOT because it matches /yellow|red/ but because it
  // is not the project's Eligibility tier — the same check catches a RENAMED
  // family's own red-equivalent, which no substring heuristic could.
  assert.throws(() => extractAutoAdvance('## Auto-Advance\n\nrisk:yellow\n', 'risk:green'), /the only tier this project could ever auto-advance/)
  assert.throws(() => extractAutoAdvance('## Auto-Advance\n\npriority:critical\n', 'priority:low'), /the only tier this project could ever auto-advance/)
})

test('extractAutoAdvance: free prose that is not a label shape HALTs (review m1)', () => {
  const { extractAutoAdvance } = getHelpers()
  assert.throws(() => extractAutoAdvance('## Auto-Advance\n\nmerge everything\n'), /not a well-formed/)
})

test('extractAutoAdvance: without an eligibilityValue param, only shape/prompt-safety is checked (backward-compatible direct call)', () => {
  const { extractAutoAdvance } = getHelpers()
  assert.deepEqual(extractAutoAdvance('## Auto-Advance\n\nrisk:yellow\n'), { tiers: ['risk:yellow'] })
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

test('parseStopPredicate: tag:<label> selector is valid', () => {
  const { parseStopPredicate } = getHelpers()
  const text = '## Stop Predicate\n\ntag:risk:red ⇒ has-tag:risk:red\n'
  const result = parseStopPredicate(text)
  assert.equal(result.predicate.selector, 'tag:risk:red')
})

test('parseStopPredicate: a composite selector like root:has-tag:x HALTs (review M7)', () => {
  const { parseStopPredicate } = getHelpers()
  assert.throws(
    () => parseStopPredicate('## Stop Predicate\n\nroot:has-tag:risk:red ⇒ Done\n'),
    /is not `root`, `tag:<label>` or `type:<issue-type>`/,
  )
})

test('parseStopPredicate: a tag:/type: payload carrying a backtick or $( HALTs — content, not just prefix shape (review round 3 Major-1)', () => {
  const { parseStopPredicate } = getHelpers()
  assert.throws(
    () => parseStopPredicate('## Stop Predicate\n\ntag:risk:green`whoami` ⇒ Done\n'),
    /is not `root`, `tag:<label>` or `type:<issue-type>`/,
  )
})

test('parseStopPredicate: issue-body-content condition HALTs (assessments are not predicates)', () => {
  const { parseStopPredicate } = getHelpers()
  const text = '## Stop Predicate\n\nroot ⇒ contains "approved by maintainer"\n'
  assert.throws(() => parseStopPredicate(text), /canonical macrostate/)
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

test('parseMaxParallelism: a per-tier override naming a non-label key HALTs (review m2)', () => {
  const { parseMaxParallelism } = getHelpers()
  assert.throws(
    () => parseMaxParallelism('## Max Parallelism\n\n3\nnot a label: 5\n'),
    /not a well-formed/,
  )
})

test('parseMaxParallelism: a well-formed but unknown tier HALTs when a Tag Projection family is supplied (review round 2/3)', () => {
  const { parseMaxParallelism } = getHelpers()
  const tagProjectionFamily = new Set(['risk:green', 'risk:yellow', 'risk:red'])
  assert.throws(
    () => parseMaxParallelism('## Max Parallelism\n\n3\nrisk:blue: 5\n', tagProjectionFamily),
    /does not emit/,
  )
  assert.doesNotThrow(() => parseMaxParallelism('## Max Parallelism\n\n3\nrisk:green: 5\n', tagProjectionFamily))
})

test('parseMaxParallelism: an EMITTED but never-eligible tier is a legal override target (review round 3 Minor)', () => {
  const { parseMaxParallelism } = getHelpers()
  // risk:red is emitted by this repo's Tag Projection but never eligible —
  // round 2's fix (family = eligibility ∪ auto-advance tiers) false-HALTed
  // this exact, legitimate narrowing override.
  const tagProjectionFamily = new Set(['risk:green', 'risk:yellow', 'risk:red'])
  assert.doesNotThrow(() => parseMaxParallelism('## Max Parallelism\n\n3\nrisk:red: 1\n', tagProjectionFamily))
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

test('resolveAuditLocation: a path escaping via .. HALTs (review m3)', () => {
  const { resolveAuditLocation } = getHelpers()
  assert.throws(
    () => resolveAuditLocation('## Audit Location\n\n../../etc/x.md\n'),
    /escapes the working area/,
  )
})

test('resolveAuditLocation: a multi-line body HALTs — the section takes exactly one path (review round 3 Major-1)', () => {
  const { resolveAuditLocation } = getHelpers()
  assert.throws(
    () => resolveAuditLocation('## Audit Location\n\nautomation/a.md\nautomation/b.md\n'),
    /more than one line/,
  )
})

test('resolveAuditLocation: a path carrying a backtick or $( HALTs — content, not just traversal (review round 3 Major-1)', () => {
  const { resolveAuditLocation } = getHelpers()
  assert.throws(
    () => resolveAuditLocation('## Audit Location\n\nautomation/`whoami`.md\n'),
    /command fragment/,
  )
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

test('computeMutexBatch: every card after a sequential pin still gets an audit entry (review m4)', () => {
  const { computeMutexBatch } = getHelpers()
  const cards = [
    { id: '1', mutexResources: [] },
    { id: '2', mutexResources: [] },
    { id: '3', mutexResources: [] },
  ]
  const { audit } = computeMutexBatch(cards, { sequential: ['1'] })
  assert.equal(audit.length, 3)
  assert.equal(audit.find(a => a.id === '3').excluded, true)
  assert.match(audit.find(a => a.id === '3').reason, /deferred/)
})

// ── Cap-audit reconciliation ──────────────────────────────────────────────────
test('reconcileCapAudit: a card the cap drops flips from included to excluded (review M2)', () => {
  const { computeMutexBatch, composeBatch, reconcileCapAudit } = getHelpers()
  const cards = [
    { id: '1', mutexResources: [] },
    { id: '2', mutexResources: [] },
    { id: '3', mutexResources: [] },
  ]
  const { batch: mutexBatch, audit } = computeMutexBatch(cards)
  const finalBatch = composeBatch(mutexBatch, 1)
  const reconciled = reconcileCapAudit(audit, finalBatch.map(c => c.id))
  assert.deepEqual(reconciled.find(a => a.id === '1'), { id: '1', excluded: false, mutexResources: [] })
  assert.equal(reconciled.find(a => a.id === '2').excluded, true)
  assert.match(reconciled.find(a => a.id === '2').reason, /over max_parallelism cap/)
  assert.equal(reconciled.find(a => a.id === '3').excluded, true)
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

// ── Args validation (review M4) ───────────────────────────────────────────
test('validateArgs: a safe root id, overrides and startIteration pass', () => {
  const { validateArgs } = getHelpers()
  assert.doesNotThrow(() =>
    validateArgs({ root: '212', overrides: { exclude: ['1'], sequential: ['2'] }, startIteration: 3 }),
  )
})

test('validateArgs: an unsafe root (shell metacharacters / traversal) HALTs', () => {
  const { validateArgs } = getHelpers()
  assert.throws(() => validateArgs({ root: '212; rm -rf /' }), /not a safe issue id/)
  assert.throws(() => validateArgs({ root: '../etc' }), /not a safe issue id/)
})

test('validateArgs: overrides.exclude/sequential must be arrays of safe ids', () => {
  const { validateArgs } = getHelpers()
  assert.throws(() => validateArgs({ overrides: { exclude: 'not-an-array' } }), /must be an array/)
  assert.throws(() => validateArgs({ overrides: { exclude: ['1; rm -rf /'] } }), /must be an array/)
})

test('validateArgs: startIteration must be a non-negative integer', () => {
  const { validateArgs } = getHelpers()
  assert.throws(() => validateArgs({ startIteration: -1 }), /non-negative integer/)
  assert.throws(() => validateArgs({ startIteration: 1.5 }), /non-negative integer/)
})

// ── Orchestration control flow (agent/workflow stubs) ────────────────────────
// Defaults answer the two calls EVERY run now makes regardless of scenario —
// the audit-based resume read (Policy phase) and the audit write confirmation
// (Audit phase, review M5) — so per-test dispatch only needs to cover what
// that test actually varies.
function runWorkflow({ args, dispatch, workflowDispatch, auditWritten = true, resumeHaltedIds = [] }) {
  const calls = []
  const agent = async (prompt, opts) => {
    calls.push({ prompt, opts })
    if (opts.phase === 'Policy' && prompt.includes('audit file')) return { haltedCardIds: resumeHaltedIds }
    if (opts.phase === 'Audit') return { written: auditWritten, path: 'x' }
    return dispatch(prompt, opts)
  }
  const parallel = fns => Promise.all(fns.map(f => Promise.resolve().then(f).catch(() => null)))
  const workflow = async (name, wfArgs) => (workflowDispatch ?? (() => ({ batch: [] })))(name, wfArgs)
  const logs = []
  const log = m => logs.push(m)
  const phase = () => {}
  return new AsyncFunction('args', 'agent', 'parallel', 'log', 'phase', 'workflow', SRC)(
    args,
    agent,
    parallel,
    log,
    phase,
    workflow,
  ).then(result => ({ result, calls, logs }))
}

test('orchestration: fail-closed HALT on absent/empty policy — no card touched', async () => {
  await assert.rejects(
    runWorkflow({ args: { policyText: '' }, dispatch: () => ({}) }),
    /HALT/,
  )
})

test('orchestration: unsafe args.root HALTs before any agent call runs', async () => {
  await assert.rejects(
    runWorkflow({ args: { policyText: '## Eligibility\n\nrisk:green\n', root: '1; rm -rf /' }, dispatch: () => ({}) }),
    /not a safe issue id/,
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
  assert.equal(batchArgsSeen.wfArgs.cards.length, 1)
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

test('orchestration: review-approved risk:green with Auto-Advance re-reads the tier and pushes/merges', async () => {
  let advancePrompted = false
  await runWorkflow({
    args: {
      policyText: '## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\nrisk:green\n\n## Max Parallelism\n\n1\n',
    },
    dispatch: (prompt, opts) => {
      if (opts.phase === 'Select') return { candidates: [{ id: '1', title: 'A', branch: 'feature/#1-a', tier: 'risk:green', mutexResources: [], prerequisites: [] }] }
      if (opts.phase === 'Advance' && prompt.includes('CURRENT')) return { tier: 'risk:green' }
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

test('orchestration: a mid-run tier raise (green -> red) halts auto-advance even with an approved PR (review M3)', async () => {
  let mergeAttempted = false
  const { result } = await runWorkflow({
    args: {
      policyText: '## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\nrisk:green\n\n## Max Parallelism\n\n1\n',
    },
    dispatch: (prompt, opts) => {
      if (opts.phase === 'Select') return { candidates: [{ id: '1', title: 'A', branch: 'feature/#1-a', tier: 'risk:green', mutexResources: [], prerequisites: [] }] }
      // The re-read (M3's own agent call) reports the tier RAISED since selection.
      if (opts.phase === 'Advance' && prompt.includes('CURRENT')) return { tier: 'risk:red' }
      if (opts.phase === 'Advance') {
        mergeAttempted = true
        return { merged: true }
      }
      return {}
    },
    workflowDispatch: () => ({ batch: [{ id: '1', status: 'ready-for-merge', prNumber: 7 }] }),
  })
  assert.equal(mergeAttempted, false)
  const haltEntry = result.log.find(l => l.id === '1' && l.reason?.includes('tier changed'))
  assert.ok(haltEntry, 'expected a halt entry recording the mid-run tier change')
})

test('orchestration: an escalated card is excluded from every subsequent iteration, never re-driven (review M1)', async () => {
  let batchCalls = 0
  const { result } = await runWorkflow({
    args: {
      policyText: '## Eligibility\n\nrisk:green\n\n## Max Parallelism\n\n1\n## Stop Predicate\n\nmax-iterations: 3\n',
    },
    dispatch: (_prompt, opts) => {
      if (opts.phase === 'Select') return { candidates: [{ id: '1', title: 'A', branch: 'feature/#1-a', tier: 'risk:green', mutexResources: [], prerequisites: [] }] }
      return {}
    },
    workflowDispatch: () => {
      batchCalls++
      return { batch: [{ id: '1', status: 'escalate' }] }
    },
  })
  // Iteration 0 drives it once, sees `escalate`, halts card #1 — every
  // subsequent iteration must select nothing (card #1 is the only candidate
  // the Select stub ever returns) and the run ends on "nothing eligible".
  assert.equal(batchCalls, 1)
  assert.equal(result.log.filter(l => l.status === 'escalate').length, 1)
})

test('orchestration: audit write not confirmed HALTs the run (review M5)', async () => {
  await assert.rejects(
    runWorkflow({
      args: { policyText: '## Eligibility\n\nrisk:green\n\n## Max Parallelism\n\n1\n' },
      dispatch: (_prompt, opts) => {
        if (opts.phase === 'Select') return { candidates: [{ id: '1', title: 'A', branch: 'feature/#1-a', tier: 'risk:green', mutexResources: [], prerequisites: [] }] }
        return {}
      },
      workflowDispatch: () => ({ batch: [{ id: '1', status: 'failed-implement' }] }),
      auditWritten: false,
    }),
    /audit write.*could not be confirmed/s,
  )
})

test('orchestration: a --predicate override (Argument tier) is actually EVALUATED, not merely accepted (review M6 / round 2 m-test)', async () => {
  let predicateEvalPrompt = null
  const { result } = await runWorkflow({
    args: {
      // Adoption declares max-iterations: 50 and NO predicate — if the
      // override were ignored, this run would go 50 iterations. It must
      // instead stop on iteration 1 once the override's condition holds.
      policyText: '## Eligibility\n\nrisk:green\n\n## Max Parallelism\n\n1\n## Stop Predicate\n\nmax-iterations: 50\n',
      predicateOverride: 'root ⇒ Done',
    },
    dispatch: (prompt, opts) => {
      if (opts.phase === 'Select' && prompt.includes('pair-next'))
        return { candidates: [{ id: '1', title: 'A', branch: 'feature/#1-a', tier: 'risk:green', mutexResources: [], prerequisites: [] }] }
      if (opts.phase === 'Select') {
        predicateEvalPrompt = prompt
        return { cards: [{ id: '1', tags: [], macrostate: 'Done' }] } // satisfies `root ⇒ Done`
      }
      return {}
    },
    workflowDispatch: () => ({ batch: [{ id: '1', status: 'failed-implement' }] }),
  })
  assert.ok(predicateEvalPrompt, 'the override predicate must actually be evaluated against board state')
  assert.equal(result.iterations, 1) // stopped after iteration 0, never reached 50
  // Round-3 Minor: this alone would pass identically if maxIterations had
  // silently degraded to the fail-safe 1 instead of retaining the adoption
  // file's 50 — assert the resolved value directly. `applyPredicateOverride`
  // itself lives in the orchestration half (post-marker) and re-parses via
  // the same `parseStopPredicate`, so this is the equivalent public check.
  const { parseStopPredicate } = getHelpers()
  const overridden = parseStopPredicate(`## Stop Predicate\n\nroot ⇒ Done\nmax-iterations: 50\n`)
  assert.equal(overridden.maxIterations, 50)
})

test('orchestration: a gate-red merge refusal is parked, never re-driven through the full pipeline again (review round 3 Major-2)', async () => {
  let batchCalls = 0
  const { result } = await runWorkflow({
    args: {
      policyText: '## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\nrisk:green\n\n## Max Parallelism\n\n1\n## Stop Predicate\n\nmax-iterations: 3\n',
    },
    dispatch: (prompt, opts) => {
      if (opts.phase === 'Select') return { candidates: [{ id: '1', title: 'A', branch: 'feature/#1-a', tier: 'risk:green', mutexResources: [], prerequisites: [] }] }
      if (opts.phase === 'Advance' && prompt.includes('CURRENT')) return { tier: 'risk:green' }
      if (opts.phase === 'Advance') return { merged: false, reason: 'lint failed' } // gate came back red
      return {}
    },
    workflowDispatch: () => {
      batchCalls++
      return { batch: [{ id: '1', status: 'ready-for-merge', prNumber: 7 }] }
    },
  })
  assert.equal(batchCalls, 1) // never re-driven on iteration 1/2 despite max-iterations: 3
  assert.ok(result.log.some(l => l.id === '1' && l.parked === true && l.reason?.includes('gate re-verification came back red')))
})

test('orchestration: an unconfirmed AC8 issue comment is recorded in the audit, never silently swallowed (review round 3 Minor)', async () => {
  const { result } = await runWorkflow({
    args: {
      policyText: '## Eligibility\n\nrisk:green\n\n## Max Parallelism\n\n1\n',
    },
    dispatch: (prompt, opts) => {
      if (opts.phase === 'Select') return { candidates: [{ id: '1', title: 'A', branch: 'feature/#1-a', tier: 'risk:green', mutexResources: [], prerequisites: [] }] }
      if (opts.phase === 'Advance' && prompt.includes('CURRENT')) return { tier: 'risk:green' }
      if (opts.phase === 'Advance' && prompt.includes('Post a comment')) return { posted: false }
      return {}
    },
    workflowDispatch: () => ({ batch: [{ id: '1', status: 'ready-for-merge', prNumber: 7 }] }),
  })
  assert.ok(result.log.some(l => l.id === '1' && l.note?.includes('could not be confirmed posted')))
})

test('orchestration: a review-approved card not covered by Auto-Advance is parked, never re-driven from scratch (review round 2 Major-1)', async () => {
  let batchCalls = 0
  let issueCommentPosted = false
  const { result } = await runWorkflow({
    args: {
      // This repo's own shipped default: Auto-Advance absent -> (none).
      policyText: '## Eligibility\n\nrisk:green\n\n## Max Parallelism\n\n1\n## Stop Predicate\n\nmax-iterations: 3\n',
    },
    dispatch: (prompt, opts) => {
      if (opts.phase === 'Select') return { candidates: [{ id: '1', title: 'A', branch: 'feature/#1-a', tier: 'risk:green', mutexResources: [], prerequisites: [] }] }
      if (opts.phase === 'Advance' && prompt.includes('CURRENT')) return { tier: 'risk:green' }
      if (opts.phase === 'Advance' && prompt.includes('Post a comment')) {
        issueCommentPosted = true
        return {}
      }
      return {}
    },
    workflowDispatch: () => {
      batchCalls++
      return { batch: [{ id: '1', status: 'ready-for-merge', prNumber: 7 }] }
    },
  })
  assert.equal(batchCalls, 1) // never re-driven on iteration 1/2 despite max-iterations: 3
  assert.equal(issueCommentPosted, true) // AC8: the awaited human action is recorded ON THE ISSUE
  assert.ok(result.log.some(l => l.id === '1' && l.parked === true))
})

test('orchestration: a killed-and-resumed run excludes cards the prior audit already halted (review M8)', async () => {
  let workflowCalled = false
  await runWorkflow({
    args: { policyText: '## Eligibility\n\nrisk:green\n' },
    resumeHaltedIds: ['1'],
    dispatch: (_prompt, opts) => {
      if (opts.phase === 'Select')
        return { candidates: [{ id: '1', title: 'A', branch: 'feature/#1-a', tier: 'risk:green', mutexResources: [], prerequisites: [] }] }
      return {}
    },
    workflowDispatch: () => {
      workflowCalled = true
      return { batch: [] }
    },
  })
  assert.equal(workflowCalled, false) // card #1 was already halted by a prior run — never re-selected
})

test('orchestration: startIteration seeds the loop counter (review M6 continue-token)', async () => {
  const { result } = await runWorkflow({
    args: {
      policyText: '## Eligibility\n\nrisk:green\n',
      startIteration: 5,
    },
    dispatch: () => ({ candidates: [] }),
    workflowDispatch: () => ({ batch: [] }),
  })
  assert.equal(result.iterations, 5) // breaks on "nothing eligible" before incrementing
})
