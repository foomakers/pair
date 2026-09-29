import { describe, it, expect } from 'vitest'
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
  // `created`: the story worktree `input.worktree()` answers; defaults to `root` so a test about
  // something else still hands every stage hook a tree. `{}` = no path (the r0-1 hazard).
  opts: { spawned?: string[]; created?: { path?: string } } = {},
) {
  const { spawned = [], created = { path: root } } = opts
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
        worktree: async () => created,
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

describe('pair-cli ## Cycle Hooks against the real executor (US-489)', () => {
  it('AC1/AC7: a real failing pre-verify blocks verify; a real post-implement runs in the story worktree', async () => {
    const { root, policyPath } = project(
      '## Cycle Hooks\n\n- `post-implement`: `pwd > post-cwd.txt`\n- `pre-verify`: `echo build-broke; exit 4`\n- `on-halt`: `echo halted >> alert.txt`',
    )
    const tree = mkdtempSync(join(tmpdir(), 'us489-tree-'))
    const spawned: string[] = []
    const d = drive(root, policyPath, [step('implement'), step('verify'), DONE], {
      spawned,
      created: { path: tree },
    })

    const outcome = await d.run()

    expect(outcome.status).toBe('failed-hook')
    expect(outcome.next?.['detail']).toContain('`pre-verify` `echo build-broke; exit 4` exited 4')
    expect(outcome.next?.['detail']).toContain('build-broke')
    expect(spawned).toEqual(['implement'])
    expect(readFileSync(join(tree, 'post-cwd.txt'), 'utf8').trim()).toMatch(/us489-tree-/)
    expect(existsSync(join(root, 'post-cwd.txt'))).toBe(false)
    // on-halt is cycle-level: the main checkout.
    expect(readFileSync(join(root, 'alert.txt'), 'utf8')).toBe('halted\n')
  })

  // r3 (PR analysis, latent r0-1): the bridge used `cwd ?? options.cwd`, so a stage hook handed no
  // worktree path silently ran in the MAIN checkout. A stage point with no cwd is refused, naming
  // the point; it never falls back to main.
  it('r3-w1: a stage hook with no story worktree path is refused, naming the point; it never runs in main', async () => {
    const { root, policyPath } = project('## Cycle Hooks\n\n- `pre-implement`: `pwd > pre-cwd.txt`')
    const spawned: string[] = []
    const d = drive(root, policyPath, [step('implement'), DONE], { spawned, created: {} })
    await expect(d.run()).rejects.toThrow(/pre-implement/)
    expect(existsSync(join(root, 'pre-cwd.txt'))).toBe(false)
    expect(spawned).toEqual([])
  })

  it.each(['pre-verify', 'post-implement'])(
    'r3-w2: bridge.run(%s) with no cwd rejects naming the point; nothing runs in main',
    async point => {
      const { root, policyPath } = project(`## Cycle Hooks\n\n- \`${point}\`: \`touch ran.txt\``)
      const hooks = createCycleHooksBridge({ scriptsDir: SCRIPTS_DIR }, { policyPath, cwd: root })
      await expect(hooks.run(point, undefined, undefined)).rejects.toThrow(point)
      expect(existsSync(join(root, 'ran.txt'))).toBe(false)
    },
  )

  it.each([
    ['pre-cycle', undefined],
    ['post-cycle', 'ready-for-merge'],
    ['on-halt', 'failed-hook'],
  ])(
    'r3-c1 (control): cycle-level %s with no cwd runs in the main checkout',
    async (point, status) => {
      const { root, policyPath } = project(`## Cycle Hooks\n\n- \`${point}\`: \`pwd > ran.txt\``)
      const hooks = createCycleHooksBridge({ scriptsDir: SCRIPTS_DIR }, { policyPath, cwd: root })
      const result = await hooks.run(point, status, undefined)
      expect(result.halted).toBeUndefined()
      expect(readFileSync(join(root, 'ran.txt'), 'utf8').trim()).toMatch(/us489-cli-/)
    },
  )

  it('r3-c2 (control): a stage hook handed the story worktree runs there, not in main', async () => {
    const { root, policyPath } = project('## Cycle Hooks\n\n- `pre-verify`: `pwd > ran.txt`')
    const tree = mkdtempSync(join(tmpdir(), 'us489-tree-'))
    const hooks = createCycleHooksBridge({ scriptsDir: SCRIPTS_DIR }, { policyPath, cwd: root })
    expect((await hooks.run('pre-verify', undefined, tree)).halted).toBeUndefined()
    expect(readFileSync(join(tree, 'ran.txt'), 'utf8').trim()).toMatch(/us489-tree-/)
    expect(existsSync(join(root, 'ran.txt'))).toBe(false)
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
