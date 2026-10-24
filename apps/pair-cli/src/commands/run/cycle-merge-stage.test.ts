import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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
import { createDefaultCycleDriver, readCardTier, type CycleDriverContext } from './cycle-wiring'
import { POLICY_PATH } from './automation-policy'
import {
  createCycleScriptsBridge,
  CYCLE_BASE_BRANCH_DEFAULT,
  CYCLE_WORKFLOW_VERSION,
} from './cycle-scripts'
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

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')
const INSTALLED_SCRIPTS = join(REPO_ROOT, '.claude/skills/pair-workflow-cycle/scripts')
const REVIEWED_HEAD = 'abcdef0123456789abcdef0123456789abcdef01'
const BRANCH = 'feature/US-7-a-story'
const PR = 42
const GATE_PASS = 'RESULT: ALL GATES PASS'
const GATE_BLOCKED = 'RESULT: BLOCKED — 2 gates failing'
const GATE_SKILL = 'pair-capability-verify-quality'

// The stub `resolve`: a converged cycle (`done`, reviewed at REVIEWED_HEAD), turned into `merge` by
// the real script's own rule. After a recorded `cycle-merge.mjs run` it answers plain `done`.
const RESOLVE_STUB = `#!/usr/bin/env node
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
const MERGE_STUB = `#!/usr/bin/env node
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

interface MergeCall {
  readonly cmd: string
  readonly opts: Record<string, string>
}

describe('pair-cli run --card reaches the merge stage (US-490 r1-g2, finding r0-2)', () => {
  let root: string
  let main: string
  let remoteHead: string
  let logs: { resolve: string; merge: string; engine: string }
  let printed: string[]

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

    const git = (cwd: string, ...args: string[]) =>
      execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    git(main, 'init', '-q', '-b', 'main')
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
  function writeGh(bin: string): void {
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
  function writeEngine(bin: string): void {
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

  const lines = (file: string): string[] =>
    existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : []
  const resolveCalls = () => lines(logs.resolve).map(l => JSON.parse(l) as Record<string, string>)
  const mergeCalls = () => lines(logs.merge).map(l => JSON.parse(l) as MergeCall)
  const runDir = () => join(main, '.pair/working/runs/story-7/7')
  const gatePrompts = () =>
    lines(logs.engine)
      .map(l => (JSON.parse(l) as { argv: string[] }).argv)
      .map(argv => argv[argv.length - 1] ?? '')
      .filter(prompt => prompt.includes(GATE_SKILL))
  const runCalls = () => mergeCalls().filter(c => c.cmd === 'run')
  const reported = (outcome: string) => `${outcome}\n${printed.join('\n')}`

  /** `automation.md`, on disk AND in the driver's file system, however the fix reads it. */
  function adopt(policy: string | undefined): InMemoryFileSystemService {
    const files: Record<string, string> = {}
    if (policy !== undefined) {
      const path = join(main, POLICY_PATH)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, policy)
      files[path] = policy
    }
    return new InMemoryFileSystemService(files, main, main)
  }

  const ELIGIBLE = '## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\nrisk:green\n'

  const drive = (fs: InMemoryFileSystemService, ciWait?: CycleDriverContext['ciWait']) =>
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
  const settle = async (run: Promise<unknown>): Promise<string> =>
    run.then(
      value => `resolved ${JSON.stringify(value)}`,
      (error: unknown) => `rejected ${error instanceof Error ? error.message : String(error)}`,
    )

  // ── witnesses: RED against the unfixed base ────────────────────────────────────────────────

  it('g2-w1: resolve receives the card tier as --tier and the Auto-Advance tiers as policy.autoAdvance.tiers', async () => {
    await settle(drive(adopt(ELIGIBLE)))

    const calls = resolveCalls()
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call['tier']).toBe('risk:green')
      const policy = JSON.parse(call['policy'] ?? '{}') as { autoAdvance?: { tiers?: unknown } }
      expect(policy.autoAdvance?.tiers).toEqual(['risk:green'])
    }
  }, 60_000)

  it('g2-w2: a merge next runs cycle-merge.mjs check, then cycle-merge.mjs run — never a ready-for-merge terminal', async () => {
    // US-575: a red gate no longer reaches `run` (it is routed to the fix stage) — the pinning is observed on a green one.
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)
    const outcome = await settle(drive(adopt(ELIGIBLE)))

    const cmds = mergeCalls().map(c => c.cmd)
    expect(cmds[0]).toBe('check')
    expect(cmds).toContain('run')
    expect(cmds.indexOf('check')).toBeLessThan(cmds.indexOf('run'))
    expect(cmds.filter(c => c === 'check')).toHaveLength(1)
    expect(cmds.filter(c => c === 'run')).toHaveLength(1)
    expect(outcome).not.toMatch(/"status":"ready-for-merge"/)
  }, 60_000)

  it('g2-w3: check and run are pinned to the reviewed head, the PR, the story, the tier and the Auto-Advance tiers', async () => {
    // US-575: a red gate no longer reaches `run` (it is routed to the fix stage) — the pinning is observed on a green one.
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)
    await settle(drive(adopt(ELIGIBLE)))

    const calls = mergeCalls()
    expect(calls.map(c => c.cmd)).toEqual(['check', 'run'])
    expect(REVIEWED_HEAD).not.toBe(remoteHead)
    for (const { opts } of calls) {
      expect(opts['reviewedHead']).toBe(REVIEWED_HEAD)
      expect(opts['pr']).toBe(String(PR))
      expect(opts['story']).toBe('7')
      expect(opts['cardTier']).toBe('risk:green')
      expect(JSON.parse(opts['autoAdvance'] ?? 'null')).toEqual(['risk:green'])
      expect(realpathSync(opts['dir'] ?? '')).toBe(realpathSync(runDir()))
    }
    const run = calls[1]!.opts
    expect(run['branch']).toBe(BRANCH)
    expect((run['message'] ?? '').trim().length).toBeGreaterThan(0)
  }, 60_000)

  it('g2-w4: the gate stage ran but wrote NO evidence — red: retried once, then routed to the fix stage; nothing merges', async () => {
    const outcome = await settle(drive(adopt(ELIGIBLE)))

    expect(gatePrompts()).toHaveLength(2)
    expect(existsSync(join(runDir(), 'merge-gate.json'))).toBe(false)
    expect(runCalls()).toHaveLength(0)
    expect(outcome).not.toContain('"merged":true')
    expect(outcome).toContain('stub-fix-stage')
    expect(`${outcome}\n${printed.join('\n')}`).toContain('no gate evidence for this tier and head')
  }, 60_000)

  it('g2-w5: a parked check never runs the merge, and its reason is reported verbatim', async () => {
    const reason = 'the card tier changed since the cycle started (risk:green -> risk:yellow)'
    vi.stubEnv(
      'FAKE_MERGE_CHECK',
      JSON.stringify({
        mergeAllowed: false,
        failed: [{ code: 'tier-changed', detail: reason }],
        reason,
        parkKind: 'halted',
      }),
    )

    const outcome = await settle(drive(adopt(ELIGIBLE)))

    expect(mergeCalls().map(c => c.cmd)).toEqual(['check'])
    expect(`${outcome}\n${printed.join('\n')}`).toContain(reason)
    expect(outcome).not.toContain('"merged":true')
  }, 60_000)

  it('g2-w6: a malformed ## Auto-Advance halts naming the section — no merge script, no stage', async () => {
    const outcome = await settle(
      drive(adopt('## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\nrisk:green AND risk:red\n')),
    )

    expect(outcome).toMatch(/^rejected .*Auto-Advance|"status":"invalid"/)
    expect(mergeCalls()).toHaveLength(0)
    expect(lines(logs.engine)).toHaveLength(0)
  }, 60_000)

  it('g2-w7: green gate evidence for the card tier gives exactly one run --gate green, merged:true and cascaded relayed', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)

    const outcome = await settle(drive(adopt(ELIGIBLE)))

    expect(mergeCalls().map(c => c.cmd)).toEqual(['check', 'run'])
    expect(runCalls()[0]!.opts['gate']).toBe('green')
    expect(outcome).toMatch(/^resolved /)
    expect(outcome).toContain('"merged":true')
    expect(outcome).toContain('"cascaded":true')
  }, 60_000)

  it('g2-w8: a merge that landed with the closure unfinished is relayed merged:true, cascaded:false with its reason', async () => {
    const reason = 'post-merge closure unfinished: board (status field not found)'
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)
    vi.stubEnv('FAKE_MERGE_RUN', JSON.stringify({ merged: true, cascaded: false, reason }))

    const outcome = await settle(drive(adopt(ELIGIBLE)))

    expect(runCalls()).toHaveLength(1)
    expect(runCalls()[0]!.opts['gate']).toBe('green')
    expect(outcome).toContain('"merged":true')
    expect(outcome).toContain('"cascaded":false')
    expect(outcome).not.toContain('"cascaded":true')
    expect(reported(outcome)).toContain(reason)
  }, 60_000)

  // 2026-10-24 (#575 / PR #581): CI stayed red on a deterministic failure (no git identity on the
  // runner); re-runs cannot fix it, and the card parked awaiting a human instead of being fixed.
  const platformCases = ['darwin', 'linux']
  it.each(platformCases)(
    'US-575 follow-up: CI still red after its re-run is routed to the fix stage with the failing checks as findings — never parked (platform %s)',
    async platform => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue(platform as NodeJS.Platform)
      vi.stubEnv(
        'FAKE_MERGE_CHECK',
        JSON.stringify({
          mergeAllowed: false,
          ciPending: false,
          ciFailed: true,
          failed: [{ code: 'ci-failed', detail: 'build: failure' }],
          reason: 'required CI failed: build',
          parkKind: 'halted',
        }),
      )

      const outcome = await settle(drive(adopt(ELIGIBLE), { capSeconds: 0 }))

      expect(runCalls()).toHaveLength(0)
      expect(outcome).not.toContain('merge-parked')
      const recovery = JSON.parse(readFileSync(join(runDir(), 'recovery.json'), 'utf8'))
      expect(recovery.gateRed.reviewedHead).toBe(REVIEWED_HEAD)
      expect(JSON.stringify(recovery.gateRed.gates)).toContain('build')
    },
    60_000,
  )

  it('g2-w9 / US-575 AC2: gate evidence that ran and FAILED twice is routed to the fix stage with the failing gates as findings — never run --gate red', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_BLOCKED)

    const outcome = await settle(drive(adopt(ELIGIBLE)))

    expect(gatePrompts()).toHaveLength(2)
    expect(runCalls()).toHaveLength(0)
    expect(outcome).not.toContain('"merged":true')
    expect(reported(outcome)).toContain(GATE_BLOCKED)
    const recovery = JSON.parse(readFileSync(join(runDir(), 'recovery.json'), 'utf8'))
    expect(recovery.gateRed).toMatchObject({
      reviewedHead: REVIEWED_HEAD,
      gates: [
        { name: 'lint', ok: false, lastLines: 'error  no-unused-vars' },
        { name: 'test', ok: true },
      ],
    })
    expect(outcome).toContain('stub-fix-stage')
  }, 60_000)

  it('US-575 AC1: a gate BLOCKED once, then green on re-run, merges — the driver never exits on the first BLOCKED (#568 / PR #574)', async () => {
    vi.stubEnv('FAKE_GATE_SEQUENCE', JSON.stringify([GATE_BLOCKED, GATE_PASS]))

    const outcome = await settle(drive(adopt(ELIGIBLE)))

    expect(gatePrompts()).toHaveLength(2)
    expect(gatePrompts().every(p => p.includes(REVIEWED_HEAD))).toBe(true)
    expect(runCalls()).toHaveLength(1)
    expect(runCalls()[0]!.opts['gate']).toBe('green')
    expect(outcome).toContain('"status":"merged"')
    expect(printed.join('\n')).toMatch(/recovery round 1\/5/)
    const recovery = JSON.parse(readFileSync(join(runDir(), 'recovery.json'), 'utf8'))
    expect(recovery.rounds).toMatchObject([{ kind: 'gate-retry', detail: GATE_BLOCKED }])
  }, 60_000)

  it('US-575 AC1: the gate prompt asks for every gate by name with its last error lines in merge-gate.json', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)
    await settle(drive(adopt(ELIGIBLE)))
    expect(gatePrompts()[0]).toMatch(
      /"gates": \[\{"name": "<gate>", "ok": <true\|false>, "lastLines": "<its last error lines>"\}/,
    )
  }, 60_000)

  it('US-575 AC1: before the re-run the driver runs the adopted worktree-setup-command in the story worktree; a failing setup is one round, its error recorded', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_BLOCKED)
    const wow = join(main, '.pair/adoption/tech/way-of-working.md')
    mkdirSync(dirname(wow), { recursive: true })
    writeFileSync(
      wow,
      "- **`worktree-setup-command`**: `node -e \"require('fs').appendFileSync('setup.log', process.cwd() + '\\\\n'); process.exit(3)\"` — run once.\n",
    )

    const outcome = await settle(drive(adopt(ELIGIBLE)))

    const recovery = JSON.parse(readFileSync(join(runDir(), 'recovery.json'), 'utf8'))
    expect(recovery.rounds.map((r: { detail: string }) => r.detail)).toEqual([GATE_BLOCKED])
    expect(recovery.gateRed.gates).toContainEqual({
      name: 'worktree-setup-command',
      ok: false,
      lastLines: expect.stringMatching(/worktree-setup-command .* exited 3/),
    })
    expect(printed.join('\n')).toMatch(/worktree-setup-command .* exited 3/)
    expect(readFileSync(join(root, 'pair-worktrees/7/setup.log'), 'utf8')).toContain(
      'pair-worktrees/7',
    )
    expect(gatePrompts()).toHaveLength(1)
    expect(outcome).toContain('stub-fix-stage')
  }, 60_000)

  it('US-575 AC5: a story branch that conflicts with its base is synced mechanically, pushed, and the new head re-resolved — then it merges', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
        cwd: main,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim()
    git('checkout', '-q', '-b', 'scratch')
    writeFileSync(join(main, 'f.txt'), 'story\n')
    git('add', 'f.txt')
    git('commit', '-q', '-m', '[#7] feat: story side')
    git('push', '-q', 'origin', `HEAD:refs/heads/${BRANCH}`)
    git('checkout', '-q', 'main')
    writeFileSync(join(main, 'f.txt'), 'base\n')
    git('add', 'f.txt')
    git('commit', '-q', '-m', 'base side')
    git('push', '-q', 'origin', 'main')

    const outcome = await settle(drive(adopt(ELIGIBLE)))

    const synced = git('rev-parse', `origin/${BRANCH}`)
    expect(git('log', '-1', '--format=%B', synced)).toMatch(
      /Pair-Base-Sync: base=[0-9a-f]{40}; ours=f\.txt/,
    )
    expect(resolveCalls().some(c => c['head'] === synced)).toBe(true)
    expect(JSON.parse(readFileSync(join(runDir(), 'recovery.json'), 'utf8')).rounds).toMatchObject([
      { kind: 'base-sync' },
    ])
    expect(outcome).toContain('"status":"merged"')
  }, 60_000)

  it('US-575 AC8 edge: the run budgets reach resolve; autoRecoveryRounds 0 re-runs nothing — the red gate goes straight to the fix stage', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_BLOCKED)
    const outcome = await settle(
      createDefaultCycleDriver({
        engine: { ...ENGINES.claude, command: join(root, 'bin', 'fake-engine') },
        cwd: main,
        fs: adopt(ELIGIBLE),
        location: { scriptsDir: join(main, '.claude/skills/pair-workflow-cycle/scripts') },
        autonomyArgs: [],
        timeoutSeconds: 30,
        workflowVersion: CYCLE_WORKFLOW_VERSION,
        baseBranch: CYCLE_BASE_BRANCH_DEFAULT,
      })({
        runId: 'story-7',
        card: '7',
        pr: PR,
        budgets: { autoRecoveryRounds: 0, maxFixRounds: 4 },
      }),
    )
    expect(JSON.parse(resolveCalls()[0]!['policy']!)).toMatchObject({
      autoRecoveryRounds: 0,
      maxFixRounds: 4,
    })
    expect(gatePrompts()).toHaveLength(1)
    expect(outcome).toContain('stub-fix-stage')
  }, 60_000)

  it('g2-w10: the gate is dispatched ONCE, after check, for the card tier, the PR, the reviewed head and the evidence path', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)

    await settle(drive(adopt(ELIGIBLE)))

    const prompts = gatePrompts()
    expect(prompts).toHaveLength(1)
    const prompt = prompts[0]!
    expect(prompt).toContain('risk:green')
    expect(prompt).toContain(REVIEWED_HEAD)
    expect(prompt).toMatch(/\b42\b/)
    expect(prompt).toContain(
      join(realpathSync(main), '.pair/working/runs/story-7/7/merge-gate.json'),
    )
  }, 60_000)

  it('g2-w11: passing evidence for ANOTHER tier is not green — never merged', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)
    vi.stubEnv('FAKE_GATE_TIER', 'risk:yellow')

    const outcome = await settle(drive(adopt(ELIGIBLE)))

    expect(runCalls()).toHaveLength(0)
    expect(outcome).not.toContain('"merged":true')
  }, 60_000)

  it('g2-w12: passing evidence for ANOTHER head is not green — never merged', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)
    vi.stubEnv('FAKE_GATE_HEAD', remoteHead)

    const outcome = await settle(drive(adopt(ELIGIBLE)))

    expect(runCalls()).toHaveLength(0)
    expect(outcome).not.toContain('"merged":true')
  }, 60_000)

  it('g2-w13: passing evidence left by an EARLIER dispatch is never reused — never merged', async () => {
    mkdirSync(runDir(), { recursive: true })
    writeFileSync(
      join(runDir(), 'merge-gate.json'),
      JSON.stringify({ tier: 'risk:green', reviewedHead: REVIEWED_HEAD, result: GATE_PASS }),
    )

    const outcome = await settle(drive(adopt(ELIGIBLE)))

    expect(gatePrompts()).toHaveLength(2)
    expect(runCalls()).toHaveLength(0)
    expect(outcome).not.toContain('"merged":true')
  }, 60_000)

  it('g2-w14: a parked check dispatches no gate stage and no run', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)
    vi.stubEnv(
      'FAKE_MERGE_CHECK',
      JSON.stringify({
        mergeAllowed: false,
        failed: [{ code: 'pair-review', detail: 'pair-review is not success' }],
        reason: 'pair-review is not success',
        parkKind: 'halted',
      }),
    )

    await settle(drive(adopt(ELIGIBLE)))

    expect(mergeCalls().map(c => c.cmd)).toEqual(['check'])
    expect(gatePrompts()).toHaveLength(0)
  }, 60_000)

  describe('pending CI: bounded wait, then re-check', () => {
    const PENDING = JSON.stringify({
      mergeAllowed: false,
      ciPending: true,
      failed: [{ code: 'ci-not-green', detail: 'CI checks not green: build=pending' }],
      reason: 'CI checks not green: build=pending',
      parkKind: 'awaiting-human',
    })
    const clock = () => {
      let t = 0
      const waits: number[] = []
      return {
        waits,
        ciWait: {
          capSeconds: 120,
          intervalSeconds: 30,
          now: () => t,
          wait: async (ms: number) => {
            waits.push(ms)
            t += ms
            return 'elapsed' as const
          },
        },
      }
    }

    it('ci-w1: pending CI is polled, the check re-run once it settles, then the merge proceeds', async () => {
      vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)
      vi.stubEnv('FAKE_MERGE_CHECK_FIRST', PENDING)
      vi.stubEnv('FAKE_MERGE_CHECK_FIRST_N', '2')
      const { waits, ciWait } = clock()

      const outcome = await drive(adopt(ELIGIBLE), ciWait)

      expect(waits).toEqual([30_000, 30_000])
      expect(mergeCalls().map(c => c.cmd)).toEqual(['check', 'check', 'check', 'run'])
      expect(
        mergeCalls()
          .filter(c => c.cmd === 'check')
          .every(c => c.opts['deferPark'] === 'true'),
      ).toBe(true)
      expect(outcome.status).toBe('merged')
    }, 60_000)

    it('ci-w2: still pending after the cap parks as today (merge-parked, no run)', async () => {
      vi.stubEnv('FAKE_MERGE_CHECK', PENDING)
      const { waits, ciWait } = clock()

      const outcome = await drive(adopt(ELIGIBLE), ciWait)

      expect(waits).toEqual([30_000, 30_000, 30_000, 30_000])
      expect(outcome.status).toBe('merge-parked')
      expect(mergeCalls().every(c => c.cmd === 'check')).toBe(true)
      // 5 polls post no park comment (deferPark); the ONE final check after the cap parks for real
      expect(mergeCalls().map(c => c.opts['deferPark'])).toEqual([
        'true',
        'true',
        'true',
        'true',
        'true',
        undefined,
      ])
    }, 60_000)

    it('ci-w3: failed CI parks at once, no wait', async () => {
      vi.stubEnv(
        'FAKE_MERGE_CHECK',
        JSON.stringify({
          mergeAllowed: false,
          ciPending: false,
          failed: [{ code: 'ci-not-green', detail: 'build=failure' }],
          reason: 'build=failure',
          parkKind: 'halted',
        }),
      )
      const { waits, ciWait } = clock()

      const outcome = await drive(adopt(ELIGIBLE), ciWait)

      expect(waits).toEqual([])
      expect(outcome.status).toBe('merge-parked')
      expect(mergeCalls()).toHaveLength(1)
    }, 60_000)
  })

  it('g2-w15: the squash message follows the commit template — [<story code>] <type>: <description>', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)

    await settle(drive(adopt(ELIGIBLE)))

    expect(runCalls()).toHaveLength(1)
    expect(runCalls()[0]!.opts['message'] ?? '').toMatch(/^\[(#7|US-7)\] [a-z]+: \S/)
  }, 60_000)

  // ── controls: already correct at the base, and must stay so ────────────────────────────────

  it('g2-c1: a card tier outside ## Auto-Advance is the unchanged done terminal (ready-for-merge), no merge script', async () => {
    vi.stubEnv('FAKE_CARD_LABELS', 'risk:yellow')

    const outcome = await drive(adopt(ELIGIBLE))

    expect(outcome.status).toBe('ready-for-merge')
    expect(outcome.next?.step).toBe('done')
    expect(mergeCalls()).toHaveLength(0)
  }, 60_000)

  it('g2-c2: ## Auto-Advance (none) is the unchanged done terminal, no merge script', async () => {
    const outcome = await drive(
      adopt('## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\n(none)\n'),
    )

    expect(outcome.status).toBe('ready-for-merge')
    expect(mergeCalls()).toHaveLength(0)
  }, 60_000)

  it('g2-c3: no automation.md at all is the unchanged done terminal, no merge script', async () => {
    const outcome = await drive(adopt(undefined))

    expect(outcome.status).toBe('ready-for-merge')
    expect(mergeCalls()).toHaveLength(0)
  }, 60_000)

  it('g2-c4: a card with no risk:* label is the unchanged done terminal, no merge script', async () => {
    vi.stubEnv('FAKE_CARD_LABELS', '')

    const outcome = await drive(adopt(ELIGIBLE))

    expect(outcome.status).toBe('ready-for-merge')
    expect(mergeCalls()).toHaveLength(0)
  }, 60_000)

  // ── the card tier's label grammar: the family:tier shape cycle-merge.mjs readCurrentTier applies
  // (LABEL_SHAPE_RE, /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/i). One reader per flow, one grammar: a label
  // readCurrentTier refuses is never a card tier either — the reader's fail-safe (undefined: resolve
  // never offers merge), not the malformed text passed on as --tier / --cardTier.

  it.each(['risk:a.b', 'risk:a/b', 'risk:', 'risk:1x', 'risk:green:x', 'risk:gre en', 'risk:_x'])(
    'g3-w1: a malformed risk label %j is no card tier (fail-safe undefined), never itself',
    label => {
      vi.stubEnv('FAKE_CARD_LABELS', label)

      expect(readCardTier('7', main)).toBeUndefined()
    },
  )

  it.each(['risk:green', 'risk:yellow', 'risk:red', 'risk:Green', 'risk:red-2'])(
    'g3-c1: a well-formed risk label %j is the card tier, verbatim',
    label => {
      vi.stubEnv('FAKE_CARD_LABELS', `bug,${label},auto-dev`)

      expect(readCardTier('7', main)).toBe(label)
    },
  )

  it.each([
    ['two well-formed', 'risk:green,risk:yellow'],
    ['a well-formed and a malformed', 'risk:green,risk:a.b'],
    ['none', 'bug,auto-dev'],
  ])('g3-c2: %s risk label(s) is no card tier (fail-safe undefined)', (_name, labels) => {
    vi.stubEnv('FAKE_CARD_LABELS', labels)

    expect(readCardTier('7', main)).toBeUndefined()
  })

  it('g3-w2: a malformed risk label is never handed to resolve as --tier, and no merge script runs', async () => {
    vi.stubEnv('FAKE_CARD_LABELS', 'risk:a.b')

    const outcome = await settle(drive(adopt(ELIGIBLE)))

    expect(resolveCalls().length).toBeGreaterThan(0)
    for (const call of resolveCalls()) expect(call['tier']).not.toBe('risk:a.b')
    expect(mergeCalls()).toHaveLength(0)
    expect(outcome).not.toContain('"merged":true')
  }, 60_000)

  it("g2-c5: resolve answering invalid is a typed stop carrying resolve's reason — never a merge", async () => {
    vi.stubEnv(
      'FAKE_RESOLVE_FORCE',
      JSON.stringify({ status: 'invalid', reason: 'policy-auto-advance-invalid' }),
    )

    const outcome = await drive(adopt(ELIGIBLE))

    expect(outcome.status).toBe('invalid')
    expect(outcome.next?.step).toBe('blocked')
    expect(JSON.stringify(outcome)).toContain('policy-auto-advance-invalid')
    expect(mergeCalls()).toHaveLength(0)
    expect(lines(logs.engine)).toHaveLength(0)
  }, 60_000)

  it('g2-c6: the REAL cycle-state.mjs answers a malformed policy.autoAdvance with invalid, through the bridge', () => {
    const bridge = createCycleScriptsBridge({ scriptsDir: INSTALLED_SCRIPTS }, main)

    const answer = bridge.resolve({
      dir: runDir(),
      workflowVersion: CYCLE_WORKFLOW_VERSION,
      policy: { autoAdvance: { tiers: 'risk:green' } },
      entry: 'pr',
      pr: PR,
      story: '7',
      runsRoot: join(main, '.pair/working/runs'),
    })

    expect(answer.status).toBe('invalid')
    expect(answer['reason']).toBe('policy-auto-advance-invalid')
  })

  // ── r3 (review r3-1 / r3-2): the merge hooks through the REAL executor. The r3 blind spot was a
  // scripts dir without cycle-hooks.mjs (the bridge a no-op) and a merge stub that removed no
  // worktree. These rows install the real executor and remove the story worktree on an executed
  // merge, as cycle-merge.mjs run's `branch` step does (AC3).

  const hooksLog = () => join(root, 'hooks.log')
  const hookRuns = (point: string) =>
    lines(hooksLog())
      .filter(l => l.startsWith(`${point} `))
      .map(l => l.slice(point.length + 1))
  const hook = (point: string, code = 0) =>
    `- \`${point}\`: \`echo "${point} $(pwd -P)" >> ${hooksLog()}${code === 0 ? '' : `; exit ${code}`}\``

  /** The real `cycle-hooks.mjs` in the scripts dir, and `## Cycle Hooks` appended to the policy. */
  function withRealHooks(bullets: string[]): InMemoryFileSystemService {
    cpSync(
      join(INSTALLED_SCRIPTS, 'cycle-hooks.mjs'),
      join(main, '.claude/skills/pair-workflow-cycle/scripts/cycle-hooks.mjs'),
    )
    vi.stubEnv('FAKE_MERGE_REMOVE_WORKTREE', '1')
    return adopt(`${ELIGIBLE}\n## Cycle Hooks\n\n${bullets.join('\n')}\n`)
  }

  it('g4-w1 (r3-1): an executed merge that removed the story worktree runs post-merge in the MAIN checkout, then post-cycle — merged, no throw', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)
    const fs = withRealHooks([hook('pre-merge'), hook('post-merge'), hook('post-cycle')])

    const outcome = await settle(drive(fs))

    expect(runCalls()).toHaveLength(1)
    expect(outcome).toMatch(/^resolved /)
    expect(outcome).toContain('"status":"merged"')
    expect(hookRuns('pre-merge')).toEqual([join(root, 'pair-worktrees', '7')])
    expect(existsSync(join(root, 'pair-worktrees', '7'))).toBe(false)
    expect(hookRuns('post-merge')).toEqual([main])
    expect(hookRuns('post-cycle')).toEqual([main])
  }, 60_000)

  it('g4-w2 (r3-1): the same executed merge with a ## Cycle Hooks section declaring NO post-merge — merged, no throw', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)
    const fs = withRealHooks([hook('post-cycle')])

    const outcome = await settle(drive(fs))

    expect(outcome).toMatch(/^resolved /)
    expect(outcome).toContain('"status":"merged"')
    expect(hookRuns('post-cycle')).toEqual([main])
  }, 60_000)

  it('g4-c1 (r3-2): a failing pre-merge (real executor) is failed-hook — zero check/run calls, no gate stage', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)
    const fs = withRealHooks([hook('pre-merge', 3), hook('post-merge')])

    const outcome = await drive(fs)

    expect(outcome.status).toBe('failed-hook')
    expect(mergeCalls()).toHaveLength(0)
    expect(gatePrompts()).toHaveLength(0)
    expect(hookRuns('post-merge')).toEqual([])
  }, 60_000)

  // ── D5 (autonomous run 493): the merge gate is decided on the PR's tier, at the merge boundary, BEFORE cycle-merge check ──
  const LACKS_GREEN = {
    until: 'merged',
    prepare: { mode: 'always', has: [], lacks: [] },
    merge: { mode: 'when', has: ['needs-review'], lacks: ['risk:green'] },
  }
  const driveAutonomous = (fs: InMemoryFileSystemService) =>
    createDefaultCycleDriver({
      engine: { ...ENGINES.claude, command: join(root, 'bin', 'fake-engine') },
      cwd: main,
      fs,
      location: { scriptsDir: join(main, '.claude/skills/pair-workflow-cycle/scripts') },
      autonomyArgs: [],
      timeoutSeconds: 30,
      workflowVersion: CYCLE_WORKFLOW_VERSION,
      baseBranch: CYCLE_BASE_BRANCH_DEFAULT,
    })({ runId: 'story-7', card: '7', pr: PR, autonomy: { policy: LACKS_GREEN } } as never)

  it('d5-w1: card risk:green, PR raised to risk:yellow -> escalated at the merge boundary, no cycle-merge check/run, comment posted', async () => {
    vi.stubEnv('FAKE_CARD_LABELS', 'risk:green')
    vi.stubEnv('FAKE_PR_LABELS', 'risk:yellow')

    const outcome = await settle(driveAutonomous(adopt(undefined)))

    expect(outcome).toContain('"status":"escalated"')
    expect(
      resolveCalls().every(c => JSON.parse(c['prLabels'] ?? 'null')?.[0] === 'risk:yellow'),
    ).toBe(true)
    expect(mergeCalls().map(c => c.cmd)).toEqual(['escalate'])
    expect(mergeCalls()[0]?.opts['conditions']).toBe('["lacks:risk:green"]')
  }, 60_000)

  it('d5-c1: card and PR both risk:green -> the gate allows, the merge stage runs', async () => {
    vi.stubEnv('FAKE_CARD_LABELS', 'risk:green')
    vi.stubEnv('FAKE_PR_LABELS', 'risk:green')
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)

    const outcome = await settle(driveAutonomous(adopt(undefined)))

    expect(outcome).toContain('"status":"merged"')
    expect(mergeCalls().map(c => c.cmd)).toContain('check')
  }, 60_000)
})
