import { describe, it, expect, vi, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand, type RunHandlerDependencies } from './handler'
import { parseRunCommand } from './parser'
import { POLICY_PATH } from './automation-policy'

/**
 * Autonomous-run defect D1 — `run --card N --autonomous` WITHOUT `--card-tags` treated the card as
 * unlabelled ("carries no `risk:green` label") although it carried it. Absent flag ≠ empty flag:
 * absent means "read the card's live labels through the tracker"; `--card-tags` stays the explicit
 * override; an unreadable tracker fails closed with its own message.
 */
const cwd = '/project'
const fs = () =>
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
      [`${cwd}/${POLICY_PATH}`]: '## Eligibility\n\nrisk:green\n',
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
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    lines.push(a.map(String).join(' '))
  })
  return () => lines.join('\n')
}

const base = (extra: Partial<RunHandlerDependencies> = {}): RunHandlerDependencies => ({
  acquireLock: ({ card }) => ({
    kind: 'acquired',
    lock: { path: `/locks/${card}`, release: () => {} },
  }),
  appendAudit: () => {},
  cardReadiness: async () => 'ready',
  driveCycle: vi.fn(async () => ({ status: 'ready-for-merge', stagesRun: 1 })),
  ...extra,
})

afterEach(() => vi.restoreAllMocks())

describe('D1: live card labels when --card-tags is absent', () => {
  it('reads the live labels: a risk:green card is eligible, the cycle starts', async () => {
    const out = capture()
    const readCardLabels = vi.fn(() => ['risk:green', 'needs-review'])
    const deps = base({ readCardLabels })

    const code = await handleRunCommand(
      parseRunCommand({ card: '493', autonomous: true }),
      fs(),
      deps,
    )

    expect(code).toBe(0)
    expect(readCardLabels).toHaveBeenCalledWith('493', cwd)
    expect(out()).not.toMatch(/carries no/)
    expect(deps.driveCycle).toHaveBeenCalled()
  })

  it('--card-tags stays the explicit override: no live read', async () => {
    capture()
    const readCardLabels = vi.fn(() => ['risk:green'])
    const deps = base({ readCardLabels })

    await handleRunCommand(
      parseRunCommand({ card: '493', cardTags: 'risk:red', autonomous: true }),
      fs(),
      deps,
    )

    expect(readCardLabels).not.toHaveBeenCalled()
    expect(deps.driveCycle).not.toHaveBeenCalled()
  })

  it('a live read WITHOUT the eligibility label still skips, naming the live labels', async () => {
    const out = capture()
    const deps = base({ readCardLabels: () => ['risk:red'] })

    await handleRunCommand(parseRunCommand({ card: '493', autonomous: true }), fs(), deps)

    expect(deps.driveCycle).not.toHaveBeenCalled()
    expect(out()).toMatch(/does not carry `risk:green`/)
    expect(out()).toContain('risk:red')
  })

  it('an unreadable tracker fails closed with its own message, never "carries no label"', async () => {
    const out = capture()
    const deps = base({ readCardLabels: () => undefined })

    await expect(
      handleRunCommand(parseRunCommand({ card: '493', autonomous: true }), fs(), deps),
    ).rejects.toThrow(/could not read the labels of card 493.*--card-tags/s)
    expect(deps.driveCycle).not.toHaveBeenCalled()
    expect(out()).not.toMatch(/carries no/)
  })

  for (const platform of ['darwin', 'linux'] as const) {
    it(`the live read decides identically on platform ${platform}`, async () => {
      const original = process.platform
      Object.defineProperty(process, 'platform', { value: platform })
      try {
        capture()
        const deps = base({ readCardLabels: () => ['risk:green'] })
        await handleRunCommand(parseRunCommand({ card: '493', autonomous: true }), fs(), deps)
        expect(deps.driveCycle).toHaveBeenCalled()
      } finally {
        Object.defineProperty(process, 'platform', { value: original })
      }
    })
  }
})
