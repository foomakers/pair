import { execFileSync } from 'node:child_process'
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
import { resolvePolicy } from '../skills/pair-workflow-cycle/scripts/autonomy-policy.mjs'
// US-524: the loop holds no merge call — pair-implement-batch (batch = cycle) owns the merge and the loop
// records the batch's per-card outcome. The scenarios below script that outcome (`workflowDispatch`).

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
  `${HELPERS_SRC}\nreturn { extractEligibility, extractAutoAdvance, parseStopPredicate, evaluateStopPredicate, parseMaxParallelism, resolveMaxParallelism, resolveAuditLocation, dependencyFilter, computeMutexBatch, resolveCards, composeBatch, reconcileCapAudit, renderContinueToken, validateArgs, APPROVAL_DECLARING_SKILLS, approvalArgsFor }`,
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
  assert.match(token, /--root '212'/)
  assert.match(token, /--iteration 3/)
})

test('renderContinueToken: the full effective argument set round-trips, quote-free, ahead of the adoption gate', () => {
  const { renderContinueToken } = getHelpers()
  const token = renderContinueToken({
    root: '212', predicateText: 'x', iteration: 0,
    filter: 'risk:green', assignee: ['a', 'b'], status: 'Ready', until: 'ready', prepare: 'never', merge: 'always',
  })
  for (const part of ["--filter 'risk:green'", "--assignee 'a,b'", "--status 'Ready'", "--until 'ready'", "--prepare 'never'", "--merge 'always'", '--iteration 1'])
    assert.ok(token.includes(part), `${part} in ${token}`)
  assert.equal(renderContinueToken({ iteration: 0 }), 'pair-loop --iteration 1')
})

test('renderContinueToken: shell-safe — values with spaces/;/quotes survive a real shell word-split (d1-1)', () => {
  const { renderContinueToken } = getHelpers()
  const vals = { prepare: 'when; has: risk:red', merge: 'never; lacks: needs-human', assignee: 'a b', predicateText: `it's $HOME \`x\` "q"` }
  const token = renderContinueToken({ root: '212', iteration: 0, ...vals })
  const out = execFileSync('sh', ['-c', `printf '%s\\n' ${token}`], { encoding: 'utf8' }).split('\n').slice(0, -1)
  assert.deepEqual(out, ['pair-loop', '--root', '212', '--assignee', 'a b', '--prepare', 'when; has: risk:red', '--merge', 'never; lacks: needs-human', '--predicate', vals.predicateText, '--iteration', '1'])
})

test('continue-token: --merge always (stricter-than-adoption argument) is handed to the resolve call on resume', async () => {
  // resume = the same args the token renders, so the resolve dispatch must see merge: always
  const { renderContinueToken } = getHelpers()
  assert.match(renderContinueToken({ iteration: 3, merge: 'always' }), /--merge 'always' --iteration 4$/)
})

test('loop: assignee/status arrays render identically in the Select prompt and the resolve call', async () => {
  const src = readFileSync(new URL('./pair-loop.js', import.meta.url), 'utf8')
  assert.ok(!/--assignee \$\{JSON\.stringify\(args\.assignee\)\}/.test(src), 'Select must not JSON.stringify the array')
  assert.ok(src.includes('selectionText(args.assignee)') && src.includes('selectionText(args[k])'), 'one shared renderer')
  assert.ok(!/return \{ eligibility, autoAdvance/.test(src), 'the validation-only autoAdvance value is not carried')
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
  const flag = (prompt, name) => new RegExp(`--${name} (\\S+)`).exec(prompt)?.[1]
  const agent = async (prompt, opts) => {
    calls.push({ prompt, opts })
    if (opts.phase === 'Policy' && prompt.includes('audit file')) return { haltedCardIds: resumeHaltedIds }
    if (opts.phase === 'Audit') return { written: auditWritten, path: 'x' }
    // The agent-run `autonomy-policy.mjs resolve` is answered by the REAL script function (the authority).
    if (/autonomy-policy\.mjs resolve/.test(prompt)) {
      const given = /--args '([^']*)'/.exec(prompt)
      return resolvePolicy({ args: given ? JSON.parse(given[1]) : {}, adoptionText: args.policyText })
    }
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

test('orchestration: ANY non-ready status halts the card — a status outside escalate/failed-* is never re-driven (US-479 c0)', async () => {
  // The engine emits statuses that start with neither `failed` nor `escalate` (`seal-invalidated`,
  // `stale-history-decision`). A halt rule spelled as an allow-list of failure prefixes let those
  // cards fall through: not halted, not parked, re-selected and re-driven on every iteration until
  // max-iterations. The only status that may ever advance is `ready-for-merge`; everything else halts.
  for (const status of ['seal-invalidated', 'stale-history-decision', 'some-future-status']) {
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
        return { batch: [{ id: '1', status }] }
      },
    })
    assert.equal(batchCalls, 1, `${status}: card was re-driven`)
    const halted = result.log.find(l => l.id === '1' && l.excluded === true && /halted/.test(l.reason ?? ''))
    assert.ok(halted, `${status}: no halted audit entry`)
    assert.match(halted.reason, new RegExp(status))
  }
})

test('orchestration: a `ready-for-merge` row without a 40-hex reviewedHead and a verdict is an INCOMPLETE handoff — halted, never advanced (US-479 AC-11)', async () => {
  for (const row of [
    { id: '1', status: 'ready-for-merge', prNumber: 7 },
    { id: '1', status: 'ready-for-merge', prNumber: 7, reviewedHead: 'abc', verdict: 'APPROVED' },
    { id: '1', status: 'ready-for-merge', prNumber: 7, reviewedHead: 'a'.repeat(40), verdict: '' },
    { id: '1', status: 'ready-for-merge', reviewedHead: 'a'.repeat(40), verdict: 'APPROVED' },
  ]) {
    let advancePrompted = false
    const { result } = await runWorkflow({
      args: { policyText: '## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\nrisk:green\n\n## Max Parallelism\n\n1\n' },
      dispatch: (prompt, opts) => {
        if (opts.phase === 'Select') return { candidates: [{ id: '1', title: 'A', branch: 'feature/#1-a', tier: 'risk:green', mutexResources: [], prerequisites: [] }] }
        if (opts.phase === 'Advance' && prompt.includes('CURRENT')) return { tier: 'risk:green' }
        if (opts.phase === 'Advance') {
          advancePrompted = true
          return { merged: true }
        }
        return {}
      },
      workflowDispatch: () => ({ batch: [row] }),
    })
    assert.equal(advancePrompted, false, `${JSON.stringify(row)}: advanced on incomplete evidence`)
    const halted = result.log.find(l => l.id === '1' && l.excluded === true && /halted/.test(l.reason ?? ''))
    assert.ok(halted, `${JSON.stringify(row)}: no halted audit entry`)
    assert.match(halted.reason, /reviewedHead|verdict|prNumber/)
  }
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

// ── `$approval` threading (US-464 T-4) ───────────────────────────────────────
// Tier 1's half of the seam #451 and #410 left unwired. The signal is threaded
// ONLY to a skill that DECLARES it (AC3/D18 — borrowed, never invented), and the
// posture is unconditional here because `pair-loop.js` IS the unattended fan-out
// path: nobody is present for any of it. See the ADL, and the cross-tier corpus
// in apps/pair-cli/src/commands/run/tier-parity.test.ts.

test('approvalArgsFor: a declaring skill gets --approval auto', () => {
  const { approvalArgsFor } = getHelpers()
  assert.equal(approvalArgsFor('pair-capability-assess-stack'), ' --approval auto')
  assert.equal(approvalArgsFor('pair-capability-map-contexts'), ' --approval auto')
})

test('approvalArgsFor: tolerates the rendered slash form, since prompts spell it `/skill`', () => {
  const { approvalArgsFor } = getHelpers()
  assert.equal(approvalArgsFor('/pair-capability-assess-stack'), ' --approval auto')
})

test('approvalArgsFor: a skill declaring no approval round gets NOTHING (AC3)', () => {
  const { approvalArgsFor } = getHelpers()
  // The two skills this workflow actually composes today.
  assert.equal(approvalArgsFor('pair-next'), '')
  assert.equal(approvalArgsFor('/pair-capability-verify-quality'), '')
  // Callers that FORWARD the signal without declaring it, and the two assess-*
  // members ADR-021 deliberately left out (no approval round at all).
  assert.equal(approvalArgsFor('pair-process-bootstrap'), '')
  assert.equal(approvalArgsFor('pair-process-refine-story'), '')
  assert.equal(approvalArgsFor('pair-capability-assess-cost'), '')
  assert.equal(approvalArgsFor('pair-capability-assess-coupling'), '')
})

test('approvalArgsFor: fails closed on a malformed skill name rather than inventing an argument', () => {
  const { approvalArgsFor } = getHelpers()
  for (const bogus of [undefined, null, '', 42, {}]) assert.equal(approvalArgsFor(bogus), '')
})

test('APPROVAL_DECLARING_SKILLS: exactly the eleven members ADR-021 converted', () => {
  const { APPROVAL_DECLARING_SKILLS } = getHelpers()
  assert.deepEqual([...APPROVAL_DECLARING_SKILLS].sort(), [
    'pair-capability-assess-ai',
    'pair-capability-assess-architecture',
    'pair-capability-assess-infrastructure',
    'pair-capability-assess-methodology',
    'pair-capability-assess-observability',
    'pair-capability-assess-pm',
    'pair-capability-assess-security',
    'pair-capability-assess-stack',
    'pair-capability-assess-testing',
    'pair-capability-map-contexts',
    'pair-capability-map-subdomains',
    'pair-process-plan-tasks',
    'pair-process-refine-story',
  ])
})

test('orchestration: the /pair-next Select prompt is UNCHANGED — pair-next declares no approval round', async () => {
  const { calls } = await runWorkflow({
    args: { policyText: '## Eligibility\n\nrisk:green\n' },
    dispatch: () => ({ candidates: [] }),
    workflowDispatch: () => ({ batch: [] }),
  })
  const select = calls.find(c => c.opts.phase === 'Select')
  assert.ok(select, 'the Select phase must have run')
  assert.ok(select.prompt.startsWith('Run /pair-next --filter "risk:green"'))
  // The no-drift guarantee, tier 1's side: threading IS applied at this live call
  // site and contributes nothing, because the composed skill declares none.
  assert.equal(select.prompt.includes('--approval'), false)
})

// Review of PR #465, Minor 1: the prompt assertions below are NECESSARY but not
// SUFFICIENT. Deleting both `${approvalArgsFor(...)}` interpolations from
// pair-loop.js left every suite green — the prompts they check are supposed to
// be unchanged (neither composed skill declares an approval round), so an
// assertion on the rendered output cannot tell a working no-op from a missing
// mechanism. These two check the SOURCE: whatever verb introduces a composed
// skill, its name must be followed by the `approvalArgsFor` CALL.
// `/<name>` where the slash does not continue an identifier — which is what
// separates an invocation (`Run /pair-next`) from a path or prose mention
// (`apps/pair-cli/…`, `pair-implement-batch/pair-analyze-pr-batch`), both of
// which occur in this file and are NOT invocations.
function composedSkills() {
  return [...FULL_SRC.matchAll(/(?<![\w-])\/(pair-[a-z0-9-]+)/g)].map(match => ({
    name: match[1],
    following: FULL_SRC.slice(match.index + match[0].length),
  }))
}

test('source: every composed skill is followed by the approvalArgsFor call', () => {
  // Deliberately independent of WHICH skills are composed, so a new site fails
  // with "not wired at that site" rather than with a list mismatch.
  const composed = composedSkills()
  assert.ok(composed.length > 0, 'the invocation scan matched nothing — it would pass vacuously')

  for (const { name, following } of composed) {
    assert.ok(
      following.startsWith(`\${approvalArgsFor('${name}')}`),
      `/${name} is composed without \${approvalArgsFor('${name}')} immediately after it — ` +
        `the threading mechanism is not wired at that site`,
    )
  }
})

test('source: the composed set is exactly the one skill the loop names (pair-next), not declaring', () => {
  const { APPROVAL_DECLARING_SKILLS } = getHelpers()
  const names = composedSkills().map(s => s.name)

  assert.deepEqual(names, ['pair-next'])
  // The T-4 scope finding, pinned: tier 1's exposure to the family is TRANSITIVE
  // (pair-implement-batch -> /pair-process-implement -> /pair-capability-assess-stack),
  // and neither intermediary declares $approval, so threading it there would be
  // the invented argument D18 forbids.
  for (const name of names) assert.equal(APPROVAL_DECLARING_SKILLS.has(name), false)
})

test('source: the --approval literal exists only inside approvalArgsFor, never hardcoded in a prompt', () => {
  // A second occurrence would be a prompt spelling the argument itself, which
  // bypasses the family lookup and could hand it to a NON-declaring skill.
  assert.equal(FULL_SRC.split(' --approval auto').length - 1, 1)
  assert.ok(FULL_SRC.includes(`? ' --approval auto' : ''`))
})

// ── US-521 r1-g3 (r0-4): tier 1 hands the batch the SAME policy text it validated ───────────────
// The batch refuses a launch without the caller's Read of tech/automation.md (`policyText`), because
// the Workflow sandbox cannot read it; pair-loop holds that Read and must forward it verbatim.
const LEGACY_LOOP_POLICY = '## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\nrisk:green\n\n## Max Parallelism\n\n1\n'
const oneEligible = (_prompt, opts) =>
  opts.phase === 'Select' ? { candidates: [{ id: '1', title: 'A', branch: 'feature/#1-a', tier: 'risk:green', mutexResources: [], prerequisites: [] }] } : {}

test('G3-L1: pair-loop forwards its policyText verbatim to pair-implement-batch', async () => {
  let seen = null
  await runWorkflow({
    args: { policyText: LEGACY_LOOP_POLICY },
    dispatch: oneEligible,
    workflowDispatch: (name, wfArgs) => {
      seen = { name, wfArgs }
      return { batch: [{ id: '1', status: 'failed-implement' }] }
    },
  })
  assert.equal(seen?.name, 'pair-implement-batch')
  assert.equal(seen.wfArgs.policyText, LEGACY_LOOP_POLICY)
})

test('G3-L5: interaction — the REAL batch, launched by pair-loop on a legacy-only policy, passes its guard (reaches its first dispatch)', async () => {
  const BATCH_SRC = readFileSync(new URL('./pair-implement-batch.js', import.meta.url), 'utf8').replace(/^export /gm, '')
  let batchError = null
  await runWorkflow({
    args: { policyText: LEGACY_LOOP_POLICY },
    dispatch: oneEligible,
    workflowDispatch: async (_name, wfArgs) => {
      const never = async () => {
        throw new Error('no agent may run')
      }
      await new AsyncFunction('args', 'agent', 'parallel', 'log', BATCH_SRC)(wfArgs, never, never, () => {}).catch(e => {
        batchError = e.message
      })
      return { batch: [{ id: '1', status: 'failed-implement' }] }
    },
  })
  assert.match(String(batchError), /no agent may run/)
  assert.doesNotMatch(String(batchError), /autonomy-not-supported-until-#524|policyText/)
})

// ═══════════════════════════════════════════════════════════════════════════
// US-524 — `pair-loop` without its own merge: select (pair-next) → batch → repeat. The merge scenarios of the
// loop (merged, parked awaiting-human, halted, tier raised, head moved, gate red, unfinished cascade) are the
// BATCH's outcome rows now; the loop records them with the same audit expectations as before.
// ═══════════════════════════════════════════════════════════════════════════
const HEAD40 = 'a'.repeat(40)
const READY_ROW = { id: '1', status: 'ready-for-merge', prNumber: 7, reviewedHead: HEAD40, verdict: 'APPROVED' }
const driveRows = (row, args = {}) => runWorkflow({ args: { policyText: LEGACY_LOOP_POLICY, ...args }, dispatch: oneEligible, workflowDispatch: () => ({ batch: [row] }) })

test('US-524 AC-4: pair-loop.js contains no cycle-merge call, merge script or merge schema (grep-pinned)', () => {
  const code = FULL_SRC.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
  assert.doesNotMatch(code, /cycle-merge/)
  assert.doesNotMatch(code, /MERGE_SCRIPT|MERGE_CHECK_SCHEMA|MERGE_RUN_SCHEMA|--autoAdvance|--mergeGate/)
  assert.doesNotMatch(FULL_SRC, /autonomy-not-supported/)
})

test('US-524 AC-4: until / prepare / merge are handed to the batch as passed — and only those passed', async () => {
  let seen
  await runWorkflow({ args: { policyText: LEGACY_LOOP_POLICY, until: 'merged', merge: 'when; lacks: risk:red' }, dispatch: oneEligible, workflowDispatch: (_n, a) => ((seen = a), { batch: [{ id: '1', status: 'failed-implement' }] }) })
  assert.equal(seen.until, 'merged')
  assert.equal(seen.merge, 'when; lacks: risk:red')
  assert.equal(Object.hasOwn(seen, 'prepare'), false)
  assert.deepEqual(seen.cards, [{ id: '1', title: 'A', branch: 'feature/#1-a', tier: 'risk:green' }])
  let none
  await runWorkflow({ args: { policyText: LEGACY_LOOP_POLICY }, dispatch: oneEligible, workflowDispatch: (_n, a) => ((none = a), { batch: [{ id: '1', status: 'failed-implement' }] }) })
  for (const k of ['until', 'prepare', 'merge']) assert.equal(Object.hasOwn(none, k), false, k)
})

test('US-524 AC-4: selection runs through pair-next with the resolved filter / assignee / status / root, and is never re-filtered by tier', async () => {
  let selectPrompt
  let batchCalled = false
  await runWorkflow({
    args: { policyText: LEGACY_LOOP_POLICY, filter: 'cost:green', assignee: 'rucka', status: 'Refined', root: '485' },
    dispatch: (prompt, opts) => {
      if (opts.phase === 'Select') return (selectPrompt ??= prompt), { candidates: [{ id: '1', title: 'A', branch: 'feature/#1-a', tier: 'risk:yellow', mutexResources: [], prerequisites: [] }] }
      return {}
    },
    workflowDispatch: () => ((batchCalled = true), { batch: [{ id: '1', status: 'failed-implement' }] }),
  })
  assert.match(selectPrompt, /\/pair-next --filter "cost:green"/)
  assert.match(selectPrompt, /--assignee "rucka"/)
  assert.match(selectPrompt, /--status "Refined"/)
  assert.match(selectPrompt, /--root "485"/)
  assert.equal(batchCalled, true, 'a candidate pair-next returned is the selection — its tier is not compared here')
})

test('US-524 AC-4: an untagged candidate is handed over as risk:red (fail-safe), never dropped by the loop', async () => {
  let seen
  await runWorkflow({
    args: { policyText: LEGACY_LOOP_POLICY },
    dispatch: (_p, opts) => (opts.phase === 'Select' ? { candidates: [{ id: '1', title: 'A', branch: 'feature/#1-a', tier: 'untagged', mutexResources: [], prerequisites: [] }] } : {}),
    workflowDispatch: (_n, a) => ((seen = a), { batch: [{ id: '1', status: 'failed-implement' }] }),
  })
  assert.equal(seen.cards[0].tier, 'risk:red')
})

test('US-524: the A1 refusal is gone — new arguments and a declared `## Autonomy` start the loop', async () => {
  for (const args of [{ until: 'merged' }, { prepare: 'always' }, { merge: 'never' }, { assignee: 'x' }, { status: 'Refined' }, { filter: 'risk:green' }, { policyText: `${LEGACY_LOOP_POLICY}\n## Autonomy\n\nuntil: merged\n` }]) {
    let started = false
    await runWorkflow({ args: { policyText: LEGACY_LOOP_POLICY, ...args }, dispatch: oneEligible, workflowDispatch: () => ((started = true), { batch: [{ id: '1', status: 'failed-implement' }] }) })
    assert.equal(started, true, JSON.stringify(args))
  }
})

test('US-524 edge: an EMPTY `## Autonomy` section behaves like an absent one (parse().declared = off) — never refused, never read as a declaration', async () => {
  for (const policyText of [`## Autonomy\n\n${LEGACY_LOOP_POLICY}`, `##  Autonomy\n\n${LEGACY_LOOP_POLICY}`, `##Autonomy\nuntil: merged\n\n${LEGACY_LOOP_POLICY}`]) {
    let seen
    await runWorkflow({ args: { policyText }, dispatch: oneEligible, workflowDispatch: (_n, a) => ((seen = a), { batch: [{ id: '1', status: 'failed-implement' }] }) })
    assert.equal(seen.policyText, policyText, 'forwarded verbatim: the batch\'s policy script (parse().declared) decides, the loop holds no reader')
    for (const k of ['until', 'prepare', 'merge']) assert.equal(Object.hasOwn(seen, k), false)
  }
})

test('US-524: the new arguments are validated by content before any agent runs', async () => {
  for (const [key, bad] of [['until', "merged'; x"], ['merge', 'a`b`'], ['prepare', 'a\nb'], ['assignee', 'a$(b)'], ['status', 'a`b`'], ['filter', 'x\ny']])
    await assert.rejects(runWorkflow({ args: { policyText: LEGACY_LOOP_POLICY, [key]: bad }, dispatch: () => assert.fail('no agent may run'), workflowDispatch: () => assert.fail('no batch') }), new RegExp(`args\\.${key}`), key)
})

test('US-524 AC-2/5: the batch outcome is recorded — merged (autoAdvance), cascade unfinished (parked), awaiting-human, escalated, target-ready, PR-ready', async () => {
  const merged = await driveRows({ ...READY_ROW, status: 'merged', cascaded: true, reason: 'merged' })
  assert.ok(merged.result.log.some(l => l.id === '1' && l.autoAdvance === true && !l.parked))
  const open = await driveRows({ ...READY_ROW, status: 'merged', cascaded: false, reason: 'closure failed' })
  assert.ok(open.result.log.some(l => l.id === '1' && l.autoAdvance === true && l.parked === true && /MERGED but the post-merge cascade did not confirm complete/.test(l.reason)))
  const parked = await driveRows({ ...READY_ROW, status: 'awaiting-human', reason: 'merge: always', commentPosted: false })
  assert.ok(parked.result.log.some(l => l.id === '1' && l.parked === true && /awaiting human — merge: always/.test(l.reason)))
  assert.ok(parked.result.log.some(l => l.id === '1' && /could not be confirmed posted/.test(l.note ?? '')), 'an unconfirmed comment is recorded, never swallowed')
  const esc = await driveRows({ id: '1', status: 'escalated', stage: 'prepare', conditions: ['has:cost:red'] })
  assert.ok(esc.result.log.some(l => l.id === '1' && l.escalated === true && l.excluded === true && l.stage === 'prepare' && l.conditions[0] === 'has:cost:red' && /not re-drivable/.test(l.reason)))
  const target = await driveRows({ id: '1', status: 'target-ready', target: 'ready', stage: 'implement' })
  assert.ok(target.result.log.some(l => l.id === '1' && l.excluded === true && /until target \(ready\)/.test(l.reason)))
  const ready = await driveRows(READY_ROW)
  assert.ok(ready.result.log.some(l => l.id === '1' && l.parked === true && /PR-ready/.test(l.reason)))
})

test('US-524 AC-5/BR-4: every outcome ends the card\'s drive — merged, parked, escalated, halted are never re-selected', async () => {
  for (const row of [{ ...READY_ROW, status: 'merged', cascaded: true }, { ...READY_ROW, status: 'awaiting-human' }, { id: '1', status: 'escalated', conditions: ['lacks:x'] }, { ...READY_ROW, status: 'halted', reason: 'tier changed risk:green -> risk:red' }, READY_ROW]) {
    let batchCalls = 0
    await runWorkflow({ args: { policyText: `${LEGACY_LOOP_POLICY}\n## Stop Predicate\n\nmax-iterations: 3\n` }, dispatch: oneEligible, workflowDispatch: () => (batchCalls++, { batch: [row] }) })
    assert.equal(batchCalls, 1, JSON.stringify(row))
  }
})

test('US-524: a halted batch row (a refused merge, a moved head, a red gate, malformed signals) is excluded with its reason — never retried silently', async () => {
  for (const reason of ['PR head moved since the review', 'pair-review conclusion is failure', 'the merge stage returned no readable decision', 'the tier\'s gate set came back red at merge time']) {
    const r = await driveRows({ ...READY_ROW, status: 'halted', reason })
    assert.ok(r.result.log.some(l => l.id === '1' && l.excluded === true && /halted — engine reported halted/.test(l.reason)), reason)
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// US-524 r1-g1 (r0-1) — the loop selects with the RESOLVED filter (argument > `## Autonomy` > translated
// `## Eligibility`), the one autonomy-policy.mjs computes. Oracle: the REAL resolvePolicy over the same policy
// text; a resolve dispatch the loop makes is answered by that real function. The pair-next `--filter` must equal
// effective.filter, or be omitted (pair-next resolves it); an absent resolved filter still HALTs.
// ═══════════════════════════════════════════════════════════════════════════
const R1G1_CANDIDATE = { id: '1', title: 'A', branch: 'feature/#1-a', tier: 'risk:green', mutexResources: [], prerequisites: [] }
function r1g1FilterOf(prompt) {
  if (!/--filter\b/.test(prompt)) return undefined
  const m = /--filter ("(?:[^"\\]|\\.)*"|\[[^\]]*\])/.exec(prompt)
  const raw = m ? JSON.parse(m[1]) : /--filter (\S+)/.exec(prompt)?.[1]
  assert.ok(raw !== undefined, `unparseable --filter in ${prompt.slice(0, 120)}`)
  return (Array.isArray(raw) ? raw : String(raw).split(',')).map(v => String(v).trim())
}
function r1g1ArgsOf(prompt) {
  const m = /--args '([^']*)'/.exec(prompt)
  return m ? JSON.parse(m[1]) : {}
}
async function r1g1Select(args) {
  let selectPrompt
  const out = await runWorkflow({
    args,
    dispatch: (prompt, opts) => {
      if (/autonomy-policy\.mjs resolve/.test(prompt)) return resolvePolicy({ args: r1g1ArgsOf(prompt), adoptionText: args.policyText })
      if (opts.phase === 'Select') return (selectPrompt ??= prompt), { candidates: [R1G1_CANDIDATE] }
      return {}
    },
    workflowDispatch: () => ({ batch: [{ id: '1', status: 'failed-implement' }] }),
  })
  return { ...out, selectPrompt }
}
const r1g1Oracle = (policyText, args = {}) => resolvePolicy({ args, adoptionText: policyText }).effective.filter

test('r1g1-L-W1: `## Autonomy` filter (list) with no `## Eligibility` and no argument selects with the resolved filter — no HALT', async () => {
  const policyText = '## Autonomy\n\nfilter: risk:green, risk:yellow\n'
  const oracle = r1g1Oracle(policyText)
  assert.equal(oracle.source, 'adoption')
  const { selectPrompt } = await r1g1Select({ policyText })
  assert.ok(selectPrompt, 'the Select phase must run')
  const sent = r1g1FilterOf(selectPrompt)
  assert.ok(sent !== undefined, '--filter must be present')
  assert.deepEqual(sent, oracle.value)
})

test('r1g1-L-W2: `## Autonomy` filter (single label) with no `## Eligibility` selects with the resolved filter — no HALT', async () => {
  const policyText = '## Autonomy\n\nfilter: cost:green\nuntil: pr\n'
  const oracle = r1g1Oracle(policyText)
  const { selectPrompt } = await r1g1Select({ policyText })
  assert.ok(selectPrompt, 'the Select phase must run')
  const sent = r1g1FilterOf(selectPrompt)
  assert.ok(sent !== undefined, '--filter must be present')
  assert.deepEqual(sent, oracle.value)
})

// The loop's HALT on a policy the authority rejects (resolvePolicy ok:false, an error keyed `filter`): the run
// rejects with a HALT naming the filter, Select never runs, and no dispatched prompt carries `forbidden`.
async function r1g1HaltsOnFilterError(policyText, forbidden) {
  const resolved = resolvePolicy({ args: {}, adoptionText: policyText })
  assert.equal(resolved.ok, false, policyText)
  assert.equal(resolved.errors[0].key, 'filter', policyText)
  const prompts = []
  let selected = false
  await assert.rejects(
    runWorkflow({
      args: { policyText },
      dispatch: (prompt, opts) => {
        prompts.push(prompt)
        if (/autonomy-policy\.mjs resolve/.test(prompt)) return resolvePolicy({ args: r1g1ArgsOf(prompt), adoptionText: policyText })
        if (opts.phase === 'Select') selected = true
        return { candidates: [R1G1_CANDIDATE] }
      },
      workflowDispatch: () => ({ batch: [{ id: '1', status: 'failed-implement' }] }),
    }),
    e => e.halt === true && /HALT/.test(e.message) && /filter/i.test(e.message),
    policyText,
  )
  assert.equal(selected, false, `Select must never run: ${policyText}`)
  if (forbidden !== undefined)
    assert.ok(!prompts.some(p => p.includes(forbidden)), `no dispatched prompt may carry ${forbidden}`)
}

test('r1g1-L-W3: `## Autonomy` filter conflicting with `## Eligibility` — the authority rejects the policy (ok:false, filter conflict), so the loop HALTs naming the filter before Select', async () => {
  await r1g1HaltsOnFilterError('## Eligibility\n\nrisk:green\n\n## Autonomy\n\nfilter: risk:yellow\n')
})

test('r1g1-L-C1: `## Autonomy` filter identical to `## Eligibility` — selects with the resolved filter', async () => {
  const policyText = '## Eligibility\n\nrisk:green\n\n## Autonomy\n\nfilter: risk:green\n'
  const { selectPrompt } = await r1g1Select({ policyText })
  const sent = r1g1FilterOf(selectPrompt)
  assert.ok(sent !== undefined, '--filter must be present')
  assert.deepEqual(sent, r1g1Oracle(policyText).value)
})

test('r1g1-L-C2: legacy `## Eligibility` only — selects with its translated filter', async () => {
  const policyText = '## Eligibility\n\nrisk:green\n'
  const { selectPrompt } = await r1g1Select({ policyText })
  const sent = r1g1FilterOf(selectPrompt)
  assert.ok(sent !== undefined, '--filter must be present')
  assert.deepEqual(sent, r1g1Oracle(policyText).value)
})

test('r1g1-L-C3: a filter argument wins over `## Autonomy` filter (argument > adoption), no `## Eligibility` needed', async () => {
  const policyText = '## Autonomy\n\nfilter: risk:green\n'
  const oracle = r1g1Oracle(policyText, { filter: 'cost:green' })
  assert.equal(oracle.source, 'argument')
  const { selectPrompt } = await r1g1Select({ policyText, filter: 'cost:green' })
  assert.deepEqual(r1g1FilterOf(selectPrompt), oracle.value)
})

test('r1g1-L-C4: no resolved filter anywhere (no argument, no `## Autonomy` filter, no `## Eligibility`) still HALTs before selection', async () => {
  for (const policyText of ['## Max Parallelism\n\n1\n', '## Autonomy\n\nuntil: merged\n']) {
    assert.equal(r1g1Oracle(policyText).value, undefined)
    let selected = false
    await assert.rejects(
      runWorkflow({
        args: { policyText },
        dispatch: (prompt, opts) => {
          if (/autonomy-policy\.mjs resolve/.test(prompt)) return resolvePolicy({ args: r1g1ArgsOf(prompt), adoptionText: policyText })
          if (opts.phase === 'Select') selected = true
          return { candidates: [] }
        },
      }),
      /HALT/,
      policyText,
    )
    assert.equal(selected, false, policyText)
  }
})

test('r1g1-L-W4: malformed `## Autonomy` filter (empty list) next to a valid `## Eligibility` — the authority rejects it (ok:false), so the loop HALTs before Select, never selecting with the translated Eligibility', async () => {
  await r1g1HaltsOnFilterError('## Eligibility\n\nrisk:green\n\n## Autonomy\n\nfilter: \n')
})

test('r1g1-L-W5: `## Autonomy` filter listing a label twice (no `## Eligibility`) — the authority rejects it, so the loop HALTs naming the filter before Select', async () => {
  await r1g1HaltsOnFilterError('## Autonomy\n\nfilter: risk:green, risk:green\n')
})

test('r1g1-L-W6: unsafe `## Autonomy` filter (`$(` / backtick), no `## Eligibility` — HALT naming the filter before Select, and the raw value reaches no agent prompt', async () => {
  await r1g1HaltsOnFilterError('## Autonomy\n\nfilter: $(id)\n', '$(id)')
  await r1g1HaltsOnFilterError('## Autonomy\n\nfilter: `id`\n', '`id`')
})

test('r1g1-L-I1: `## Autonomy` filter (no `## Eligibility`) x legacy `## Auto-Advance` — the authority accepts it (ok:true), so the loop proceeds to Select with the resolved filter', async () => {
  const policyText = '## Autonomy\n\nfilter: risk:green\n\n## Auto-Advance\n\nrisk:yellow\n'
  const resolved = resolvePolicy({ args: {}, adoptionText: policyText })
  assert.equal(resolved.ok, true)
  const { selectPrompt } = await r1g1Select({ policyText })
  assert.ok(selectPrompt, 'the Select phase must run')
  const sent = r1g1FilterOf(selectPrompt)
  assert.ok(sent !== undefined, '--filter must be present')
  assert.deepEqual(sent, resolved.effective.filter.value)
})

test('r1g1-L-W7: a filter ARGUMENT does not bypass the authority — `## Autonomy` `filter:` empty (or conflicting with `## Eligibility`) still HALTs naming the filter, Select never runs', async () => {
  for (const policyText of ['## Autonomy\n\nfilter: \n', '## Eligibility\n\nrisk:green\n\n## Autonomy\n\nfilter: risk:yellow\n']) {
    let selected = false
    await assert.rejects(
      runWorkflow({
        args: { policyText, filter: 'cost:green' },
        dispatch: (prompt, opts) => {
          if (opts.phase === 'Select') selected = true
          return { candidates: [R1G1_CANDIDATE] }
        },
      }),
      e => e.halt === true && /filter/i.test(e.message),
      policyText,
    )
    assert.equal(selected, false, policyText)
  }
})

// r1-1 (security): filter/assignee/status reach a single-quoted shell arg of the resolve dispatch — quote-free.
test('r1-1: validateArgs HALTs on a quote/backslash in filter, assignee or status (incl. list elements)', () => {
  const { validateArgs } = getHelpers()
  const bad = ["a'b", "risk:green' ; touch /tmp/pwned ; echo '", 'a\\b']
  for (const key of ['filter', 'assignee', 'status'])
    for (const v of bad) {
      assert.throws(() => validateArgs({ [key]: v }), /HALT|plain-text/, `${key}=${v}`)
      assert.throws(() => validateArgs({ [key]: ['ok', v] }), /HALT|plain-text/, `${key}[]=${v}`)
    }
  assert.doesNotThrow(() => validateArgs({ filter: 'risk:green', assignee: 'bob', status: 'Ready' }))
  assert.doesNotThrow(() => validateArgs({ filter: ['risk:green', 'risk:yellow'] }))
})

test('r1-1: an injecting filter HALTs before any agent is dispatched', async () => {
  for (const key of ['filter', 'assignee', 'status']) {
    const prompts = []
    await assert.rejects(
      runWorkflow({
        args: { policyText: '## Eligibility\n\nrisk:green\n', [key]: "risk:green' ; touch /tmp/pwned ; echo '" },
        dispatch: p => (prompts.push(p), {}),
      }),
      /HALT|plain-text/,
    )
    assert.equal(prompts.length, 0, `${key}: no agent may run`)
  }
})
