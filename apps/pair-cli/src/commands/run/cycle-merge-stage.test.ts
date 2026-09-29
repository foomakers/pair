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
import { createDefaultCycleDriver, readCardTier } from './cycle-wiring'
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
  const error = autoAdvancePolicyError(policy.autoAdvance)
  if (error) {
    process.stdout.write(JSON.stringify({ status: 'invalid', reason: error, policy: effective }) + '\\n')
    process.exit(0)
  }
  const log = process.env.FAKE_MERGE_LOG
  const merged = existsSync(log) && readFileSync(log, 'utf8').split('\\n').filter(Boolean).some(l => JSON.parse(l).cmd === 'run')
  let next = { step: 'done', reviewedHead: '${REVIEWED_HEAD}', round: 1, verdict: 'approved' }
  if (!merged && mergeOffered(policy.autoAdvance, opts.tier)) next = { ...next, step: 'merge', tier: opts.tier }
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
  const answer = process.env.FAKE_MERGE_CHECK ? JSON.parse(process.env.FAKE_MERGE_CHECK) : { mergeAllowed: true, failed: [], reason: null, parkKind: null }
  process.stdout.write(JSON.stringify({ stage: 'merge', mode: 'check', ...answer }) + '\\n')
} else if (cmd === 'run') {
  const green = opts.gate === 'green'
  const landed = process.env.FAKE_MERGE_RUN ? JSON.parse(process.env.FAKE_MERGE_RUN) : { merged: true, cascaded: true, reason: null }
  process.stdout.write(JSON.stringify(green
    ? { stage: 'merge', mode: 'run', mergeAllowed: true, failed: [], ...landed }
    : { stage: 'merge', mode: 'run', mergeAllowed: false, failed: [{ code: 'gate-red', detail: "the tier's gate set came back red at merge time" }], reason: "the tier's gate set came back red at merge time", parkKind: 'halted', merged: false, cascaded: false }) + '\\n')
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
const card = { number: 7, title: 'A story', state: 'OPEN', body: '**Status**: Refined\\n\\n## Task Breakdown\\n\\n- [ ] T-1\\n', labels, headRefName: '${BRANCH}' }
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
if (prompt.includes('${GATE_SKILL}') && process.env.FAKE_GATE_RESULT && path) {
  fs.writeFileSync(path, JSON.stringify({
    tier: process.env.FAKE_GATE_TIER || (prompt.match(/risk:[a-z]+/) || [])[0],
    reviewedHead: process.env.FAKE_GATE_HEAD || (prompt.match(/[0-9a-f]{40}/) || [])[0],
    result: process.env.FAKE_GATE_RESULT,
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

  const drive = (fs: InMemoryFileSystemService) =>
    createDefaultCycleDriver({
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

  it('g2-w4: the gate stage ran but wrote NO evidence — the run is handed --gate red and nothing merges', async () => {
    const outcome = await settle(drive(adopt(ELIGIBLE)))

    expect(gatePrompts()).toHaveLength(1)
    expect(existsSync(join(runDir(), 'merge-gate.json'))).toBe(false)
    const runs = mergeCalls().filter(c => c.cmd === 'run')
    expect(runs).toHaveLength(1)
    expect(runs[0]!.opts['gate']).toBe('red')
    expect(mergeCalls().some(c => c.opts['gate'] === 'green')).toBe(false)
    expect(outcome).not.toContain('"merged":true')
    expect(`${outcome}\n${printed.join('\n')}`).toContain(
      "the tier's gate set came back red at merge time",
    )
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

  it('g2-w9: gate evidence that ran and FAILED gives run --gate red, not merged, with the verify-quality line reported', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_BLOCKED)

    const outcome = await settle(drive(adopt(ELIGIBLE)))

    expect(gatePrompts()).toHaveLength(1)
    expect(runCalls()).toHaveLength(1)
    expect(runCalls()[0]!.opts['gate']).toBe('red')
    expect(outcome).not.toContain('"merged":true')
    expect(reported(outcome)).toContain(GATE_BLOCKED)
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

  it('g2-w11: passing evidence for ANOTHER tier is not green — run --gate red', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)
    vi.stubEnv('FAKE_GATE_TIER', 'risk:yellow')

    const outcome = await settle(drive(adopt(ELIGIBLE)))

    expect(runCalls()).toHaveLength(1)
    expect(runCalls()[0]!.opts['gate']).toBe('red')
    expect(outcome).not.toContain('"merged":true')
  }, 60_000)

  it('g2-w12: passing evidence for ANOTHER head is not green — run --gate red', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)
    vi.stubEnv('FAKE_GATE_HEAD', remoteHead)

    const outcome = await settle(drive(adopt(ELIGIBLE)))

    expect(runCalls()).toHaveLength(1)
    expect(runCalls()[0]!.opts['gate']).toBe('red')
    expect(outcome).not.toContain('"merged":true')
  }, 60_000)

  it('g2-w13: passing evidence left by an EARLIER dispatch is never reused — run --gate red', async () => {
    mkdirSync(runDir(), { recursive: true })
    writeFileSync(
      join(runDir(), 'merge-gate.json'),
      JSON.stringify({ tier: 'risk:green', reviewedHead: REVIEWED_HEAD, result: GATE_PASS }),
    )

    const outcome = await settle(drive(adopt(ELIGIBLE)))

    expect(gatePrompts()).toHaveLength(1)
    expect(runCalls()).toHaveLength(1)
    expect(runCalls()[0]!.opts['gate']).toBe('red')
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
})
