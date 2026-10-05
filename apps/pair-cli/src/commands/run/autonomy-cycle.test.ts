import { describe, it, expect, vi, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { runCycle, type CycleHooks, type CycleResolveResult, type CycleStageResult } from './cycle'
import { handleRunCommand, type IterationRunner, type RunHandlerDependencies } from './handler'
import { parseRunCommand } from './parser'
import { describeAutonomy, resolveAutonomyPolicy, type AutonomyResolver } from './autonomy-policy'
import type { AutonomyResolution, CycleScriptsLocation } from './cycle-scripts'
import type { DriveCycleInput, DriveCycleResult } from './run-context'
import { pinnedTier } from './cycle-wiring'
import { buildSkillArgs, selectionDeliveredBy } from './invocation'
import { createPerimeter, UNHONOURABLE_SELECTION_MESSAGE } from './perimeter'

/**
 * US-521 (ADR-027) — `pair-cli run --card` and the stage loop honour the shared autonomy model by RELAY:
 * the script's resolution is printed and forwarded verbatim, `escalated` exits 1 and fires `on-halt`,
 * `target-ready` exits 0, and nothing is re-derived here. Hermetic: fake collaborators, in-memory project.
 */

afterEach(() => vi.restoreAllMocks())

const cwd = '/project'
const GATE = { mode: 'when', has: ['cost:red'], lacks: [] as string[] }

const resolution = (over: Partial<AutonomyResolution> = {}): AutonomyResolution => ({
  ok: true,
  active: true,
  policy: { until: 'merged', prepare: { mode: 'always', has: [], lacks: [] }, merge: GATE },
  lines: [
    'filter: (all) (default)',
    'until: merged (argument)',
    'merge: when; has: cost:red (argument)',
    'prepare: always (default)',
  ],
  warnings: [],
  errors: [],
  translated: {},
  ...over,
})

// ── parser: flags, scope, refusals ────────────────────────────────────────────────────────
describe('parser: autonomy arguments', () => {
  it('P1: --until/--prepare/--merge travel raw in config.autonomy (the script owns the grammar)', () => {
    const config = parseRunCommand({
      card: '521',
      until: 'merged',
      prepare: 'never',
      merge: 'when; has: cost:red',
    })
    expect(config.autonomy).toEqual({
      until: 'merged',
      prepare: 'never',
      merge: 'when; has: cost:red',
    })
  })

  it('P2: nothing passed ⇒ no `autonomy` key at all (default off)', () => {
    expect('autonomy' in parseRunCommand({ card: '521' })).toBe(false)
  })

  it.each(['until', 'prepare', 'merge'] as const)(
    'P3: --%s without --card is refused, naming the --card path',
    flag => {
      expect(() => parseRunCommand({ root: '485', [flag]: 'x' })).toThrow(
        /only meaningful with --card[\s\S]*do not carry it through this driver/,
      )
    },
  )

  it('P4: an argument that could become a command fragment is refused at parse time', () => {
    expect(() => parseRunCommand({ card: '1', merge: 'when; has: `id`' })).toThrow(/--merge/)
    expect(() => parseRunCommand({ card: '1', until: '$(id)' })).toThrow(/--until/)
  })

  it('P5: --assignee / --status enter the scope; --filter may be an any-of list', () => {
    const config = parseRunCommand({
      skill: 'pair-next',
      filter: 'risk:green,risk:yellow',
      assignee: '@me',
      status: 'Draft,Ready',
    })
    expect(config.scope).toEqual({
      filter: 'risk:green,risk:yellow',
      assignee: '@me',
      status: 'Draft,Ready',
    })
  })

  it('P6 (US-522 lifts it): --assignee/--status are the fan-out selection params and combine with --parallel', () => {
    expect(parseRunCommand({ root: '1', parallel: '2', assignee: '@me' }).scope.assignee).toBe(
      '@me',
    )
    expect(parseRunCommand({ root: '1', parallel: '2', status: 'Ready' }).scope.status).toBe(
      'Ready',
    )
  })
})

// ── pair-next delivery, pair-loop refusal ─────────────────────────────────────────────────
describe('selection arguments reach pair-next only', () => {
  it('S1: pair-next renders --assignee and --status next to --filter; a single label is unchanged', () => {
    expect(buildSkillArgs('pair-next', { filter: 'risk:green' })).toEqual([
      '--filter',
      'risk:green',
    ])
    expect(
      buildSkillArgs('pair-next', {
        root: '9',
        filter: 'a,b',
        assignee: '@me',
        status: 'Draft,Ready',
      }),
    ).toEqual(['--root', '9', '--filter', 'a,b', '--assignee', '@me', '--status', 'Draft,Ready'])
  })

  it('S2: pair-loop declares neither, so they are never rendered for it', () => {
    expect(buildSkillArgs('pair-loop', { root: '9', assignee: '@me', status: 'Ready' })).toEqual([
      '--root',
      '9',
    ])
  })

  it('S3: the perimeter REFUSES them where they cannot be honoured, with the driver-declaration reason', () => {
    const base = {
      root: '1',
      cwd,
      cwdDeclared: false,
      invocationKind: 'skill' as const,
      policyCap: 3,
      filterDelivery: 'none' as const,
    }
    expect(() => createPerimeter({ ...base, assignee: '@me', selectionDelivered: false })).toThrow(
      UNHONOURABLE_SELECTION_MESSAGE,
    )
    expect(UNHONOURABLE_SELECTION_MESSAGE).toMatch(/only root\/predicate\/iteration/)
    const ok = createPerimeter({
      ...base,
      assignee: '@me',
      status: 'Ready',
      selectionDelivered: true,
    })
    expect(ok).toMatchObject({ assignee: '@me', status: 'Ready' })
    // default off: nothing passed ⇒ no key on the perimeter
    expect('assignee' in createPerimeter({ ...base, selectionDelivered: false })).toBe(false)
  })

  it('S4: only a skill invocation declaring them delivers them', () => {
    expect(
      selectionDeliveredBy({ kind: 'skill', name: 'pair-next', source: 'flag' } as never),
    ).toBe(true)
    expect(
      selectionDeliveredBy({ kind: 'skill', name: 'pair-loop', source: 'cascade' } as never),
    ).toBe(false)
    expect(selectionDeliveredBy({ kind: 'prompt', text: 'x' } as never)).toBe(false)
  })
})

// ── the policy is read through the script, relayed verbatim ───────────────────────────────
describe('resolveAutonomyPolicy: relay, never re-derive', () => {
  const location = { scriptsDir: '/s' } as unknown as CycleScriptsLocation

  it('R1: returns exactly what the script answered and forwards the raw arguments untouched', () => {
    const seen: unknown[] = []
    const resolver: AutonomyResolver = input => {
      seen.push(input.args)
      return resolution()
    }
    const out = resolveAutonomyPolicy(resolver, {
      location,
      main: '/m',
      cwd,
      args: { until: 'merged' },
    })
    expect(out).toEqual(resolution())
    expect(seen).toEqual([{ until: 'merged' }])
  })

  it('R2: ok:false HALTs naming every key and reason, before anything runs', () => {
    const bad = resolution({
      ok: false,
      errors: [
        { key: 'until', reason: 'argument "soon" is not one of ready | pr | merged' },
        { key: 'merge', reason: '`has:` is valid only with `when` (got `always`)' },
      ],
    })
    expect(() => resolveAutonomyPolicy(() => bad, { location, main: '/m', cwd, args: {} })).toThrow(
      /`until` argument "soon"[\s\S]*`merge` `has:` is valid only with `when`/,
    )
  })

  it('R3: no script installed and nothing passed ⇒ undefined (today’s legacy path)', () => {
    expect(
      resolveAutonomyPolicy(() => undefined, { location, main: '/m', cwd, args: {} }),
    ).toBeUndefined()
  })

  it('R4: every effective value is printed with its source, then translations and warnings — verbatim', () => {
    const lines = describeAutonomy(
      resolution({
        warnings: [
          '`## Autonomy` `filter` and `## Eligibility` declare the same value — drop the legacy section.',
        ],
        translated: {
          merge: { from: '## Auto-Advance', equivalent: 'merge: when; lacks: risk:green' },
        },
      }),
    )
    expect(lines[0]).toMatch(/argument > adoption > KB default/)
    expect(lines).toContain('  until: merged (argument)')
    expect(lines).toContain(
      '  prepare: always (default)',
    )
    expect(lines.join('\n')).toMatch(
      /translated from ## Auto-Advance.*merge: when; lacks: risk:green/,
    )
    expect(lines.join('\n')).toMatch(/! .*same value/)
  })
})

// ── the stage loop: escalated / target-ready ──────────────────────────────────────────────
const ESCALATED: CycleResolveResult = {
  status: 'escalated',
  next: {
    step: 'blocked',
    reason: 'escalated',
    stage: 'green',
    conditions: ['has:cost:red'],
    detail: 'merge gate condition fired at green: has:cost:red',
  },
}
const loopBase = {
  worktree: async () => ({ path: '/w' }),
  packet: async (next: { step: string }) => ({ step: next.step, prompt: 'p', worktree: '/w' }),
  spawnStage: vi.fn(async (): Promise<CycleStageResult> => ({ processOutcome: 'success' })),
  policy: {},
}

describe('runCycle: escalated and target-ready', () => {
  it('L1: escalated stops with status `escalated`, posts the ONE comment via the collaborator, runs no stage', async () => {
    const escalate = vi.fn(async () => ({ comment: { posted: true } }))
    const out = await runCycle({ ...loopBase, resolve: async () => ESCALATED, escalate })
    expect(out.status).toBe('escalated')
    expect(out.stagesRun).toBe(0)
    expect(escalate).toHaveBeenCalledTimes(1)
    expect(escalate).toHaveBeenCalledWith(ESCALATED.next)
    expect(out.escalation).toEqual({ comment: { posted: true } })
  })

  it('L2: a failed comment post never changes the status — the collaborator reports, the loop stays escalated', async () => {
    const escalate = vi.fn(async () => ({ comment: { posted: false, error: 'rate limited' } }))
    const out = await runCycle({ ...loopBase, resolve: async () => ESCALATED, escalate })
    expect(out.status).toBe('escalated')
    expect(out.escalation).toEqual({ comment: { posted: false, error: 'rate limited' } })
  })

  it('L3: on-halt fires for escalated (and post-cycle closes the invocation); never before, never twice', async () => {
    const log: string[] = []
    const hooks: CycleHooks = {
      run: async (point, status) => {
        log.push(status === undefined ? point : `${point}(${status})`)
        return {}
      },
    }
    await runCycle({
      ...loopBase,
      hooks,
      resolve: async () => ESCALATED,
      escalate: async () => ({}),
    })
    expect(log).toEqual(['pre-cycle', 'on-halt(escalated)', 'post-cycle(escalated)'])
  })

  it('L4: `until: ready` (done with target ready) is `target-ready`, not `ready-for-merge`; a plain done is unchanged', async () => {
    const ready = await runCycle({
      ...loopBase,
      resolve: async () => ({
        status: 'completed',
        next: { step: 'done', target: 'ready', stage: 'implement' },
      }),
    })
    expect(ready.status).toBe('target-ready')
    expect(ready.stagesRun).toBe(0)
    const plain = await runCycle({
      ...loopBase,
      resolve: async () => ({ status: 'completed', next: { step: 'done' } }),
    })
    expect(plain.status).toBe('ready-for-merge')
  })

  it('L5: default off — no escalate collaborator wired ⇒ an escalated resolve is just its terminal reason', async () => {
    const out = await runCycle({ ...loopBase, resolve: async () => ESCALATED })
    expect(out.status).toBe('escalated')
    expect(out.escalation).toBeUndefined()
  })

  it('L6: the batch row status `escalate` stays distinct and keeps its own meaning', async () => {
    const out = await runCycle({
      ...loopBase,
      resolve: async () => ({ status: 'blocked', next: { step: 'blocked', reason: 'escalate' } }),
    })
    expect(out.status).toBe('escalate')
    expect(out.status).not.toBe('escalated')
  })
})

// ── handler: exit codes, printed policy, autonomy forwarded ───────────────────────────────
const files = (): InMemoryFileSystemService =>
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
      [`${cwd}/.claude/skills/pair-workflow-cycle/SKILL.md`]: '',
      [`${cwd}/.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs`]: '',
      [`${cwd}/.claude/skills/pair-workflow-cycle/scripts/cycle-dispatch.mjs`]: '',
      '/bin/claude': '',
    },
    cwd,
    cwd,
  )

async function runCard(
  outcome: DriveCycleResult,
  flags: Record<string, string>,
  resolver?: AutonomyResolver,
) {
  const stdout: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    stdout.push(args.map(String).join(' '))
  })
  const driven: DriveCycleInput[] = []
  const runIteration: IterationRunner = async () => ({ outcome: 'success', detail: 'done' })
  const deps: RunHandlerDependencies = {
    runIteration,
    acquireLock: ({ card }) => ({
      kind: 'acquired',
      lock: { path: `/l/${card}`, release: () => {} },
    }),
    appendAudit: () => {},
    cardReadiness: async () => 'ready',
    driveCycle: async input => {
      driven.push(input)
      return outcome
    },
    ...(resolver && { resolveAutonomy: resolver }),
  }
  const code = await handleRunCommand(
    parseRunCommand({ card: '521', cardTags: '', ...flags }),
    files(),
    deps,
  )
  return { code, stdout, driven }
}

describe('run --card: exit codes and the printed policy', () => {
  it('H1: escalated exits 1; target-ready exits 0; ready-for-merge still exits 0', async () => {
    expect((await runCard({ status: 'escalated', stagesRun: 0 }, {})).code).toBe(1)
    expect((await runCard({ status: 'target-ready', stagesRun: 0 }, {})).code).toBe(0)
    expect((await runCard({ status: 'ready-for-merge', stagesRun: 3 }, {})).code).toBe(0)
  })

  it('H2: an escalated merge park (status escalated from the merge stage) also exits 1', async () => {
    const out = await runCard(
      { status: 'escalated', stagesRun: 0, merge: { parkKind: 'escalated', mergeAllowed: false } },
      {},
    )
    expect(out.code).toBe(1)
  })

  it('H3: an ACTIVE policy is printed with its sources and forwarded to the driver', async () => {
    const out = await runCard(
      { status: 'ready-for-merge', stagesRun: 0 },
      { until: 'merged', merge: 'when; has: cost:red' },
      () => resolution(),
    )
    expect(out.stdout.join('\n')).toMatch(/until: merged \(argument\)/)
    expect(out.stdout.join('\n')).toMatch(/merge: when; has: cost:red \(argument\)/)
    expect(out.stdout.join('\n')).toMatch(/prepare: always \(default\)/)
    expect(out.driven[0]?.autonomy).toEqual({ policy: resolution().policy })
  })

  it('H4: default off — an inactive resolution is printed but NOT forwarded (today’s legacy path)', async () => {
    const out = await runCard({ status: 'ready-for-merge', stagesRun: 0 }, {}, () =>
      resolution({ active: false }),
    )
    expect(out.driven[0]).not.toHaveProperty('autonomy')
  })

  it('H5: a malformed policy HALTs before the driver is called', async () => {
    await expect(
      runCard({ status: 'ready-for-merge', stagesRun: 0 }, { until: 'soon' }, () =>
        resolution({
          ok: false,
          errors: [{ key: 'until', reason: 'argument "soon" is not one of ready | pr | merged' }],
        }),
      ),
    ).rejects.toThrow(/`until` argument "soon"/)
  })
})

describe('merge pin under an active gate', () => {
  it('T1: an untagged card pins risk:red (fail-safe) only when a gate is active; legacy keeps "no tier, no merge"', () => {
    expect(pinnedTier(undefined, true)).toBe('risk:red')
    expect(pinnedTier(undefined, false)).toBeUndefined()
    expect(pinnedTier('risk:green', true)).toBe('risk:green')
    expect(pinnedTier('risk:green', false)).toBe('risk:green')
  })
})
