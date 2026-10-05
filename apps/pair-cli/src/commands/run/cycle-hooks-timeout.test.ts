import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCycleHooksBridge } from './cycle-scripts'
import { runCycle, type CycleResolveResult } from './cycle'

/**
 * US-489 AC9 (finding r1-3) — the per-hook timeout as pair-cli sees it: `runCycle` over the REAL
 * bridge spawning the REAL shared executor, with real `sh -c` hooks. The bridge's own `spawnSync`
 * must never expire before the hook timeout does (a killed bridge is an unreadable answer, not
 * `failed-hook`), and `timeout: 0` must never be capped by the bridge.
 */

const SCRIPTS_DIR = join(__dirname, '../../../../../.claude/skills/pair-workflow-cycle/scripts')
const TIMED_OUT = /time(d)?[ -]?out/i

function project(lines: string[]) {
  const root = mkdtempSync(join(tmpdir(), 'us489-cli-to-'))
  mkdirSync(join(root, '.pair/adoption/tech'), { recursive: true })
  const policyPath = join(root, '.pair/adoption/tech/automation.md')
  writeFileSync(policyPath, `# Automation\n\n## Cycle Hooks\n\n${lines.join('\n')}\n`)
  return { root, policyPath }
}

const step = (name: string): CycleResolveResult => ({
  status: 'in-progress',
  next: { step: name, phase: 'a0', attempt: 1, context: 'fresh' },
})
const DONE: CycleResolveResult = { status: 'completed', next: { step: 'done' } }

function drive(root: string, policyPath: string, sequence: CycleResolveResult[]) {
  let call = 0
  const notices: string[] = []
  const spawned: string[] = []
  const hooks = createCycleHooksBridge({ scriptsDir: SCRIPTS_DIR }, { policyPath, cwd: root })
  const run = () =>
    runCycle({
      hooks,
      resolve: async () => sequence[Math.min(call++, sequence.length - 1)]!,
      // The story worktree is `root` here: every stage hook gets a tree (never the r0-1 fallback).
      worktree: async () => ({ path: root }),
      packet: async (n: { step: string }) => ({ step: n.step, prompt: 'p', worktree: '/w' }),
      spawnStage: async p => {
        spawned.push((p as { step: string }).step)
        return { processOutcome: 'success' as const }
      },
      policy: {},
      onNotice: n => notices.push(n),
    })
  return { hooks, run, notices, spawned }
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
const reap = (pid: number) => {
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // already gone
  }
}

describe('pair-cli ## Cycle Hooks timeout against the real executor (US-489 AC9)', () => {
  it('TO-P1: a timed-out post-implement is logged and the cycle continues; a timed-out pre-verify is failed-hook, verify never spawns', async () => {
    const { root, policyPath } = project([
      '- `timeout`: `1`',
      '- `post-implement`: `sleep 4`',
      '- `pre-verify`: `sleep 4`',
    ])
    const d = drive(root, policyPath, [step('implement'), step('verify'), DONE])
    expect(d.hooks.warnings()).toEqual([])
    const outcome = await d.run()

    expect(outcome.status).toBe('failed-hook')
    expect(String(outcome.next?.['detail'])).toMatch(/pre-verify/)
    expect(String(outcome.next?.['detail'])).toMatch(TIMED_OUT)
    expect(d.spawned).toEqual(['implement'])
    expect(d.notices.join('\n')).toMatch(/post-implement/)
    expect(d.notices.join('\n')).toMatch(TIMED_OUT)
  }, 20000)

  it('TO-P2: the grandchild of a timed-out pre-verify is dead when the cycle halts', async () => {
    const { root, policyPath } = project([
      '- `timeout`: `1`',
      '- `pre-verify`: `sleep 6 >/dev/null 2>&1 & echo $! > child.pid; wait`',
    ])
    const d = drive(root, policyPath, [step('verify'), DONE])
    const outcome = await d.run()
    const pid = Number(readFileSync(join(root, 'child.pid'), 'utf8').trim())
    try {
      expect(outcome.status).toBe('failed-hook')
      expect(String(outcome.next?.['detail'])).toMatch(TIMED_OUT)
      const deadline = Date.now() + 1000
      while (alive(pid) && Date.now() < deadline) spawnSync('sleep', ['0.05'])
      expect(alive(pid)).toBe(false)
      expect(d.spawned).toEqual([])
    } finally {
      if (alive(pid)) reap(pid)
    }
  }, 20000)

  it('TO-P3 control: `timeout: 0` — a `sleep 3` pre-verify completes through the bridge, no cap, the cycle converges', async () => {
    const { root, policyPath } = project([
      '- `timeout`: `0`',
      '- `pre-verify`: `sleep 3; touch ok.txt`',
    ])
    const d = drive(root, policyPath, [step('verify'), DONE])
    const outcome = await d.run()
    expect(outcome.status).toBe('ready-for-merge')
    expect(d.spawned).toEqual(['verify'])
    expect(existsSync(join(root, 'ok.txt'))).toBe(true)
  }, 20000)

  it.each(['-5', '1.5', 'abc'])(
    'TO-P4: malformed `timeout: %s` is a load-time error naming the value, before any stage',
    async value => {
      const { root, policyPath } = project([
        `- \`timeout\`: \`${value}\``,
        '- `pre-verify`: `touch ran.txt`',
      ])
      const d = drive(root, policyPath, [step('verify'), DONE])
      expect(() => d.hooks.warnings()).toThrow(value)
      await expect(d.hooks.run('pre-verify', undefined, root)).rejects.toThrow(value)
      expect(existsSync(join(root, 'ran.txt'))).toBe(false)
      expect(d.spawned).toEqual([])
    },
    20000,
  )
})
