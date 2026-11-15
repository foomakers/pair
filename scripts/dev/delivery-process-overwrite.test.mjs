// #646 r0-2 / AC-20, AC-21: publish's reason must reach budgeted reset-group.
// The actual workflow executes with a stub agent: no engine or tracker is launched.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  publish,
  contractHash,
} from '../../.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs'

const HEAD = 'a'.repeat(40)
const VERSION = '4.0.1'
const STOP = { step: 'blocked', reason: 'needs-human', detail: 'probe reached durable next' }
const SOURCES = [
  ['installed', '../../.claude/workflows/pair-implement-batch.js'],
  ['dataset', '../../packages/knowledge-hub/dataset/.workflows/pair-implement-batch.js'],
]
const MODES = [
  ['initial', 'a0'],
  ['remediation', 'r1-g1'],
  ['repair', 'r1-g2'],
  ['revision', 'r1-g2-rev2'],
]

function emit({ root, dir, phase, pathFor }, n, hash) {
  const file = join(root, 'draft.json')
  writeFileSync(
    file,
    JSON.stringify({
      run: 'probe',
      story: '646',
      phase,
      skill: 'red-spec',
      inputHead: HEAD,
      status: 'red',
      mode: 'remediation',
      contractPath: pathFor(n),
      contractHash: hash,
    }),
  )
  return publish({
    dir,
    file,
    phase,
    skill: 'red-spec',
    workflowVersion: VERSION,
    attempt: n,
    repoRoot: root,
  })
}

function refusal(kind, phase, priorAttempt = 1) {
  const root = mkdtempSync(join(tmpdir(), 'pair-646-overwrite-'))
  const dir = join(root, '.pair/working/runs/probe/646')
  mkdirSync(dir, { recursive: true })
  const body = {
    fixScope: { owner: 'probe', mode: 'behavioral', allowedPaths: ['src/a.js'] },
    redTests: [
      {
        file: 'probe.test.mjs',
        sha256: `sha256:${'1'.repeat(64)}`,
        command: 'node --test probe.test.mjs',
        baseline: 'red',
        observed: 'FAIL 1 of 1',
      },
    ],
  }
  const pathFor = n => join(dir, `${phase}-red-contract${n > 1 ? `.attempt-${n}` : ''}.json`)
  try {
    writeFileSync(pathFor(priorAttempt), JSON.stringify(body))
    if (kind === 'hash') {
      const out = emit({ root, dir, phase, pathFor }, priorAttempt, `sha256:${'0'.repeat(64)}`)
      assert.equal(out.reason, 'contract-hash-mismatch')
      return out.reason
    }
    assert.equal(
      emit({ root, dir, phase, pathFor }, priorAttempt, contractHash(body)).published,
      true,
    )
    writeFileSync(pathFor(priorAttempt), JSON.stringify({ ...body, tampered: true }))
    writeFileSync(pathFor(priorAttempt + 1), JSON.stringify(body))
    const out = emit({ root, dir, phase, pathFor }, priorAttempt + 1, contractHash(body))
    assert.equal(out.published, false)
    assert.equal(
      out.reason,
      `contract-attempt-overwritten:${phase}-red-contract${priorAttempt > 1 ? `.attempt-${priorAttempt}` : ''}.json`,
    )
    return out.reason
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

async function route(
  source,
  {
    reason,
    mode = 'remediation',
    phase = 'r1-g1',
    budget = true,
    reset = true,
    repeat = false,
    prepareNext,
    resetNext,
  },
) {
  const calls = []
  const due = {
    step: 'prepare',
    mode,
    phase,
    round: mode === 'initial' ? 0 : 1,
    attempt: 1,
    base: HEAD,
    findings: [],
    ...(['repair', 'revision'].includes(mode)
      ? { contract: { path: '/probe/contract.json', hash: `sha256:${'1'.repeat(64)}` } }
      : {}),
  }
  const stop = { ...STOP, phase }
  let prepares = 0
  const agent = async (prompt, opts) => {
    if (opts.label === 'profile:resolve') return { source: 'KB default', stages: Object.fromEntries(['prepare', 'validate', 'implement', 'green', 'verify'].map(stage => [stage, { engine: { value: 'default' }, model: { resolved: { id: null } }, effort: { value: 'default' } }])) }
    calls.push({ prompt, label: opts.label, type: opts.agentType })
    assert.ok(calls.length < 25, 'bounded probe dispatches')
    if (opts.agentType === 'pair-reviewer') return { status: 'redirect', next: due }
    if (opts.agentType === 'pair-fix-test-author') {
      prepares++
      return repeat || prepares === 1
        ? { status: 'failed', reason, ...(prepareNext ?? { next: stop }) }
        : { status: 'redirect', next: stop }
    }
    if (opts.label?.startsWith('recover:budget')) return { allowed: budget, next: stop }
    if (prompt.includes(' reset-group ')) return resetResult(reset, resetNext, stop)
    throw new Error(`unexpected dispatch ${opts.label}`)
  }
  return { calls, result: await executeWorkflow(source, agent), prepares }
}

function resetResult(reset, resetNext, stop) {
  return reset === true
    ? { reset: true, ...(resetNext ?? { next: stop }) }
    : { reset: false, reason: reset, ...resetNext }
}

async function executeWorkflow(source, agent) {
  const text = readFileSync(new URL(source, import.meta.url), 'utf8').replace(/^export /gm, '')
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
  const result = await new AsyncFunction('args', 'agent', 'parallel', 'log', text)(
    {
      cards: [{ id: '646', title: 'Probe', branch: 'feature/US-646-probe', prNumber: 653 }],
      policyText: '',
    },
    agent,
    jobs => Promise.all(jobs.map(job => job())),
    () => {},
  )
  return result.batch[0]
}

for (const [representation, source] of SOURCES) {
  for (const [mode, phase] of MODES) {
    for (const priorAttempt of [1, 2]) {
      test(`r0-2-${representation}-${mode}-attempt${priorAttempt}`, async () => {
        const reason = refusal('overwrite', phase, priorAttempt)
        const out = await route(source, { reason, mode, phase })
        assert.ok(out.prepares >= 1, 'valid due packet reaches prepare')
        const resets = out.calls.filter(c => c.prompt.includes(' reset-group '))
        assert.equal(
          resets.length,
          1,
          'publish overwrite refusal must reset its group exactly once',
        )
        assert.match(resets[0].prompt, new RegExp(`--phase ${phase} `))
        assert.match(resets[0].prompt, /--dir \.pair\/working\/runs\/story-646\/646 /)
        assert.match(resets[0].prompt, /--workflowVersion 4\.0\.1 /)
        assert.match(resets[0].prompt, /--pr 653/)
        assert.ok(
          out.calls.findIndex(c => c.label?.startsWith('recover:budget')) <
            out.calls.indexOf(resets[0]),
        )
        assert.equal(out.prepares, 1, 'no blind judgment retry before reset')
        assert.equal(out.result.reason, 'probe reached durable next')
        assert.equal(out.calls.filter(c => c.type === 'pair-red-contract-verifier').length, 0)
      })
    }
  }
  test(`r0-2-${representation}-hash`, async () => {
    const out = await route(source, { reason: refusal('hash', 'r1-g1') })
    assert.equal(out.calls.filter(c => c.prompt.includes(' reset-group ')).length, 1)
    assert.equal(out.result.reason, 'probe reached durable next')
  })
  for (const [label, reason] of [
    ['empty', ''],
    ['null', null],
    ['number', 42],
    ['lookalike', 'contract-attempt-overwritten-extra:x.json'],
    ['unknown', 'unknown:x.json'],
  ]) {
    test(`r0-2-${representation}-${label}`, async () => {
      const out = await route(source, { reason, repeat: true })
      assert.equal(out.calls.filter(c => c.prompt.includes(' reset-group ')).length, 0)
      assert.equal(out.calls.filter(c => c.label?.startsWith('recover:budget')).length, 0)
      assert.notEqual(out.result.status, 'ready-for-merge')
    })
  }
  test(`r0-2-${representation}-budget`, async () => {
    const out = await route(source, { reason: refusal('overwrite', 'r1-g1'), budget: false })
    assert.equal(out.result.status, 'awaiting-human')
    assert.ok(out.result.resumeToken)
    assert.equal(out.prepares, 1)
    assert.equal(out.calls.filter(c => c.prompt.includes(' reset-group ')).length, 0)
  })
  test(`r0-2-${representation}-reset-refused`, async () => {
    const out = await route(source, {
      reason: refusal('overwrite', 'r1-g1'),
      reset: 'identity-refused',
    })
    assert.equal(out.result.status, 'awaiting-human')
    assert.equal(out.result.reason, 'identity-refused')
    assert.ok(out.result.resumeToken)
    assert.equal(out.prepares, 1)
  })
  test(`r0-2-${representation}-non-tail`, async () => {
    const out = await route(source, {
      reason: refusal('overwrite', 'r1-g1'),
      reset: 'reset-group-not-tail',
    })
    assert.equal(out.calls.filter(c => c.prompt.includes(' reset-group ')).length, 1)
    assert.equal(out.result.reason, 'probe reached durable next')
  })
}

// #646 r0-2 repair: independent next-shape and reset-authority counterexamples.
const PREPARE_NEXT = { next: { ...STOP, detail: 'prepare continuation' } }
const RESET_NEXT = { next: { ...STOP, detail: 'reset continuation' } }
const UNUSABLE_NEXT = [
  ['absent', {}],
  ['malformed', { next: { step: 'unknown-step' } }],
]

function assertRecovery(out) {
  assert.equal(out.prepares, 1, 'recognized process fault never retries preparation')
  const budgets = out.calls.filter(c => c.label?.startsWith('recover:budget'))
  const resets = out.calls.filter(c => c.prompt.includes(' reset-group '))
  assert.equal(budgets.length, 1, 'one budget relay')
  assert.equal(resets.length, 1, 'one reset relay')
  assert.ok(out.calls.indexOf(budgets[0]) < out.calls.indexOf(resets[0]))
  assert.equal(out.calls.filter(c => c.type === 'pair-red-contract-verifier').length, 0)
}

for (const [representation, source] of SOURCES) {
  for (const kind of ['hash', 'overwrite']) {
    for (const [shape, prepareNext] of UNUSABLE_NEXT) {
      test(`r0-2-${representation}-format-${kind}-${shape}`, async () => {
        const out = await route(source, {
          reason: refusal(kind, 'r1-g1'),
          prepareNext,
          resetNext: RESET_NEXT,
        })
        assertRecovery(out)
        assert.equal(out.result.reason, 'reset continuation')
      })
    }
  }
  test(`r0-2-${representation}-reset-next-valid`, async () => {
    const out = await route(source, {
      reason: refusal('overwrite', 'r1-g1'),
      prepareNext: PREPARE_NEXT,
      resetNext: RESET_NEXT,
    })
    assertRecovery(out)
    assert.equal(out.result.reason, 'reset continuation')
  })
  for (const [shape, resetNext] of UNUSABLE_NEXT) {
    test(`r0-2-${representation}-reset-next-${shape}`, async () => {
      const out = await route(source, {
        reason: refusal('overwrite', 'r1-g1'),
        prepareNext: PREPARE_NEXT,
        resetNext,
      })
      assertRecovery(out)
      assert.equal(out.result.status, 'awaiting-human')
      assert.equal(out.result.resumeToken, 'story-646:646:r1-g1:contract-attempt-overwritten')
      assert.equal(out.result.reason, 'contract-attempt-overwritten: reset-group failed')
    })
  }
  test(`r0-2-${representation}-reset-next-non-tail`, async () => {
    const out = await route(source, {
      reason: refusal('overwrite', 'r1-g1'),
      prepareNext: PREPARE_NEXT,
      reset: 'reset-group-not-tail',
      resetNext: RESET_NEXT,
    })
    assertRecovery(out)
    assert.equal(out.result.reason, 'prepare continuation')
  })
}
