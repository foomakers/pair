import { describe, it, expect, vi, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { ELIGIBILITY_OFF_SECTION_ABSENT, POLICY_PATH } from './automation-policy'
import { decideDispatch } from './dispatch'
import { handleRunCommand } from './handler'
import type { CardProcessRunner } from './parallel'
import { parseRunCommand } from './parser'
import type { RootCandidate } from './root-plan'
import { readWorkflowMapping } from './workflow-mapping'

/**
 * US-491 review r1-1 — `## Workflows` declared and no `## Eligibility`: every child `run --card`
 * decides `automation-off` (`decideDispatch`, dispatch.ts: the eligible set is empty) and exits 0,
 * so a plan that runs the cards reports each one `completed` for work nobody did. Tier 1
 * (`pair-loop.js` `parsePolicyOrHalt`) HALTs on an absent `## Eligibility`: automation is off.
 *
 * The real handler; only the `pair-next` selection, the lock, the audit writer and the card runner
 * are injected. The oracle is the printed plan / outcome lines and the runner's calls: no card may
 * be spawned, none reported completed, and the reason must be said — never a silent drop (AC1).
 *
 * The header already prints the policy warning `ELIGIBILITY_OFF_SECTION_ABSENT` for this policy
 * (reportHeader → policy.warnings) before any selection: that line proves nothing about the stop.
 * `stopReason` drops exactly ONE occurrence of it and looks for the reason in what remains, so a
 * silent `return 0` fails and a stop that states why (in any words naming `## Eligibility` or
 * automation off, even repeating the warning's text) passes.
 */

const cwd = '/project'
const PATH_BEFORE = process.env['PATH']

const WORKFLOWS = '## Workflows\n\nauto-dev ⇒ pair-loop\n'
const MAX = '## Max Parallelism\n\n3\n'
const ELIGIBILITY = '## Eligibility\n\nrisk:green\n'

const card = (id: string): RootCandidate => ({
  id,
  title: `Card ${id}`,
  branch: `feature/US-${id}-x`,
  tier: 'risk:green',
  labels: ['risk:green', 'auto-dev'],
  mutexResources: [],
  prerequisites: [],
})

afterEach(() => {
  vi.restoreAllMocks()
  process.env['PATH'] = PATH_BEFORE
})

async function runBatch(policy: string, extra: Record<string, unknown> = {}) {
  process.env['PATH'] = '/bin'
  const lines: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '))
  })
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '))
  })
  const fs = new InMemoryFileSystemService(
    {
      [`${cwd}/config.json`]: JSON.stringify({ asset_registries: {} }),
      '/bin/claude': '',
      [`${cwd}/${POLICY_PATH}`]: policy,
      [`${cwd}/.claude/skills/pair-loop/SKILL.md`]: '---\nname: pair-loop\n---\n',
    },
    cwd,
    cwd,
  )
  const runCardProcess = vi.fn<CardProcessRunner>(async () => ({ exitCode: 0, signal: null }))
  let code: number | undefined
  let error: unknown
  try {
    code = await handleRunCommand(
      parseRunCommand({ root: '66', parallel: '2', autonomous: true, ...extra }),
      fs,
      {
        selectCandidates: async () => [card('1'), card('2')],
        runCardProcess,
        acquireLock: ({ card: id }) => ({
          kind: 'acquired',
          lock: { path: `/locks/${id}`, release: () => {} },
        }),
        appendAudit: () => {},
      },
    )
  } catch (e) {
    error = e
  }
  const said = [...lines, error instanceof Error ? error.message : ''].join('\n')
  return { code, error, said, runCardProcess }
}

/** Output minus the one header warning line the policy itself produces (never the fix's). */
function stopReason(said: string): string {
  const lines = said.split('\n')
  const header = lines.findIndex(line => line.includes(ELIGIBILITY_OFF_SECTION_ABSENT))
  return lines.filter((_, i) => i !== header).join('\n')
}

const STATED_STOP = /## Eligibility|automation[ -]?(is )?off/i

/** The finding's ASSERT: nothing spawned, nothing reported completed, and why is said. */
function expectAutomationOff(batch: Awaited<ReturnType<typeof runBatch>>): void {
  expect(
    batch.runCardProcess.mock.calls.map(([input]) => input.card.id),
    'spawned a run --card its child skips as automation-off',
  ).toEqual([])
  expect(batch.said).not.toMatch(/Plan: Run \(/)
  expect(batch.said).not.toMatch(/#\d+: completed/)
  expect(
    stopReason(batch.said),
    'the stop is stated by the fan-out itself, beyond the header policy warning (never silent)',
  ).toMatch(STATED_STOP)
}

describe('r1-1: ## Workflows declared, no ## Eligibility ⇒ automation is off for the fan-out too', () => {
  it('r2-g1-W-off: two eligible-looking candidates ⇒ none planned as Run, none spawned, none completed, the reason said', async () => {
    expectAutomationOff(await runBatch(`${MAX}\n${WORKFLOWS}`))
  })

  it('r2-g1-W-off-approve: the same with --approve-ineligible (automation-off is no DoR-fallback reason) ⇒ still nothing spawned', async () => {
    expectAutomationOff(await runBatch(`${MAX}\n${WORKFLOWS}`, { approveIneligible: true }))
  })

  it('r2-g1-C-on: ## Workflows AND ## Eligibility risk:green declared ⇒ both cards planned and spawned (the guard is Eligibility, not Workflows)', async () => {
    const batch = await runBatch(`${ELIGIBILITY}\n${MAX}\n${WORKFLOWS}`)
    expect(batch.error).toBeUndefined()
    expect(batch.said).toMatch(/Plan: Run \(2\): #1, #2/)
    expect(batch.runCardProcess.mock.calls.map(([input]) => input.card.id).sort()).toEqual([
      '1',
      '2',
    ])
  })

  it('r2-g1-C-nomapping: no ## Workflows and no ## Eligibility (the child takes its DoR fallback) ⇒ never spawned-and-skipped: spawned, or stopped naming ## Eligibility', async () => {
    const batch = await runBatch(MAX)
    const spawned = batch.runCardProcess.mock.calls.length
    if (spawned === 0) expect(stopReason(batch.said)).toMatch(STATED_STOP)
    else expect(spawned).toBe(2)
  })

  it("r2-g1-C-child: the premise, read off the child's own decideDispatch — mapping declared, no ## Eligibility ⇒ skip automation-off for a card carrying the mapped tag", () => {
    const mapping = readWorkflowMapping(`${MAX}\n${WORKFLOWS}`)
    expect(mapping, 'the ## Workflows section parses').toBeDefined()
    const decision = decideDispatch({
      card: '1',
      tags: card('1').labels!,
      eligibility: undefined,
      mapping,
      isInstalled: () => true,
    })
    expect(decision).toMatchObject({ kind: 'skip', reason: 'automation-off' })
  })
})
