// US-479 F7/F8 — the HOST LAUNCH RECIPE, executed as documented.
//
// The recipe in ADR-024 was written and never run: its `entry` line was missing
// `--workflowVersion` and exited 2 on the first command, and nothing connected the workflow's real
// terminal result to the observer it started in the background. This suite extracts the bash block
// from the ADR itself, substitutes a fixture, and runs every line through the real CLI — so the
// document and the executables cannot drift again.
for (const k of Object.keys(process.env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|PREFIX|NAMESPACE|CEILING_DIRECTORIES|IMPLICIT_WORK_TREE|DISCOVERY_ACROSS_FILESYSTEM)$/.test(k)) delete process.env[k]
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, appendFileSync, mkdirSync, readFileSync, existsSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ADR = fileURLToPath(new URL('../../../.pair/adoption/tech/adr/adr-024-delivery-phases-are-skills.md', import.meta.url))
const SKILL_DIR = fileURLToPath(new URL('../../skills/pair-workflow-review-phase', import.meta.url))
const STATE_CLI = join(SKILL_DIR, 'scripts/cycle-state.mjs')
const H = c => c.repeat(40)
const T0 = Date.parse('2026-09-11T10:00:00.000Z')

/** The LAST bash block of the ADR: the current host launch recipe, verbatim. */
function recipeFromAdr() {
  const md = readFileSync(ADR, 'utf8')
  const blocks = [...md.matchAll(/```bash\n([\s\S]*?)```/g)].map(m => m[1])
  assert.ok(blocks.length, 'the ADR carries no bash block')
  const recipe = blocks[blocks.length - 1]
  assert.match(recipe, /cycle-runtime\.mjs" entry/, 'the last bash block is not the launch recipe')
  return recipe
}

function fakeGh() {
  const dir = mkdtempSync(join(tmpdir(), 'gh-recipe-'))
  const state = join(dir, 'state.json')
  writeFileSync(state, '[]')
  writeFileSync(
    join(dir, 'gh'),
    `#!/usr/bin/env node
const fs = require('fs')
const args = process.argv.slice(2)
const statePath = ${JSON.stringify(state)}
const list = JSON.parse(fs.readFileSync(statePath, 'utf8'))
const body = () => { const i = args.indexOf('-f'); return args[i + 1].replace(/^body=/, '') }
if (args[0] === 'api' && args.includes('--paginate')) process.stdout.write(JSON.stringify(list))
else if (args[0] === 'api' && args.includes('POST')) {
  const c = { id: list.length + 1, body: body(), html_url: 'https://x/c/' + (list.length + 1) }
  list.push(c); fs.writeFileSync(statePath, JSON.stringify(list))
  process.stdout.write(JSON.stringify({ id: c.id, html_url: c.html_url }))
} else if (args[0] === 'api' && args.includes('PATCH')) {
  const id = Number(args.find(a => /comments\\/\\d+$/.test(a)).split('/').pop())
  const c = list.find(x => x.id === id); c.body = body(); fs.writeFileSync(statePath, JSON.stringify(list))
  process.stdout.write(JSON.stringify({ id, html_url: c.html_url }))
} else { process.stderr.write('unexpected gh call: ' + args.join(' ')); process.exit(1) }
`,
  )
  chmodSync(join(dir, 'gh'), 0o755)
  return { dir, state }
}

/** A run directory, its legacy predecessor, and the harness transcripts the recipe reads. */
function fixture({ status = 'ready-for-merge' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'recipe-'))
  const runsRoot = join(root, '.pair', 'working', 'runs')
  const dir = join(runsRoot, 'v5', '42')
  const legacy = join(runsRoot, 'v4', '42')
  const transcripts = join(root, 'wf_abc')
  for (const d of [dir, legacy, transcripts]) mkdirSync(d, { recursive: true })
  // the legacy predecessor: schema 2, with its own persisted metrics
  writeFileSync(join(legacy, 'r0-review-phase.json'), JSON.stringify({ schemaVersion: 2, workflowVersion: '3.0.13', run: 'v4', story: '42', pr: 7, branch: 'b', skill: 'review-phase', phase: 'r0', inputHead: H('a'), reviewedHead: H('c'), verdict: 'CHANGES-REQUESTED', findings: [], custody: {}, readiness: { ready: false }, seq: 1 }))
  writeFileSync(join(legacy, 'metrics.json'), JSON.stringify({ schemaVersion: 1, identity: { storyId: '42', prNumber: 7, canonicalRunId: 'v4' }, snapshot: { completeness: 'complete', missingSources: [] }, cycles: { attempted: 1, completed: 1 }, usage: { observedTotalTokens: 500, inputTokens: 400, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 }, time: { agentMs: 1000, activeWallMs: 1000 } }))
  // the current cycle: one real review, already approved
  const draft = join(dir, 'draft.json')
  writeFileSync(draft, JSON.stringify({ run: 'v5', story: '42', pr: 7, branch: 'b', phase: 'r0', skill: 'review-phase', inputHead: H('a'), reviewedHead: H('c'), verdict: 'APPROVED', findings: [], custody: { verified: true, contractBreach: false }, readiness: { ready: true, remoteHead: H('c') }, mode: 'first' }))
  const pub = spawnSync('node', [STATE_CLI, 'publish', '--dir', dir, '--file', draft, '--phase', 'r0', '--skill', 'review-phase', '--workflowVersion', '4.0.0', '--pr', '7'], { encoding: 'utf8' })
  assert.equal(pub.status, 0, pub.stdout + pub.stderr)
  // the harness sources: a journal with NO terminal flag and NO timestamps, and one transcript
  writeFileSync(join(transcripts, 'journal.jsonl'), [JSON.stringify({ type: 'started', key: 'k1', agentId: 'a1' }), JSON.stringify({ type: 'result', key: 'k1', agentId: 'a1', result: { status: 'reviewed' } })].join('\n') + '\n')
  writeFileSync(join(transcripts, 'agent-a1.meta.json'), JSON.stringify({ agentType: 'pair-reviewer', spawnDepth: 1 }))
  writeFileSync(
    join(transcripts, 'agent-a1.jsonl'),
    [0, 1].map(i => JSON.stringify({ agentId: 'a1', type: 'assistant', apiBlockIndex: i, requestId: 'q1', effort: 'high', timestamp: new Date(T0 + i * 1000).toISOString(), message: { role: 'assistant', model: 'claude-opus-5', stop_reason: i === 1 ? 'end_turn' : null, usage: { input_tokens: 10, cache_creation_input_tokens: 20, cache_read_input_tokens: 30, output_tokens: i === 1 ? 40 : 1 } } })).join('\n') + '\n',
  )
  // the workflow's returned result, as the host wrote it
  const wfResult = join(root, 'wf-result.json')
  writeFileSync(wfResult, JSON.stringify({ workflowVersion: '4.0.0', batch: [{ id: '42', status, metrics: { dispatches: 3, retries: 1, redirects: 2 } }], metrics: { dispatches: 4, retries: 1, redirects: 2, perDispatch: [{ label: 'contract:code-review' }, { label: 'verify:#42 r0' }] } }))
  return { root, dir, legacy, transcripts, wfResult, stats: join(root, 'stats.json') }
}

function runRecipe(f, { gh = fakeGh() } = {}) {
  const script = join(f.root, 'recipe.sh')
  writeFileSync(script, `set -euo pipefail\n${recipeFromAdr()}\n`)
  const res = spawnSync('bash', [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${gh.dir}:${process.env.PATH}`,
      SKILL: SKILL_DIR,
      RUN_DIR: f.dir,
      LEGACY_DIR: f.legacy,
      TRANSCRIPTS: f.transcripts,
      WF_RESULT: f.wfResult,
      STATS: f.stats,
      REPO: 'foomakers/pair',
      STORY: '42',
      PR: '7',
      RUN_ID: 'v5',
      BRANCH: 'b',
      HEAD: H('a'),
      WORKFLOW_VERSION: '4.0.0',
      WF_ID: 'wf_fixture',
    },
  })
  return { res, gh }
}

test('F7: the recipe documented in ADR-024 runs, line for line, through the real CLI', () => {
  const f = fixture()
  const { res, gh } = runRecipe(f)
  assert.equal(res.status, 0, `recipe failed\n${res.stdout}\n${res.stderr}`)
  const view = JSON.parse(readFileSync(join(f.dir, 'metrics.json'), 'utf8'))
  // the provider's own accounting (F3), the demonstrated span (F4) and the bound predecessor (F6)
  assert.equal(view.usage.observedTotalTokens, 10 + 20 + 30 + 40)
  // AMENDED by US-479 F4 residual: a transcript proves a message SPAN, not an execution duration.
  assert.equal(view.time.messageSpan.totalMs, 1000)
  assert.equal(view.time.agentMs, null)
  assert.deepEqual(view.identity.predecessorRuns, ['v4'])
  assert.equal(view.lifetime.usage.observedTotalTokens, 500 + 100)
  assert.equal(view.lifetime.cycles.completed, 1)
  // the admin counters came from the engine's own result through the file the recipe wrote
  assert.equal(view.execution.redirects, 2)
  assert.equal(view.execution.engineRecoveries, 1)
  assert.equal(view.execution.administrativeDispatches, 1)
  assert.equal(view.execution.nestedDispatches, null)
  // one synthesis comment, published by finalize
  assert.equal(JSON.parse(readFileSync(gh.state, 'utf8')).length, 1)
})

test('F8: the observer stops on the HOST`s real terminal result — not on a flag in the journal, and not because every agent seen so far has returned', () => {
  const f = fixture()
  const CLI = join(SKILL_DIR, 'scripts/cycle-runtime.mjs')
  const observe = args => spawnSync('node', [CLI, 'observe', '--dir', f.dir, '--repository', 'foomakers/pair', '--story', '42', '--branch', 'b', '--pr', '7', '--runId', 'v5', '--journal', join(f.transcripts, 'journal.jsonl'), '--transcripts', f.transcripts, '--usage', join(f.dir, 'usage.jsonl'), '--interval-ms', '10', '--grace-ms', '200', ...args], { encoding: 'utf8' })
  // the journal is complete and every observed agent has a result — and that is NOT the end
  const withoutMarker = observe(['--max-ticks', '3'])
  assert.equal(withoutMarker.status, 0, withoutMarker.stderr)
  assert.equal(JSON.parse(withoutMarker.stdout.trim().split('\n').pop()).stopReason, 'max-ticks')
  assert.equal(existsSync(join(f.dir, '.run-terminal.json')), false, 'no terminal flag was invented')
  // the host records the workflow's REAL result, and only then does the observer finish
  const mark = spawnSync('node', [CLI, 'mark-terminal', '--dir', f.dir, '--result', f.wfResult, '--story', '42'], { encoding: 'utf8' })
  assert.equal(mark.status, 0, mark.stderr)
  const marker = JSON.parse(readFileSync(join(f.dir, '.run-terminal.json'), 'utf8'))
  assert.equal(marker.status, 'ready-for-merge')
  assert.equal(marker.story, '42')
  assert.match(marker.observedAt, /^\d{4}-/)
  const withMarker = observe([])
  assert.equal(withMarker.status, 0, withMarker.stderr)
  assert.equal(JSON.parse(withMarker.stdout.trim().split('\n').pop()).stopReason, 'terminal-reconciled')
  // the journal itself was never touched
  assert.equal(readFileSync(join(f.transcripts, 'journal.jsonl'), 'utf8').includes('terminal'), false)
})

test('F8: a FAILED workflow ends the observation just as a successful one does, and the summary does not read ready', () => {
  const f = fixture({ status: 'failed-preparation' })
  const CLI = join(SKILL_DIR, 'scripts/cycle-runtime.mjs')
  assert.equal(spawnSync('node', [CLI, 'mark-terminal', '--dir', f.dir, '--result', f.wfResult, '--story', '42'], { encoding: 'utf8' }).status, 0)
  assert.equal(JSON.parse(readFileSync(join(f.dir, '.run-terminal.json'), 'utf8')).status, 'failed-preparation')
  const out = spawnSync('node', [CLI, 'observe', '--dir', f.dir, '--repository', 'foomakers/pair', '--story', '42', '--branch', 'b', '--pr', '7', '--runId', 'v5', '--journal', join(f.transcripts, 'journal.jsonl'), '--transcripts', f.transcripts, '--usage', join(f.dir, 'usage.jsonl'), '--interval-ms', '10', '--grace-ms', '200'], { encoding: 'utf8' })
  assert.equal(JSON.parse(out.stdout.trim().split('\n').pop()).stopReason, 'terminal-reconciled')
})

test('F8: a terminal result with NO usage source stops on the grace period and reports partial — never a fabricated complete', () => {
  const f = fixture()
  const CLI = join(SKILL_DIR, 'scripts/cycle-runtime.mjs')
  assert.equal(spawnSync('node', [CLI, 'mark-terminal', '--dir', f.dir, '--result', f.wfResult, '--story', '42'], { encoding: 'utf8' }).status, 0)
  const out = spawnSync('node', [CLI, 'observe', '--dir', f.dir, '--repository', 'foomakers/pair', '--story', '42', '--branch', 'b', '--pr', '7', '--runId', 'v5', '--journal', join(f.transcripts, 'journal.jsonl'), '--usage', join(f.dir, 'never.jsonl'), '--interval-ms', '10', '--grace-ms', '120'], { encoding: 'utf8' })
  assert.equal(out.status, 0, out.stderr)
  assert.equal(JSON.parse(out.stdout.trim().split('\n').pop()).stopReason, 'terminal-partial-usage')
  assert.equal(JSON.parse(readFileSync(join(f.dir, 'metrics.json'), 'utf8')).snapshot.completeness, 'partial')
})

// AMENDED by US-479 F8 residual: the guard is no longer "a finalization exists" — that froze the
// metrics and refused a legitimate late reconciliation. It is now "this write carries no new
// evidence", which is what a stale writer actually is.
test('F8: a tick after `finalize` carrying NO new evidence changes nothing', () => {
  const f = fixture()
  const { res } = runRecipe(f)
  assert.equal(res.status, 0, res.stderr)
  const finalized = JSON.parse(readFileSync(join(f.dir, 'metrics.json'), 'utf8'))
  const CLI = join(SKILL_DIR, 'scripts/cycle-runtime.mjs')
  const late = spawnSync('node', [CLI, 'reconcile', '--dir', f.dir, '--repository', 'foomakers/pair', '--story', '42', '--branch', 'b', '--pr', '7', '--runId', 'v5', '--journal', join(f.transcripts, 'journal.jsonl'), '--transcripts', f.transcripts, '--usage', join(f.dir, 'usage.jsonl')], { encoding: 'utf8' })
  assert.equal(late.status, 0, late.stderr)
  assert.match(late.stdout, /no-new-evidence/)
  assert.deepEqual(JSON.parse(readFileSync(join(f.dir, 'metrics.json'), 'utf8')), finalized)
})

// ── US-479 F8 residual: finalize is IDEMPOTENT, not a freeze ─────────────────────────────────
// "No late write" means a stale writer never wins — not that the metrics can never be revised
// again. A legitimate reconciliation must produce a HIGHER revision, consistent across the
// checkpoint, the file and the one PR comment.
const CLI = join(SKILL_DIR, 'scripts/cycle-runtime.mjs')
const RUNTIME_ARGS = f => ['--dir', f.dir, '--repository', 'foomakers/pair', '--story', '42', '--branch', 'b', '--pr', '7', '--runId', 'v5', '--journal', join(f.transcripts, 'journal.jsonl'), '--transcripts', f.transcripts, '--usage', join(f.dir, 'usage.jsonl')]
const FINALIZE_ARGS = f => ['--dir', f.dir, '--repo', 'foomakers/pair', '--story', '42', '--branch', 'b', '--pr', '7', '--runId', 'v5', '--journal', join(f.transcripts, 'journal.jsonl'), '--transcripts', f.transcripts, '--usage', join(f.dir, 'usage.jsonl')]
const saved = f => JSON.parse(readFileSync(join(f.dir, 'metrics.json'), 'utf8'))
const comments = gh => JSON.parse(readFileSync(gh.state, 'utf8'))
/** A second, genuinely new provider request appended to the transcript after the fact. */
const lateRequest = (f, { requestId = 'q2', output = 10 } = {}) =>
  writeFileSync(
    join(f.transcripts, 'agent-a1.jsonl'),
    readFileSync(join(f.transcripts, 'agent-a1.jsonl'), 'utf8') +
      [0, 1].map(i => JSON.stringify({ agentId: 'a1', type: 'assistant', apiBlockIndex: i, requestId, effort: 'high', timestamp: new Date(T0 + 60_000 + i * 1000).toISOString(), message: { role: 'assistant', model: 'claude-opus-5', stop_reason: i === 1 ? 'end_turn' : null, usage: { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: i === 1 ? output : 1 } } })).join('\n') +
      '\n',
  )

test('F8 residual: finalize with nothing new is idempotent — same revision, same comment, no second publication', () => {
  const f = fixture()
  const gh = fakeGh()
  const env = { ...process.env, PATH: `${gh.dir}:${process.env.PATH}` }
  const first = spawnSync('node', [CLI, 'finalize', ...FINALIZE_ARGS(f)], { encoding: 'utf8', env })
  assert.equal(first.status, 0, first.stderr)
  const afterFirst = saved(f)
  const second = spawnSync('node', [CLI, 'finalize', ...FINALIZE_ARGS(f)], { encoding: 'utf8', env })
  assert.equal(second.status, 0, second.stderr)
  assert.deepEqual(saved(f).snapshot.revision, afterFirst.snapshot.revision)
  assert.equal(saved(f).usage.observedTotalTokens, afterFirst.usage.observedTotalTokens)
  assert.equal(comments(gh).length, 1)
  assert.match(second.stdout, /no-new-evidence|"written":false/)
})

test('F8 residual: a usage tail that arrives AFTER finalize is reconciled into a HIGHER revision, consistent across the file, the checkpoint and the same PR comment', () => {
  const f = fixture()
  const gh = fakeGh()
  const env = { ...process.env, PATH: `${gh.dir}:${process.env.PATH}` }
  assert.equal(spawnSync('node', [CLI, 'reconcile', ...RUNTIME_ARGS(f)], { encoding: 'utf8', env }).status, 0)
  assert.equal(spawnSync('node', [CLI, 'finalize', ...FINALIZE_ARGS(f)], { encoding: 'utf8', env }).status, 0)
  const before = saved(f)
  assert.equal(before.usage.observedTotalTokens, 100)
  const commentBefore = comments(gh)[0]
  // a real new request lands after the finalization
  lateRequest(f)
  const again = spawnSync('node', [CLI, 'finalize', ...FINALIZE_ARGS(f)], { encoding: 'utf8', env })
  assert.equal(again.status, 0, again.stderr)
  const after = saved(f)
  assert.equal(after.usage.observedTotalTokens, 110, 'the late tail is reconciled, not refused')
  assert.ok(after.snapshot.revision > before.snapshot.revision, `${after.snapshot.revision} must exceed ${before.snapshot.revision}`)
  const checkpoint = JSON.parse(readFileSync(join(f.dir, '.runtime-checkpoint.json'), 'utf8'))
  assert.ok(checkpoint.revision >= before.snapshot.revision, 'the checkpoint does not lag the file it wrote')
  // the SAME comment carries the new numbers
  assert.equal(comments(gh).length, 1)
  assert.equal(comments(gh)[0].id, commentBefore.id)
  assert.match(comments(gh)[0].body, /tokens 110/)
})

test('F8 residual: a failed publication retries — unchanged data republishes the same view, new data raises the revision', () => {
  const f = fixture()
  const broken = mkdtempSync(join(tmpdir(), 'gh-broken-'))
  writeFileSync(join(broken, 'gh'), '#!/bin/sh\nexit 1\n')
  chmodSync(join(broken, 'gh'), 0o755)
  const failed = spawnSync('node', [CLI, 'finalize', ...FINALIZE_ARGS(f)], { encoding: 'utf8', env: { ...process.env, PATH: `${broken}:${process.env.PATH}` } })
  assert.equal(JSON.parse(readFileSync(join(f.dir, 'metrics.json'), 'utf8')).publication.state !== 'confirmed', true, failed.stdout)
  const gh = fakeGh()
  const env = { ...process.env, PATH: `${gh.dir}:${process.env.PATH}` }
  const retry = spawnSync('node', [CLI, 'finalize', ...FINALIZE_ARGS(f)], { encoding: 'utf8', env })
  assert.equal(retry.status, 0, retry.stderr)
  assert.equal(saved(f).publication.state, 'confirmed', 'the retry publishes the same evidence')
  assert.equal(comments(gh).length, 1)
  const revisionAfterRetry = saved(f).snapshot.revision
  lateRequest(f, { requestId: 'q3', output: 5 })
  assert.equal(spawnSync('node', [CLI, 'finalize', ...FINALIZE_ARGS(f)], { encoding: 'utf8', env }).status, 0)
  assert.equal(saved(f).usage.observedTotalTokens, 105)
  assert.ok(saved(f).snapshot.revision > revisionAfterRetry)
  assert.equal(comments(gh).length, 1)
})

test('F8 residual: a terminal marker from the PREVIOUS invocation does not close a resumed observation', () => {
  const f = fixture()
  assert.equal(spawnSync('node', [CLI, 'mark-terminal', '--dir', f.dir, '--result', f.wfResult, '--story', '42'], { encoding: 'utf8' }).status, 0)
  // a new invocation starts AFTER that marker: it must observe, not exit on a stale terminal
  const resumed = spawnSync('node', [CLI, 'observe', ...RUNTIME_ARGS(f), '--interval-ms', '10', '--grace-ms', '100', '--max-ticks', '3', '--since', new Date(Date.now() + 1000).toISOString()], { encoding: 'utf8' })
  assert.equal(resumed.status, 0, resumed.stderr)
  assert.equal(JSON.parse(resumed.stdout.trim().split('\n').pop()).stopReason, 'max-ticks', 'the previous marker did not end this invocation')
})

test('F8 residual: an OLD observer cannot overwrite the revision a later reconciliation wrote', () => {
  const f = fixture()
  const gh = fakeGh()
  const env = { ...process.env, PATH: `${gh.dir}:${process.env.PATH}` }
  assert.equal(spawnSync('node', [CLI, 'reconcile', ...RUNTIME_ARGS(f)], { encoding: 'utf8', env }).status, 0)
  const staleCheckpoint = JSON.parse(readFileSync(join(f.dir, '.runtime-checkpoint.json'), 'utf8'))
  lateRequest(f)
  assert.equal(spawnSync('node', [CLI, 'finalize', ...FINALIZE_ARGS(f)], { encoding: 'utf8', env }).status, 0)
  const current = saved(f)
  assert.equal(current.usage.observedTotalTokens, 110)
  // the old observer comes back with its own, older checkpoint
  writeFileSync(join(f.dir, '.runtime-checkpoint.json'), JSON.stringify(staleCheckpoint))
  const old = spawnSync('node', [CLI, 'reconcile', ...RUNTIME_ARGS(f)], { encoding: 'utf8', env })
  assert.equal(old.status, 0, old.stderr)
  assert.equal(saved(f).snapshot.revision, current.snapshot.revision, 'the persisted revision did not go backwards')
  assert.equal(saved(f).usage.observedTotalTokens, 110)
})

// ── US-479 F8-C residual: the fingerprint is the PUBLISHED semantic state ─────────────────────
const finalizeWith = (f, gh, extra = []) => spawnSync('node', [CLI, 'finalize', ...FINALIZE_ARGS(f), ...extra], { encoding: 'utf8', env: { ...process.env, PATH: `${gh.dir}:${process.env.PATH}` } })

test('F8-C residual: a change in a HOST ADMIN counter alone is new evidence — the file, the checkpoint and the one comment all move together', () => {
  const f = fixture()
  const gh = fakeGh()
  const one = finalizeWith(f, gh, ['--dispatchStats', '{"redirects":1}'])
  assert.equal(one.status, 0, one.stderr)
  assert.equal(saved(f).execution.redirects, 1)
  const firstRevision = saved(f).snapshot.revision
  const two = finalizeWith(f, gh, ['--dispatchStats', '{"redirects":2}'])
  assert.equal(two.status, 0, two.stderr)
  assert.equal(saved(f).execution.redirects, 2, 'the published metric changed, so it was written')
  assert.ok(saved(f).snapshot.revision > firstRevision)
  assert.equal(JSON.parse(readFileSync(join(f.dir, '.runtime-checkpoint.json'), 'utf8')).dispatchStats.redirects, 2)
  assert.equal(comments(gh).length, 1)
  assert.match(comments(gh)[0].body, /redirects 2/)
})

test('F8-C residual: a genuinely identical finalize is a no-op that returns the PERSISTED, confirmed view — not a fresh one that was never written', () => {
  const f = fixture()
  const gh = fakeGh()
  assert.equal(finalizeWith(f, gh).status, 0)
  const persisted = saved(f)
  const again = finalizeWith(f, gh)
  assert.equal(again.status, 0, again.stderr)
  const out = JSON.parse(again.stdout.trim().split('\n').pop())
  assert.match(again.stdout, /no-new-evidence/)
  assert.equal(out.revision, persisted.snapshot.revision, 'the returned revision is the persisted one')
  assert.equal(out.publication.state, persisted.publication.state)
  assert.deepEqual(saved(f), persisted)
  assert.equal(comments(gh).length, 1)
})

test('F8-C residual: new tokens, different timing coverage, and different lifetime evidence are each new evidence on their own', () => {
  // (a) tokens only
  const a = fixture()
  const ghA = fakeGh()
  assert.equal(finalizeWith(a, ghA).status, 0)
  const beforeA = saved(a).snapshot.revision
  lateRequest(a)
  assert.equal(finalizeWith(a, ghA).status, 0)
  assert.equal(saved(a).usage.observedTotalTokens, 110)
  assert.ok(saved(a).snapshot.revision > beforeA)
  // (b) timing coverage only: a boundary-bearing journal record closes what was open
  const b = fixture()
  const ghB = fakeGh()
  assert.equal(finalizeWith(b, ghB).status, 0)
  const beforeB = saved(b)
  assert.equal(beforeB.time.incomplete, true, 'a transcript alone leaves the duration unknown')
  appendFileSync(join(b.transcripts, 'journal.jsonl'), JSON.stringify({ type: 'started', key: 'k1', agentId: 'a1', observedAt: T0 }) + '\n' + JSON.stringify({ type: 'result', key: 'k1', agentId: 'a1', observedAt: T0 + 5000, result: { status: 'reviewed' } }) + '\n')
  assert.equal(finalizeWith(b, ghB).status, 0)
  assert.equal(saved(b).time.agentMs, 5000, 'a real boundary measures the duration')
  assert.ok(saved(b).snapshot.revision > beforeB.snapshot.revision)
  assert.equal(comments(ghB).length, 1)
  // (c) lifetime evidence only: the predecessor's own metrics change. The predecessor has to be
  // BOUND first — that is what makes it a contributor at all.
  const c = fixture()
  const ghC = fakeGh()
  assert.equal(
    spawnSync('node', [STATE_CLI, 'migrate-acknowledge', '--dir', c.dir, '--legacy', c.legacy, '--workflowVersion', '4.0.0', '--story', '42', '--run', 'v5', '--head', H('a'), '--pr', '7'], { encoding: 'utf8' }).status,
    0,
  )
  assert.equal(finalizeWith(c, ghC).status, 0)
  assert.equal(saved(c).lifetime.usage.observedTotalTokens, 500 + 100)
  const beforeC = saved(c)
  const pred = join(c.legacy, 'metrics.json')
  const predView = JSON.parse(readFileSync(pred, 'utf8'))
  predView.usage.observedTotalTokens = 900
  predView.usage.inputTokens = 800
  writeFileSync(pred, JSON.stringify(predView))
  assert.equal(finalizeWith(c, ghC).status, 0)
  assert.equal(saved(c).lifetime.usage.observedTotalTokens, 900 + 100)
  assert.ok(saved(c).snapshot.revision > beforeC.snapshot.revision)
})

test('F8-C residual: the same token TOTAL with a different request identity or different categories is new evidence, not a heartbeat', () => {
  const f = fixture()
  const gh = fakeGh()
  assert.equal(finalizeWith(f, gh).status, 0)
  const before = saved(f)
  assert.equal(before.usage.observedTotalTokens, 100)
  // the same 100 tokens, redistributed across the categories and under a different request id
  writeFileSync(
    join(f.transcripts, 'agent-a1.jsonl'),
    [0, 1].map(i => JSON.stringify({ agentId: 'a1', type: 'assistant', apiBlockIndex: i, requestId: 'qOTHER', effort: 'high', timestamp: new Date(T0 + i * 1000).toISOString(), message: { role: 'assistant', model: 'claude-opus-5', stop_reason: i === 1 ? 'end_turn' : null, usage: { input_tokens: 5, cache_creation_input_tokens: 25, cache_read_input_tokens: 30, output_tokens: i === 1 ? 40 : 1 } } })).join('\n') + '\n',
  )
  assert.equal(finalizeWith(f, gh).status, 0)
  const after = saved(f)
  assert.equal(after.usage.observedTotalTokens, 100 + 100, 'the ledger keeps both requests: identity is not a total')
  assert.notDeepEqual(after.usage, before.usage)
  assert.ok(after.snapshot.revision > before.snapshot.revision)
  assert.equal(comments(gh).length, 1)
})
