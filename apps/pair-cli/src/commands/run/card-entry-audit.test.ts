import { describe, it, expect, vi, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand, type IterationRunner, type RunHandlerDependencies } from './handler'
import { parseRunCommand } from './parser'
import { POLICY_PATH } from './automation-policy'
import type { CardReadiness } from './cycle-scripts'

/**
 * US-487 review r1-1 — every fallback route that SPAWNS on a card leaves the audit trail the KB
 * automation policy requires of every dispatch ("start, skip, end") and prints the one
 * `DISPATCH-RECORD:` line the host adapter posts — exactly as the mapped route does
 * (`handler.ts:driveDispatchedCard`). Routes: the delivery cycle (unattended and supervised), the
 * `--pr` entry (unmapped and on a mapped tag), and the supervised preparation skill.
 *
 * Hermetic: in-memory project, injected readiness / cycle driver / engine runner / lock / audit.
 */

const cwd = '/project'

const files = (
  extra: Record<string, string> = {},
  omit: readonly string[] = [],
): InMemoryFileSystemService => {
  const seed: Record<string, string> = {
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
    [`${cwd}/.claude/skills/pair-process-refine-story/SKILL.md`]: '',
    [`${cwd}/.claude/skills/pair-process-plan-tasks/SKILL.md`]: '',
    [`${cwd}/.claude/skills/pair-workflow-cycle/SKILL.md`]: '',
    [`${cwd}/.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs`]: '',
    [`${cwd}/.claude/skills/pair-workflow-cycle/scripts/cycle-dispatch.mjs`]: '',
    '/bin/claude': '',
    ...extra,
  }
  for (const path of omit) delete seed[path]
  return new InMemoryFileSystemService(seed, cwd, cwd)
}

const MAPPED_POLICY = '## Eligibility\n\nrisk:green\n\n## Workflows\n\nauto-dev ⇒ pair-loop\n'

function harness(readiness: CardReadiness) {
  const audit: string[] = []
  const stdout: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    stdout.push(args.map(String).join(' '))
  })
  const runIteration: IterationRunner = async () => ({ outcome: 'success', detail: 'done' })
  const deps: RunHandlerDependencies = {
    runIteration,
    acquireLock: ({ card }) => ({
      kind: 'acquired',
      lock: { path: `/locks/${card}`, release: () => {} },
    }),
    appendAudit: (_path, line) => audit.push(line),
    cardReadiness: async () => readiness,
    driveCycle: async () => ({ status: 'ready-for-merge', stagesRun: 1 }),
  }
  const records = () => stdout.filter(line => line.startsWith('DISPATCH-RECORD:'))
  return { audit, records, deps }
}

async function run(
  options: Parameters<typeof parseRunCommand>[0],
  fs: InMemoryFileSystemService,
  deps: RunHandlerDependencies,
): Promise<{ code?: number; error?: Error }> {
  try {
    return { code: await handleRunCommand(parseRunCommand(options), fs, deps) }
  } catch (error) {
    return { error: error as Error }
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('r1-1: every spawning fallback route writes start + end and prints one DISPATCH-RECORD', () => {
  const rows = [
    {
      id: 'A1-W1',
      name: 'unattended eligible Ready card, unmapped (the reviewer reproducer) ⇒ the cycle',
      options: { card: '32', cardTags: 'risk:green', autonomous: true },
      policy: MAPPED_POLICY,
      readiness: 'ready' as const,
      workflow: 'pair-workflow-cycle',
    },
    {
      id: 'A1-W2',
      name: 'supervised Ready card, no automation.md ⇒ the cycle',
      options: { card: '32', cardTags: '' },
      readiness: 'ready' as const,
      workflow: 'pair-workflow-cycle',
    },
    {
      id: 'A1-W3',
      name: '--pr on an unmapped card ⇒ the cycle at review',
      options: { card: '32', cardTags: '', pr: '12' },
      readiness: 'draft' as const,
      workflow: 'pair-workflow-cycle',
    },
    {
      id: 'A1-W4',
      name: '--pr on a MAPPED tag ⇒ the cycle at review',
      options: { card: '32', cardTags: 'auto-dev,risk:green', pr: '12' },
      policy: MAPPED_POLICY,
      readiness: 'draft' as const,
      workflow: 'pair-workflow-cycle',
    },
    {
      id: 'A1-W5',
      name: 'supervised Draft card ⇒ pair-process-refine-story',
      options: { card: '21', cardTags: '' },
      readiness: 'draft' as const,
      workflow: 'pair-process-refine-story',
    },
    {
      id: 'A1-W6',
      name: 'supervised Ready card without a breakdown ⇒ pair-process-plan-tasks',
      options: { card: '23', cardTags: '' },
      readiness: 'refined-no-breakdown' as const,
      workflow: 'pair-process-plan-tasks',
    },
  ]

  for (const row of rows) {
    it(`${row.id}: ${row.name}`, async () => {
      const { audit, records, deps } = harness(row.readiness)
      const fs = files(row.policy ? { [`${cwd}/${POLICY_PATH}`]: row.policy } : {})

      const outcome = await run(row.options, fs, deps)

      expect(outcome.error?.message).toBeUndefined()
      const card = row.options.card
      expect(audit).toHaveLength(2)
      expect(audit[0]).toMatch(new RegExp(`event=start card=${card}\\b.*workflow=${row.workflow}`))
      expect(audit[1]).toMatch(new RegExp(`event=end card=${card}\\b.*outcome=`))
      expect(records()).toHaveLength(1)
      expect(records()[0]).toContain(`event=start card=${card}`)
      expect(records()[0]).toContain(`workflow=${row.workflow}`)
    })
  }

  it('A1-W7: the cycle driver throws ⇒ start, then end outcome=crashed, and the error still surfaces', async () => {
    const { audit, records, deps } = harness('ready')

    const outcome = await run({ card: '32', cardTags: '' }, files(), {
      ...deps,
      driveCycle: () => Promise.reject(new Error('driver exploded')),
    })

    expect(outcome.error?.message).toContain('driver exploded')
    expect(audit).toHaveLength(2)
    expect(audit[0]).toMatch(/event=start card=32\b/)
    expect(audit[1]).toMatch(/event=end card=32\b.*outcome=crashed/)
    expect(records()).toHaveLength(1)
  })

  it('A1-W8: a cycle that ends short of ready-for-merge is audited outcome=failed', async () => {
    const { audit, deps } = harness('ready')

    const outcome = await run({ card: '32', cardTags: '' }, files(), {
      ...deps,
      driveCycle: async () => ({ status: 'failed-prepare', stagesRun: 2 }),
    })

    expect(outcome.code).toBe(1)
    expect(audit[1]).toMatch(/event=end card=32\b.*outcome=failed/)
  })

  it('A1-C1: an unattended Draft card (nothing spawned) stays a skip — no start, no DISPATCH-RECORD', async () => {
    const { audit, records, deps } = harness('draft')

    const outcome = await run({ card: '21', cardTags: '', autonomous: true }, files(), deps)

    expect(outcome.code).toBe(0)
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatch(/event=skip card=21\b/)
    expect(records()).toHaveLength(0)
  })

  it('A1-C2: the MAPPED route is unchanged — start (tag + workflow), end, one DISPATCH-RECORD', async () => {
    const { audit, records, deps } = harness('draft')

    const outcome = await run(
      { card: '31', cardTags: 'auto-dev,risk:green' },
      files({ [`${cwd}/${POLICY_PATH}`]: MAPPED_POLICY }),
      deps,
    )

    expect(outcome.code).toBe(0)
    expect(audit[0]).toMatch(/event=start card=31 tag=auto-dev workflow=pair-loop/)
    expect(audit[1]).toMatch(/event=end card=31\b.*outcome=completed/)
    expect(records()).toHaveLength(1)
  })

  it('A1-C3: a cycle entry refused before anything spawns (skill-missing) writes no start and prints no DISPATCH-RECORD', async () => {
    const { audit, records, deps } = harness('ready')
    const fs = files(
      {},
      ['SKILL.md', 'scripts/cycle-state.mjs', 'scripts/cycle-dispatch.mjs'].map(
        f => `${cwd}/.claude/skills/pair-workflow-cycle/${f}`,
      ),
    )

    const outcome = await run({ card: '32', cardTags: '' }, fs, deps)

    expect(outcome.error?.message).toMatch(/skill-missing/)
    expect(audit.filter(line => /event=start/.test(line))).toHaveLength(0)
    expect(records()).toHaveLength(0)
  })

  it('A1-C4: a prep route refused before anything spawns (engine not available) writes no start and prints no DISPATCH-RECORD', async () => {
    const { audit, records, deps } = harness('draft')
    const fs = files({}, ['/bin/claude'])

    const outcome = await run({ card: '21', cardTags: '' }, fs, deps)

    expect(outcome.error).toBeDefined()
    expect(audit.filter(line => /event=start/.test(line))).toHaveLength(0)
    expect(records()).toHaveLength(0)
  })
})
