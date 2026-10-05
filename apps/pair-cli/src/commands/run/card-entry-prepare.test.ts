import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand, type RunHandlerDependencies } from './handler'
import { parseRunCommand } from './parser'
import type {
  AutonomyResolution,
  CardReadiness,
  PrepareCompleteOptions,
  PrepareDecideOptions,
  PrepareEscalateOptions,
  PrepareGateValue,
} from './cycle-scripts'
import type { DriveCycleInput, DriveCycleResult } from './run-context'
// The REAL decision function — the bridge fake delegates to it, so no rule is re-derived in this test.
// @ts-expect-error — an untyped .mjs shipped as a skill script
import { decide as realDecide } from '../../../../../packages/knowledge-hub/dataset/.skills/workflow/cycle/scripts/cycle-prepare.mjs'

/**
 * US-523 T-6 — the prepare gate at `pair-cli run --card`: the DoR fallback's unattended skip is replaced
 * by the shared `decide` route. Hermetic: the real decision function behind a recording bridge, injected
 * readiness / labels / body / engine runner / cycle driver / lock / audit / hooks.
 */

let root: string
let bin: string
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'card-entry-prepare-')))
  bin = join(root, 'bin')
  mkdirSync(bin)
  symlinkSync(process.execPath, join(bin, 'node'))
  vi.stubEnv('PATH', bin)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
})

const project = () =>
  new InMemoryFileSystemService(
    {
      [`${root}/config.json`]: JSON.stringify({
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
      [`${root}/.claude/skills/pair-loop/SKILL.md`]: '',
      [`${root}/.claude/skills/pair-process-refine-story/SKILL.md`]: '',
      [`${root}/.claude/skills/pair-process-plan-tasks/SKILL.md`]: '',
      [`${root}/.claude/skills/pair-workflow-cycle/SKILL.md`]: '',
      [`${root}/.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs`]: '',
      [`${root}/.claude/skills/pair-workflow-cycle/scripts/cycle-dispatch.mjs`]: '',
      [`${root}/.claude/skills/pair-workflow-cycle/scripts/autonomy-policy.mjs`]: '',
      [`${bin}/claude`]: '',
    },
    root,
    root,
  )

const gate = (mode: string, has: string[] = [], lacks: string[] = []): PrepareGateValue => ({
  mode,
  has,
  lacks,
})
const selection = (
  prepare: PrepareGateValue,
  until = 'pr',
  source = 'argument',
): AutonomyResolution => ({
  ok: true,
  active: true,
  policy: { until, prepare, merge: gate('always') },
  effective: { prepare: { value: prepare, source } },
  lines: [`prepare: ${prepare.mode} (${source})`],
  warnings: [],
  errors: [],
  translated: {},
})

const PREPARED_BODY = '## Assumptions\n\n- Q/A\n'

interface Scenario {
  readonly readiness?: CardReadiness
  readonly prepare?: AutonomyResolution | undefined
  readonly autonomous?: boolean
  /** Labels returned by successive reads (the last one repeats). */
  readonly labels?: Array<string[] | undefined>
  readonly body?: string
  readonly iterationOutcome?: 'success' | 'failed'
  readonly completion?: { completed: boolean; reason?: string }
}

async function run(s: Scenario = {}) {
  const stdout: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    stdout.push(args.map(String).join(' '))
  })
  const calls: string[] = []
  const prompts: string[] = []
  const audits: string[] = []
  const escalations: PrepareEscalateOptions[] = []
  const completions: PrepareCompleteOptions[] = []
  const decisions: PrepareDecideOptions[] = []
  const driven: DriveCycleInput[] = []
  const hooks: string[] = []
  const labelQueue = [...(s.labels ?? [[]])]
  const deps: RunHandlerDependencies = {
    runIteration: async input => {
      calls.push('iteration')
      prompts.push(input.promptText)
      return { outcome: s.iterationOutcome ?? 'success', detail: 'done' }
    },
    acquireLock: ({ card }) => ({
      kind: 'acquired',
      lock: { path: `/l/${card}`, release: () => {} },
    }),
    appendAudit: (_path: unknown, line: unknown) => {
      audits.push(String(line))
    },
    cardReadiness: async () => s.readiness ?? 'draft',
    driveCycle: async (input): Promise<DriveCycleResult> => {
      calls.push('cycle')
      driven.push(input)
      return { status: 'ready-for-merge', stagesRun: 0 }
    },
    resolveAutonomy: () => s.prepare,
    prepare: {
      bridge: {
        prepareDecide: o => {
          decisions.push(o)
          calls.push(`decide:${o.boundary}`)
          return realDecide(o)
        },
        prepareEscalate: o => {
          calls.push(`escalate:${o.boundary}`)
          escalations.push(o)
          return {
            outcome: 'escalated',
            boundary: o.boundary,
            label: { applied: true },
            comment: { posted: true },
          }
        },
        prepareComplete: o => {
          calls.push('complete')
          completions.push(o)
          return s.completion ?? { completed: true }
        },
        bindHosts: () => ({ action: 'bound', binding: { pmTool: 'github', codeHost: 'github' } }),
      },
      readLabels: () => (labelQueue.length > 1 ? labelQueue.shift() : labelQueue[0]),
      readBody: () => s.body ?? PREPARED_BODY,
      hooks: {
        run: async point => {
          hooks.push(point)
          return {}
        },
      },
    },
  }
  const code = await handleRunCommand(
    parseRunCommand({ card: '523', cardTags: '', autonomous: s.autonomous === true }),
    project(),
    deps,
  )
  return {
    code,
    stdout,
    calls,
    prompts,
    audits,
    escalations,
    completions,
    decisions,
    driven,
    hooks,
  }
}

const skipAudits = (r: { audits: string[] }) => r.audits.filter(a => a.includes('event=skip'))

describe('AC1/AC2: the default and `always` never reach Ready autonomously', () => {
  it.each([
    ['no selection (default, nothing resolved)', undefined],
    ['declared always', selection(gate('always'))],
    ['defaulted always', selection(gate('always'), 'pr', 'default')],
  ])(
    'unattended Draft, %s ⇒ skipped needs-human, nothing spawned, nothing written',
    async (_n, prepare) => {
      const r = await run({ prepare, autonomous: true })
      expect(r.code).toBe(0)
      expect(r.calls.filter(c => c === 'iteration' || c === 'cycle' || c === 'complete')).toEqual(
        [],
      )
      expect(r.calls.some(c => c.startsWith('escalate'))).toBe(false)
      expect(r.stdout.join('\n')).toMatch(/needs a human/)
      expect(skipAudits(r)).toHaveLength(1)
      expect(skipAudits(r)[0]).toContain('reason=prepare-needs-human')
    },
  )

  it('AC1/AC3: attended Draft under the default ⇒ the interactive refine-story prompt, byte-identical (no --approval, no --prepare)', async () => {
    for (const prepare of [undefined, selection(gate('always'))]) {
      const r = await run({ prepare })
      expect(r.prompts).toEqual(['/pair-process-refine-story --story 523'])
      expect(r.calls.some(c => c === 'complete' || c.startsWith('escalate'))).toBe(false)
    }
  })

  it('AC3: attended refined-no-breakdown under `always` ⇒ the interactive plan-tasks prompt', async () => {
    const r = await run({ readiness: 'refined-no-breakdown', prepare: selection(gate('always')) })
    expect(r.prompts).toEqual(['/pair-process-plan-tasks --story 523'])
  })

  it('AC2 property: `always` + unattended, every readiness and label set ⇒ no skill, no Ready, no escalation', async () => {
    for (const readiness of ['draft', 'refined-no-breakdown'] as const)
      for (const labels of [[], ['triaged'], ['risk:red'], ['needs-review']]) {
        const r = await run({
          readiness,
          prepare: selection(gate('always')),
          autonomous: true,
          labels: [labels],
        })
        expect(
          r.calls.filter(c => c === 'iteration' || c === 'complete' || c.startsWith('escalate')),
        ).toEqual([])
      }
  })
})

describe('AC4/AC5/AC8: never and when proceed alone, Ready once, until decides what follows', () => {
  it('never: refine (approval auto + prepare never) → B1 → plan (approval auto) → B2 → complete; then the cycle', async () => {
    const r = await run({ prepare: selection(gate('never')), autonomous: true })
    expect(r.code).toBe(0)
    expect(r.prompts).toEqual([
      '/pair-process-refine-story --story 523 --approval auto --prepare never',
      '/pair-process-plan-tasks --story 523 --approval auto',
    ])
    expect(r.calls).toEqual([
      'decide:B0',
      'iteration',
      'decide:B1',
      'iteration',
      'decide:B2',
      'complete',
      'cycle',
    ])
    expect(r.completions[0]).toMatchObject({ story: '523', source: 'argument' })
    expect(r.stdout.join('\n')).toContain('PREPARE-RESULT: prepared')
  })

  it('when with no escalation behaves as never and passes `--prepare when`', async () => {
    const r = await run({
      prepare: selection(gate('when', [], ['triaged'])),
      autonomous: true,
      labels: [['triaged']],
    })
    expect(r.prompts[0]).toContain('--approval auto --prepare when')
    expect(r.calls).toContain('complete')
    expect(r.code).toBe(0)
  })

  it('AC8: until ready stops right after prepare — Ready written, no cycle', async () => {
    const r = await run({ prepare: selection(gate('never'), 'ready'), autonomous: true })
    expect(r.code).toBe(0)
    expect(r.calls).toContain('complete')
    expect(r.calls).not.toContain('cycle')
    expect(r.stdout.join('\n')).toMatch(/until: ready — stopping after prepare/)
  })

  it('a refined-no-breakdown card enters at B1 and only plans', async () => {
    const r = await run({
      readiness: 'refined-no-breakdown',
      prepare: selection(gate('never')),
      autonomous: true,
    })
    expect(r.prompts).toEqual(['/pair-process-plan-tasks --story 523 --approval auto'])
    expect(r.calls[0]).toBe('decide:B1')
  })

  it('attended `never` is autonomous too (the maintainer declared it)', async () => {
    const r = await run({ prepare: selection(gate('never')), autonomous: false })
    expect(r.prompts[0]).toContain('--approval auto --prepare never')
  })
})

describe('AC6/AC10: escalation stops the phase, the card stays Draft', () => {
  it('B0: a firing gate escalates before any skill runs — exit 1, on-halt, one escalation, no Ready', async () => {
    const r = await run({
      prepare: selection(gate('when', [], ['triaged'])),
      autonomous: true,
      labels: [[]],
    })
    expect(r.code).toBe(1)
    expect(r.calls).toEqual(['decide:B0', 'escalate:B0'])
    expect(r.escalations[0]).toMatchObject({ conditions: ['lacks:triaged'], source: 'argument' })
    expect(r.hooks).toEqual(['on-halt'])
    expect(r.stdout.join('\n')).toContain('PREPARE-RESULT: escalated')
  })

  it('B1: a tag written by refinement escalates — plan never runs, Ready never written', async () => {
    const r = await run({
      prepare: selection(gate('when', ['risk:red'])),
      autonomous: true,
      labels: [[], ['risk:red']],
    })
    expect(r.code).toBe(1)
    expect(r.calls).toEqual(['decide:B0', 'iteration', 'decide:B1', 'escalate:B1'])
    expect(r.escalations[0]).toMatchObject({ boundary: 'B1', conditions: ['has:risk:red'] })
  })

  it('B2: a tag written by planning escalates before complete', async () => {
    const r = await run({
      prepare: selection(gate('when', ['risk:red'])),
      autonomous: true,
      labels: [[], [], ['risk:red']],
    })
    expect(r.code).toBe(1)
    expect(r.calls.slice(-2)).toEqual(['decide:B2', 'escalate:B2'])
    expect(r.calls).not.toContain('complete')
  })

  it('AC10: an open question escalates even under `never` and is named', async () => {
    const r = await run({
      prepare: selection(gate('never')),
      autonomous: true,
      body: '## Assumptions\n\n- x\n\n## Open Questions\n\n- Which tenant model do we ship?\n',
    })
    expect(r.code).toBe(1)
    expect(r.escalations[0]?.openQuestion).toContain('Which tenant model')
    expect(r.calls).not.toContain('complete')
    expect(r.prompts).toHaveLength(1)
  })

  it('AC7: an unattended card carrying needs-review is skipped as escalated, audited `escalated`', async () => {
    const r = await run({
      prepare: selection(gate('never')),
      autonomous: true,
      labels: [['needs-review']],
    })
    expect(r.code).toBe(0)
    expect(r.calls.filter(c => c === 'iteration')).toEqual([])
    expect(skipAudits(r)[0]).toContain('reason=escalated')
    expect(r.stdout.join('\n')).toContain('PREPARE-RESULT: escalated')
  })

  it('AC7: attended, a needs-review card is workable again (a human is here)', async () => {
    const r = await run({ prepare: selection(gate('always')), labels: [['needs-review']] })
    expect(r.prompts).toEqual(['/pair-process-refine-story --story 523'])
  })
})

describe('fail closed', () => {
  it('a failed skill iteration ⇒ exit 1, no complete, on-halt', async () => {
    const r = await run({
      prepare: selection(gate('never')),
      autonomous: true,
      iterationOutcome: 'failed',
    })
    expect(r.code).toBe(1)
    expect(r.calls).not.toContain('complete')
    expect(r.hooks).toEqual(['on-halt'])
  })

  it('a refused completion (missing assumptions, board unconfirmed) ⇒ exit 1, no cycle', async () => {
    const r = await run({
      prepare: selection(gate('never')),
      autonomous: true,
      completion: { completed: false, reason: 'assumptions-missing' },
    })
    expect(r.code).toBe(1)
    expect(r.calls).not.toContain('cycle')
    expect(r.stdout.join('\n')).toContain('assumptions-missing')
  })

  it('an unreadable label set under `when` escalates (labels-unreadable), never proceeds', async () => {
    const r = await run({
      prepare: selection(gate('when', [], ['triaged'])),
      autonomous: true,
      labels: [undefined],
    })
    expect(r.code).toBe(1)
    expect(r.escalations[0]?.conditions).toEqual(['labels-unreadable'])
  })
})

describe('AC11: the effective gate is printed with its source', () => {
  it('names value, source and route', async () => {
    const r = await run({ prepare: selection(gate('never'), 'pr', 'adoption'), autonomous: true })
    expect(r.stdout.join('\n')).toMatch(
      /Prepare: never \(source: adoption\) — run-autonomous at B0/,
    )
  })
})
