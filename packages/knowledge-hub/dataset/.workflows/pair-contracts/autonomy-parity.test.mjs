// US-524 AC-6 / T-4: PARITY. The same policy + card fixture, driven by the cycle (`cycle-state.mjs resolve` +
// `cycle-merge.mjs check`, what /pair-workflow-cycle and `pair-cli run --card` call), by the batch sequentially and by
// the batch in parallel, gives the same decision, conditions and stage — and `pair-cli run --card`'s own suite
// (apps/pair-cli/src/commands/run/autonomy-parity.test.ts) reads THIS fixture file. The batch is the REAL workflow
// source; its scripted agent runs the REAL scripts the prompts name (commands extracted verbatim from the prompt and run
// through `sh -c`, `gh` replaced by a fake via PAIR_GH_BIN), so a rule re-derived in the sandbox could not agree with them.
// RUNS FROM `.claude/workflows` ONLY (the dataset copy's `../../skills/...` imports resolve nowhere).
for (const k of Object.keys(process.env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|PREFIX|NAMESPACE|CEILING_DIRECTORIES|IMPLICIT_WORK_TREE|DISCOVERY_ACROSS_FILESYSTEM)/.test(k)) delete process.env[k]
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolve } from '../../skills/pair-workflow-cycle/scripts/cycle-state.mjs'
import { resolvePolicy, parse } from '../../skills/pair-workflow-cycle/scripts/autonomy-policy.mjs'

const SCRIPTS = fileURLToPath(new URL('../../skills/pair-workflow-cycle/scripts', import.meta.url))
const { rows } = JSON.parse(readFileSync(new URL('./autonomy-parity.fixtures.json', import.meta.url), 'utf8'))
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
const BATCH = readFileSync(new URL('../pair-implement-batch.js', import.meta.url), 'utf8').replace(/^export /gm, '')
const HEAD = 'a'.repeat(40)
const POLICY = { maxFixRounds: 3, redRepairs: 1, greenRetries: 1, reviewers: 1 }
const tierOf = labels => labels.find(l => l.startsWith('risk:')) ?? 'risk:red'

// A project root with the adoption file, the host binding of every card and a fake `gh` that answers the reads
// `cycle-merge.mjs` makes (card labels, PR head, both required checks green) and swallows the comment writes.
function project(row, ids) {
  const root = mkdtempSync(join(tmpdir(), 'parity-'))
  mkdirSync(join(root, '.pair/adoption/tech'), { recursive: true })
  writeFileSync(join(root, '.pair/adoption/tech/automation.md'), row.adoption ?? '')
  for (const id of ids) {
    const dir = join(root, `.pair/working/runs/story-${id}/${id}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, '.host-binding.json'), JSON.stringify({ schemaVersion: 1, pmTool: 'github', codeHost: 'github' }))
  }
  const gh = join(root, 'fake-gh.sh')
  writeFileSync(gh, `#!/bin/sh
case "$*" in
  *"issue view"*"--json labels"*) echo "{\\"labels\\":$PARITY_LABELS}" ;;
  *"headRefOid"*) echo ${HEAD} ;;
  *"/status"*) echo '{"statuses":[{"context":"pair-review","state":"success"},{"context":"pair-explicit-approval","state":"success"}]}' ;;
  *"--paginate"*) echo '[]' ;;
  *) echo '{}' ;;
esac
`)
  chmodSync(gh, 0o755)
  return { root, gh }
}
const labelsJson = names => JSON.stringify(names.map(name => ({ name })))
const runCommand = (prompt, { root, gh }, labelNames) => {
  const cmd = /`(node \S+\.mjs [^`]*)`/.exec(prompt)?.[1]
  assert.ok(cmd, `no script command in the prompt: ${prompt.slice(0, 120)}`)
  const r = spawnSync('sh', ['-c', cmd.replaceAll('.claude/skills/pair-workflow-cycle/scripts', SCRIPTS).replace("'<labels>'", `'${JSON.stringify(labelNames)}'`)], { cwd: root, encoding: 'utf8', env: { ...process.env, PAIR_GH_BIN: gh, PARITY_LABELS: labelsJson(labelNames) } })
  assert.equal(r.status, 0, `${cmd}\n${r.stderr}`)
  return JSON.parse(r.stdout.trim().split('\n').pop())
}

// ── realization 1: the cycle (cycle-state resolve at the stage boundary, cycle-merge check at the merge boundary) ──
function cycleDecisions(row) {
  const p = project(row, ['1'])
  const resolved = resolvePolicy({ args: row.args, adoptionText: row.adoption ?? '' })
  assert.equal(resolved.ok, true, JSON.stringify(resolved.errors))
  const policy = resolved.active ? { ...POLICY, autonomy: resolved.policy } : POLICY
  const dir = join(p.root, '.pair/working/runs/story-1/1')
  const { next } = resolve({ dir, runsRoot: join(p.root, '.pair/working/runs'), workflowVersion: '4.0.1', policy, entry: 'fresh', story: '1', labels: row.labels, tier: tierOf(row.labels) })
  const implement = next.step === 'blocked' && next.reason === 'escalated' ? { decision: 'escalate', conditions: next.conditions, stage: next.stage } : next.step === 'done' ? { decision: 'stop-at-target', target: next.target } : { decision: 'proceed' }
  let merge = null
  if (resolved.policy.until === 'merged' && resolved.active) {
    const mergeCmd = `\`node .claude/skills/pair-workflow-cycle/scripts/cycle-merge.mjs check --dir .pair/working/runs/story-1/1 --story 1 --pr 7 --reviewedHead ${HEAD} --cardTier ${tierOf(row.labels)} --mergeGate '${JSON.stringify(resolved.policy.merge)}'\``
    merge = mergeDecision(runCommand(mergeCmd, p, row.labelsAtMerge ?? row.labels))
  }
  return { implement, merge }
}
const mergeDecision = check => (check.mergeAllowed ? { decision: 'proceed' } : check.parkKind === 'awaiting-human' ? { decision: 'await-human' } : check.parkKind === 'escalated' ? { decision: 'escalate', conditions: check.conditions } : { decision: `halted:${check.reason}` })

for (const row of rows) {
  test(`${row.id}: the cycle decides ${JSON.stringify(row.args)} ${row.note ? '— ' + row.note : ''}as the fixture says`, () => {
    const got = cycleDecisions(row)
    const strip = ({ decision, target, conditions }) => ({ decision, ...(target ? { target } : {}), ...(conditions ? { conditions } : {}) })
    assert.deepEqual(strip(got.implement), strip(row.implement))
    assert.deepEqual(got.merge && strip(got.merge), row.merge && strip(row.merge))
  })
}

// ── realizations 2 and 3: the REAL batch, sequential (maxParallelism 1) and parallel ──────────────────────────────
function batchRun(row, ids, maxParallelism) {
  const p = project(row, ids)
  const calls = []
  const agent = async (prompt, opts) => {
    calls.push(opts.label)
    const l = opts.label ?? ''
    if (l === 'autonomy:resolve' || l.startsWith('decide:') || l.startsWith('merge-check:') || l.startsWith('escalate:')) return runCommand(prompt, p, l.startsWith('merge-check:') && row.labelsAtMerge ? row.labelsAtMerge : row.labels)
    if (l.startsWith('prepare:phase')) return { outcome: 'nothing-to-prepare' } // US-523 r1-g1: the harness card is Ready
    if (l.startsWith('tier:')) return { tier: tierOf(row.labels) }
    if (l.startsWith('merge:')) return { merged: true, cascaded: true, reason: 'merged' }
    return stageAnswer(prompt, opts)
  }
  const parallel = async fns => Promise.all(fns.map(f => Promise.resolve().then(f).catch(() => null)))
  const cards = ids.map(id => ({ id, title: 'T', branch: `feat/#${id}-x` }))
  return new AsyncFunction('args', 'agent', 'parallel', 'log', BATCH)({ cards, policyText: row.adoption ?? '', ...(row.args ?? {}), maxParallelism }, agent, parallel, () => {}).then(r => ({ result: r, calls }))
}
// The cycle's stages answered minimally: implement publishes PR 7; the first review approves it (a `done` next).
const stageAnswer = (prompt, opts) => {
  const story = /\$story=(\S+)/.exec(prompt)?.[1]
  if (opts.agentType === 'pair-implementer')
    return { status: 'ok', gatesPassed: true, branch: 'b', prNumber: 7, url: 'https://x/pr/7', outputHead: HEAD, checkpointPath: 'c.md', next: { step: 'verify', mode: 'first', phase: 'r0', round: 0, attempt: 1, pr: 7, base: HEAD } }
  if (opts.agentType === 'pair-reviewer')
    return { status: 'reviewed', verdict: 'Approved', reviewedHead: HEAD, findings: [], custody: { verified: true, contractBreach: false }, readiness: { ready: true, remoteHead: HEAD }, published: { firstReview: true, synthesis: true }, templateContract: undefined, next: { step: 'done', reviewedHead: HEAD, round: 0, verdict: 'Approved' }, story }
  return {}
}
const expectFinal = (b, row) => {
  assert.equal(b.status, row.final.status, `${row.id}: ${JSON.stringify(b).slice(0, 300)}`)
  if (row.final.stage) assert.equal(b.stage, row.final.stage)
  if (row.final.conditions) assert.deepEqual(b.conditions, row.final.conditions)
}
for (const row of rows) {
  test(`${row.id}: the batch (sequential and parallel) reaches the cycle's decision`, async () => {
    const one = await batchRun(row, ['1'], 1)
    expectFinal(one.result.batch[0], row)
    const par = await batchRun(row, ['1', '2'], 2)
    assert.equal(par.result.batch.length, 2)
    for (const b of par.result.batch) expectFinal(b, row)
  })
}

test('P-11: an empty `## Autonomy` is not declared by parse() — the same answer the batch acted on (no stage decision, no merge)', async () => {
  const row = rows.find(r => r.id === 'P-11')
  assert.equal(parse(row.adoption).declared, false)
  const { calls } = await batchRun(row, ['1'], 1)
  assert.deepEqual(calls.filter(l => /^(decide|merge|tier|escalate)/.test(l)), [])
})

test('the batch re-derives no rule: the source holds no gate evaluation (a local copy would not survive the matrix above)', () => {
  assert.doesNotMatch(BATCH.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n'), /\.mode === ['"](when|always|never)['"]|escalationConditions|\.lacks\.(some|every|filter)|\.has\.(some|every|filter)/)
})

// ── ONE answer to "is `## Autonomy` declared?" (carried from #525, d-1): `parse(text).declared`. The batch no longer
// holds a reader of its own — it asks the resolve script — so every heading variant must engage it exactly when
// parse() says declared, and never refuse. (Carried from the retired A1 refusal suite: H-1 .. H-9.)
const BODY = '\n\nmerge: when; has: cost:red\n'
const BASE = '## Eligibility\n\nrisk:green\n'
const HEADING_VARIANTS = [
  ['H-1', '##  Autonomy'], ['H-2', '##\tAutonomy'], ['H-3', '## \tAutonomy'], ['H-4', '## Autonomy  '], ['H-5', '## Autonomy\t'],
  ['H-6', '## Autonomy'], ['H-7', '```\n## Autonomy\n```'], ['H-8', '### Autonomy'], ['H-9', '##Autonomy'],
]
for (const [id, heading] of HEADING_VARIANTS) {
  test(`${id}: ${JSON.stringify(heading)} — the batch engages the policy exactly when parse().declared says so`, async () => {
    const adoption = `${heading}${BODY}\n${BASE}`
    const truth = parse(adoption).declared
    const { calls, result } = await batchRun({ id, adoption, args: {}, labels: ['risk:green'] }, ['1'], 1)
    assert.equal(calls.some(l => l.startsWith('decide:')), truth, `parse().declared = ${truth}`)
    assert.equal(result.batch[0].status, 'ready-for-merge')
  })
}
test('an EMPTY `## Autonomy` section (heading only, or only blank lines) is off in parse() and in the batch', async () => {
  for (const adoption of [`${BASE}\n## Autonomy\n`, `${BASE}\n## Autonomy\n\n\n`]) {
    assert.equal(parse(adoption).declared, false)
    const { calls } = await batchRun({ id: 'E', adoption, args: {}, labels: ['risk:green'] }, ['1'], 1)
    assert.equal(calls.some(l => /^(decide|merge)/.test(l)), false)
  }
})
