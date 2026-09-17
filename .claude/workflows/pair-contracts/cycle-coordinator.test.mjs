// US-486 — the in-session cycle coordinator (`pair-workflow-cycle`): its shipped artifacts and the
// rules it is forbidden to own a second copy of.
//
// The coordinator itself runs inside an agent session, so the thing that CAN be proven here is
// everything it delegates to: the durable transition authority (`cycle-state.mjs`), the
// deterministic dispatch script (`cycle-dispatch.mjs`), and the shipped skill's own text where no
// executable surface exists. Every assertion below runs the REAL producer — the installed script,
// the real `pair-implement-batch.js` source under its dry-run harness, a real git repository —
// never a hand-built stand-in for one.
//
// RUNS FROM `.claude/workflows` ONLY: the `../../skills/pair-workflow-*` imports resolve nowhere
// else. Execute via `pnpm workflows:test` (i.e. `cd .claude/workflows && node --test`).
//
// The pre-push hook exports GIT_DIR (and friends) to everything it runs; a test that spawns git in
// a temp directory under that environment acts on the REAL repository. Scrubbed here at import.
for (const k of Object.keys(process.env))
  if (
    /^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|PREFIX|NAMESPACE|CEILING_DIRECTORIES|IMPLICIT_WORK_TREE|DISCOVERY_ACROSS_FILESYSTEM)$/.test(
      k,
    )
  )
    delete process.env[k]

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SKILLS = fileURLToPath(new URL('../../skills/', import.meta.url))
const DATASET = fileURLToPath(new URL('../../../packages/knowledge-hub/dataset/', import.meta.url))
const STATE_CLI = join(SKILLS, 'pair-workflow-red-spec/scripts/cycle-state.mjs')
const DISPATCH_CLI = join(SKILLS, 'pair-workflow-cycle/scripts/cycle-dispatch.mjs')
const CYCLE_SKILL = join(SKILLS, 'pair-workflow-cycle/SKILL.md')
const BATCH_JS = fileURLToPath(new URL('../pair-implement-batch.js', import.meta.url))

const WORKFLOW_VERSION = '4.0.1'
const POLICY = { maxFixRounds: 3, redRepairs: 1, greenRetries: 1, reviewers: 1 }
const CARD = { id: '42', title: 'T', branch: 'feature/US-42-x' }

// ── helpers ───────────────────────────────────────────────────────────────────────────────────
const run = (cli, args, opts = {}) => {
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', ...opts })
  let json = null
  try {
    json = JSON.parse(r.stdout.trim().split('\n').pop())
  } catch {}
  return { status: r.status, json, stdout: r.stdout, stderr: r.stderr }
}
const state = (args, opts) => run(STATE_CLI, args, opts)
const dispatch = (args, opts) => run(DISPATCH_CLI, args, opts)

function runDir(runId = 'story-42', story = '42') {
  const root = mkdtempSync(join(tmpdir(), 'us486-'))
  const dir = join(root, '.pair', 'working', 'runs', runId, story)
  mkdirSync(dir, { recursive: true })
  mkdirSync(join(root, '.pair', 'adoption', 'tech'), { recursive: true })
  writeFileSync(
    join(root, '.pair', 'adoption', 'tech', 'way-of-working.md'),
    '## Assignment\n\n- `default-assignee`: `rucka` — the maintainer.\n',
  )
  return { root, dir }
}

const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}
function throwawayRepo() {
  const root = mkdtempSync(join(tmpdir(), 'us486 repo ')) // a space in the path, on purpose
  const main = join(root, 'repo')
  mkdirSync(main)
  git(main, 'init', '-q', '-b', 'main')
  git(main, 'config', 'user.email', 't@e.com')
  git(main, 'config', 'user.name', 'T')
  writeFileSync(join(main, 'a.txt'), 'a\n')
  git(main, 'add', '-A')
  git(main, 'commit', '-qm', 'init')
  return { root, main, worktreeRoot: join(root, 'wt') }
}

// The REAL batch engine under its dry-run harness: `agent` is the sandbox primitive, stubbed to
// die immediately, so every prompt the engine composes is captured verbatim before anything else
// can happen. The engine source is the producer — this is not a transcription of it.
const BATCH_SRC = readFileSync(BATCH_JS, 'utf8').replace(/^export /gm, '')
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
async function batchPrompts(args) {
  const calls = []
  const agent = async (prompt, opts) => {
    calls.push({ prompt, opts })
    return null // a dead dispatch: the engine retries once, then ends the story
  }
  const parallel = fns =>
    Promise.all(
      fns.map(f =>
        Promise.resolve()
          .then(f)
          .catch(() => null),
      ),
    )
  await new AsyncFunction('args', 'agent', 'parallel', 'log', BATCH_SRC)(
    args,
    agent,
    parallel,
    () => {},
  )
  return calls
}

// ══ AC1 — fresh-card entry: resolve yields prepare/initial/a0, the worktree is idempotent ══════

test('AC1-c1 (control): `resolve` on an empty run directory with `--entry fresh` yields prepare/initial/a0', () => {
  const { dir } = runDir()
  const r = state([
    'resolve',
    '--dir',
    dir,
    '--workflowVersion',
    WORKFLOW_VERSION,
    '--policy',
    JSON.stringify(POLICY),
    '--entry',
    'fresh',
    '--story',
    '42',
    '--inputs',
    'abc',
  ])
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.json.next.step, 'prepare')
  assert.equal(r.json.next.mode, 'initial')
  assert.equal(r.json.next.phase, 'a0')
})

test('AC1-w1: `cycle-dispatch.mjs worktree` creates the persistent story worktree on the card branch', () => {
  const { main, worktreeRoot } = throwawayRepo()
  const r = dispatch([
    'worktree',
    '--main',
    main,
    '--story',
    '42',
    '--branch',
    'feature/US-42-x',
    '--base',
    'main',
    '--worktree-root',
    worktreeRoot,
  ])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.path, join(worktreeRoot, '42'))
  assert.equal(r.json.created, true)
  assert.equal(existsSync(join(worktreeRoot, '42', 'a.txt')), true)
  assert.equal(
    git(join(worktreeRoot, '42'), 'rev-parse', '--abbrev-ref', 'HEAD'),
    'feature/US-42-x',
  )
})

test('AC1-w2: a second `worktree` call on the same story reuses the path — idempotent, never a second add', () => {
  const { main, worktreeRoot } = throwawayRepo()
  assert.equal(
    dispatch([
      'worktree',
      '--main',
      main,
      '--story',
      '42',
      '--branch',
      'feature/US-42-x',
      '--base',
      'main',
      '--worktree-root',
      worktreeRoot,
    ]).status,
    0,
  )
  const again = dispatch([
    'worktree',
    '--main',
    main,
    '--story',
    '42',
    '--branch',
    'feature/US-42-x',
    '--base',
    'main',
    '--worktree-root',
    worktreeRoot,
  ])
  assert.equal(again.status, 0, again.stdout + again.stderr)
  assert.equal(again.json.created, false)
  assert.equal(again.json.reused, true)
  const listed = git(main, 'worktree', 'list', '--porcelain')
    .split('\n')
    .filter(l => l.startsWith('worktree ')).length
  assert.equal(listed, 2, 'the main checkout plus exactly one story worktree')
})

test('AC1-b1 (boundary): the worktree path already on ANOTHER branch is `worktree-conflict`, never `--force`', () => {
  const { main, worktreeRoot } = throwawayRepo()
  git(main, 'worktree', 'add', '-q', '-b', 'feature/other', join(worktreeRoot, '42'), 'main')
  const r = dispatch([
    'worktree',
    '--main',
    main,
    '--story',
    '42',
    '--branch',
    'feature/US-42-x',
    '--base',
    'main',
    '--worktree-root',
    worktreeRoot,
  ])
  assert.notEqual(r.status, 0, 'a conflicting worktree must not be adopted silently')
  assert.equal(r.json.halt, 'worktree-conflict')
  assert.match(r.stdout + r.stderr, /feature\/other/)
  assert.match(r.stdout + r.stderr, /feature\/US-42-x/)
  assert.equal(
    git(join(worktreeRoot, '42'), 'rev-parse', '--abbrev-ref', 'HEAD'),
    'feature/other',
    'the existing worktree was switched',
  )
})

// ══ AC2 — PR entry is fix & review: the first stage is verify/first/r0, no prepare before it ════

test('AC2-c1 (control): `resolve --entry pr` yields verify/first/r0 and writes no prepare handoff', () => {
  const { dir } = runDir()
  const r = state([
    'resolve',
    '--dir',
    dir,
    '--workflowVersion',
    WORKFLOW_VERSION,
    '--policy',
    JSON.stringify(POLICY),
    '--entry',
    'pr',
    '--pr',
    '7',
    '--story',
    '42',
    '--inputs',
    'abc',
  ])
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(
    { step: r.json.next.step, mode: r.json.next.mode, phase: r.json.next.phase },
    { step: 'verify', mode: 'first', phase: 'r0' },
  )
  assert.equal(existsSync(join(dir, 'a0-red-spec.json')), false)
})

// Readable statement only. What makes it discriminating is AC3-w1b, the differential equality
// against the engine's own reviewer prompt.
test('AC2-w1: the packet built for a PR entry invokes the review-phase skill, never red-spec', () => {
  const { dir } = runDir()
  const next = state([
    'resolve',
    '--dir',
    dir,
    '--workflowVersion',
    WORKFLOW_VERSION,
    '--policy',
    JSON.stringify(POLICY),
    '--entry',
    'pr',
    '--pr',
    '7',
    '--story',
    '42',
    '--inputs',
    'abc',
  ]).json.next
  const r = dispatch([
    'packet',
    '--next',
    JSON.stringify(next),
    '--card',
    JSON.stringify({ ...CARD, prNumber: 7 }),
    '--policy',
    JSON.stringify(POLICY),
    '--run',
    'story-42',
    '--workflow-version',
    WORKFLOW_VERSION,
  ])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.json.prompt, /pair-workflow-review-phase/)
  assert.doesNotMatch(r.json.prompt, /pair-workflow-red-spec/)
  assert.equal(r.json.agentType, 'pair-reviewer')
})

// ══ AC3 — one stage, one dispatch, arguments byte-identical in shape to the batch's ════════════

test('AC3-w1: the `prepare` packet is byte-identical to the prompt `pair-implement-batch.js` composes', async () => {
  const calls = await batchPrompts({ cards: [CARD] })
  const fromBatch = calls.find(c => c.opts.label?.startsWith('prepare:'))
  assert.ok(
    fromBatch,
    `the engine dispatched no prepare: ${calls.map(c => c.opts.label).join(', ')}`,
  )

  const { dir } = runDir()
  const next = state([
    'resolve',
    '--dir',
    dir,
    '--workflowVersion',
    WORKFLOW_VERSION,
    '--policy',
    JSON.stringify(POLICY),
    '--entry',
    'fresh',
    '--story',
    '42',
    '--inputs',
    'x',
  ]).json.next
  const r = dispatch([
    'packet',
    '--next',
    JSON.stringify(next),
    '--card',
    JSON.stringify(CARD),
    '--policy',
    JSON.stringify(POLICY),
    '--run',
    'story-42',
    '--workflow-version',
    WORKFLOW_VERSION,
  ])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.prompt, fromBatch.prompt)
  assert.equal(r.json.agentType, fromBatch.opts.agentType)
})

test('AC3-w1b: the `verify` packet is byte-identical to the prompt `pair-implement-batch.js` composes', async () => {
  // AC2-w1 and AC3-w2 STATE what the reviewer packet must say; this is what makes them
  // discriminating. The engine's reviewer prompt carries $pr, $mode, $head, a SECOND
  // $worktree=<story>-review that overrides the story worktree, $reviewLog, $marker,
  // $synthesisMarker, $template, $severities, $verdicts, $floor, $ranks, $attempt, $reviewer,
  // $reviewers, $reviewSkill, $writeIssue and the whole $contractSpec skeleton — none of which a
  // prose regex sees missing.
  const card = { ...CARD, prNumber: 7 }
  const calls = await batchPrompts({ cards: [card] })
  const fromBatch = calls.find(c => c.opts.label?.startsWith('verify:'))
  assert.ok(
    fromBatch,
    `the engine dispatched no verify: ${calls.map(c => c.opts.label).join(', ')}`,
  )

  const { dir } = runDir()
  const next = state([
    'resolve',
    '--dir',
    dir,
    '--workflowVersion',
    WORKFLOW_VERSION,
    '--policy',
    JSON.stringify(POLICY),
    '--entry',
    'pr',
    '--pr',
    '7',
    '--story',
    '42',
    '--inputs',
    'x',
  ]).json.next
  const r = dispatch([
    'packet',
    '--next',
    JSON.stringify(next),
    '--card',
    JSON.stringify(card),
    '--policy',
    JSON.stringify(POLICY),
    '--run',
    'story-42',
    '--workflow-version',
    WORKFLOW_VERSION,
  ])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(r.json.prompt, fromBatch.prompt)
  assert.equal(r.json.agentType, fromBatch.opts.agentType)
})

test('AC3-w2: the reviewer packet blinds `.pair/working/` except the run directory', async () => {
  const { dir } = runDir()
  const next = state([
    'resolve',
    '--dir',
    dir,
    '--workflowVersion',
    WORKFLOW_VERSION,
    '--policy',
    JSON.stringify(POLICY),
    '--entry',
    'pr',
    '--pr',
    '7',
    '--story',
    '42',
    '--inputs',
    'abc',
  ]).json.next
  const r = dispatch([
    'packet',
    '--next',
    JSON.stringify(next),
    '--card',
    JSON.stringify({ ...CARD, prNumber: 7 }),
    '--policy',
    JSON.stringify(POLICY),
    '--run',
    'story-42',
    '--workflow-version',
    WORKFLOW_VERSION,
  ])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.json.prompt, /Do NOT read[\s\S]*`\.pair\/working\/`/)
  assert.match(r.json.prompt, /\.pair\/working\/runs\/story-42\/42\//)
})

// ══ AC4 / AC5 — the file is the contract; a dead dispatch is retried exactly once ═══════════════

test('AC4-c1 (control): `resolve` is unmoved by a dead dispatch and advances only on a published handoff', () => {
  const { dir } = runDir()
  const args = [
    'resolve',
    '--dir',
    dir,
    '--workflowVersion',
    WORKFLOW_VERSION,
    '--policy',
    JSON.stringify(POLICY),
    '--entry',
    'fresh',
    '--story',
    '42',
    '--inputs',
    'abc',
  ]
  const before = state(args).json.next
  const afterDead = state(args).json.next // nothing published in between: a dead dispatch
  assert.deepEqual(afterDead, before)

  const draft = join(dir, 'draft.json')
  writeFileSync(
    draft,
    JSON.stringify({
      run: 'story-42',
      story: '42',
      pr: 7,
      branch: CARD.branch,
      phase: 'a0',
      skill: 'red-spec',
      inputHead: 'a'.repeat(40),
      status: 'red',
      contractPath: '/abs/a0-red-contract.json',
      contractHash: `sha256:${'1'.repeat(64)}`,
      mode: 'initial',
    }),
  )
  const pub = state([
    'publish',
    '--dir',
    dir,
    '--file',
    draft,
    '--phase',
    'a0',
    '--skill',
    'red-spec',
    '--workflowVersion',
    WORKFLOW_VERSION,
    '--attempt',
    '1',
  ])
  assert.equal(pub.status, 0, pub.stdout + pub.stderr)
  assert.equal(state(args).json.next.step, 'validate')
})

test('AC5-c1 (control): the engine retries a dead dispatch exactly once, then ends the story failed', async () => {
  const calls = await batchPrompts({ cards: [CARD] })
  assert.equal(
    calls.filter(c => c.opts.label?.startsWith('prepare:')).length,
    2,
    'one dispatch plus exactly one retry',
  )
})

test('AC4-w1 / AC5-w1: the dead-dispatch retry budget is `cycle-state` policy data, defaulted to 1', () => {
  const { dir } = runDir()
  const r = state([
    'resolve',
    '--dir',
    dir,
    '--workflowVersion',
    WORKFLOW_VERSION,
    '--policy',
    JSON.stringify(POLICY),
    '--entry',
    'fresh',
    '--story',
    '42',
    '--inputs',
    'abc',
  ])
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.json.policy?.deadDispatchRetries, 1)
  const over = state([
    'resolve',
    '--dir',
    dir,
    '--workflowVersion',
    WORKFLOW_VERSION,
    '--policy',
    JSON.stringify({ ...POLICY, deadDispatchRetries: 2 }),
    '--entry',
    'fresh',
    '--story',
    '42',
    '--inputs',
    'abc',
  ])
  assert.equal(over.json.policy?.deadDispatchRetries, 2, 'an explicit budget is honoured')
})

// ══ AC6 — the realization is probed over a table held as data, never inferred ═══════════════════

test('AC6-w1: the realization table is data — one structure, tool names as its rows', () => {
  const r = dispatch(['realizations'])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.ok(Array.isArray(r.json.realizations), 'realizations is one array of rows')
  const byId = Object.fromEntries(r.json.realizations.map(x => [x.id, x]))
  assert.deepEqual(Object.keys(byId).sort(), ['claude', 'codex'])
  assert.equal(byId.claude.dispatch, 'Agent')
  assert.equal(byId.claude.resume, 'SendMessage')
  assert.equal(byId.codex.dispatch, 'spawn_agent')
  assert.match(byId.codex.resume, /^(resume_agent|send_input)$/)
})

test('AC6-w2: the row is bound by the PROBED tool, never by a product name or version', () => {
  const codex = dispatch([
    'realizations',
    '--tools',
    JSON.stringify(['spawn_agent', 'resume_agent']),
  ])
  assert.equal(codex.status, 0, codex.stdout + codex.stderr)
  assert.equal(codex.json.bound, 'codex')
  const claude = dispatch([
    'realizations',
    '--tools',
    JSON.stringify(['Agent', 'SendMessage', 'Bash']),
  ])
  assert.equal(claude.json.bound, 'claude')
  // a product name with no primitive present binds nothing: the name is not evidence
  const named = dispatch([
    'realizations',
    '--tools',
    JSON.stringify(['Bash', 'Read']),
    '--product',
    'Claude Code 2.0',
  ])
  assert.notEqual(named.status, 0)
  assert.equal(named.json.halt, 'realization-unavailable')
})

// The bracketed form. Its complement — a fresh card with no PR — is AC6-b2.
test('AC6-b1 (boundary): no row applies ⇒ `realization-unavailable` printing the `pair-cli` fallback', () => {
  const r = dispatch(['realizations', '--tools', '[]', '--story', '486', '--pr', '9'])
  assert.notEqual(r.status, 0, 'a missing primitive must fail closed, before any dispatch')
  assert.equal(r.json.halt, 'realization-unavailable')
  assert.match(r.stdout + r.stderr, /pair-cli run --card 486 --pr 9/)
})

test('AC6-b2 (boundary): with NO PR the fallback line is `pair-cli run --card N` — no dangling `--pr`', () => {
  // AC6 spells the fallback `pair-cli run --card N [--pr P]`: the bracket is optional, and the
  // fresh-card entry (AC-1, the dominant invocation) has no PR. A HALT line reading
  // `--pr undefined` hands the operator a command that does not run, which is the whole remedy
  // this boundary promises.
  const r = dispatch(['realizations', '--tools', '[]', '--story', '486'])
  assert.notEqual(r.status, 0, 'a missing primitive must fail closed, before any dispatch')
  assert.equal(r.json.halt, 'realization-unavailable')
  assert.match(r.stdout + r.stderr, /pair-cli run --card 486/)
  assert.doesNotMatch(
    r.stdout + r.stderr,
    /--pr/,
    'the optional flag is omitted when there is no PR, never printed empty',
  )
})

// ══ AC7 — freshness is a transition policy cycle-state owns; reuse never enters validate/verify ══

test('AC7-w1: every `resolve` output carries `next.context`, `fresh` by default', () => {
  const { dir } = runDir()
  for (const entry of [
    ['--entry', 'fresh'],
    ['--entry', 'pr', '--pr', '7'],
  ]) {
    const r = state([
      'resolve',
      '--dir',
      dir,
      '--workflowVersion',
      WORKFLOW_VERSION,
      '--policy',
      JSON.stringify(POLICY),
      ...entry,
      '--story',
      '42',
      '--inputs',
      'abc',
    ])
    assert.equal(r.status, 0, r.stderr)
    assert.equal(
      r.json.next.context,
      'fresh',
      `${entry.join(' ')}: the KB default is fresh on every transition`,
    )
  }
})

// The refusing half of `--contextPolicy`. Its admissible half is AC7-w3.
test('AC7-w2: a published prepare advances to validate — still `fresh`, whatever the policy asks', () => {
  const { dir } = runDir()
  const draft = join(dir, 'draft.json')
  writeFileSync(
    draft,
    JSON.stringify({
      run: 'story-42',
      story: '42',
      pr: 7,
      branch: CARD.branch,
      phase: 'a0',
      skill: 'red-spec',
      inputHead: 'a'.repeat(40),
      status: 'red',
      contractPath: '/abs/a0-red-contract.json',
      contractHash: `sha256:${'1'.repeat(64)}`,
      mode: 'initial',
    }),
  )
  assert.equal(
    state([
      'publish',
      '--dir',
      dir,
      '--file',
      draft,
      '--phase',
      'a0',
      '--skill',
      'red-spec',
      '--workflowVersion',
      WORKFLOW_VERSION,
      '--attempt',
      '1',
    ]).status,
    0,
  )
  const plain = state([
    'resolve',
    '--dir',
    dir,
    '--workflowVersion',
    WORKFLOW_VERSION,
    '--policy',
    JSON.stringify(POLICY),
    '--entry',
    'fresh',
    '--story',
    '42',
    '--inputs',
    'abc',
  ])
  assert.equal(plain.json.next.step, 'validate')
  assert.equal(plain.json.next.context, 'fresh', 'a transition INTO validate is always fresh')
  const r = state([
    'resolve',
    '--dir',
    dir,
    '--workflowVersion',
    WORKFLOW_VERSION,
    '--policy',
    JSON.stringify(POLICY),
    '--entry',
    'fresh',
    '--story',
    '42',
    '--inputs',
    'abc',
    '--contextPolicy',
    JSON.stringify({ 'prepare->validate': 'reuse' }),
  ])
  assert.notEqual(r.status, 0, '`reuse` into validate must be refused fail-closed, never honoured')
  assert.equal(r.json.error ?? r.json.halt, 'context-policy-invalid')
})

test('AC7-w3: an ADMISSIBLE `--contextPolicy` transition is honoured — prepare→prepare yields `reuse`', () => {
  // AC-7 has two halves. AC7-w1/AC7-w2 pin the refusing one; without this row `--contextPolicy`
  // is introduced as a `resolve` input whose admissible value has no defined answer, and 'fresh',
  // 'reuse' and an error would all be conformant.
  const { dir } = runDir()
  const publishOne = (phase, skill, fields, predecessor) => {
    const draft = join(dir, `draft-${phase}-${skill}.json`)
    writeFileSync(
      draft,
      JSON.stringify({
        run: 'story-42',
        story: '42',
        pr: 7,
        branch: CARD.branch,
        phase,
        skill,
        inputHead: 'a'.repeat(40),
        ...fields,
      }),
    )
    const args = [
      'publish',
      '--dir',
      dir,
      '--file',
      draft,
      '--phase',
      phase,
      '--skill',
      skill,
      '--workflowVersion',
      WORKFLOW_VERSION,
      '--attempt',
      '1',
    ]
    if (predecessor) args.push('--predecessor', predecessor)
    const out = state(args)
    assert.equal(out.status, 0, out.stdout + out.stderr)
  }
  // a0 prepared, then rejected by the validator: the next step is prepare AGAIN — the one
  // transition the table admits for the prepare role.
  publishOne('a0', 'red-spec', {
    status: 'red',
    mode: 'initial',
    contractPath: '/abs/a0-red-contract.json',
    contractHash: `sha256:${'1'.repeat(64)}`,
  })
  publishOne(
    'a0',
    'red-verify',
    {
      status: 'rejected',
      mode: 'initial',
      verified: false,
      sealed: false,
      contractPath: '/abs/a0-red-contract.json',
      contractHash: `sha256:${'1'.repeat(64)}`,
      findings: [
        {
          rowId: 'AC1-w1',
          mechanismId: 'm1',
          severity: 'major',
          location: 'x',
          description: 'd',
          recommendation: 'r',
          closureAssertions: [{ id: 'CA-1', testRef: 't :: x', expected: 'e' }],
        },
      ],
    },
    'a0-red-spec',
  )
  const resolveWith = extra =>
    state([
      'resolve',
      '--dir',
      dir,
      '--workflowVersion',
      WORKFLOW_VERSION,
      '--policy',
      JSON.stringify(POLICY),
      '--entry',
      'fresh',
      '--story',
      '42',
      '--inputs',
      'abc',
      ...extra,
    ])
  const plain = resolveWith([])
  assert.equal(plain.status, 0, plain.stderr)
  assert.equal(plain.json.next.step, 'prepare')
  assert.equal(plain.json.next.mode, 'repair')
  assert.equal(plain.json.next.context, 'fresh', 'the KB default stands with no policy')
  const reuse = resolveWith(['--contextPolicy', JSON.stringify({ 'prepare->prepare': 'reuse' })])
  assert.equal(reuse.status, 0, reuse.stdout + reuse.stderr)
  assert.equal(reuse.json.next.step, 'prepare')
  assert.equal(
    reuse.json.next.context,
    'reuse',
    'an admissible transition asked to reuse is honoured, never silently downgraded',
  )
})

test('AC7-w4: the coordinator skill documents the `reuse` branch and names each realization’s resume primitive', () => {
  assert.ok(existsSync(CYCLE_SKILL), `the coordinator skill is not shipped at ${CYCLE_SKILL}`)
  const md = readFileSync(CYCLE_SKILL, 'utf8')
  assert.match(md, /`?reuse`?/, 'the reuse branch must be documented at all')
  assert.match(md, /resum/i, 'what `reuse` MEANS — the previous subagent of the role is resumed')
  assert.match(md, /SendMessage/, 'the Claude resume primitive the realization table binds')
  assert.match(md, /resume_agent|send_input/, 'the Codex resume primitive')
})

test('AC7-b1 (boundary): `reuse` is admissible only within a role, and `context-table` is cycle-state’s own table', async () => {
  const r = dispatch(['context-table'])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const allowed = r.json.reuseAllowed
  assert.ok(Array.isArray(allowed), 'the transition table is one structure')
  assert.deepEqual([...allowed].sort(), ['green->green', 'implement->green', 'prepare->prepare'])
  for (const t of allowed) assert.doesNotMatch(t, /->(validate|verify)$/)
  // AC-12: cycle-state OWNS this table; `context-table` only exposes it. Asserting the literal
  // alone would be satisfied by a hardcoded copy inside cycle-dispatch.mjs — the second copy
  // AC-12 exists to forbid.
  const mod = await import(STATE_CLI)
  assert.ok(mod.CONTEXT_TABLE, '`CONTEXT_TABLE` is not exported by cycle-state.mjs')
  assert.deepEqual(
    [...mod.CONTEXT_TABLE.reuseAllowed].sort(),
    [...allowed].sort(),
    '`context-table` must print cycle-state’s table, never a second copy of it',
  )
})

// ══ AC8 — `$rounds` bounds this invocation's remediation and never widens maxFixRounds ══════════

test('AC8-c1 (control): `maxFixRounds` is the authority `$rounds` may only narrow', async () => {
  const calls = await batchPrompts({ cards: [CARD] })
  const policy = JSON.parse(/\$policy=(\{.*?\})\s/.exec(calls[0].prompt)[1])
  assert.equal(
    policy.maxFixRounds,
    3,
    'every stage packet carries the round ceiling as policy data',
  )
})

test('AC8-w1: the coordinator skill documents `$rounds`, its default and the clamp that never widens', () => {
  assert.ok(existsSync(CYCLE_SKILL), `the coordinator skill is not shipped at ${CYCLE_SKILL}`)
  const md = readFileSync(CYCLE_SKILL, 'utf8')
  assert.match(md, /\$rounds/, 'the Arguments table must carry $rounds')
  assert.match(
    md,
    /never widen|never widens|clamped/i,
    'the clamp against maxFixRounds must be stated',
  )
  assert.match(md, /maxFixRounds/)
})

// ══ AC9 — idempotent and resumable ══════════════════════════════════════════════════════════════

test('AC9-c1 (control): a converged cycle re-resolves to `done` and asks for no dispatch', () => {
  const { dir } = runDir()
  const publishOne = (phase, skill, fields, predecessor) => {
    const draft = join(dir, `draft-${phase}-${skill}.json`)
    writeFileSync(
      draft,
      JSON.stringify({
        run: 'story-42',
        story: '42',
        pr: 7,
        branch: CARD.branch,
        phase,
        skill,
        inputHead: 'a'.repeat(40),
        ...fields,
      }),
    )
    const args = [
      'publish',
      '--dir',
      dir,
      '--file',
      draft,
      '--phase',
      phase,
      '--skill',
      skill,
      '--workflowVersion',
      WORKFLOW_VERSION,
      '--attempt',
      '1',
    ]
    if (predecessor) args.push('--predecessor', predecessor)
    const out = state(args)
    assert.equal(out.status, 0, out.stdout + out.stderr)
  }
  publishOne('r0', 'review-phase', {
    reviewedHead: 'c'.repeat(40),
    verdict: 'APPROVED',
    findings: [],
    custody: { verified: true, contractBreach: false },
    readiness: { ready: true, remoteHead: 'c'.repeat(40) },
    mode: 'first',
  })
  const r = state([
    'resolve',
    '--dir',
    dir,
    '--workflowVersion',
    WORKFLOW_VERSION,
    '--policy',
    JSON.stringify(POLICY),
    '--entry',
    'pr',
    '--pr',
    '7',
    '--story',
    '42',
    '--inputs',
    'abc',
  ])
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.json.next.step, 'done')
})

// ══ AC10 — interoperable with the batch: one run id, one inputs digest ══════════════════════════

test('AC10-c1 (control): the batch keys the run directory `story-<id>`', async () => {
  const calls = await batchPrompts({ cards: [CARD] })
  assert.match(calls[0].prompt, /\$run=story-42\b/)
})

// Parity on a NEW `--story` form. The EXISTING `--json` surface and the mismatch behaviour it
// keys are AC10-c2 and AC10-b1: this parity may not be bought by mutating the shared helper.
test('AC10-w1: `cycle-state.mjs inputs --story` reproduces the digest the engine puts in `$inputs`', async () => {
  const calls = await batchPrompts({ cards: [CARD] })
  const fromBatch = /\$inputs=(\S+)/.exec(calls[0].prompt)?.[1]
  assert.ok(fromBatch, 'the engine dispatched no $inputs')
  const r = state([
    'inputs',
    '--story',
    JSON.stringify(CARD),
    '--workflowVersion',
    WORKFLOW_VERSION,
  ])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(
    r.json.inputsDigest,
    fromBatch,
    'both realizations must compute the same effective-inputs digest',
  )
})

// `$inputs` is a persisted IDENTITY, not a display value: `resolve` compares a review-phase
// handoff's recorded `inputsDigest` against the value it is given and, on inequality, discards the
// approved review (`re-review`, `inputsChanged`, `invalidated`). AC10-w1 makes a NEW `--story` form
// agree with the engine's fnv1a composition; these two rows keep that parity from being bought by
// re-keying the shared helper, and pin what the mismatch actually does.

test('AC10-c2 (control): `inputs --json` keeps its published `sha256:<64 hex>` form, and the export is that same function', async () => {
  const r = state(['inputs', '--json', JSON.stringify({ story: '42' })])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(
    r.json.inputsDigest,
    /^sha256:[0-9a-f]{64}$/,
    'the documented `inputs --json` surface is already consumed — its digest form is not AC10-w1’s to re-key',
  )
  const mod = await import(STATE_CLI)
  assert.equal(typeof mod.inputsDigest, 'function', '`inputsDigest` is exported by cycle-state.mjs')
  assert.equal(
    mod.inputsDigest({ story: '42' }),
    r.json.inputsDigest,
    'the CLI surface and the exported helper are one function',
  )
})

test('AC10-b1 (boundary): a CHANGED effective-inputs digest invalidates the review evidence; the same digest does not', () => {
  const { dir } = runDir()
  const draft = join(dir, 'draft-r0-review-phase.json')
  writeFileSync(
    draft,
    JSON.stringify({
      run: 'story-42',
      story: '42',
      pr: 7,
      branch: CARD.branch,
      phase: 'r0',
      skill: 'review-phase',
      inputHead: 'a'.repeat(40),
      inputsDigest: 'DIGEST-X',
      reviewedHead: 'c'.repeat(40),
      verdict: 'APPROVED',
      findings: [],
      custody: { verified: true, contractBreach: false },
      readiness: { ready: true, remoteHead: 'c'.repeat(40) },
      mode: 'first',
    }),
  )
  const pub = state([
    'publish',
    '--dir',
    dir,
    '--file',
    draft,
    '--phase',
    'r0',
    '--skill',
    'review-phase',
    '--workflowVersion',
    WORKFLOW_VERSION,
    '--attempt',
    '1',
  ])
  assert.equal(pub.status, 0, pub.stdout + pub.stderr)
  const resolveWith = inputs =>
    state([
      'resolve',
      '--dir',
      dir,
      '--workflowVersion',
      WORKFLOW_VERSION,
      '--policy',
      JSON.stringify(POLICY),
      '--entry',
      'pr',
      '--pr',
      '7',
      '--story',
      '42',
      '--inputs',
      inputs,
    ])

  const same = resolveWith('DIGEST-X')
  assert.equal(same.status, 0, same.stderr)
  assert.equal(same.json.next.step, 'done', 'an unchanged digest keeps the approved review')
  assert.equal(same.json.next.inputsChanged, undefined)
  assert.equal(same.json.next.invalidated, undefined)

  const changed = resolveWith('DIGEST-Y')
  assert.equal(changed.status, 0, changed.stderr)
  assert.equal(changed.json.next.step, 'verify')
  assert.equal(changed.json.next.mode, 're-review')
  assert.equal(changed.json.next.inputsChanged, true)
  assert.deepEqual(
    changed.json.next.invalidated,
    ['r0-review-phase'],
    'every review-phase handoff stamped under the other digest is named as invalidated',
  )
})

// ══ AC11 — the coordinator never decides merge ══════════════════════════════════════════════════

test('AC11-w1: the coordinator skill holds no merge logic and ends at the status `resolve` reports', () => {
  assert.ok(existsSync(CYCLE_SKILL), `the coordinator skill is not shipped at ${CYCLE_SKILL}`)
  const md = readFileSync(CYCLE_SKILL, 'utf8')
  assert.doesNotMatch(md, /gh pr merge|--squash|--admin/, 'merge is never this skill’s decision')
  assert.match(md, /ready-for-merge/)
  assert.match(md, /escalate/)
})

// ══ AC12 — one owner for the rules ══════════════════════════════════════════════════════════════

test('AC12-w1: the caps are exported data of `cycle-state.mjs`', async () => {
  const mod = await import(STATE_CLI)
  assert.ok(mod.CAPS, '`CAPS` is not exported by cycle-state.mjs')
  assert.equal(mod.CAPS.dispatchesPerStory, 40)
  assert.equal(mod.CAPS.consecutiveRedirects, 3)
})

// The engine is one consumer. The OTHER consumer this story creates is cycle-dispatch.mjs —
// AC12-w5 applies the same mechanical statement to it.
test('AC12-w2: `pair-implement-batch.js` redefines none of them', () => {
  const src = readFileSync(BATCH_JS, 'utf8')
  assert.doesNotMatch(
    src,
    /const\s+MAX_DISPATCHES_PER_STORY\s*=\s*\d+/,
    'the dispatch cap is redefined in the engine',
  )
  assert.doesNotMatch(
    src,
    /const\s+effectiveInputs\s*=\s*story\s*=>/,
    'the effective-inputs composition is redefined in the engine',
  )
  assert.doesNotMatch(
    src,
    /redirectsInARow\s*>\s*\d/,
    'the consecutive-redirect cap is redefined in the engine',
  )
})

test('AC12-w5: `cycle-dispatch.mjs` redefines none of them either — it consumes the rules, it does not own a copy', () => {
  assert.ok(
    existsSync(DISPATCH_CLI),
    `the coordinator dispatch script is not shipped at ${DISPATCH_CLI}`,
  )
  const src = readFileSync(DISPATCH_CLI, 'utf8')
  assert.doesNotMatch(
    src,
    /const\s+MAX_DISPATCHES_PER_STORY\s*=\s*\d+/,
    'the dispatch cap is redefined in cycle-dispatch.mjs',
  )
  assert.doesNotMatch(
    src,
    /const\s+effectiveInputs\s*=\s*story\s*=>/,
    'the effective-inputs composition is redefined in cycle-dispatch.mjs',
  )
  assert.doesNotMatch(
    src,
    /redirectsInARow\s*>\s*\d/,
    'the consecutive-redirect cap is redefined in cycle-dispatch.mjs',
  )
  assert.doesNotMatch(
    src,
    /dispatchesPerStory\s*:\s*\d+/,
    'CAPS is redefined as a literal in cycle-dispatch.mjs',
  )
  assert.doesNotMatch(
    src,
    /consecutiveRedirects\s*:\s*\d+/,
    'CAPS is redefined as a literal in cycle-dispatch.mjs',
  )
  assert.doesNotMatch(
    src,
    /['"`]prepare->prepare['"`]/,
    'the reuse-transition list is a second copy in cycle-dispatch.mjs',
  )
})

test('AC12-w3: `cycle-state.mjs` ships byte-identical inside SIX skills, dataset and mirror', () => {
  const skills = ['cycle', 'red-spec', 'red-verify', 'implement-phase', 'green-fix', 'review-phase']
  const canonical = readFileSync(
    join(DATASET, '.skills/workflow/red-spec/scripts/cycle-state.mjs'),
    'utf8',
  )
  for (const s of skills) {
    const ds = join(DATASET, `.skills/workflow/${s}/scripts/cycle-state.mjs`)
    assert.ok(existsSync(ds), `dataset ${s} carries no cycle-state.mjs`)
    assert.equal(readFileSync(ds, 'utf8'), canonical, `dataset ${s} drifted`)
    const mirror = join(SKILLS, `pair-workflow-${s}/scripts/cycle-state.mjs`)
    assert.ok(existsSync(mirror), `mirror pair-workflow-${s} carries no cycle-state.mjs`)
    assert.equal(readFileSync(mirror, 'utf8'), canonical, `mirror ${s} drifted`)
  }
})

test('AC12-w4: the coordinator ships as a dataset skill mirrored to `pair-workflow-cycle`', () => {
  for (const rel of ['SKILL.md', 'scripts/cycle-state.mjs', 'scripts/cycle-dispatch.mjs']) {
    const ds = join(DATASET, '.skills/workflow/cycle', rel)
    const mirror = join(SKILLS, 'pair-workflow-cycle', rel)
    assert.ok(existsSync(ds), `dataset workflow/cycle/${rel} is missing`)
    assert.ok(existsSync(mirror), `mirror pair-workflow-cycle/${rel} is missing`)
    assert.equal(
      readFileSync(mirror, 'utf8'),
      readFileSync(ds, 'utf8'),
      `${rel} drifted from the dataset`,
    )
  }
})
