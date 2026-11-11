import { beforeEach, afterEach, vi } from 'vitest'
import { execFileSync } from 'child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { createDefaultCycleDriver, type CycleDriverContext } from './cycle-wiring'
import { POLICY_PATH } from './automation-policy'
import { CYCLE_BASE_BRANCH_DEFAULT, CYCLE_WORKFLOW_VERSION } from './cycle-scripts'
import { ENGINES } from './engines'
/**
 * US-490 r1-g2 (finding r0-2) — `pair-cli run --card` reaches the `merge` stage through the SAME
 * gate the in-session cycle skill does (cycle SKILL.md Step 5, merge branch):
 *
 * - `resolve` is handed the card's `risk:*` tier as `--tier` and the project's `## Auto-Advance`
 *   tiers as `policy.autoAdvance.tiers`;
 * - a `merge` next runs `cycle-merge.mjs check`, and — only when the check allows it — `cycle-merge.mjs
 *   run` with the tier gate result, both pinned to the head the verifier reviewed;
 * - a tier outside the policy is the unchanged `done` terminal, a malformed policy never merges.
 *
 * The production driver runs over a throwaway repository. `resolve` is a stub whose merge-offer rule
 * is the REAL one (`autoAdvancePolicyError` / `mergeOffered`, imported from the copied
 * `cycle-state.mjs`) over a converged cycle; every other `cycle-state.mjs` command delegates to the
 * real script. `cycle-merge.mjs`, `gh` and the engine are stubs that record their argv — nothing
 * reaches a real tracker, host or engine.
 *
 * The tier gate seam (repair r1-g2 attempt 2 — the one the fix must use). SKILL Step 5 makes the
 * coordinator run `/pair-capability-verify-quality` for the tier once the check passed; a process
 * realization gets its answer back through a FILE, as every stage does:
 *
 * - only after `check` answered `mergeAllowed: true`, the driver dispatches ONE engine stage whose
 *   prompt invokes `pair-capability-verify-quality` for the PR (`42`), naming the card tier, the
 *   reviewed head and the absolute evidence path `<run dir>/merge-gate.json`;
 * - the stage writes `{ "tier", "reviewedHead", "result" }` there, `result` being verify-quality's
 *   own `RESULT:` line verbatim (`RESULT: ALL GATES PASS` | `RESULT: BLOCKED — N gates failing`);
 * - the driver removes any evidence file before that dispatch, and hands `run` `--gate green` ONLY
 *   when the file this dispatch wrote names the card tier, the reviewed head and
 *   `RESULT: ALL GATES PASS`; anything else is `--gate red`, a `RESULT: BLOCKED` line reported
 *   verbatim. `run`'s `merged` / `cascaded` (and `reason`) are relayed in the outcome verbatim.
 */
export const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')
export const INSTALLED_SCRIPTS = join(REPO_ROOT, '.claude/skills/pair-workflow-cycle/scripts')
export const REVIEWED_HEAD = 'abcdef0123456789abcdef0123456789abcdef01'
export const BRANCH = 'feature/US-7-a-story'
export const PR = 42
export const GATE_PASS = 'RESULT: ALL GATES PASS'
export const GATE_BLOCKED = 'RESULT: BLOCKED — 2 gates failing'
export const GATE_SKILL = 'pair-capability-verify-quality'

// The stub `resolve`: a converged cycle (`done`, reviewed at REVIEWED_HEAD), turned into `merge` by
// the real script's own rule. After a recorded `cycle-merge.mjs run` it answers plain `done`.
export const RESOLVE_STUB = `#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync, realpathSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { autoAdvancePolicyError, mergeOffered } from './cycle-state.real.mjs'
import { decide } from './autonomy-policy.mjs'
export * from './cycle-state.real.mjs'

const self = fileURLToPath(import.meta.url)
const isMain = !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(self)
if (isMain) {
  const [cmd, ...rest] = process.argv.slice(2)
  if (cmd !== 'resolve') {
    const real = spawnSync('node', [self.replace(/cycle-state\\.mjs$/, 'cycle-state.real.mjs'), cmd, ...rest], { encoding: 'utf8' })
    process.stdout.write(real.stdout ?? '')
    process.stderr.write(real.stderr ?? '')
    process.exit(real.status ?? 1)
  }
  const opts = {}
  for (let i = 0; i < rest.length; i += 2) opts[rest[i].replace(/^--/, '')] = rest[i + 1]
  appendFileSync(process.env.FAKE_RESOLVE_LOG, JSON.stringify(opts) + '\\n')
  if (process.env.FAKE_RESOLVE_FORCE) {
    process.stdout.write(process.env.FAKE_RESOLVE_FORCE + '\\n')
    process.exit(0)
  }
  const policy = opts.policy ? JSON.parse(opts.policy) : {}
  const effective = { deadDispatchRetries: 1, ...policy }
  // US-575 AC2: the REAL resolve routes a recorded merge-time gate-red to the fix stage (cycle-recovery.test.mjs);
  // here that route is a typed terminal, so the driver's hand-off to it is observable.
  const recovery = existsSync(opts.dir + '/recovery.json') ? JSON.parse(readFileSync(opts.dir + '/recovery.json', 'utf8')) : {}
  if (recovery.gateRed) {
    process.stdout.write(JSON.stringify({ status: 'blocked', next: { step: 'blocked', reason: 'stub-fix-stage', findings: recovery.gateRed.gates }, pr: ${PR}, policy: effective }) + '\\n')
    process.exit(0)
  }
  const error = autoAdvancePolicyError(policy.autoAdvance)
  if (error) {
    process.stdout.write(JSON.stringify({ status: 'invalid', reason: error, policy: effective }) + '\\n')
    process.exit(0)
  }
  const log = process.env.FAKE_MERGE_LOG
  const merged = existsSync(log) && readFileSync(log, 'utf8').split('\\n').filter(Boolean).some(l => JSON.parse(l).cmd === 'run')
  let next = { step: 'done', reviewedHead: '${REVIEWED_HEAD}', round: 1, verdict: 'approved' }
  if (!merged && mergeOffered(policy.autoAdvance, opts.tier)) next = { ...next, step: 'merge', tier: opts.tier }
  if (policy.autonomy) {
    // the REAL gate rule (the copied autonomy-policy.mjs), fed exactly what the driver passed
    const d = decide({ boundary: { kind: 'merge' }, labels: opts.labels ? JSON.parse(opts.labels) : undefined, prLabels: opts.prLabels ? JSON.parse(opts.prLabels) : undefined, policy: policy.autonomy })
    if (d.decision === 'escalate') {
      const blocked = { step: 'blocked', reason: 'escalated', stage: d.stage, conditions: d.conditions }
      process.stdout.write(JSON.stringify({ status: 'escalated', next: blocked, pr: ${PR}, policy: effective }) + '\\n')
      process.exit(0)
    }
    if (d.decision === 'proceed' && !merged) next = { ...next, step: 'merge', tier: opts.tier }
  }
  process.stdout.write(JSON.stringify({ status: next.step === 'done' ? 'completed' : 'in-progress', next, pr: ${PR}, policy: effective }) + '\\n')
}
`

// The stub `cycle-merge.mjs`: records every call; `check` answers FAKE_MERGE_CHECK (default: allowed),
// `run` merges only on `--gate green`, exactly the refusal the real script applies to any other gate.
export const MERGE_STUB = `#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
const [cmd, ...rest] = process.argv.slice(2)
const opts = {}
for (let i = 0; i < rest.length; i += 2) opts[rest[i].replace(/^--/, '')] = rest[i + 1]
const log = process.env.FAKE_MERGE_LOG
const count = existsSync(log) ? readFileSync(log, 'utf8').split('\\n').filter(Boolean).length : 0
appendFileSync(log, JSON.stringify({ cmd, opts }) + '\\n')
if (count >= 6) { process.stdout.write(JSON.stringify({ error: 'merge stub: called too many times' }) + '\\n'); process.exit(2) }
if (cmd === 'check') {
  const checks = existsSync(log) ? readFileSync(log, 'utf8').split('\\n').filter(Boolean).filter(l => JSON.parse(l).cmd === 'check').length - 1 : 0
  const first = Number(process.env.FAKE_MERGE_CHECK_FIRST_N || 0)
  const answer = process.env.FAKE_MERGE_CHECK_FIRST && checks < first ? JSON.parse(process.env.FAKE_MERGE_CHECK_FIRST) : process.env.FAKE_MERGE_CHECK ? JSON.parse(process.env.FAKE_MERGE_CHECK) : { mergeAllowed: true, failed: [], reason: null, parkKind: null }
  process.stdout.write(JSON.stringify({ stage: 'merge', mode: 'check', ...answer }) + '\\n')
} else if (cmd === 'run') {
  const green = opts.gate === 'green'
  // FAKE_MERGE_REMOVE_WORKTREE: an executed merge removes the worktree holding the story branch,
  // as the real run's \`branch\` step does (AC3) — before the driver's post-merge.
  if (green && process.env.FAKE_MERGE_REMOVE_WORKTREE) {
    const { execFileSync } = await import('node:child_process')
    const list = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: opts.root, encoding: 'utf8' })
    const held = list.split('\\n\\n').find(b => b.includes('branch refs/heads/' + opts.branch))
    const path = held && held.split('\\n')[0].replace(/^worktree /, '')
    if (path && path !== opts.root) execFileSync('git', ['worktree', 'remove', '--force', path], { cwd: opts.root })
  }
  const landed = process.env.FAKE_MERGE_RUN ? JSON.parse(process.env.FAKE_MERGE_RUN) : { merged: true, cascaded: true, reason: null }
  process.stdout.write(JSON.stringify(green
    ? { stage: 'merge', mode: 'run', mergeAllowed: true, failed: [], ...landed }
    : { stage: 'merge', mode: 'run', mergeAllowed: false, failed: [{ code: 'gate-red', detail: "the tier's gate set came back red at merge time" }], reason: "the tier's gate set came back red at merge time", parkKind: 'halted', merged: false, cascaded: false }) + '\\n')
} else if (cmd === 'escalate') {
  process.stdout.write(JSON.stringify({ stage: opts.stage, conditions: JSON.parse(opts.conditions), comment: { posted: true } }) + '\\n')
} else { process.stdout.write(JSON.stringify({ error: 'unknown command' }) + '\\n'); process.exit(2) }
`

export interface MergeCall {
  readonly cmd: string
  readonly opts: Record<string, string>
}

export let root: string
export let main: string
export let remoteHead: string
export let logs: { resolve: string; merge: string; engine: string }
export let printed: string[]

function initRepos(origin: string): void {
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  git(main, 'init', '-q', '-b', 'main')
  // Hermetic identity: the base sync commits in this repo, and a runner with no global git identity (release.yml) must not differ.
  git(main, 'config', 'user.name', 't')
  git(main, 'config', 'user.email', 't@t')
  git(
    main,
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@t',
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'init',
  )
  git(main, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
  // A LOCAL origin whose story branch sits at a head that is NOT the reviewed one: a merge pinned
  // to the remote head instead of the reviewed head is caught.
  git(root, 'init', '-q', '--bare', origin)
  git(main, 'remote', 'add', 'origin', origin)
  git(main, 'push', '-q', 'origin', `HEAD:refs/heads/${BRANCH}`)
  remoteHead = git(main, 'rev-parse', 'HEAD').trim()
}

function installScripts(): void {
  const scripts = join(main, '.claude/skills/pair-workflow-cycle/scripts')
  mkdirSync(scripts, { recursive: true })
  cpSync(join(INSTALLED_SCRIPTS, 'cycle-dispatch.mjs'), join(scripts, 'cycle-dispatch.mjs'))
  cpSync(join(INSTALLED_SCRIPTS, 'host'), join(scripts, 'host'), { recursive: true })
  cpSync(join(INSTALLED_SCRIPTS, 'cycle-state.mjs'), join(scripts, 'cycle-state.real.mjs'))
  cpSync(join(INSTALLED_SCRIPTS, 'autonomy-policy.mjs'), join(scripts, 'autonomy-policy.mjs'))
  writeFileSync(join(scripts, 'cycle-state.mjs'), RESOLVE_STUB)
  writeFileSync(join(scripts, 'cycle-merge.mjs'), MERGE_STUB)
  writeFileSync(join(main, '.claude/skills/pair-workflow-cycle/SKILL.md'), '')
  cpSync(join(REPO_ROOT, '.claude/agents'), join(main, '.claude/agents'), { recursive: true })
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-cycle-merge-stage-')))
  main = join(root, 'main')
  const bin = join(root, 'bin')
  const origin = join(root, 'origin.git')
  logs = {
    resolve: join(root, 'resolve.log'),
    merge: join(root, 'merge.log'),
    engine: join(root, 'engine.log'),
  }
  mkdirSync(main, { recursive: true })
  mkdirSync(bin, { recursive: true })

  initRepos(origin)
  installScripts()

  vi.stubEnv('FAKE_RESOLVE_LOG', logs.resolve)
  vi.stubEnv('FAKE_MERGE_LOG', logs.merge)
  vi.stubEnv('FAKE_ENGINE_LOG', logs.engine)
  vi.stubEnv('FAKE_CARD_LABELS', 'risk:green')
  vi.stubEnv('PATH', `${bin}:${process.env['PATH'] ?? ''}`)
  writeGh(bin)
  writeEngine(bin)

  printed = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    printed.push(args.map(String).join(' '))
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  rmSync(root, { recursive: true, force: true })
})

// The operator's `gh`: the card (and its PR) carry FAKE_CARD_LABELS; `-q`/`--jq` answers the two
// projections a caller could ask for, the head branch or the label names.
export function writeGh(bin: string): void {
  writeFileSync(
    join(bin, 'gh'),
    `#!/usr/bin/env node
const a = process.argv.slice(2)
const labels = (process.env.FAKE_CARD_LABELS || '').split(',').filter(Boolean).map(name => ({ name }))
const prLabels = process.env.FAKE_PR_LABELS === undefined ? labels : process.env.FAKE_PR_LABELS.split(',').filter(Boolean).map(name => ({ name }))
const card = { number: 7, title: 'A story', state: 'OPEN', body: '**Status**: Refined\\n\\n## Task Breakdown\\n\\n- [ ] T-1\\n', labels: a[0] === 'pr' ? prLabels : labels, headRefName: '${BRANCH}' }
if ((a[0] === 'issue' || a[0] === 'pr') && a[1] === 'view') {
const q = a.indexOf('-q') >= 0 ? a[a.indexOf('-q') + 1] : a.indexOf('--jq') >= 0 ? a[a.indexOf('--jq') + 1] : undefined
if (q === undefined) process.stdout.write(JSON.stringify(card))
else if (q.includes('headRefName')) process.stdout.write('${BRANCH}\\n')
else if (q.includes('labels')) process.stdout.write(labels.map(l => l.name).join('\\n') + '\\n')
else process.stdout.write(JSON.stringify(card))
} else process.exit(1)
`,
  )
  chmodSync(join(bin, 'gh'), 0o755)
}

// The engine: records its start and emits a success terminal event. Dispatched for the tier gate
// (a prompt naming verify-quality) with FAKE_GATE_RESULT set, it writes the gate evidence to the
// path the prompt names — tier and head read from the prompt unless FAKE_GATE_TIER/_HEAD override.
// Without FAKE_GATE_RESULT it produces nothing: no gate evidence exists anywhere.
export function writeEngine(bin: string): void {
  writeFileSync(
    join(bin, 'fake-engine'),
    `#!/usr/bin/env node
const fs = require('fs')
const argv = process.argv.slice(2)
fs.appendFileSync(process.env.FAKE_ENGINE_LOG, JSON.stringify({ argv }) + '\\n')
const prompt = argv[argv.length - 1] || ''
const path = (prompt.match(/(\\/[^\\s\`'"]+merge-gate\\.json)/) || [])[1]
// FAKE_GATE_SEQUENCE: one RESULT line per successive gate dispatch (US-575: BLOCKED once, then PASS).
const gateRuns = fs.readFileSync(process.env.FAKE_ENGINE_LOG, 'utf8').split('\\n').filter(l => l.includes('${GATE_SKILL}')).length
const result = process.env.FAKE_GATE_SEQUENCE ? JSON.parse(process.env.FAKE_GATE_SEQUENCE)[gateRuns - 1] : process.env.FAKE_GATE_RESULT
if (prompt.includes('${GATE_SKILL}') && result && path) {
fs.writeFileSync(path, JSON.stringify({
  tier: process.env.FAKE_GATE_TIER || (prompt.match(/risk:[a-z]+/) || [])[0],
  reviewedHead: process.env.FAKE_GATE_HEAD || (prompt.match(/[0-9a-f]{40}/) || [])[0],
  result,
  gates: result.includes('BLOCKED') ? [{ name: 'lint', ok: false, lastLines: 'error  no-unused-vars' }, { name: 'test', ok: true }] : [{ name: 'lint', ok: true }],
}))
}
process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success' }) + '\\n')
`,
  )
  chmodSync(join(bin, 'fake-engine'), 0o755)
}

export const lines = (file: string): string[] =>
  existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : []
export const resolveCalls = () =>
  lines(logs.resolve).map(l => JSON.parse(l) as Record<string, string>)
export const mergeCalls = () => lines(logs.merge).map(l => JSON.parse(l) as MergeCall)
export const runDir = () => join(main, '.pair/working/runs/story-7/7')
export const gatePrompts = () =>
  lines(logs.engine)
    .map(l => (JSON.parse(l) as { argv: string[] }).argv)
    .map(argv => argv[argv.length - 1] ?? '')
    .filter(prompt => prompt.includes(GATE_SKILL))
export const runCalls = () => mergeCalls().filter(c => c.cmd === 'run')
export const reported = (outcome: string) => `${outcome}\n${printed.join('\n')}`

/** `automation.md`, on disk AND in the driver's file system, however the fix reads it. */
export function adopt(policy: string | undefined): InMemoryFileSystemService {
  const files: Record<string, string> = {}
  if (policy !== undefined) {
    const path = join(main, POLICY_PATH)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, policy)
    files[path] = policy
  }
  return new InMemoryFileSystemService(files, main, main)
}

export const ELIGIBLE = '## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\nrisk:green\n'

export const drive = (fs: InMemoryFileSystemService, ciWait?: CycleDriverContext['ciWait']) =>
  createDefaultCycleDriver({
    ...(ciWait !== undefined && { ciWait }),
    engine: { ...ENGINES.claude, command: join(root, 'bin', 'fake-engine') },
    cwd: main,
    fs,
    location: { scriptsDir: join(main, '.claude/skills/pair-workflow-cycle/scripts') },
    autonomyArgs: [],
    timeoutSeconds: 30,
    workflowVersion: CYCLE_WORKFLOW_VERSION,
    baseBranch: CYCLE_BASE_BRANCH_DEFAULT,
  })({ runId: 'story-7', card: '7', pr: PR })

/** The driver's answer, resolved or rejected — a typed stop may take either shape. */
export const settle = async (run: Promise<unknown>): Promise<string> =>
  run.then(
    value => `resolved ${JSON.stringify(value)}`,
    (error: unknown) => `rejected ${error instanceof Error ? error.message : String(error)}`,
  )

// ── witnesses: RED against the unfixed base ────────────────────────────────────────────────
