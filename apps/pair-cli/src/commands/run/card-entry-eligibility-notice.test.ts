import { describe, it, expect, vi, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand, type RunHandlerDependencies } from './handler'
import { parseRunCommand } from './parser'
import { POLICY_PATH } from './automation-policy'

/**
 * US-487 review r1-4 — with no `## Eligibility` declared, an explicit `--card` on a Ready card
 * enters the delivery cycle (AC14, kept as written). The operator output must not first claim the
 * opposite: "automation is off … nothing is selected unattended", then enter the cycle. The
 * warning is reworded on the card path to say what happens; loop mode keeps it verbatim.
 */

const cwd = '/project'

const files = (extra: Record<string, string> = {}) =>
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
      ...extra,
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

const deps: RunHandlerDependencies = {
  acquireLock: ({ card }) => ({
    kind: 'acquired',
    lock: { path: `/locks/${card}`, release: () => {} },
  }),
  appendAudit: () => {},
  cardReadiness: async () => 'ready',
  driveCycle: async () => ({ status: 'ready-for-merge', stagesRun: 1 }),
}

afterEach(() => vi.restoreAllMocks())

describe('r1-4: the card path never says "nothing is selected unattended" and then runs', () => {
  const rows = [
    { id: 'E4-W1', name: 'automation.md absent', extra: {} },
    {
      id: 'E4-W2',
      name: 'automation.md present, no `## Eligibility`',
      extra: { [`${cwd}/${POLICY_PATH}`]: '## Audit Location\n\nautomation/loop-audit.md\n' },
    },
  ]
  for (const row of rows) {
    it(`${row.id}: ${row.name}, --autonomous Ready card ⇒ the cycle, with a notice that says so`, async () => {
      const output = capture()

      const code = await handleRunCommand(
        parseRunCommand({ card: '12', cardTags: '', autonomous: true }),
        files(row.extra),
        deps,
      )

      expect(code).toBe(0)
      expect(output()).toContain('entering the delivery cycle')
      expect(output()).not.toMatch(/nothing is selected unattended/)
      expect(output()).not.toMatch(/automation is off/)
      expect(output()).toMatch(
        /explicit --card names its own card, so this run proceeds on card 12/,
      )
    })
  }

  it('E4-C1: loop mode keeps the "automation is off" warning verbatim', async () => {
    const output = capture()

    await handleRunCommand(parseRunCommand({ dryRun: true, root: '5' }), files(), deps)

    expect(output()).toContain('automation is off')
  })
})
