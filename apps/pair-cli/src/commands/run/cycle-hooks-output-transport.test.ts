import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCycleHooksBridge } from './cycle-scripts'
import { runCycle, type CycleResolveResult } from './cycle'

/**
 * US-489 review r0-2 — the hook-run output transport. `createCycleHooksBridge` spawns the REAL
 * shared executor (`cycle-hooks.mjs`), which embeds the hook's output in its ONE JSON line (once in
 * `ran[]`, again in `halted` / `logged`). However large that output, the cycle reaches the typed
 * outcome the executor decided — `failed-hook` for a failing `pre-*`, a logged notice for a failing
 * `post-*` / `on-halt`, a dispatch for a passing hook — never `cycle-state-unreadable`.
 *
 * Hermetic: real `sh` hooks in a temp project, stubbed resolve/worktree/packet/spawnStage; no
 * engine, no `gh`, no network.
 */

const SCRIPTS_DIR = join(__dirname, '../../../../../.claude/skills/pair-workflow-cycle/scripts')
const EXECUTOR = join(SCRIPTS_DIR, 'cycle-hooks.mjs')

/** A shell command printing `HEAD-MARK`, then `bytes` of `a`, then exiting `code`. */
const loud = (bytes: number, code: number) =>
  `printf 'HEAD-MARK\\n'; head -c ${bytes} /dev/zero | tr '\\0' a; exit ${code}`

const MB2 = 2 * 1024 * 1024

function project(bullets: string[]) {
  const root = mkdtempSync(join(tmpdir(), 'us489-r02-'))
  mkdirSync(join(root, '.pair/adoption/tech'), { recursive: true })
  const policyPath = join(root, '.pair/adoption/tech/automation.md')
  writeFileSync(policyPath, `# Automation\n\n## Cycle Hooks\n\n${bullets.join('\n')}\n`)
  return { root, policyPath }
}

const step = (name: string): CycleResolveResult => ({
  status: 'in-progress',
  next: { step: name, phase: 'a0', attempt: 1, context: 'fresh' },
})
const DONE: CycleResolveResult = { status: 'completed', next: { step: 'done' } }

function drive(
  root: string,
  policyPath: string,
  sequence: CycleResolveResult[],
  worktreePath?: string,
) {
  let call = 0
  const notices: string[] = []
  const spawned: string[] = []
  const hooks = createCycleHooksBridge({ scriptsDir: SCRIPTS_DIR }, { policyPath, cwd: root })
  const run = () =>
    runCycle({
      hooks,
      resolve: async () => sequence[Math.min(call++, sequence.length - 1)]!,
      // Absent ⇒ the story worktree is `root`: every stage hook gets a tree (never the r0-1 fallback).
      worktree: async () => ({ path: worktreePath ?? root }),
      packet: async (n: { step: string }) => ({ step: n.step, prompt: 'p', worktree: '/w' }),
      spawnStage: async p => {
        spawned.push((p as { step: string }).step)
        return { processOutcome: 'success' as const }
      },
      policy: {},
      onNotice: n => notices.push(n),
    })
  return { notices, spawned, run }
}

describe('r0-2: hook output larger than the bridge buffer never crashes the cycle', () => {
  it('r02-w1: a pre-verify printing 2 MB then exit 1 ⇒ failed-hook, on-halt runs', async () => {
    const { root, policyPath } = project([
      `- \`pre-verify\`: \`${loud(MB2, 1)}\``,
      '- `on-halt`: `touch halted.txt`',
    ])
    const d = drive(root, policyPath, [step('implement'), step('verify'), DONE])
    const outcome = await d.run()
    expect(outcome.status).toBe('failed-hook')
    expect(outcome.next?.['detail']).toContain('`pre-verify`')
    expect(outcome.next?.['detail']).toContain('exited 1')
    expect(outcome.next?.['detail']).toContain('HEAD-MARK')
    expect(d.spawned).toEqual(['implement'])
    expect(existsSync(join(root, 'halted.txt'))).toBe(true)
  }, 60_000)

  it('r02-w2: a passing pre-verify printing 2 MB ⇒ verify dispatches, the cycle converges', async () => {
    const { root, policyPath } = project([`- \`pre-verify\`: \`${loud(MB2, 0)}\``])
    const d = drive(root, policyPath, [step('verify'), DONE])
    const outcome = await d.run()
    expect(outcome.status).toBe('ready-for-merge')
    expect(d.spawned).toEqual(['verify'])
  }, 60_000)

  it('r02-w3: a failing post-implement printing 2 MB ⇒ logged, the cycle converges, post-cycle runs', async () => {
    const { root, policyPath } = project([
      `- \`post-implement\`: \`${loud(MB2, 9)}\``,
      '- `post-cycle`: `touch closed.txt`',
    ])
    const d = drive(root, policyPath, [step('implement'), DONE])
    const outcome = await d.run()
    expect(outcome.status).toBe('ready-for-merge')
    expect(d.notices.join('\n')).toMatch(/post-implement.*exited 9/s)
    expect(existsSync(join(root, 'closed.txt'))).toBe(true)
  }, 60_000)

  it('r02-w4: a passing post-implement printing 2 MB ⇒ the cycle converges, post-cycle runs', async () => {
    const { root, policyPath } = project([
      `- \`post-implement\`: \`${loud(MB2, 0)}\``,
      '- `post-cycle`: `touch closed.txt`',
    ])
    const d = drive(root, policyPath, [step('implement'), DONE])
    expect((await d.run()).status).toBe('ready-for-merge')
    expect(existsSync(join(root, 'closed.txt'))).toBe(true)
  }, 60_000)

  it('r02-w5: an on-halt printing 2 MB ⇒ the failed-hook outcome stands, post-cycle runs', async () => {
    const { root, policyPath } = project([
      '- `pre-verify`: `echo small; exit 2`',
      `- \`on-halt\`: \`${loud(MB2, 3)}\``,
      '- `post-cycle`: `touch closed.txt`',
    ])
    const d = drive(root, policyPath, [step('verify'), DONE])
    const outcome = await d.run()
    expect(outcome.status).toBe('failed-hook')
    expect(d.notices.join('\n')).toMatch(/on-halt.*exited 3/s)
    expect(existsSync(join(root, 'closed.txt'))).toBe(true)
  }, 60_000)

  it('r02-b1: 600 KB then exit 1 (under 1 MiB once, over it once embedded twice) ⇒ failed-hook', async () => {
    const { root, policyPath } = project([
      `- \`pre-verify\`: \`${loud(600 * 1024, 1)}\``,
      '- `on-halt`: `touch halted.txt`',
    ])
    const d = drive(root, policyPath, [step('verify'), DONE])
    const outcome = await d.run()
    expect(outcome.status).toBe('failed-hook')
    expect(existsSync(join(root, 'halted.txt'))).toBe(true)
  }, 60_000)

  it('r02-b2: output beyond the executor capture cap (65 MiB) ⇒ a typed outcome, never unreadable', async () => {
    const { root, policyPath } = project([
      `- \`pre-verify\`: \`${loud(65 * 1024 * 1024, 0)}\``,
      '- `post-cycle`: `touch closed.txt`',
    ])
    const d = drive(root, policyPath, [step('verify'), DONE])
    const outcome = await d.run()
    expect(['failed-hook', 'ready-for-merge']).toContain(outcome.status)
    expect(existsSync(join(root, 'closed.txt'))).toBe(true)
  }, 120_000)

  it('r02-i1: a stage hook in the story worktree printing 2 MB then exit 1 ⇒ failed-hook, ran there', async () => {
    const { root, policyPath } = project([
      `- \`pre-verify\`: \`pwd > cwd.txt; ${loud(MB2, 1)}\``,
      '- `on-halt`: `touch halted.txt`',
    ])
    const tree = mkdtempSync(join(tmpdir(), 'us489-r02-tree-'))
    const d = drive(root, policyPath, [step('verify'), DONE], tree)
    const outcome = await d.run()
    expect(outcome.status).toBe('failed-hook')
    expect(existsSync(join(tree, 'cwd.txt'))).toBe(true)
    expect(existsSync(join(root, 'halted.txt'))).toBe(true)
  }, 60_000)

  it('r02-c1 (control): 100 KB then exit 1 ⇒ failed-hook with the output verbatim', async () => {
    const { root, policyPath } = project([
      `- \`pre-verify\`: \`${loud(100 * 1024, 1)}\``,
      '- `on-halt`: `touch halted.txt`',
    ])
    const d = drive(root, policyPath, [step('verify'), DONE])
    const outcome = await d.run()
    expect(outcome.status).toBe('failed-hook')
    expect(outcome.next?.['detail']).toContain(`HEAD-MARK\n${'a'.repeat(100 * 1024)}`)
    expect(existsSync(join(root, 'halted.txt'))).toBe(true)
  }, 60_000)

  it('r02-c2 (control, in-session parity): the executor CLI answers 2 MB then exit 1 with one parseable JSON line', () => {
    const { root, policyPath } = project([`- \`pre-verify\`: \`${loud(MB2, 1)}\``])
    const r = spawnSync(
      'node',
      [EXECUTOR, 'run', policyPath, '--point', 'pre-verify', '--cwd', root],
      { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 },
    )
    expect(r.status).toBe(0)
    const lines = r.stdout.trim().split('\n')
    expect(lines).toHaveLength(1)
    const out = JSON.parse(lines[0]!) as { halted?: { exitCode: number; output: string } }
    expect(out.halted?.exitCode).toBe(1)
    expect(out.halted?.output.startsWith('HEAD-MARK\n')).toBe(true)
  }, 60_000)
})
