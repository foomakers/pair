// US-591 r1-g1 (r0-1, r0-2): an owner approval is bounded to its rows end to end — dispatch forwards it,
// the sealer refuses edits outside it, the successor handoff links it, approval refuses unknown rows.
// RUNS FROM `.claude/workflows` ONLY: execute via `pnpm workflows:test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  resolve,
  approveCorrection,
  readApprovals,
} from '../../skills/pair-workflow-cycle/scripts/cycle-state.mjs'
import { chainRepo, revision } from './red-snapshot-lib.mjs'

const DISPATCH = fileURLToPath(
  new URL('../../skills/pair-workflow-cycle/scripts/cycle-dispatch.mjs', import.meta.url),
)
const V = '4.0.1'
const SHA = c => c.repeat(40)
const H = `sha256:${'a'.repeat(64)}`
const POLICY = { maxFixRounds: 3, redRepairs: 1, greenRetries: 1, reviewers: 1 }
const APPROVAL = {
  decisionRef: 'pr7#c-1',
  actor: 'rucka',
  delta: 'oracle expects 9 not 8',
  reason: 'wrong pnpm oracle',
}
let seq = 0
const put = (dir, phase, skill, data) =>
  writeFileSync(
    join(dir, `${phase}-${skill}.json`),
    JSON.stringify({
      schemaVersion: 3,
      workflowVersion: V,
      run: 'run-1',
      story: '42',
      phase,
      skill,
      inputHead: SHA('a'),
      seq: ++seq,
      attempt: 1,
      ...data,
    }),
  )

// A real sealed contract file (matrix rows row-1, row-2) behind the a0 handoff: approval rows are checked against it.
const runDir = () => {
  const root = mkdtempSync(join(tmpdir(), 'owner-bound-'))
  const dir = join(root, '.pair', 'working', 'runs', 'run-1', '42')
  mkdirSync(dir, { recursive: true })
  mkdirSync(join(root, '.pair', 'adoption', 'tech'), { recursive: true })
  writeFileSync(
    join(root, '.pair', 'adoption', 'tech', 'way-of-working.md'),
    '- `default-assignee`: `rucka`\n',
  )
  const contractPath = join(dir, 'a0-red-contract.json')
  writeFileSync(contractPath, JSON.stringify({ matrix: [{ id: 'row-1' }, { id: 'row-2' }] }))
  put(dir, 'a0', 'red-spec', { status: 'red', contractPath, contractHash: H })
  put(dir, 'a0', 'red-verify', {
    verified: true,
    sealed: true,
    contractHash: H,
    snapshot: SHA('b'),
  })
  put(dir, 'r0', 'review-phase', {
    pr: 7,
    reviewedHead: SHA('c'),
    verdict: 'approved',
    findings: [],
    custody: { contractBreach: false },
    readiness: { ready: true, remoteHead: SHA('c') },
  })
  return dir
}
const body = rows =>
  '```json\n' +
  JSON.stringify({
    schemaVersion: 1,
    kind: 'contract-correction',
    story: '42',
    pr: 7,
    predecessorContractHash: H,
    rows,
    delta: APPROVAL.delta,
    reason: APPROVAL.reason,
  }) +
  '\n```'
const approve = (dir, rows) =>
  approveCorrection({
    dir,
    decisionRef: APPROVAL.decisionRef,
    repo: 'o/r',
    pr: 7,
    host: {
      code: {
        parseCommentRef: () => ({ id: 1, pr: 7, inScope: true }),
        readComment: () => ({ authorLogin: 'rucka', authorIsUser: true, pr: 7, body: body(rows) }),
      },
    },
  })

test('r0-1 VERIFY: the dispatch packet for an owner-approved revision carries the approval (decisionRef, delta) to red-spec', () => {
  const next = {
    step: 'prepare',
    mode: 'revision',
    phase: 'a0-rev2',
    revision: 2,
    round: 0,
    attempt: 1,
    base: SHA('c'),
    changedRows: ['row-1'],
    ownerApproval: { ...APPROVAL, rows: ['row-1'] },
  }
  const card = { id: '42', branch: 'feature/US-42-x', base: 'origin/main', title: 't' }
  const r = spawnSync(
    process.execPath,
    [
      DISPATCH,
      'packet',
      '--next',
      JSON.stringify(next),
      '--card',
      JSON.stringify(card),
      '--run',
      'story-42',
      '--workflow-version',
      V,
    ],
    { encoding: 'utf8' },
  )
  assert.equal(r.status, 0, r.stderr)
  const prompt = JSON.parse(r.stdout).prompt
  assert.match(prompt, /\$ownerApproval=\{[^\n]*pr7#c-1/)
  assert.match(prompt, /\$ownerApproval=\{[^\n]*oracle expects 9 not 8/)
})

test('r0-1 ORACLE/ASSERT: the sealer refuses a successor that edits a row outside the approved rows', () => {
  const approval = { ...APPROVAL, rows: ['row-1'] }
  const outside = chainRepo()
  const refused = revision(outside.cwd, outside.head1, {
    ownerApproval: approval,
    changedRows: ['row-1', 'row-2'],
    matrix: [
      {
        id: 'row-1',
        kind: 'witness',
        baseline: 'red',
        condition: 'default',
        oracle: 'node test/a.test.js',
        expected: '3',
        covers: ['r0-1'],
      },
      {
        id: 'row-2',
        kind: 'witness',
        baseline: 'red',
        condition: 'empty',
        oracle: 'node test/a.test.js',
        expected: '0',
        covers: ['r1-1'],
      },
    ],
  })
  assert.deepEqual(
    [refused.sealed, refused.reason, refused.rows],
    [false, 'rows-outside-approval', ['row-2']],
    JSON.stringify(refused),
  )
  rmSync(outside.cwd, { recursive: true, force: true })
})

test('r0-1 control: a successor editing only the approved row seals', () => {
  const approval = { ...APPROVAL, rows: ['row-1'] }
  const inside = chainRepo()
  const ok = revision(inside.cwd, inside.head1, {
    ownerApproval: approval,
    changedRows: ['row-1'],
    matrix: [
      {
        id: 'row-1',
        kind: 'witness',
        baseline: 'red',
        condition: 'default',
        oracle: 'node test/a.test.js',
        expected: '3',
        covers: ['r0-1'],
      },
    ],
  })
  assert.equal(ok.sealed, true, JSON.stringify(ok))
  rmSync(inside.cwd, { recursive: true, force: true })
})

test('r0-1 ASSERT: the successor red-spec handoff links the approval; the validate step carries it forward', () => {
  const dir = runDir()
  assert.equal(approve(dir, ['row-1']).approved, true)
  const prep = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 }).next
  assert.equal(prep.ownerApproval.decisionRef, APPROVAL.decisionRef)
  put(dir, 'a0-rev2', 'red-spec', {
    status: 'red',
    contractPath: join(dir, 'a0-rev2-red-contract.json'),
    contractHash: `sha256:${'d'.repeat(64)}`,
    mode: 'revision',
    changedRows: ['row-1'],
    ownerApproval: prep.ownerApproval,
  })
  const next = resolve({ dir, workflowVersion: V, policy: POLICY, entry: 'pr', pr: 7 }).next
  assert.equal(next.step, 'validate')
  assert.equal(next.ownerApproval?.decisionRef, APPROVAL.decisionRef)
})

test('r0-2 ORACLE/ASSERT: approval naming a row absent from the sealed matrix is refused rows-unknown and records nothing; known rows are approved', () => {
  const dir = runDir()
  const refused = approve(dir, ['ZZ-9'])
  assert.deepEqual(
    [refused.approved, refused.reason],
    [false, 'rows-unknown'],
    JSON.stringify(refused),
  )
  assert.deepEqual(readApprovals(dir), [])
  assert.equal(approve(dir, ['row-1', 'ZZ-9']).reason, 'rows-unknown')
  assert.equal(approve(dir, ['row-1', 'row-2']).approved, true)
})

test('r0-1 control (c-3): the dispatch packet of a revision without ownerApproval carries no $ownerApproval line', () => {
  const next = {
    step: 'prepare',
    mode: 'revision',
    phase: 'a0-rev2',
    revision: 2,
    round: 0,
    attempt: 1,
    base: SHA('c'),
    changedRows: ['row-1'],
  }
  const card = { id: '42', branch: 'feature/US-42-x', base: 'origin/main', title: 't' }
  const r = spawnSync(
    process.execPath,
    [
      DISPATCH,
      'packet',
      '--next',
      JSON.stringify(next),
      '--card',
      JSON.stringify(card),
      '--run',
      'story-42',
      '--workflow-version',
      V,
    ],
    { encoding: 'utf8' },
  )
  assert.equal(r.status, 0, r.stderr)
  assert.doesNotMatch(JSON.parse(r.stdout).prompt, /ownerApproval/)
})

test('r0-1 control (c-4): a successor revision without ownerApproval and with changed rows still seals', () => {
  const plain = chainRepo()
  const ok = revision(plain.cwd, plain.head1, {
    changedRows: ['row-1', 'row-2'],
    matrix: [
      {
        id: 'row-1',
        kind: 'witness',
        baseline: 'red',
        condition: 'default',
        oracle: 'node test/a.test.js',
        expected: '3',
        covers: ['r0-1'],
      },
      {
        id: 'row-2',
        kind: 'witness',
        baseline: 'red',
        condition: 'empty',
        oracle: 'node test/a.test.js',
        expected: '0',
        covers: ['r1-1'],
      },
    ],
  })
  assert.equal(ok.sealed, true, JSON.stringify(ok))
  rmSync(plain.cwd, { recursive: true, force: true })
})
