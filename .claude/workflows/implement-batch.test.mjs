// Dry-run harness for implement-batch.js (#292): executes the workflow source
// with stubbed `agent`/`parallel` (the sandbox primitives) and asserts the
// phase-0 ensure-contract behavior — derived schema on a valid contract (AC1),
// loose fallback on a malformed/failed one (AC4), value-agnostic control flow
// (AC6) — plus the optional per-story `notes` scope directive threading.
// Run: node --test .claude/workflows
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The workflow file is a sandbox script (top-level await + return, ambient
// `args`/`agent`/`parallel`), not importable ESM. Evaluate it as an async
// function body — same shape the Workflow harness gives it.
const SRC = readFileSync(new URL('./implement-batch.js', import.meta.url), 'utf8').replace(
  /^export /gm,
  '',
)
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor

async function runWorkflow({ args, dispatch }) {
  const calls = []
  const agent = async (prompt, opts) => {
    calls.push({ prompt, opts })
    return dispatch(prompt, opts)
  }
  const parallel = fns => Promise.all(fns.map(f => f()))
  const result = await new AsyncFunction('args', 'agent', 'parallel', SRC)(args, agent, parallel)
  return { result, calls }
}

// Happy-path stub: dispatch on agentType/phase; contract behavior injectable.
function stdDispatch({ contractResult, review = { verdict: 'Approved', findings: [] } } = {}) {
  return (prompt, opts) => {
    if (opts.agentType === 'contract-generator') return contractResult
    if (opts.agentType === 'reviewer') return review
    if (opts.phase === 'Implement') return { gatesPassed: true, branch: 'b' }
    if (opts.phase === 'PR') return { prNumber: 7 }
    return { fixed: true } // fix step
  }
}

// A valid generated contract, with a NON-default severity ('Blocker') to prove
// the reviewer prompt vocabulary is threaded from the contract, not hardcoded.
function validContract() {
  return {
    $meta: { source: 't.md', sourceHash: `sha256:${'0'.repeat(64)}`, generatedAt: 'x' },
    vocabulary: {
      verdictOptions: ['Approved', 'Rework'],
      severities: ['Blocker', 'Major', 'Minor'],
      findingFields: ['location', 'severity', 'description', 'recommendation'],
    },
    schema: {
      type: 'object',
      properties: {
        verdict: { type: 'string', enum: ['Approved', 'Rework'] },
        needsHumanDecision: { type: 'boolean' },
        findings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              location: { type: 'string' },
              severity: { type: 'string', enum: ['Blocker', 'Major', 'Minor'] },
              description: { type: 'string' },
              recommendation: { type: 'string' },
              nonActionable: { type: 'boolean' },
            },
          },
        },
      },
      required: ['verdict'],
    },
  }
}

const STORY = { id: '292', title: 'T', branch: 'feat/#292-x' }

test('valid contract: reviewer schema derives from contract.json (AC1) and cache-hit is reported (AC2)', async () => {
  const contract = validContract()
  const { result, calls } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract } }),
  })
  const rev = calls.find(c => c.opts.agentType === 'reviewer')
  assert.deepEqual(rev.opts.schema, contract.schema)
  assert.ok(rev.prompt.includes('Blocker'), 'severity vocabulary threaded from the contract')
  assert.ok(rev.prompt.includes('Rework'), 'verdict vocabulary threaded from the contract')
  assert.deepEqual(result.contracts, [{ name: 'code-review', status: 'cache-hit' }])
  assert.equal(result.batch[0].status, 'ready-for-merge')
})

test('malformed contract: loose fallback schema, run never breaks (AC4)', async () => {
  const { result, calls } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: stdDispatch({
      contractResult: { status: 'regenerated', contract: { schema: { type: 'object' } } },
    }),
  })
  const rev = calls.find(c => c.opts.agentType === 'reviewer')
  assert.equal(rev.opts.schema.properties.verdict.type, 'string')
  assert.equal(
    rev.opts.schema.properties.verdict.enum,
    undefined,
    'fallback stays loose (no enum lock)',
  )
  assert.ok(rev.prompt.includes('Critical, Major, Minor'), 'fallback vocabulary used')
  assert.deepEqual(result.contracts, [{ name: 'code-review', status: 'fallback-loose' }])
  assert.equal(result.batch[0].status, 'ready-for-merge')
})

test('generator failure (no return): loose fallback, run never breaks (AC4)', async () => {
  const { result, calls } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: stdDispatch({ contractResult: undefined }),
  })
  const rev = calls.find(c => c.opts.agentType === 'reviewer')
  assert.equal(rev.opts.schema.properties.verdict.enum, undefined)
  assert.deepEqual(result.contracts, [{ name: 'code-review', status: 'fallback-loose' }])
})

test('control flow stays value-agnostic: nonActionable findings converge without matching verdict strings (AC6)', async () => {
  const { result } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: stdDispatch({
      contractResult: { status: 'cache-hit', contract: validContract() },
      review: {
        verdict: 'Some Unrecognized Verdict',
        findings: [
          { location: 'a.js:1', severity: 'Minor', description: 'by design', nonActionable: true },
        ],
      },
    }),
  })
  assert.equal(result.batch[0].status, 'ready-for-merge')
  assert.equal(result.batch[0].acceptedFindings.length, 1)
})

test('story.notes: scope directive threaded into implement and PR prompts', async () => {
  const { calls } = await runWorkflow({
    args: { stories: [{ ...STORY, notes: 'resolve all findings in ONE PR, do not split' }] },
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract: validContract() } }),
  })
  const impl = calls.find(c => c.opts.phase === 'Implement')
  const pr = calls.find(c => c.opts.phase === 'PR')
  assert.ok(
    impl.prompt.includes(
      'SCOPE DIRECTIVE (overrides the issue body where they conflict): resolve all findings in ONE PR, do not split',
    ),
  )
  assert.ok(pr.prompt.includes('SCOPE DIRECTIVE: resolve all findings in ONE PR, do not split'))
})

test('story without notes: no scope directive in prompts', async () => {
  const { calls } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract: validContract() } }),
  })
  for (const c of calls)
    assert.ok(!c.prompt.includes('SCOPE DIRECTIVE'), `unexpected directive in ${c.opts.label}`)
})

test('empty batch: no agent calls at all (contracts skipped too)', async () => {
  const { result, calls } = await runWorkflow({ args: { stories: [] }, dispatch: stdDispatch() })
  assert.equal(calls.length, 0)
  assert.deepEqual(result.batch, [])
})
