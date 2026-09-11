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
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, chmodSync } from 'node:fs'
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
  assert.equal(view.time.agentMs, 1000)
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

test('F8: nothing written after `finalize` can overwrite the finalized view', () => {
  const f = fixture()
  const { res } = runRecipe(f)
  assert.equal(res.status, 0, res.stderr)
  const finalized = JSON.parse(readFileSync(join(f.dir, 'metrics.json'), 'utf8'))
  const CLI = join(SKILL_DIR, 'scripts/cycle-runtime.mjs')
  const late = spawnSync('node', [CLI, 'reconcile', '--dir', f.dir, '--repository', 'foomakers/pair', '--story', '42', '--branch', 'b', '--pr', '7', '--runId', 'v5', '--journal', join(f.transcripts, 'journal.jsonl'), '--transcripts', f.transcripts, '--usage', join(f.dir, 'usage.jsonl')], { encoding: 'utf8' })
  assert.equal(late.status, 0, late.stderr)
  assert.match(late.stdout, /finalized/)
  assert.deepEqual(JSON.parse(readFileSync(join(f.dir, 'metrics.json'), 'utf8')), finalized)
})
