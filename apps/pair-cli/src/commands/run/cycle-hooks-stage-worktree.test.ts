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
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { createDefaultCycleDriver } from './cycle-wiring'
import { CYCLE_WORKFLOW_VERSION, CYCLE_BASE_BRANCH_DEFAULT } from './cycle-scripts'
import { ENGINES } from './engines'

/**
 * US-489 review r0-1 — a STAGE hook (`pre-<stage>` / `post-<stage>`) runs in the tree that stage
 * works on (the story worktree), never in the developer's main checkout.
 *
 * The production driver, end to end, over the REAL installed scripts (cycle-state, cycle-dispatch,
 * cycle-hooks). The main checkout carries a commit (`green.txt`) that `origin/main` — the base the
 * story worktree is cut from — does not, so a command can tell the two trees apart. Hermetic: `gh`
 * is a stub on PATH (card read + PR head branch only), the engine is a stub binary; nothing reaches
 * a network.
 *
 * `verify` is its own class (r1-g1 g1-w8): its packet's `$worktree` is `<worktreeRoot>/<story>-review`,
 * a detached tree the verify AGENT creates and removes — it does not exist when `pre-verify` runs.
 * A verify hook gates the STORY worktree (`<worktreeRoot>/<story>`, checked out at the PR head), the
 * tree the verifier is about to judge — never the main checkout, never the review worktree.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')
const SCRIPTS = ['cycle-state.mjs', 'cycle-dispatch.mjs', 'cycle-hooks.mjs', 'host']

describe('r0-1: stage hooks run in the stage worktree, never in the main checkout', () => {
  let root: string
  let main: string
  let engineLog: string

  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const commit = (message: string) =>
    git(main, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', message)
  const storyTree = () => join(root, 'pair-worktrees', '7')
  const reviewTree = () => join(root, 'pair-worktrees', '7-review')
  const scriptsDir = () => join(main, '.claude/skills/pair-workflow-cycle/scripts')
  const runDir = () => join(main, '.pair/working/runs/story-7/7')
  const engineCalls = () =>
    existsSync(engineLog) ? readFileSync(engineLog, 'utf8').split('\n').filter(Boolean).length : 0

  const declare = (bullets: string[]) =>
    writeFileSync(
      join(main, '.pair/adoption/tech/automation.md'),
      `# Automation\n\n## Cycle Hooks\n\n${bullets.join('\n')}\n`,
    )

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-r01-hooks-')))
    main = join(root, 'main')
    const bin = join(root, 'bin')
    engineLog = join(root, 'engine.log')
    mkdirSync(join(main, '.pair/adoption/tech'), { recursive: true })
    mkdirSync(bin, { recursive: true })

    git(main, 'init', '-q', '-b', 'main')
    writeFileSync(join(main, '.gitignore'), '.claude/\n.pair/\n')
    git(main, 'add', '.gitignore')
    commit('init')
    git(main, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
    // The PR's head branch (PR entry): cut from origin/main, so it has no green.txt either.
    git(main, 'branch', 'feature/US-7-a-story', 'origin/main')
    // Only the main checkout has it: the story worktree is cut from origin/main.
    writeFileSync(join(main, 'green.txt'), 'main only\n')
    git(main, 'add', 'green.txt')
    commit('main-only')

    mkdirSync(scriptsDir(), { recursive: true })
    for (const f of SCRIPTS)
      cpSync(
        join(REPO_ROOT, '.claude/skills/pair-workflow-cycle/scripts', f),
        join(scriptsDir(), f),
        {
          recursive: true,
        },
      )
    cpSync(join(REPO_ROOT, '.claude/agents'), join(main, '.claude/agents'), { recursive: true })

    writeFileSync(
      join(bin, 'gh'),
      `#!/usr/bin/env node
const a = process.argv.slice(2)
const card = { title: 'A story', body: '**Status**: Refined\\n\\n## Task Breakdown\\n\\n- [ ] T-1\\n' }
if (a[0] === 'issue' && a[1] === 'view') process.stdout.write(a.includes('-q') ? card.body : JSON.stringify(card))
else if (a[0] === 'pr' && a[1] === 'view') process.stdout.write('feature/US-7-a-story\\n')
else process.exit(1)
`,
    )
    chmodSync(join(bin, 'gh'), 0o755)

    // The engine stub: logs each spawn. When FAKE_PUBLISH_DRAFT is set, its FIRST spawn publishes
    // that handoff through the real cycle-state.mjs, so the dispatched stage ADVANCES.
    writeFileSync(
      join(bin, 'fake-engine'),
      `#!/usr/bin/env node
const fs = require('fs')
const first = !fs.existsSync(process.env.FAKE_ENGINE_LOG)
fs.appendFileSync(process.env.FAKE_ENGINE_LOG, JSON.stringify({ cwd: process.cwd() }) + '\\n')
if (first && process.env.FAKE_PUBLISH_DRAFT) {
  require('child_process').execFileSync('node', [process.env.FAKE_CYCLE_STATE, 'publish', '--dir', process.env.FAKE_RUN_DIR,
    '--file', process.env.FAKE_PUBLISH_DRAFT, '--phase', process.env.FAKE_PUBLISH_PHASE || 'a0',
    '--skill', process.env.FAKE_PUBLISH_SKILL || 'red-spec',
    '--workflowVersion', process.env.FAKE_WV, '--attempt', '1'], { stdio: 'ignore' })
}
process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success' }) + '\\n')
`,
    )
    chmodSync(join(bin, 'fake-engine'), 0o755)

    vi.stubEnv('PATH', `${bin}:${process.env['PATH'] ?? ''}`)
    vi.stubEnv('PAIR_GH_BIN', join(bin, 'gh'))
    vi.stubEnv('FAKE_ENGINE_LOG', engineLog)
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    rmSync(root, { recursive: true, force: true })
  })

  const drive = (pr?: number) =>
    createDefaultCycleDriver({
      engine: { ...ENGINES.claude, command: join(root, 'bin', 'fake-engine') },
      cwd: main,
      fs: new InMemoryFileSystemService({}, main, main),
      location: { scriptsDir: scriptsDir() },
      autonomyArgs: [],
      timeoutSeconds: 60,
      workflowVersion: CYCLE_WORKFLOW_VERSION,
      baseBranch: CYCLE_BASE_BRANCH_DEFAULT,
    })({ runId: 'story-7', card: '7', ...(pr !== undefined && { pr }) })

  /** PR entry, empty run directory: `resolve` answers `verify` r0 first — the next dispatch is verify. */
  const PR = 12

  const stagePublishes = (skill: string, phase: string, extra: Record<string, unknown>) => {
    const draft = join(root, `${phase}-${skill}-draft.json`)
    writeFileSync(
      draft,
      JSON.stringify({
        run: 'story-7',
        story: '7',
        branch: 'feature/US-7-a-story',
        phase,
        skill,
        inputHead: 'a'.repeat(40),
        inputsDigest: 'x',
        acHash: `sha256:${'0'.repeat(64)}`,
        attempt: 1,
        elapsedMs: 1,
        ...extra,
      }),
    )
    vi.stubEnv('FAKE_PUBLISH_DRAFT', draft)
    vi.stubEnv('FAKE_PUBLISH_PHASE', phase)
    vi.stubEnv('FAKE_PUBLISH_SKILL', skill)
    vi.stubEnv('FAKE_CYCLE_STATE', join(scriptsDir(), 'cycle-state.mjs'))
    vi.stubEnv('FAKE_RUN_DIR', runDir())
    vi.stubEnv('FAKE_WV', CYCLE_WORKFLOW_VERSION)
  }

  it('g1-w1: a pre-implement that fails only in the story tree HALTs failed-hook; zero stage spawns; main checkout untouched', async () => {
    declare(['- `pre-implement`: `test -f green.txt`'])
    const before = git(main, 'status', '--porcelain', '--untracked-files=all')

    const outcome = await drive()

    expect(outcome.status).toBe('failed-hook')
    expect(engineCalls()).toBe(0)
    expect(git(main, 'status', '--porcelain', '--untracked-files=all')).toBe(before)
  }, 60_000)

  it('g1-w2: a pre-implement that fails only in the main checkout does not HALT; the stage dispatches', async () => {
    declare(['- `pre-implement`: `test ! -f green.txt`'])

    const outcome = await drive()

    expect(outcome.status).not.toBe('failed-hook')
    expect(engineCalls()).toBeGreaterThan(0)
  }, 60_000)

  it('g1-w3: a file a pre-implement writes lands in the story worktree, never in the main checkout', async () => {
    declare(['- `pre-implement`: `touch hook-wrote.txt`'])
    const before = git(main, 'status', '--porcelain', '--untracked-files=all')

    await drive()

    expect(existsSync(join(storyTree(), 'hook-wrote.txt'))).toBe(true)
    expect(existsSync(join(main, 'hook-wrote.txt'))).toBe(false)
    expect(git(main, 'status', '--porcelain', '--untracked-files=all')).toBe(before)
  }, 60_000)

  it('g1-w4: a post-<stage> hook after an ADVANCED stage runs in the story worktree, never in the main checkout', async () => {
    declare(['- `post-implement`: `pwd > post-cwd.txt`'])
    const draft = join(root, 'a0-draft.json')
    writeFileSync(
      draft,
      JSON.stringify({
        run: 'story-7',
        story: '7',
        branch: 'feature/US-7-a-story',
        phase: 'a0',
        skill: 'red-spec',
        inputHead: 'a'.repeat(40),
        inputsDigest: 'x',
        acHash: `sha256:${'0'.repeat(64)}`,
        attempt: 1,
        mode: 'initial',
        status: 'red',
        contractPath: '/x.json',
        contractHash: `sha256:${'1'.repeat(64)}`,
        reconciled: [],
        preserved: [],
        findings: { received: [], covered: [] },
        elapsedMs: 1,
      }),
    )
    vi.stubEnv('FAKE_PUBLISH_DRAFT', draft)
    vi.stubEnv('FAKE_CYCLE_STATE', join(scriptsDir(), 'cycle-state.mjs'))
    vi.stubEnv('FAKE_RUN_DIR', runDir())
    vi.stubEnv('FAKE_WV', CYCLE_WORKFLOW_VERSION)

    await drive()

    // Precondition: the first stage advanced (a0 red-spec published ⇒ next is validate).
    expect(existsSync(join(runDir(), 'a0-red-spec.json'))).toBe(true)
    expect(existsSync(join(main, 'post-cwd.txt'))).toBe(false)
    expect(realpathSync(readFileSync(join(storyTree(), 'post-cwd.txt'), 'utf8').trim())).toBe(
      realpathSync(storyTree()),
    )
  }, 60_000)

  it('g1-c1 (control): a failing pre-cycle still HALTs failed-hook before any stage, output verbatim', async () => {
    declare(['- `pre-cycle`: `echo pre-cycle-broke; exit 5`'])

    const outcome = await drive()

    expect(outcome.status).toBe('failed-hook')
    expect(String(outcome.next?.['detail'])).toContain('pre-cycle-broke')
    expect(engineCalls()).toBe(0)
  }, 60_000)

  it('g1-w8: a pre-verify that fails only in the story tree (PR head) HALTs failed-hook; zero verify spawns; main checkout untouched', async () => {
    declare(['- `pre-verify`: `test -f green.txt`'])
    const before = git(main, 'status', '--porcelain', '--untracked-files=all')

    const outcome = await drive(PR)

    expect(outcome.status).toBe('failed-hook')
    expect(String(outcome.next?.['detail'])).toContain('pre-verify')
    expect(engineCalls()).toBe(0)
    expect(git(main, 'status', '--porcelain', '--untracked-files=all')).toBe(before)
  }, 60_000)

  it('g1-w9: a pre-verify that fails only in the main checkout does not HALT; verify dispatches', async () => {
    declare(['- `pre-verify`: `test ! -f green.txt`'])

    const outcome = await drive(PR)

    expect(outcome.status).not.toBe('failed-hook')
    expect(engineCalls()).toBeGreaterThan(0)
  }, 60_000)

  it('g1-w10: pre-verify runs in the story worktree at the PR head — not the main checkout, not the (not yet created) review worktree', async () => {
    declare([
      '- `pre-verify`: `pwd > pre-verify-cwd.txt; git rev-parse --abbrev-ref HEAD >> pre-verify-cwd.txt`',
    ])

    const outcome = await drive(PR)

    expect(outcome.status).not.toBe('failed-hook')
    expect(existsSync(join(main, 'pre-verify-cwd.txt'))).toBe(false)
    expect(existsSync(join(reviewTree(), 'pre-verify-cwd.txt'))).toBe(false)
    const [cwd, branch] = readFileSync(join(storyTree(), 'pre-verify-cwd.txt'), 'utf8')
      .trim()
      .split('\n')
    expect(realpathSync(String(cwd))).toBe(realpathSync(storyTree()))
    expect(branch).toBe('feature/US-7-a-story')
  }, 60_000)

  it('g1-w11: post-verify after an ADVANCED verify runs in the story worktree, not the main checkout or the review worktree', async () => {
    declare(['- `post-verify`: `pwd > post-verify-cwd.txt`'])
    const head = 'a'.repeat(40)
    stagePublishes('review-phase', 'r0', {
      pr: PR,
      mode: 'first',
      reviewedHead: head,
      verdict: 'APPROVED',
      findings: [],
      custody: { verified: true, contractBreach: false, breaches: [], contract: 'none' },
      readiness: { ready: true, remoteHead: head },
    })

    await drive(PR)

    // Precondition: verify advanced (r0 review-phase published ⇒ post-verify is due).
    expect(existsSync(join(runDir(), 'r0-review-phase.json'))).toBe(true)
    expect(existsSync(join(main, 'post-verify-cwd.txt'))).toBe(false)
    expect(existsSync(join(reviewTree(), 'post-verify-cwd.txt'))).toBe(false)
    expect(
      realpathSync(readFileSync(join(storyTree(), 'post-verify-cwd.txt'), 'utf8').trim()),
    ).toBe(realpathSync(storyTree()))
  }, 60_000)
})
