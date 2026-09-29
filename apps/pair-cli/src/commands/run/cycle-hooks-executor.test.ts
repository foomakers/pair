import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCycleHooksBridge } from './cycle-scripts'
import { runCycle, type CycleResolveResult } from './cycle'

/**
 * US-489 T-4 — pair-cli's hooks against the REAL shared executor (`cycle-hooks.mjs`, the same
 * script `pair-workflow-cycle` calls): real shell commands, a real repo root, real exit codes.
 */

const SCRIPTS_DIR = join(__dirname, '../../../../../.claude/skills/pair-workflow-cycle/scripts')

function project(section: string | undefined) {
  const root = mkdtempSync(join(tmpdir(), 'us489-cli-'))
  mkdirSync(join(root, '.pair/adoption/tech'), { recursive: true })
  const policyPath = join(root, '.pair/adoption/tech/automation.md')
  if (section !== undefined) writeFileSync(policyPath, `# Automation\n\n${section}\n`)
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
  spawned: string[] = [],
) {
  let call = 0
  const notices: string[] = []
  const hooks = createCycleHooksBridge({ scriptsDir: SCRIPTS_DIR }, { policyPath, cwd: root })
  return {
    notices,
    hooks,
    run: () =>
      runCycle({
        hooks,
        resolve: async () => sequence[Math.min(call++, sequence.length - 1)]!,
        worktree: async () => ({}),
        packet: async (n: { step: string }) => ({ step: n.step, prompt: 'p', worktree: '/w' }),
        spawnStage: async p => {
          spawned.push((p as { step: string }).step)
          return { processOutcome: 'success' as const }
        },
        policy: {},
        onNotice: n => notices.push(n),
      }),
  }
}

// Each case spawns the real executor (a node child + shells): generous bound for a loaded machine.
vi.setConfig({ testTimeout: 60_000 })

describe('pair-cli ## Cycle Hooks against the real executor (US-489)', () => {
  it('AC1/AC7: a real failing pre-verify blocks verify; a real post-implement runs in the repo root', async () => {
    const { root, policyPath } = project(
      '## Cycle Hooks\n\n- `post-implement`: `pwd > post-cwd.txt`\n- `pre-verify`: `echo build-broke; exit 4`\n- `on-halt`: `echo halted >> alert.txt`',
    )
    const spawned: string[] = []
    const d = drive(root, policyPath, [step('implement'), step('verify'), DONE], spawned)

    const outcome = await d.run()

    expect(outcome.status).toBe('failed-hook')
    expect(outcome.next?.['detail']).toContain('`pre-verify` `echo build-broke; exit 4` exited 4')
    expect(outcome.next?.['detail']).toContain('build-broke')
    expect(spawned).toEqual(['implement'])
    expect(readFileSync(join(root, 'post-cwd.txt'), 'utf8').trim()).toMatch(/us489-cli-/)
    expect(readFileSync(join(root, 'alert.txt'), 'utf8')).toBe('halted\n')
  })

  it('AC2: a failing real post-* hook is relayed and the cycle still converges; no on-halt at ready-for-merge', async () => {
    const { root, policyPath } = project(
      '## Cycle Hooks\n\n- `post-implement`: `echo nope; exit 9`\n- `on-halt`: `touch alert.txt`\n- `post-cycle`: `touch closed.txt`',
    )
    const d = drive(root, policyPath, [step('implement'), DONE])
    const outcome = await d.run()
    expect(outcome.status).toBe('ready-for-merge')
    expect(d.notices.join('\n')).toMatch(/post-implement.*exited 9.*nope/s)
    expect(existsSync(join(root, 'alert.txt'))).toBe(false)
    expect(existsSync(join(root, 'closed.txt'))).toBe(true)
  })

  it('AC6: no `## Cycle Hooks` (or no file) ⇒ nothing runs, nothing is reported', async () => {
    for (const section of [undefined, '## Eligibility\n\nrisk:green']) {
      const { root, policyPath } = project(section)
      const d = drive(root, policyPath, [step('implement'), DONE])
      expect(d.hooks.warnings()).toEqual([])
      expect((await d.run()).status).toBe('ready-for-merge')
      expect(d.notices).toEqual([])
    }
  })

  it('a typo in a hook key is reported once at load time, never a HALT', async () => {
    const { root, policyPath } = project('## Cycle Hooks\n\n- `pre-verfy`: `exit 1`')
    const d = drive(root, policyPath, [step('implement'), step('verify'), DONE])
    expect(d.hooks.warnings().join('\n')).toMatch(/unrecognized hook key `pre-verfy`/)
    expect((await d.run()).status).toBe('ready-for-merge')
  })

  it('an installed skill without the executor is silent when no hooks are declared, loud when they are', () => {
    const empty = mkdtempSync(join(tmpdir(), 'us489-noscript-'))
    const none = project('## Eligibility\n\nrisk:green')
    expect(
      createCycleHooksBridge(
        { scriptsDir: empty },
        { policyPath: none.policyPath, cwd: none.root },
      ).warnings(),
    ).toEqual([])
    const some = project('## Cycle Hooks\n\n- `pre-verify`: `true`')
    expect(() =>
      createCycleHooksBridge(
        { scriptsDir: empty },
        { policyPath: some.policyPath, cwd: some.root },
      ).warnings(),
    ).toThrow(/skill-outdated/)
  })
})
