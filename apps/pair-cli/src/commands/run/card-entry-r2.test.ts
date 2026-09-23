import { describe, it, expect, vi, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand, type RunHandlerDependencies } from './handler'
import { parseRunCommand } from './parser'

/**
 * US-487 review r2 — two leftovers of the r1 fixes.
 * r2-1: an interrupted run owed ONE `end` record; the inner `end outcome=failed` of the run the
 *       signal cut short landed first, then the handler's `end outcome=interrupted`.
 * r2-2: `--dry-run` on the card path still printed the pre-r1-4 "automation is off" warning and
 *       "Nothing was spawned." for a run that, live, enters the cycle.
 */

const cwd = '/project'

const files = () =>
  new InMemoryFileSystemService(
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
      [`${cwd}/.claude/skills/pair-loop/SKILL.md`]: '',
      [`${cwd}/.claude/skills/pair-workflow-cycle/SKILL.md`]: '',
      [`${cwd}/.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs`]: '',
      [`${cwd}/.claude/skills/pair-workflow-cycle/scripts/cycle-dispatch.mjs`]: '',
      '/bin/claude': '',
    },
    cwd,
    cwd,
  )

function capture(): () => string {
  const lines: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '))
  })
  return () => lines.join('\n')
}

afterEach(() => vi.restoreAllMocks())

describe('r2-2: --dry-run on the card path previews what the live run does', () => {
  it('R22-W1: no automation.md, --autonomous --dry-run ⇒ the reworded notice, never "automation is off"', async () => {
    const output = capture()
    const driveCycle = vi.fn(async () => ({ status: 'ready-for-merge' as const, stagesRun: 1 }))

    const code = await handleRunCommand(
      parseRunCommand({ card: '12', cardTags: '', autonomous: true, dryRun: true }),
      files(),
      { cardReadiness: async () => 'ready', driveCycle, appendAudit: () => {} },
    )

    expect(code).toBe(0)
    expect(driveCycle).not.toHaveBeenCalled()
    expect(output()).not.toMatch(/automation is off/)
    expect(output()).not.toMatch(/nothing is selected unattended/)
    expect(output()).toMatch(/this run proceeds on card 12/)
    expect(output()).toMatch(/[Dd]ry run/)
  })
})

describe('r2-1: an interrupted run gets exactly one `end` record', () => {
  it('R21-W1: SIGTERM mid-cycle, the cycle then settles `failed` ⇒ one end, outcome=interrupted', async () => {
    capture()
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const audit: string[] = []
    let exited!: () => void
    const done = new Promise<void>(resolve => (exited = resolve))
    exit.mockImplementation((() => exited()) as never)

    const deps: RunHandlerDependencies = {
      acquireLock: ({ card }) => ({
        kind: 'acquired',
        lock: { path: `/locks/${card}`, release: () => {} },
      }),
      appendAudit: (_path, line) => audit.push(line),
      cardReadiness: async () => 'ready',
      driveCycle: async () => {
        process.emit('SIGTERM', 'SIGTERM')
        await new Promise(resolve => setTimeout(resolve, 20))
        return { status: 'failed-prepare', stagesRun: 1 } as never
      },
    }

    void handleRunCommand(
      parseRunCommand({ card: '12', cardTags: '', autonomous: true }),
      files(),
      deps,
    ).catch(() => {})
    await done
    await new Promise(resolve => setTimeout(resolve, 50))

    const ends = audit.filter(line => /event=end\b/.test(line))
    expect(ends).toHaveLength(1)
    expect(ends[0]).toMatch(/outcome=interrupted/)
  })
})
