import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { execFileSync } from 'child_process'
import {
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
import { runCycle, type CycleMergeOutcome, type CycleOutcome } from './cycle'
import { createCycleHooksBridge, cycleHooksPolicyPath } from './cycle-scripts'
import { handleRunCommand, type RunHandlerDependencies } from './handler'
import { parseRunCommand } from './parser'

/**
 * US-490 review r3 — the merge stage's hooks (r3-1, r3-2) and the maintainer's `on-halt` decision.
 *
 * - r3-1: `post-merge` runs after `cycle-merge.mjs run`, which has already removed the story
 *   worktree (AC3, `cycle-merge.mjs` `branch` step) — so `post-merge` runs in the MAIN checkout. An
 *   executed merge never makes the run throw, with or without `## Cycle Hooks`.
 * - r3-2: `pre-merge` runs in the story worktree before `check`, and a non-zero one is `failed-hook`
 *   with nothing merged; a failing `post-merge` is logged; no `post-merge` after a park.
 * - Maintainer (on-halt on merge outcomes): `merged` → post-merge, no on-halt; `merge-parked`
 *   awaiting-human → neither (like `ready-for-merge`); `merge-parked` halted → on-halt;
 *   `merged-closure-unfinished` → post-merge AND on-halt (the closure needs a human; exit 1).
 *
 * The loop is `runCycle` with the REAL hooks bridge over the REAL installed `cycle-hooks.mjs` (the
 * r3 blind spot: a scripts dir without it made the bridge a no-op). The story worktree is a real
 * `git worktree` of a throwaway repo; the merge stage is a stub that records `check`/`run` into the
 * same log the hooks write to and — exactly like the real `run` — removes the story worktree and
 * branch whenever the merge executed. The exit code comes from the real `run --card` handler.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')
const INSTALLED = join(REPO_ROOT, '.claude/skills/pair-workflow-cycle/scripts')
const BRANCH = 'feature/US-7-a-story'

type Park = 'awaiting-human' | 'halted'
type MergeAnswer =
  | { kind: 'merged' }
  | { kind: 'closure-unfinished' }
  | { kind: 'parked'; parkKind: Park }

describe('US-490 r3: merge-stage hooks through the real executor', () => {
  let root: string
  let main: string
  let tree: string
  let log: string
  let notices: string[]

  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const scriptsDir = () => join(main, '.claude/skills/pair-workflow-cycle/scripts')
  const entries = () =>
    existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : ([] as string[])
  /** `<point> <cwd>` lines the hooks wrote, for one point. */
  const ranAt = (point: string) =>
    entries()
      .filter(l => l.startsWith(`${point} `))
      .map(l => l.slice(point.length + 1))
  const mergeCalls = () => entries().filter(l => l === 'merge:check' || l === 'merge:run')

  /** A hook that records where it ran (`pwd -P`), then exits `code`. */
  const hook = (point: string, code = 0) =>
    `- \`${point}\`: \`echo "${point} $(pwd -P)" >> ${log}${code === 0 ? '' : `; exit ${code}`}\``

  const declare = (bullets: string[] | undefined) => {
    const path = cycleHooksPolicyPath(main)
    mkdirSync(join(main, '.pair/adoption/tech'), { recursive: true })
    if (bullets === undefined) rmSync(path, { force: true })
    else writeFileSync(path, `# Automation\n\n## Cycle Hooks\n\n${bullets.join('\n')}\n`)
  }

  const ALL = (overrides: Record<string, number> = {}) =>
    ['pre-cycle', 'pre-merge', 'post-merge', 'on-halt', 'post-cycle'].map(p =>
      hook(p, overrides[p] ?? 0),
    )

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-r3-merge-hooks-')))
    main = join(root, 'main')
    tree = join(root, 'pair-worktrees', '7')
    log = join(root, 'hooks.log')
    notices = []
    mkdirSync(main, { recursive: true })
    git(main, 'init', '-q', '-b', 'main')
    writeFileSync(join(main, '.gitignore'), '.claude/\n.pair/\n')
    git(main, 'add', '.gitignore')
    git(main, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init')
    mkdirSync(scriptsDir(), { recursive: true })
    for (const f of ['cycle-hooks.mjs', 'cycle-state.mjs'])
      cpSync(join(INSTALLED, f), join(scriptsDir(), f))
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(root, { recursive: true, force: true })
  })

  /** The merge stage stub: `check` (then `run` unless parked); an executed merge removes the story worktree and branch, as the real `run` does. */
  const mergeStage = (answer: MergeAnswer) => async (): Promise<CycleMergeOutcome> => {
    writeFileSync(log, 'merge:check\n', { flag: 'a' })
    if (answer.kind === 'parked')
      return {
        status: 'merge-parked',
        stagesRun: 0,
        merge: { mergeAllowed: false, parkKind: answer.parkKind, reason: 'parked' },
      }
    writeFileSync(log, 'merge:run\n', { flag: 'a' })
    git(main, 'worktree', 'remove', '--force', tree)
    git(main, 'branch', '-D', BRANCH)
    const cascaded = answer.kind === 'merged'
    return {
      status: cascaded ? 'merged' : 'merged-closure-unfinished',
      stagesRun: 1,
      merge: {
        merged: true,
        cascaded,
        reason: cascaded ? null : 'post-merge closure unfinished: board',
        ...(cascaded ? {} : { parkKind: 'halted' }),
      },
    }
  }

  const cycle = (answer: MergeAnswer): Promise<CycleOutcome> =>
    runCycle({
      hooks: createCycleHooksBridge(
        { scriptsDir: scriptsDir() },
        { policyPath: cycleHooksPolicyPath(main), cwd: main },
      ),
      resolve: async () => ({
        status: 'in-progress',
        next: { step: 'merge', reviewedHead: 'a'.repeat(40), round: 1, tier: 'risk:green' },
      }),
      worktree: async () => {
        if (!existsSync(tree)) git(main, 'worktree', 'add', '-q', '-b', BRANCH, tree)
        return { path: tree }
      },
      packet: async () => {
        throw new Error('no agent stage is dispatched for merge')
      },
      spawnStage: async () => {
        throw new Error('no agent stage is dispatched for merge')
      },
      mergeStage: mergeStage(answer),
      policy: {},
      onNotice: note => notices.push(note),
    })

  /** The same cycle through the real `run --card` handler: its exit code. */
  async function exitOf(answer: MergeAnswer): Promise<number> {
    const cwd = '/project'
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/config.json`]: JSON.stringify({
          asset_registries: {
            skills: {
              source: '.skills',
              behavior: 'overwrite',
              description: 'skills',
              prefix: 'pair',
              targets: [{ path: '.claude/skills/', mode: 'canonical' }],
            },
          },
        }),
        [`${cwd}/.claude/skills/pair-workflow-cycle/SKILL.md`]: '',
        [`${cwd}/.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs`]: '',
        [`${cwd}/.claude/skills/pair-workflow-cycle/scripts/cycle-dispatch.mjs`]: '',
        '/bin/claude': '',
      },
      cwd,
      cwd,
    )
    const deps: RunHandlerDependencies = {
      runIteration: async () => ({ outcome: 'success', detail: 'done' }),
      acquireLock: ({ card }) => ({
        kind: 'acquired',
        lock: { path: `/locks/${card}`, release: () => {} },
      }),
      appendAudit: () => {},
      cardReadiness: async () => 'ready',
      driveCycle: () => cycle(answer),
    }
    return handleRunCommand(parseRunCommand({ card: '7', cardTags: '' }), fs, deps)
  }

  /** The driver's answer, resolved or rejected — a thrown run is a row failure, not a crash. */
  const settle = (run: Promise<CycleOutcome>) =>
    run.then(
      outcome => ({ outcome, error: undefined as string | undefined }),
      (e: unknown) => ({ outcome: undefined, error: e instanceof Error ? e.message : String(e) }),
    )

  // ── witnesses: RED against the unfixed base ────────────────────────────────────────────────

  it('h-w1 (r3-1): merged — a declared post-merge runs in the MAIN checkout, post-cycle runs, nothing throws', async () => {
    declare(ALL())

    const { outcome, error } = await settle(cycle({ kind: 'merged' }))

    expect(error).toBeUndefined()
    expect(outcome?.status).toBe('merged')
    expect(existsSync(tree)).toBe(false)
    expect(ranAt('post-merge')).toEqual([main])
    expect(ranAt('post-cycle')).toEqual([main])
  }, 60_000)

  it('h-w2 (r3-1): merged — run --card exits 0 with a declared post-merge', async () => {
    declare(ALL())

    expect(await exitOf({ kind: 'merged' })).toBe(0)
    expect(ranAt('post-merge')).toEqual([main])
  }, 60_000)

  it('h-w3 (r3-1): merged with a ## Cycle Hooks section that declares NO post-merge — nothing throws, exit 0', async () => {
    declare([hook('pre-merge'), hook('post-cycle')])

    const { outcome, error } = await settle(cycle({ kind: 'merged' }))

    expect(error).toBeUndefined()
    expect(outcome?.status).toBe('merged')
    expect(ranAt('post-cycle')).toEqual([main])
    expect(await exitOf({ kind: 'merged' })).toBe(0)
  }, 60_000)

  it('h-w4 (r3-1): merged with NO automation.md at all (installed executor) — nothing throws, exit 0', async () => {
    declare(undefined)

    const { outcome, error } = await settle(cycle({ kind: 'merged' }))

    expect(error).toBeUndefined()
    expect(outcome?.status).toBe('merged')
    expect(await exitOf({ kind: 'merged' })).toBe(0)
  }, 60_000)

  it('h-w5 (r3-2): a failing post-merge is only logged — still merged, the failure noticed, exit 0', async () => {
    declare(ALL({ 'post-merge': 5 }))

    const { outcome, error } = await settle(cycle({ kind: 'merged' }))

    expect(error).toBeUndefined()
    expect(outcome?.status).toBe('merged')
    expect(ranAt('post-merge')).toEqual([main])
    expect(notices.some(n => n.includes('post-merge') && n.includes('exited 5'))).toBe(true)
    expect(ranAt('post-cycle')).toEqual([main])
    rmSync(log, { force: true })
    expect(await exitOf({ kind: 'merged' })).toBe(0)
  }, 60_000)

  it('h-w6 (maintainer): merged — post-merge runs, on-halt does NOT', async () => {
    declare(ALL())

    const { outcome } = await settle(cycle({ kind: 'merged' }))

    expect(outcome?.status).toBe('merged')
    expect(ranAt('post-merge')).toEqual([main])
    expect(ranAt('on-halt')).toEqual([])
  }, 60_000)

  it('h-w7 (maintainer): merge-parked, parkKind halted — on-halt runs (main checkout), post-merge does not', async () => {
    declare(ALL())

    const { outcome, error } = await settle(cycle({ kind: 'parked', parkKind: 'halted' }))

    expect(error).toBeUndefined()
    expect(outcome?.status).toBe('merge-parked')
    expect(ranAt('on-halt')).toEqual([main])
    expect(ranAt('post-merge')).toEqual([])
    expect(ranAt('post-cycle')).toEqual([main])
  }, 60_000)

  it('h-w8 (maintainer): merged-closure-unfinished — post-merge runs in main AND on-halt runs; exit 1', async () => {
    declare(ALL())

    const { outcome, error } = await settle(cycle({ kind: 'closure-unfinished' }))

    expect(error).toBeUndefined()
    expect(outcome?.status).toBe('merged-closure-unfinished')
    expect(ranAt('post-merge')).toEqual([main])
    expect(ranAt('on-halt')).toEqual([main])
    expect(ranAt('post-cycle')).toEqual([main])
    expect(await exitOf({ kind: 'closure-unfinished' })).toBe(1)
  }, 60_000)

  // ── controls: already correct at the base, and must stay so ────────────────────────────────

  it('h-c1 (r3-2): pre-merge runs in the story worktree, before check', async () => {
    declare(ALL())

    await settle(cycle({ kind: 'parked', parkKind: 'awaiting-human' }))

    expect(ranAt('pre-merge')).toEqual([tree])
    const all = entries()
    expect(all.findIndex(l => l.startsWith('pre-merge '))).toBeLessThan(all.indexOf('merge:check'))
  }, 60_000)

  it('h-c2 (r3-2): a failing pre-merge is failed-hook — zero check/run calls, nothing merged, no post-merge', async () => {
    declare(ALL({ 'pre-merge': 3 }))

    const outcome = await cycle({ kind: 'merged' })

    expect(outcome.status).toBe('failed-hook')
    expect(JSON.stringify(outcome.next)).toContain('pre-merge')
    expect(mergeCalls()).toEqual([])
    expect(outcome.merge).toBeUndefined()
    expect(existsSync(tree)).toBe(true)
    expect(ranAt('post-merge')).toEqual([])
    expect(ranAt('on-halt')).toEqual([main])
  }, 60_000)

  it('h-c3 (maintainer): merge-parked, parkKind awaiting-human — neither post-merge nor on-halt; post-cycle; exit 0', async () => {
    declare(ALL())

    const outcome = await cycle({ kind: 'parked', parkKind: 'awaiting-human' })

    expect(outcome.status).toBe('merge-parked')
    expect(mergeCalls()).toEqual(['merge:check'])
    expect(ranAt('post-merge')).toEqual([])
    expect(ranAt('on-halt')).toEqual([])
    expect(ranAt('post-cycle')).toEqual([main])
    expect(await exitOf({ kind: 'parked', parkKind: 'awaiting-human' })).toBe(0)
  }, 60_000)

  it.each<Park>(['awaiting-human', 'halted'])(
    'h-c4 (r3-2): no post-merge after a %s park',
    async parkKind => {
      declare(ALL())

      await settle(cycle({ kind: 'parked', parkKind }))

      expect(mergeCalls()).toEqual(['merge:check'])
      expect(ranAt('post-merge')).toEqual([])
    },
    60_000,
  )

  it('h-c5: merge-parked halted still exits 1', async () => {
    declare(ALL())

    expect(await exitOf({ kind: 'parked', parkKind: 'halted' })).toBe(1)
  }, 60_000)
})
