import { expect, it, vi } from 'vitest'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'
import { classify } from './cards-run'
import { runCardInProcess, outcomeOfExit } from './parallel'
import type { RunHandlerDependencies } from './run-context'
// @ts-expect-error — shipped script has no TypeScript declaration
import { decide as prepareDecide } from '../../../../../packages/knowledge-hub/dataset/.skills/workflow/cycle/scripts/cycle-prepare.mjs'
import {
  root,
  mapping,
  retry,
  target,
  board,
  save,
  handoff,
  invoke,
  initial,
  preparedCases,
} from './cards-lifecycle-lib'
it.each(preparedCases)('G5-pure-$id: prepared obeys target and terminal partitions', c => {
  const outcome = {
    ...outcomeOfExit('12', c.exit),
    prepare: 'prepared' as const,
    ...(c.status !== undefined && { cycleStatus: c.status }),
  }
  expect(classify(outcome).end).toBe(c.expected)
})
it.each(preparedCases)('G5-handler-$id: prepared partitions survive handler wiring', async c => {
  const state = initial()
  const result = await invoke(
    state,
    (id, n) => {
      if (id === '12') return c.exit
      if (n > 1) return target
      handoff(id)
      return retry
    },
    { cards: '12,15' },
  )
  expect(result.calls).toEqual(
    c.expected === 'retryable' ? ['12', '15', '12', '15'] : ['12', '15', '15'],
  )
  expect(result.output).toContain(`#12: ${c.expected}`)
  expect(result.code).toBe(c.expected === 'at-target' ? 0 : 1)
})
it('G5-skipped: prepared does not defeat a lock/ineligibility skip', () => {
  expect(
    classify({ id: '12', outcome: 'skipped', detail: 'locked', prepare: 'prepared' }).end,
  ).toBe('terminal')
})
it.each(['target-ready', 'needs-human', 'rounds-bound-reached', undefined])(
  'G5-relay-%s: PREPARE-RESULT and cycle status survive the actual in-process relay',
  async cycleStatus => {
    const runner = runCardInProcess(async () => {
      console.log('PREPARE-RESULT: prepared')
      if (cycleStatus !== undefined) console.log(`  Cycle status: ${cycleStatus}`)
      return 0
    })
    const exit = await runner({
      card: { id: '12', title: '', branch: '', tier: '', mutexResources: [], prerequisites: [] },
      args: [],
      cwd: root,
    })
    expect(exit).toEqual({
      exitCode: 0,
      signal: null,
      prepare: 'prepared',
      ...(cycleStatus !== undefined && { cycleStatus }),
    })
    const result = await invoke(
      initial(),
      (id, n) => {
        if (id === '12') return exit
        if (n > 1) return target
        handoff(id)
        return retry
      },
      { cards: '12,15' },
    )
    const end =
      cycleStatus === 'target-ready'
        ? 'at-target'
        : cycleStatus === 'needs-human'
          ? 'terminal'
          : 'retryable'
    expect(result.output).toContain(`#12: ${end}`)
    expect(result.calls).toEqual(
      end === 'retryable' ? ['12', '15', '12', '15'] : ['12', '15', '15'],
    )
  },
)

it('G5-engine-boundary: real preparation and in-process entry relay their result', async () => {
  const state = initial()
  save(state)
  const output: string[] = []
  const prompts: string[] = []
  const cycles: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    output.push(args.join(' '))
  })
  // Engine discovery is virtual; execution is injected. PATH contains only the offline gh and node.
  vi.stubEnv('PATH', join(root, 'bin'))
  const skills = [
    'pair-process-refine-story',
    'pair-process-plan-tasks',
    'pair-workflow-cycle',
    'pair-loop',
  ]
  const files: Record<string, string> = {
    [join(root, 'config.json')]: JSON.stringify({
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
    [join(root, '.pair/adoption/tech/way-of-working.md')]: mapping,
    [join(root, 'bin/claude')]: '',
  }
  for (const skill of skills) files[join(root, '.claude/skills', skill, 'SKILL.md')] = ''
  for (const script of ['cycle-state.mjs', 'cycle-dispatch.mjs', 'autonomy-policy.mjs'])
    files[join(root, '.claude/skills/pair-workflow-cycle/scripts', script)] = ''
  const gate = { mode: 'never', has: [], lacks: [] }
  const deps: RunHandlerDependencies = {
    runIteration: async input => {
      prompts.push(input.promptText)
      return { outcome: 'success', detail: 'offline engine' }
    },
    resolveAutonomy: () => ({
      ok: true,
      active: true,
      policy: { until: 'pr', prepare: gate, merge: gate },
      effective: {},
      lines: [],
      warnings: [],
      errors: [],
      translated: {},
    }),
    cardReadiness: async () => (cycles.length === 0 ? 'draft' : 'ready'),
    driveCycle: async ({ card }) => {
      cycles.push(card)
      return {
        status: cycles.length === 1 ? 'rounds-bound-reached' : 'ready-for-merge',
        stagesRun: 0,
      }
    },
    prepare: {
      bridge: {
        prepareDecide,
        prepareComplete: () => {
          state.cards['12'] = board('Planned')
          save(state)
          return { completed: true }
        },
        prepareEscalate: () => {
          throw new Error('unexpected escalation')
        },
        bindHosts: () => ({ action: 'bound', binding: { pmTool: 'github', codeHost: 'github' } }),
      },
      readLabels: () => [],
      readBody: () => '## Assumptions\n\n- Resolved\n',
      hooks: { run: async () => ({}) },
    },
    appendAudit: () => {},
    runAudit: () => {},
  }
  const code = await handleRunCommand(
    parseRunCommand({ cwd: root, cards: '12', autonomous: true, maxIterations: 3 }),
    new InMemoryFileSystemService(files, root, root),
    deps,
  )
  expect(prompts).toHaveLength(2)
  expect(prompts[0]).toContain('pair-process-refine-story')
  expect(prompts[1]).toContain('pair-process-plan-tasks')
  expect(output.join('\n')).toContain('PREPARE-RESULT: prepared')
  expect(cycles).toEqual(['12', '12'])
  expect(code).toBe(0)
})
